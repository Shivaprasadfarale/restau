import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { jwtService } from '@/lib/auth/jwt'
import { withAuth, auditLog } from '@/lib/auth/middleware'

const logoutSchema = z.object({
  logoutAll: z.boolean().default(false) // Logout from all devices
})

export const POST = withAuth(async (request: NextRequest, { user, authContext }) => {
  try {
    const body = await request.json().catch(() => ({}))
    const validatedData = logoutSchema.parse(body)

    if (validatedData.logoutAll) {
      // Revoke all sessions for the user
      const success = await jwtService.revokeAllUserSessions(user.userId)
      
      if (success) {
        await auditLog(
          'LOGOUT_ALL_SESSIONS',
          'User',
          user.userId,
          user.userId,
          user.tenantId,
          { 
            sessionId: user.sessionId,
            clientIP: request.ip || request.headers.get('x-forwarded-for') || 'Unknown'
          }
        )

        return NextResponse.json({
          success: true,
          data: {
            message: 'Logged out from all devices successfully'
          }
        })
      }
    } else {
      // Revoke current session and token
      const sessionSuccess = await jwtService.revokeSession(user.userId, user.sessionId)
      
      // Also revoke the current access token
      if (user.jti) {
        await jwtService.revokeToken(user.jti)
      }
      
      if (sessionSuccess) {
        await auditLog(
          'LOGOUT',
          'Session',
          user.sessionId,
          user.userId,
          user.tenantId,
          { 
            tokenRevoked: !!user.jti,
            clientIP: request.ip || request.headers.get('x-forwarded-for') || 'Unknown'
          }
        )

        return NextResponse.json({
          success: true,
          data: {
            message: 'Logged out successfully'
          }
        })
      }
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'LOGOUT_FAILED',
        message: 'Logout failed. Session may already be expired.'
      }
    }, { status: 400 })

  } catch (error: any) {
    console.error('Logout error:', error)

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
        code: 'LOGOUT_ERROR',
        message: 'Logout failed. Please try again.'
      }
    }, { status: 500 })
  }
}, {
  rateLimitKey: 'logout',
  rateLimitMax: 30,
  rateLimitWindow: 3600
})