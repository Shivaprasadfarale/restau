import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth, ADMIN_MIDDLEWARE_CONFIGS } from '@/lib/auth/admin-middleware'
import { User } from '@/models/User'
import { connectToDatabase } from '@/lib/mongodb'
import { auditLogger } from '@/lib/audit-logger'

// GET /api/admin/auth/sessions - Get user's active sessions
export const GET = withAdminAuth(async (request, context) => {
  await connectToDatabase()

  const user = await User.findById(context.userId)
  if (!user) {
    return NextResponse.json(
      { success: false, message: 'User not found' },
      { status: 404 }
    )
  }

  // Filter out revoked sessions and sensitive data
  const activeSessions = user.sessions
    .filter((session: any) => !session.isRevoked)
    .map((session: any) => ({
      id: session._id.toString(),
      deviceInfo: session.deviceInfo,
      ipAddress: session.ipAddress,
      lastActivity: session.lastActivity,
      isCurrent: session._id.toString() === context.sessionId,
      createdAt: session.createdAt
    }))

  return NextResponse.json({
    success: true,
    sessions: activeSessions
  })
}, ADMIN_MIDDLEWARE_CONFIGS.ADMIN_ACCESS)

// DELETE /api/admin/auth/sessions - Revoke sessions
export const DELETE = withAdminAuth(async (request, context) => {
  try {
    const { sessionIds, revokeAll } = await request.json()

    await connectToDatabase()

    const user = await User.findById(context.userId)
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 404 }
      )
    }

    let revokedCount = 0
    const clientIP = request.headers.get('x-forwarded-for') || 'unknown'
    const userAgent = request.headers.get('user-agent') || 'Unknown'

    if (revokeAll) {
      // Revoke all sessions except current one
      user.sessions.forEach((session: any) => {
        if (!session.isRevoked && session._id.toString() !== context.sessionId) {
          session.isRevoked = true
          session.revokedAt = new Date()
          session.revokedReason = 'Revoked by user - all sessions'
          revokedCount++
        }
      })

      await auditLogger.log({
        action: 'ADMIN_ALL_SESSIONS_REVOKED',
        userId: context.userId,
        tenantId: context.tenantId,
        ipAddress: clientIP,
        userAgent,
        details: {
          revokedCount,
          currentSessionId: context.sessionId
        },
        severity: 'MEDIUM'
      })
    } else if (sessionIds && Array.isArray(sessionIds)) {
      // Revoke specific sessions
      sessionIds.forEach((sessionId: string) => {
        if (sessionId !== context.sessionId) { // Don't allow revoking current session
          const session = user.sessions.id(sessionId)
          if (session && !session.isRevoked) {
            session.isRevoked = true
            session.revokedAt = new Date()
            session.revokedReason = 'Revoked by user - specific session'
            revokedCount++
          }
        }
      })

      await auditLogger.log({
        action: 'ADMIN_SESSIONS_REVOKED',
        userId: context.userId,
        tenantId: context.tenantId,
        ipAddress: clientIP,
        userAgent,
        details: {
          revokedSessionIds: sessionIds,
          revokedCount,
          currentSessionId: context.sessionId
        },
        severity: 'MEDIUM'
      })
    }

    await user.save()

    return NextResponse.json({
      success: true,
      message: `${revokedCount} session(s) revoked successfully`,
      revokedCount
    })

  } catch (error) {
    console.error('Session revocation error:', error)
    return NextResponse.json(
      { success: false, message: 'Failed to revoke sessions' },
      { status: 500 }
    )
  }
}, ADMIN_MIDDLEWARE_CONFIGS.ADMIN_WRITE)