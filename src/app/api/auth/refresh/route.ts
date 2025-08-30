import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { jwtService } from '@/lib/auth/jwt'
import { authMiddleware, auditLog } from '@/lib/auth/middleware'

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
})

export async function POST(request: NextRequest) {
  // Apply rate limiting for refresh attempts
  const authResult = await authMiddleware(request, {
    requireAuth: false,
    rateLimitKey: 'refresh',
    rateLimitMax: 20, // 20 refresh attempts per hour per IP
    rateLimitWindow: 3600
  })

  if (!authResult.success) {
    return authResult.response!
  }

  try {
    const body = await request.json()
    const validatedData = refreshSchema.parse(body)

    // Get device fingerprint for validation
    const userAgent = request.headers.get('user-agent') || 'Unknown'
    const acceptLanguage = request.headers.get('accept-language') || ''
    const acceptEncoding = request.headers.get('accept-encoding') || ''
    const clientIP = request.ip || request.headers.get('x-forwarded-for') || 'Unknown'

    const deviceFingerprint = jwtService.createDeviceFingerprint(
      userAgent,
      acceptLanguage,
      acceptEncoding
    )

    // Refresh tokens using the JWT service with device validation
    const refreshResult = await jwtService.refreshTokens(validatedData.refreshToken, deviceFingerprint)

    if (!refreshResult.success) {
      // Audit failed refresh attempt
      const decoded = jwtService.decodeToken(validatedData.refreshToken)
      await auditLog(
        'TOKEN_REFRESH_FAILED',
        'Session',
        decoded?.sessionId || 'unknown',
        decoded?.userId || 'unknown',
        decoded?.tenantId || 'unknown',
        { 
          reason: refreshResult.error,
          reuseDetected: refreshResult.reuseDetected,
          clientIP
        }
      )

      const status = refreshResult.reuseDetected ? 403 : 401
      const code = refreshResult.reuseDetected ? 'TOKEN_REUSE_DETECTED' : 'REFRESH_FAILED'

      return NextResponse.json({
        success: false,
        error: {
          code,
          message: refreshResult.error || 'Token refresh failed'
        }
      }, { status })
    }

    // Audit successful refresh
    const decoded = jwtService.decodeToken(refreshResult.tokens!.accessToken)
    await auditLog(
      'TOKEN_REFRESH_SUCCESS',
      'Session',
      decoded?.sessionId || 'unknown',
      decoded?.userId || 'unknown',
      decoded?.tenantId || 'unknown',
      { 
        newTokenGenerated: true,
        clientIP: request.ip || request.headers.get('x-forwarded-for') || 'Unknown'
      }
    )

    return NextResponse.json({
      success: true,
      data: {
        tokens: {
          accessToken: refreshResult.tokens!.accessToken,
          refreshToken: refreshResult.tokens!.refreshToken,
          expiresIn: refreshResult.tokens!.expiresIn
        }
      }
    })

  } catch (error: any) {
    console.error('Token refresh error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: error.errors
        }
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'REFRESH_ERROR',
        message: 'Token refresh failed. Please login again.'
      }
    }, { status: 500 })
  }
}