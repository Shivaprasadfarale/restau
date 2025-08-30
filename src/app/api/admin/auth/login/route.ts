import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { User } from '@/models/User'
import { connectToDatabase } from '@/lib/mongodb'
import { jwtService } from '@/lib/auth/jwt'
import { rbacService } from '@/lib/auth/rbac'
import { auditLogger } from '@/lib/audit-logger'
import { advancedRateLimiter } from '@/lib/rate-limiter'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
  deviceInfo: z.string().optional().default('Unknown Device'),
  rememberMe: z.boolean().optional().default(false)
})

export async function POST(request: NextRequest) {
  try {
    console.log('Admin login API called')
    
    const body = await request.json()
    console.log('Request body:', { email: body.email, hasPassword: !!body.password })
    
    const { email, password, deviceInfo = 'Unknown Device', rememberMe = false } = loginSchema.parse(body)

    await connectToDatabase()
    console.log('Database connected')

    // Find user by email (admin roles only)
    const user = await User.findOne({ 
      email: email.toLowerCase(),
      role: { $in: ['owner', 'manager', 'staff', 'courier'] },
      isDeleted: { $ne: true }
    }).exec()

    console.log('User found:', !!user, user?.email, user?.role)

    if (!user) {
      console.log('User not found or not admin')
      return NextResponse.json(
        { success: false, message: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Verify password
    const isValidPassword = await user.comparePassword(password)
    console.log('Password valid:', isValidPassword)
    
    if (!isValidPassword) {
      console.log('Invalid password')
      return NextResponse.json(
        { success: false, message: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Check if user can access admin panel
    if (!rbacService.canAccessAdmin(user.role)) {
      console.log('Access denied for role:', user.role)
      return NextResponse.json(
        { success: false, message: 'Access denied' },
        { status: 403 }
      )
    }

    // Update last login (skip session management for now)
    user.lastLogin = new Date()
    await user.save()
    console.log('User updated')

    // Generate simple JWT token
    const { accessToken } = await jwtService.generateTokenPair(
      user._id.toString(),
      user.tenantId,
      user.role,
      'simple-session',
      'simple-device'
    )
    console.log('Token generated')

    // Prepare user data for response (excluding sensitive fields)
    const userData = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      permissions: rbacService.getRolePermissions(user.role),
      lastLogin: user.lastLogin
    }

    console.log('Sending success response')
    return NextResponse.json({
      success: true,
      user: userData,
      tokens: {
        accessToken
      }
    })

  } catch (error) {
    console.error('Admin login error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Invalid input data',
          errors: error.issues 
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { success: false, message: 'Internal server error', error: error.message },
      { status: 500 }
    )
  }
}
