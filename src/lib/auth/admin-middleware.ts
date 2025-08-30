import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'
import { User } from '@/models/User'
import { connectToDatabase } from '@/lib/mongodb'
import { rbacService, Permission, createAuthContext } from '@/lib/auth/rbac'
import { auditLogger } from '@/lib/audit-logger'
import { rateLimiter, RATE_LIMITS } from '@/lib/rate-limiter'

export interface AdminAuthContext {
  userId: string
  tenantId: string
  role: string
  sessionId: string
  user: any
  permissions: Permission[]
}

export interface AdminMiddlewareOptions {
  requiredPermission?: Permission
  allowedRoles?: string[]
  rateLimit?: {
    maxRequests: number
    windowMs: number
  }
  auditAction?: string
  requiresDestructiveConfirmation?: boolean
}

/**
 * Admin authentication and authorization middleware
 */
export async function adminMiddleware(
  request: NextRequest,
  options: AdminMiddlewareOptions = {}
): Promise<{ success: true; context: AdminAuthContext } | { success: false; response: NextResponse }> {
  try {
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown'
    const userAgent = request.headers.get('user-agent') || 'Unknown'

    // Rate limiting
    if (options.rateLimit) {
      const rateLimitKey = `admin_api:${clientIP}`
      const rateLimitResult = await rateLimiter.checkLimit(
        rateLimitKey,
        options.rateLimit.maxRequests,
        options.rateLimit.windowMs
      )

      if (!rateLimitResult.allowed) {
        await auditLogger.log({
          action: 'ADMIN_API_RATE_LIMITED',
          userId: null,
          tenantId: null,
          ipAddress: clientIP,
          userAgent,
          details: {
            endpoint: request.url,
            method: request.method,
            remainingTime: rateLimitResult.resetTime
          },
          severity: 'MEDIUM'
        })

        return {
          success: false,
          response: NextResponse.json(
            { 
              success: false, 
              message: 'Rate limit exceeded',
              retryAfter: rateLimitResult.resetTime
            },
            { 
              status: 429,
              headers: {
                'X-RateLimit-Limit': options.rateLimit.maxRequests.toString(),
                'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
                'X-RateLimit-Reset': rateLimitResult.resetTime.toString()
              }
            }
          )
        }
      }
    }

    // Extract and verify token
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        success: false,
        response: NextResponse.json(
          { success: false, message: 'No token provided' },
          { status: 401 }
        )
      }
    }

    const token = authHeader.substring(7)
    const payload = await verifyToken(token)

    if (!payload) {
      return {
        success: false,
        response: NextResponse.json(
          { success: false, message: 'Invalid token' },
          { status: 401 }
        )
      }
    }

    await connectToDatabase()

    // Find and validate user
    const user = await User.findById(payload.userId)
    if (!user || user.tenantId !== payload.tenantId) {
      return {
        success: false,
        response: NextResponse.json(
          { success: false, message: 'User not found' },
          { status: 401 }
        )
      }
    }

    // Check if user can access admin panel
    if (!rbacService.canAccessAdmin(user.role)) {
      await auditLogger.log({
        action: 'ADMIN_ACCESS_DENIED',
        userId: user._id.toString(),
        tenantId: user.tenantId,
        ipAddress: clientIP,
        userAgent,
        details: {
          role: user.role,
          endpoint: request.url,
          method: request.method,
          reason: 'Insufficient permissions for admin access'
        },
        severity: 'HIGH'
      })

      return {
        success: false,
        response: NextResponse.json(
          { success: false, message: 'Access denied' },
          { status: 403 }
        )
      }
    }

    // Validate session
    const session = user.sessions.id(payload.sessionId)
    if (!session || session.isRevoked) {
      return {
        success: false,
        response: NextResponse.json(
          { success: false, message: 'Session expired or revoked' },
          { status: 401 }
        )
      }
    }

    // Check role-based access
    if (options.allowedRoles && !options.allowedRoles.includes(user.role)) {
      await auditLogger.log({
        action: 'ADMIN_ROLE_ACCESS_DENIED',
        userId: user._id.toString(),
        tenantId: user.tenantId,
        ipAddress: clientIP,
        userAgent,
        details: {
          userRole: user.role,
          allowedRoles: options.allowedRoles,
          endpoint: request.url,
          method: request.method
        },
        severity: 'MEDIUM'
      })

      return {
        success: false,
        response: NextResponse.json(
          { success: false, message: 'Insufficient role permissions' },
          { status: 403 }
        )
      }
    }

    // Check specific permission
    if (options.requiredPermission) {
      const authContext = createAuthContext({
        userId: user._id.toString(),
        tenantId: user.tenantId,
        role: user.role,
        sessionId: session._id.toString()
      })

      const permissionResult = await rbacService.validatePermission(
        authContext,
        options.requiredPermission
      )

      if (!permissionResult.authorized) {
        await auditLogger.log({
          action: 'ADMIN_PERMISSION_DENIED',
          userId: user._id.toString(),
          tenantId: user.tenantId,
          ipAddress: clientIP,
          userAgent,
          details: {
            requiredPermission: options.requiredPermission,
            userRole: user.role,
            endpoint: request.url,
            method: request.method,
            reason: permissionResult.reason
          },
          severity: 'MEDIUM'
        })

        return {
          success: false,
          response: NextResponse.json(
            { success: false, message: 'Insufficient permissions' },
            { status: 403 }
          )
        }
      }
    }

    // Check destructive action confirmation
    if (options.requiresDestructiveConfirmation) {
      const confirmationHeader = request.headers.get('x-destructive-confirmation')
      if (confirmationHeader !== 'confirmed') {
        return {
          success: false,
          response: NextResponse.json(
            { 
              success: false, 
              message: 'Destructive action requires confirmation',
              requiresConfirmation: true
            },
            { status: 400 }
          )
        }
      }
    }

    // Update session activity
    session.lastActivity = new Date()
    await user.save()

    // Audit log for successful access (if specified)
    if (options.auditAction) {
      await auditLogger.logAdminAction(
        options.auditAction,
        user._id.toString(),
        user.tenantId,
        clientIP,
        userAgent,
        {
          endpoint: request.url,
          method: request.method
        },
        'LOW'
      )
    }

    // Create admin context
    const adminContext: AdminAuthContext = {
      userId: user._id.toString(),
      tenantId: user.tenantId,
      role: user.role,
      sessionId: session._id.toString(),
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId
      },
      permissions: rbacService.getRolePermissions(user.role)
    }

    return { success: true, context: adminContext }

  } catch (error) {
    console.error('Admin middleware error:', error)
    return {
      success: false,
      response: NextResponse.json(
        { success: false, message: 'Internal server error' },
        { status: 500 }
      )
    }
  }
}

