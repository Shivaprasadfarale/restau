import { NextRequest, NextResponse } from 'next/server'
import { jwtService, JWTPayload } from './jwt'
import { rbacService, Permission, createAuthContext } from './rbac'
import { connectToDatabase } from '../mongodb'
import { getClientIP } from './utils'

export interface AuthenticatedRequest extends NextRequest {
  user?: JWTPayload
  authContext?: ReturnType<typeof createAuthContext>
}

export interface MiddlewareOptions {
  requireAuth?: boolean
  requiredPermission?: Permission
  allowedRoles?: string[]
  rateLimitKey?: string
  rateLimitMax?: number
  rateLimitWindow?: number // in seconds
}

// Rate limiting store (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

/**
 * Authentication middleware
 */
export async function authMiddleware(
  request: NextRequest,
  options: MiddlewareOptions = {}
): Promise<{ 
  success: boolean
  response?: NextResponse
  user?: JWTPayload
  authContext?: ReturnType<typeof createAuthContext>
}> {
  const {
    requireAuth = true,
    requiredPermission,
    allowedRoles,
    rateLimitKey,
    rateLimitMax = 100,
    rateLimitWindow = 3600 // 1 hour
  } = options

  try {
    await connectToDatabase()

    // Rate limiting
    if (rateLimitKey) {
      const clientIP = getClientIP(request)
      const key = `${rateLimitKey}:${clientIP}`
      const now = Date.now()
      const windowMs = rateLimitWindow * 1000

      const existing = rateLimitStore.get(key)
      if (existing && existing.resetTime > now) {
        if (existing.count >= rateLimitMax) {
          return {
            success: false,
            response: NextResponse.json(
              { 
                success: false, 
                error: { 
                  code: 'RATE_LIMITED',
                  message: 'Too many requests',
                  retryAfter: Math.ceil((existing.resetTime - now) / 1000)
                }
              },
              { 
                status: 429,
                headers: {
                  'Retry-After': Math.ceil((existing.resetTime - now) / 1000).toString(),
                  'X-RateLimit-Limit': rateLimitMax.toString(),
                  'X-RateLimit-Remaining': Math.max(0, rateLimitMax - existing.count).toString(),
                  'X-RateLimit-Reset': new Date(existing.resetTime).toISOString()
                }
              }
            )
          }
        }
        existing.count++
      } else {
        rateLimitStore.set(key, { count: 1, resetTime: now + windowMs })
      }
    }

    // Authentication
    if (!requireAuth) {
      return { success: true }
    }

    const authHeader = request.headers.get('authorization')
    const token = jwtService.extractTokenFromHeader(authHeader)

    if (!token) {
      return {
        success: false,
        response: NextResponse.json(
          { 
            success: false, 
            error: { 
              code: 'MISSING_TOKEN',
              message: 'Authorization token required' 
            }
          },
          { status: 401 }
        )
      }
    }

    const validation = await jwtService.validateTokenWithRevocation(token, 'access')
    if (!validation.valid || !validation.payload) {
      const status = validation.expired ? 401 : 403
      const code = validation.expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN'
      
      return {
        success: false,
        response: NextResponse.json(
          { 
            success: false, 
            error: { 
              code,
              message: validation.error || 'Invalid token' 
            }
          },
          { status }
        )
      }
    }

    const user = validation.payload
    const authContext = createAuthContext(user)

    // Role-based access control
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      return {
        success: false,
        response: NextResponse.json(
          { 
            success: false, 
            error: { 
              code: 'INSUFFICIENT_ROLE',
              message: `Role '${user.role}' not allowed` 
            }
          },
          { status: 403 }
        )
      }
    }

    // Permission-based access control
    if (requiredPermission) {
      const permissionCheck = await rbacService.validatePermission(
        authContext,
        requiredPermission
      )

      if (!permissionCheck.authorized) {
        return {
          success: false,
          response: NextResponse.json(
            { 
              success: false, 
              error: { 
                code: 'INSUFFICIENT_PERMISSION',
                message: permissionCheck.reason || 'Permission denied' 
              }
            },
            { status: 403 }
          )
        }
      }
    }

    return { success: true, user, authContext }

  } catch (error: any) {
    console.error('Auth middleware error:', error)
    return {
      success: false,
      response: NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 'AUTH_ERROR',
            message: 'Authentication failed' 
          }
        },
        { status: 500 }
      )
    }
  }
}

/**
 * Create authenticated API handler
 */
export function withAuth(
  handler: (
    request: NextRequest,
    context: { 
      user: JWTPayload
      authContext: ReturnType<typeof createAuthContext>
    }
  ) => Promise<NextResponse>,
  options: MiddlewareOptions = {}
) {
  return async (request: NextRequest) => {
    const authResult = await authMiddleware(request, options)
    
    if (!authResult.success) {
      return authResult.response!
    }

    if (!authResult.user || !authResult.authContext) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 'AUTH_REQUIRED',
            message: 'Authentication required' 
          }
        },
        { status: 401 }
      )
    }

    return handler(request, {
      user: authResult.user,
      authContext: authResult.authContext
    })
  }
}

/**
 * Create public API handler with optional auth
 */
export function withOptionalAuth(
  handler: (
    request: NextRequest,
    context: { 
      user?: JWTPayload
      authContext?: ReturnType<typeof createAuthContext>
    }
  ) => Promise<NextResponse>,
  options: Omit<MiddlewareOptions, 'requireAuth'> = {}
) {
  return async (request: NextRequest) => {
    const authResult = await authMiddleware(request, { 
      ...options, 
      requireAuth: false 
    })
    
    if (!authResult.success && authResult.response) {
      // If there's a response, it means rate limiting or other error
      return authResult.response
    }

    return handler(request, {
      user: authResult.user,
      authContext: authResult.authContext
    })
  }
}

/**
 * Audit logging middleware
 */
export async function auditLog(
  action: string,
  resourceType: string,
  resourceId: string,
  userId: string,
  tenantId: string,
  details?: any
): Promise<void> {
  try {
    // In production, this would write to an audit log table or service
    console.log('AUDIT LOG:', {
      timestamp: new Date().toISOString(),
      action,
      resourceType,
      resourceId,
      userId,
      tenantId,
      details: details ? JSON.stringify(details) : undefined
    })
  } catch (error) {
    console.error('Audit logging failed:', error)
  }
}

/**
 * Clean up expired rate limit entries
 */
export function cleanupRateLimit(): void {
  const now = Date.now()
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetTime <= now) {
      rateLimitStore.delete(key)
    }
  }
}

// Clean up rate limit store every hour
setInterval(cleanupRateLimit, 60 * 60 * 1000)