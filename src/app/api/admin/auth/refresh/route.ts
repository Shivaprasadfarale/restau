import { NextRequest, NextResponse } from 'next/server'
import { verifyRefreshToken, generateTokens } from '@/lib/auth/jwt'
import { User } from '@/models/User'
import { connectToDatabase } from '@/lib/mongodb'
import { rbacService } from '@/lib/auth/rbac'
import { auditLogger } from '@/lib/audit-logger'

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get('admin_refresh_token')?.value

    if (!refreshToken) {
      return NextResponse.json(
        { success: false, message: 'No refresh token provided' },
        { status: 401 }
      )
    }

    const payload = await verifyRefreshToken(refreshToken)
    if (!payload) {
      return NextResponse.json(
        { success: false, message: 'Invalid refresh token' },
        { status: 401 }
      )
    }

    await connectToDatabase()

    // Find user and validate session
    const user = await User.findById(payload.userId)
    if (!user || user.tenantId !== payload.tenantId) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 401 }
      )
    }

    // Check if user can access admin panel
    if (!rbacService.canAccessAdmin(user.role)) {
      await auditLogger.log({
        action: 'ADMIN_REFRESH_DENIED',
        userId: user._id.toString(),
        tenantId: user.tenantId,
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'Unknown',
        details: {
          role: user.role,
          reason: 'Insufficient permissions for admin access'
        },
        severity: 'HIGH'
      })

      return NextResponse.json(
        { success: false, message: 'Access denied' },
        { status: 403 }
      )
    }

    // Validate session
    const session = user.sessions.id(payload.sessionId)
    if (!session || session.isRevoked) {
      return NextResponse.json(
        { success: false, message: 'Session expired or revoked' },
        { status: 401 }
      )
    }

    // Update session activity
    session.lastActivity = new Date()
    await user.save()

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = await generateTokens({
      userId: user._id.toString(),
      tenantId: user.tenantId,
      role: user.role,
      sessionId: session._id.toString()
    })

    // Log token refresh
    await auditLogger.log({
      action: 'ADMIN_TOKEN_REFRESHED',
      userId: user._id.toString(),
      tenantId: user.tenantId,
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'Unknown',
      details: {
        sessionId: session._id.toString()
      },
      severity: 'LOW'
    })

    const response = NextResponse.json({
      success: true,
      accessToken,
      expiresIn: '24h'
    })

    // Set new refresh token cookie
    response.cookies.set('admin_refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/api/admin'
    })

    return response

  } catch (error) {
    console.error('Admin token refresh error:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}