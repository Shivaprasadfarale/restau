import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { connectToDatabase } from '@/lib/mongodb'
import { otpService } from '@/lib/auth/otp-service'
import { authMiddleware } from '@/lib/auth/middleware'

const sendOTPSchema = z.object({
  phone: z.string().regex(/^\+?[\d\s-()]+$/, 'Invalid phone number format'),
  purpose: z.enum(['registration', 'login', 'verification']).default('verification')
})

export async function POST(request: NextRequest) {
  // Apply rate limiting for OTP requests
  const authResult = await authMiddleware(request, {
    requireAuth: false,
    rateLimitKey: 'otp-send',
    rateLimitMax: 5, // 5 OTP requests per hour per IP
    rateLimitWindow: 3600
  })

  if (!authResult.success) {
    return authResult.response!
  }

  try {
    await connectToDatabase()

    const body = await request.json()
    const validatedData = sendOTPSchema.parse(body)

    // Generate OTP using the enhanced service
    const otpResult = await otpService.generateOTP(validatedData.phone, validatedData.purpose)
    
    if (!otpResult.success) {
      const status = otpResult.retryAfter ? 429 : 500
      return NextResponse.json({
        success: false,
        error: {
          code: otpResult.retryAfter ? 'RATE_LIMITED' : 'OTP_GENERATION_FAILED',
          message: otpResult.error || 'Failed to generate OTP',
          retryAfter: otpResult.retryAfter
        }
      }, { status })
    }

    // In production, send OTP via SMS service (Twilio, etc.)
    console.log(`OTP for ${validatedData.phone}: ${otpResult.otp}`) // For development only

    // Simulate SMS sending
    const smsResult = await simulateSMSSend(validatedData.phone, otpResult.otp!)
    
    if (!smsResult.success) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'SMS_SEND_FAILED',
          message: 'Failed to send OTP. Please try again.'
        }
      }, { status: 500 })
    }

    const normalizedPhone = validatedData.phone.replace(/\s|-|\(|\)/g, '')
    return NextResponse.json({
      success: true,
      data: {
        message: 'OTP sent successfully',
        expiresIn: 600, // 10 minutes
        phone: normalizedPhone.replace(/(\d{2})(\d{4})(\d{4})/, '+91 $1****$3') // Masked phone
      }
    })

  } catch (error: any) {
    console.error('Send OTP error:', error)

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
        code: 'OTP_SEND_ERROR',
        message: 'Failed to send OTP. Please try again.'
      }
    }, { status: 500 })
  }
}

// Simulate SMS sending (replace with actual SMS service in production)
async function simulateSMSSend(phone: string, otp: string): Promise<{ success: boolean; messageId?: string }> {
  // In production, integrate with Twilio, AWS SNS, or other SMS service
  try {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Simulate success/failure (95% success rate)
    const success = Math.random() > 0.05
    
    if (success) {
      return {
        success: true,
        messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
    } else {
      throw new Error('SMS service unavailable')
    }
  } catch (error) {
    console.error('SMS send error:', error)
    return { success: false }
  }
}

