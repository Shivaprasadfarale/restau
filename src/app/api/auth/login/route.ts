import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { connectToDatabase } from '@/lib/mongodb'
import { User } from '@/models'
import { passwordService } from '@/lib/auth/password'
import { jwtService } from '@/lib/auth/jwt'
import { authMiddleware, auditLog } from '@/lib/auth/middleware'
import { getClientIP, getUserAgent, getAcceptLanguage, getAcceptEncoding } from '@/lib/auth/utils'

const loginSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
  tenantId: z.string().optional(),
  rememberMe: z.boolean().default(false)
})

export async function POST(request: NextRequest) {
  // Apply rate limiting for login attempts
  const authResult = await authMiddleware(request, {
    requireAuth: false,
    rateLimitKey: 'login',
    rateLimitMax: 10, // 10 login attempts per hour per IP
    rateLimitWindow: 3600
  })

  if (!authResult.success) {
    return authResult.response!
  }

  try {
    await connectToDatabase()

    const body = await request.json()
    const validatedData = loginSchema.parse(body)

    // Find user by email
    let user
    if (validatedData.tenantId) {
      // Specific tenant login (admin panel)
      user = await User.findOne({
        email: validatedData.email,
        tenantId: validatedData.tenantId
      })
    } else {
      // Customer login - find any tenant (for multi-tenant support)
      user = await User.findOne({
        email: validatedData.email,
        role: 'customer'
      })
    }

    if (!user) {
      // Audit failed login attempt
      await auditLog(
        'LOGIN_FAILED',
        'User',
        validatedData.email,
        'anonymous',
        validatedData.tenantId || 'unknown',
        { reason: 'User not found', email: validatedData.email }
      )

      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password'
        }
      }, { status: 401 })
    }

    // Verify password
    const isValidPassword = await passwordService.verifyPassword(
      validatedData.password,
      user.passwordHash
    )

    if (!isValidPassword) {
      // Audit failed login attempt
      await auditLog(
        'LOGIN_FAILED',
        'User',
        user._id.toString(),
        user._id.toString(),
        user.tenantId,
        { reason: 'Invalid password', email: validatedData.email }
      )

      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password'
        }
      }, { status: 401 })
    }

    // Check if account is active
    if (user.isDeleted) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'ACCOUNT_DISABLED',
          message: 'Account has been disabled'
        }
      }, { status: 403 })
    }

    // Get client info for session
    const userAgent = getUserAgent(request)
    const acceptLanguage = getAcceptLanguage(request)
    const acceptEncoding = getAcceptEncoding(request)
    const clientIP = getClientIP(request)

    // Generate device fingerprint
    const deviceFingerprint = passwordService.generateDeviceFingerprint(
      userAgent,
      acceptLanguage,
      acceptEncoding,
      clientIP
    )

    // Create new session
    const sessionId = passwordService.generateSessionId()
    user.addSession(userAgent, clientIP, deviceFingerprint)
    
    // Set the session ID for the new session
    const newSession = user.sessions[user.sessions.length - 1]
    newSession._id = sessionId

    // Update last login
    user.lastLogin = new Date()
    await user.save()

    // Generate tokens
    const tokens = await jwtService.generateTokenPair(
      user._id.toString(),
      user.tenantId,
      user.role,
      sessionId,
      deviceFingerprint
    )

    // Audit successful login
    await auditLog(
      'LOGIN_SUCCESS',
      'User',
      user._id.toString(),
      user._id.toString(),
      user.tenantId,
      { 
        email: validatedData.email,
        userAgent,
        clientIP,
        sessionId
      }
    )

    // Return success response
    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          isVerified: user.isVerified,
          tenantId: user.tenantId,
          lastLogin: user.lastLogin
        },
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn
        }
      }
    })

  } catch (error: any) {
    console.error('Login error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: error.issues
        }
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'LOGIN_FAILED',
        message: 'Login failed. Please try again.'
      }
    }, { status: 500 })
  }
}