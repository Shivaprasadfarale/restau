import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'
import { User } from '@/models/User'
import { connectToDatabase } from '@/lib/mongodb'
import { rbacService } from '@/lib/auth/rbac'
import { auditLogger } from '@/lib/audit-logger'

export async function GET(request: NextRequest) {
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
        action: 'ADMIN_ACCESS_DENIED',
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

    // Prepare user data for response
    const userData = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      permissions: rbacService.getRolePermissions(user.role),
      lastLogin: user.lastLogin,
      sessionInfo: {
        id: session._id.toString(),
        lastActivity: session.lastActivity,
        deviceInfo: session.deviceInfo
      }
    }

    return NextResponse.json({
      success: true,
      user: userData
    })

  } catch (error) {
    console.error('Admin auth check error:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}