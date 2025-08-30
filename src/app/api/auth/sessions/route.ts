import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { User } from '@/models'
import { withAuth } from '@/lib/auth/middleware'

export const GET = withAuth(async (request: NextRequest, { user, authContext }) => {
  try {
    await connectToDatabase()

    // Get user with sessions
    const userDoc = await User.findById(user.userId).select('sessions')
    
    if (!userDoc) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      }, { status: 404 })
    }

    // Filter and format active sessions
    const activeSessions = userDoc.sessions
      .filter((session: any) => !session.isRevoked)
      .map((session: any) => ({
        id: session._id,
        deviceInfo: session.deviceInfo,
        ipAddress: session.ipAddress,
        lastActivity: session.lastActivity,
        isCurrent: session._id.toString() === user.sessionId,
        createdAt: session._id.getTimestamp() // ObjectId contains timestamp
      }))
      .sort((a: any, b: any) => b.lastActivity - a.lastActivity)

    return NextResponse.json({
      success: true,
      data: {
        sessions: activeSessions,
        totalSessions: activeSessions.length,
        currentSessionId: user.sessionId
      }
    })

  } catch (error: any) {
    console.error('Sessions list error:', error)

    return NextResponse.json({
      success: false,
      error: {
        code: 'SESSIONS_ERROR',
        message: 'Failed to retrieve sessions'
      }
    }, { status: 500 })
  }
}, {
  rateLimitKey: 'sessions',
  rateLimitMax: 30,
  rateLimitWindow: 3600
})