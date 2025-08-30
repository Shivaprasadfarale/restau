import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'
import { User } from '@/models/User'
import { connectToDatabase } from '@/lib/mongodb'
import { auditLogger } from '@/lib/audit-logger'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, message: 'No token provided' },
        { status: 401 }
      )
    }

    const token = authHeader.substring(7)
    const payload = await verifyToken(token)

    if (!payload) {
      return NextResponse.json(
        { success: false, message: 'Invalid token' },
        { status: 401 }
      )
    }

    await connectToDatabase()

    // Find user
    const user = await User.findById(payload.userId)
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 401 }
      )
    }

    // Revoke the current session
    user.revokeSession(payload.sessionId, 'User logout')
    await user.save()

    // Log logout
    await auditLogger.log({
      action: 'ADMIN_LOGOUT',
      userId: user._id.toString(),
      tenantId: user.tenantId,
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'Unknown',
      details: {
        sessionId: payload.sessionId
      },
      severity: 'LOW'
    })

    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully'
    })

    // Clear refresh token cookie
    response.cookies.set('admin_refresh_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0,
      path: '/api/admin'
    })

    return response

  } catch (error) {
    console.error('Admin logout error:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}