/**
 * Wrapper function to create admin route handlers with middleware
 */
export function withAdminAuth(
  handler: (request: NextRequest, context: AdminAuthContext) => Promise<NextResponse>,
  options: AdminMiddlewareOptions = {}
) {
  return async (request: NextRequest) => {
    const middlewareResult = await adminMiddleware(request, options)
    
    if (!middlewareResult.success) {
      return middlewareResult.response
    }

    try {
      return await handler(request, middlewareResult.context)
    } catch (error) {
      console.error('Admin route handler error:', error)
      
      // Log the error for audit purposes
      await auditLogger.log({
        action: 'ADMIN_API_ERROR',
        userId: middlewareResult.context.userId,
        tenantId: middlewareResult.context.tenantId,
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'Unknown',
        details: {
          endpoint: request.url,
          method: request.method,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        severity: 'HIGH'
      })

      return NextResponse.json(
        { success: false, message: 'Internal server error' },
        { status: 500 }
      )
    }
  }
}

/**
 * Common middleware configurations
 */
export const ADMIN_MIDDLEWARE_CONFIGS = {
  // General admin access
  ADMIN_ACCESS: {
    rateLimit: RATE_LIMITS.ADMIN_API_GENERAL
  },

  // Write operations
  ADMIN_WRITE: {
    rateLimit: RATE_LIMITS.ADMIN_API_WRITE,
    auditAction: 'API_WRITE_ACCESS'
  },

  // Bulk operations
  ADMIN_BULK: {
    rateLimit: RATE_LIMITS.ADMIN_API_BULK,
    auditAction: 'API_BULK_ACCESS',
    requiresDestructiveConfirmation: true
  },

  // User management
  USER_MANAGEMENT: {
    requiredPermission: Permission.MANAGE_USERS,
    rateLimit: RATE_LIMITS.ADMIN_API_WRITE,
    auditAction: 'USER_MANAGEMENT_ACCESS'
  },

  // Menu management
  MENU_MANAGEMENT: {
    requiredPermission: Permission.MANAGE_MENU,
    rateLimit: RATE_LIMITS.ADMIN_API_WRITE,
    auditAction: 'MENU_MANAGEMENT_ACCESS'
  },

  // Analytics access
  ANALYTICS_ACCESS: {
    requiredPermission: Permission.VIEW_ANALYTICS,
    rateLimit: RATE_LIMITS.ADMIN_API_GENERAL,
    auditAction: 'ANALYTICS_ACCESS'
  },

  // Settings management
  SETTINGS_MANAGEMENT: {
    requiredPermission: Permission.MANAGE_SETTINGS,
    allowedRoles: ['owner', 'manager'],
    rateLimit: RATE_LIMITS.ADMIN_API_WRITE,
    auditAction: 'SETTINGS_ACCESS',
    requiresDestructiveConfirmation: true
  },

  // Owner only access
  OWNER_ONLY: {
    allowedRoles: ['owner'],
    rateLimit: RATE_LIMITS.ADMIN_API_WRITE,
    auditAction: 'OWNER_ACCESS',
    requiresDestructiveConfirmation: true
  }
} as const
