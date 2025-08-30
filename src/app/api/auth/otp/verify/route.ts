import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { connectToDatabase } from '@/lib/mongodb'
import { User } from '@/models'
import { passwordService } from '@/lib/auth/password'
import { jwtService } from '@/lib/auth/jwt'
import { authMiddleware, auditLog } from '@/lib/auth/middleware'
import { otpService } from '@/lib/auth/otp-service'

const verifyOTPSchema = z.object({
  phone: z.string().regex(/^\+?[\d\s-()]+$/, 'Invalid phone number format'),
  otp: z.string().length(6, 'OTP must be 6 digits'),
  purpose: z.enum(['registration', 'login', 'verification']).default('verification'),
  tenantId: z.string().optional()
})

export async function POST(request: NextRequest) {
  // Apply rate limiting for OTP verification
  const authResult = await authMiddleware(request, {
    requireAuth: false,
    rateLimitKey: 'otp-verify',
    rateLimitMax: 10, // 10 verification attempts per hour per IP
    rateLimitWindow: 3600
  })

  if (!authResult.success) {
    return authResult.response!
  }

  try {
    await connectToDatabase()

    const body = await request.json()
    const validatedData = verifyOTPSchema.parse(body)

    // Verify OTP using the enhanced service
    const verificationResult = await otpService.verifyOTP(validatedData.phone, validatedData.otp)
    
    if (!verificationResult.valid) {
      await auditLog(
        'OTP_VERIFICATION_FAILED',
        'Phone',
        validatedData.phone,
        'anonymous',
        validatedData.tenantId || 'unknown',
        { 
          error: verificationResult.error,
          purpose: validatedData.purpose
        }
      )

      const status = verificationResult.blockedUntil ? 429 : 400
      return NextResponse.json({
        success: false,
        error: {
          code: verificationResult.blockedUntil ? 'PHONE_BLOCKED' : 'OTP_VERIFICATION_FAILED',
          message: verificationResult.error || 'OTP verification failed',
          attemptsRemaining: verificationResult.attemptsRemaining,
          blockedUntil: verificationResult.blockedUntil
        }
      }, { status })
    }

    const normalizedPhone = validatedData.phone.replace(/\s|-|\(|\)/g, '')

    // Handle different purposes
    if (validatedData.purpose === 'login') {
      // Find user by phone number
      const user = await User.findOne({
        phone: normalizedPhone,
        ...(validatedData.tenantId && { tenantId: validatedData.tenantId })
      })

      if (!user) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'No account found with this phone number.'
          }
        }, { status: 404 })
      }

      // Create session and generate tokens
      const userAgent = request.headers.get('user-agent') || 'Unknown'
      const acceptLanguage = request.headers.get('accept-language') || ''
      const acceptEncoding = request.headers.get('accept-encoding') || ''
      const clientIP = request.ip || request.headers.get('x-forwarded-for') || 'Unknown'
      
      // Generate device fingerprint
      const deviceFingerprint = passwordService.generateDeviceFingerprint(
        userAgent,
        acceptLanguage,
        acceptEncoding,
        clientIP
      )
      
      const sessionId = passwordService.generateSessionId()
      user.addSession(userAgent, clientIP, deviceFingerprint)
      
      const newSession = user.sessions[user.sessions.length - 1]
      newSession._id = sessionId
      
      user.lastLogin = new Date()
      await user.save()

      const tokens = await jwtService.generateTokenPair(
        user._id.toString(),
        user.tenantId,
        user.role,
        sessionId,
        deviceFingerprint
      )

      await auditLog(
        'OTP_LOGIN_SUCCESS',
        'User',
        user._id.toString(),
        user._id.toString(),
        user.tenantId,
        { 
          phone: normalizedPhone,
          sessionId,
          clientIP
        }
      )

      return NextResponse.json({
        success: true,
        data: {
          user: {
            id: user._id,
            email: user.email,
            name: user.name,
            phone: user.phone,
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
      })
    }

    // For registration or verification purposes
    await auditLog(
      'OTP_VERIFICATION_SUCCESS',
      'Phone',
      normalizedPhone,
      'anonymous',
      validatedData.tenantId || 'unknown',
      { purpose: validatedData.purpose }
    )

    return NextResponse.json({
      success: true,
      data: {
        message: 'OTP verified successfully',
        phone: normalizedPhone,
        verified: true
      }
    })

  } catch (error: any) {
    console.error('Verify OTP error:', error)

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
        code: 'OTP_VERIFY_ERROR',
        message: 'Failed to verify OTP. Please try again.'
      }
    }, { status: 500 })
  }
}