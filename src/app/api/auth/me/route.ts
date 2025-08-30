import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { User } from '@/models'
import { withAuth } from '@/lib/auth/middleware'
import { rbacService } from '@/lib/auth/rbac'

export const GET = withAuth(async (request: NextRequest, { user, authContext }) => {
  try {
    await connectToDatabase()

    // Fetch fresh user data
    const userData = await User.findById(user.userId).select('-passwordHash')
    
    if (!userData || userData.tenantId !== user.tenantId) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      }, { status: 404 })
    }

    // Get user permissions
    const permissions = rbacService.getRolePermissions(authContext.role)
    const canAccessAdmin = rbacService.canAccessAdmin(authContext.role)

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: userData._id,
          email: userData.email,
          name: userData.name,
          phone: userData.phone,
          role: userData.role,
          isVerified: userData.isVerified,
          tenantId: userData.tenantId,
          addresses: userData.addresses,
          preferences: userData.preferences,
          lastLogin: userData.lastLogin,
          createdAt: userData.createdAt,
          updatedAt: userData.updatedAt
        },
        permissions,
        canAccessAdmin,
        session: {
          sessionId: user.sessionId,
          activeSessions: userData.sessions.filter(s => !s.isRevoked).length
        }
      }
    })

  } catch (error: any) {
    console.error('Get user profile error:', error)

    return NextResponse.json({
      success: false,
      error: {
        code: 'PROFILE_ERROR',
        message: 'Failed to fetch user profile'
      }
    }, { status: 500 })
  }
}, {
  rateLimitKey: 'profile',
  rateLimitMax: 60,
  rateLimitWindow: 3600
})