import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { jwtService } from '@/lib/auth/jwt'
import { withAuth, auditLog } from '@/lib/auth/middleware'

const revokeSchema = z.object({
  sessionId: z.string().optional(),
  revokeAll: z.boolean().default(false),
  reason: z.string().max(200).optional()
})

export const POST = withAuth(async (request: NextRequest, { user, authContext }) => {
  try {
    const body = await request.json()
    const validatedData = revokeSchema.parse(body)

    if (validatedData.revokeAll) {
      // Revoke all sessions for the user
      const success = await jwtService.revokeAllUserSessions(user.userId)
      
      if (success) {
        await auditLog(
          'ALL_SESSIONS_REVOKED',
          'User',
          user.userId,
          user.userId,
          user.tenantId,
          { 
            reason: validatedData.reason || 'User requested',
            clientIP: request.ip || request.headers.get('x-forwarded-for') || 'Unknown'
          }
        )

        return NextResponse.json({
          success: true,
          data: {
            message: 'All sessions revoked successfully'
          }
        })
      } else {
        return NextResponse.json({
          success: false,
          error: {
            code: 'REVOCATION_FAILED',
            message: 'Failed to revoke sessions'
          }
        }, { status: 500 })
      }
    } else if (validatedData.sessionId) {
      // Revoke specific session
      const success = await jwtService.revokeSession(user.userId, validatedData.sessionId)
      
      if (success) {
        await auditLog(
          'SESSION_REVOKED',
          'Session',
          validatedData.sessionId,
          user.userId,
          user.tenantId,
          { 
            reason: validatedData.reason || 'User requested',
            clientIP: request.ip || request.headers.get('x-forwarded-for') || 'Unknown'
          }
        )

        return NextResponse.json({
          success: true,
          data: {
            message: 'Session revoked successfully'
          }
        })
      } else {
        return NextResponse.json({
          success: false,
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'Session not found or already revoked'
          }
        }, { status: 404 })
      }
    } else {
      // Revoke current session
      const success = await jwtService.revokeSession(user.userId, user.sessionId)
      
      if (success) {
        // Also revoke the current token
        if (user.jti) {
          await jwtService.revokeToken(user.jti)
        }

        await auditLog(
          'CURRENT_SESSION_REVOKED',
          'Session',
          user.sessionId,
          user.userId,
          user.tenantId,
          { 
            reason: validatedData.reason || 'User logout',
            clientIP: request.ip || request.headers.get('x-forwarded-for') || 'Unknown'
          }
        )

        return NextResponse.json({
          success: true,
          data: {
            message: 'Current session revoked successfully'
          }
        })
      } else {
        return NextResponse.json({
          success: false,
          error: {
            code: 'REVOCATION_FAILED',
            message: 'Failed to revoke current session'
          }
        }, { status: 500 })
      }
    }

  } catch (error: any) {
    console.error('Token revocation error:', error)

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
        code: 'REVOCATION_ERROR',
        message: 'Token revocation failed'
      }
    }, { status: 500 })
  }
}, {
  rateLimitKey: 'revoke',
  rateLimitMax: 20,
  rateLimitWindow: 3600
})