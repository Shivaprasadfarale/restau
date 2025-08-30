import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { connectToDatabase } from '@/lib/mongodb'
import { User } from '@/models'
import { passwordService } from '@/lib/auth/password'
import { jwtService } from '@/lib/auth/jwt'
import { authMiddleware } from '@/lib/auth/middleware'
import { getClientIP, getUserAgent, getAcceptLanguage, getAcceptEncoding } from '@/lib/auth/utils'

const registerSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  phone: z.string().optional(),
  role: z.enum(['customer', 'owner', 'manager', 'staff', 'courier']).default('customer'),
  tenantId: z.string().optional() // For admin creating users
})

export async function POST(request: NextRequest) {
  // Apply rate limiting
  const authResult = await authMiddleware(request, {
    requireAuth: false,
    rateLimitKey: 'register',
    rateLimitMax: 5, // 5 registrations per hour per IP
    rateLimitWindow: 3600
  })

  if (!authResult.success) {
    return authResult.response!
  }

  try {
    await connectToDatabase()

    const body = await request.json()
    const validatedData = registerSchema.parse(body)

    // Validate password strength
    const passwordValidation = passwordService.validatePassword(validatedData.password)
    if (!passwordValidation.valid) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'WEAK_PASSWORD',
          message: 'Password does not meet security requirements',
          details: passwordValidation.errors
        }
      }, { status: 400 })
    }

    // Check for password breaches
    const isBreached = await passwordService.checkPasswordBreach(validatedData.password)
    if (isBreached) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'BREACHED_PASSWORD',
          message: 'This password has been found in data breaches. Please choose a different password.'
        }
      }, { status: 400 })
    }

    // Determine tenant ID
    let tenantId = validatedData.tenantId
    
    // For customer registration, create new tenant
    if (validatedData.role === 'customer' && !tenantId) {
      tenantId = new Date().getTime().toString() // Simple tenant ID generation
    }
    
    // For staff/manager registration, require existing tenant
    if (['staff', 'manager', 'courier'].includes(validatedData.role) && !tenantId) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'TENANT_REQUIRED',
          message: 'Tenant ID required for staff registration'
        }
      }, { status: 400 })
    }

    if (!tenantId) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'TENANT_REQUIRED',
          message: 'Tenant ID is required'
        }
      }, { status: 400 })
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      email: validatedData.email,
      tenantId
    })

    if (existingUser) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'USER_EXISTS',
          message: 'User with this email already exists'
        }
      }, { status: 409 })
    }

    // Hash password
    const passwordHash = await passwordService.hashPassword(validatedData.password)

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

    // Create user
    const user = new User({
      tenantId,
      email: validatedData.email,
      passwordHash,
      name: validatedData.name,
      phone: validatedData.phone,
      role: validatedData.role,
      addresses: [],
      preferences: {
        dietaryRestrictions: [],
        spiceLevel: 'medium',
        favoriteItems: []
      },
      sessions: [],
      isVerified: false, // Email verification required
      lastLogin: new Date()
    })

    // Add initial session
    const sessionId = passwordService.generateSessionId()
    user.addSession(userAgent, clientIP, deviceFingerprint)
    user.sessions[0]._id = sessionId

    await user.save()

    // Generate tokens
    const tokens = await jwtService.generateTokenPair(
      user._id.toString(),
      tenantId,
      validatedData.role,
      sessionId,
      deviceFingerprint
    )

    // Return success response (exclude sensitive data)
    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          isVerified: user.isVerified,
          tenantId: user.tenantId
        },
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn
        }
      }
    }, { status: 201 })

  } catch (error: any) {
    console.error('Registration error:', error)

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

    if (error.code === 11000) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'DUPLICATE_EMAIL',
          message: 'Email already exists'
        }
      }, { status: 409 })
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'REGISTRATION_FAILED',
        message: 'Registration failed. Please try again.'
      }
    }, { status: 500 })
  }
}