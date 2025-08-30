import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { notificationService } from '@/lib/services/notification-service'
import { verifyToken } from '@/lib/auth/jwt'

const testNotificationSchema = z.object({
  type: z.enum(['sms', 'whatsapp', 'email']),
  recipient: z.string()
})

export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { success: false, message: 'Authentication required' },
        { status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const payload = await verifyToken(token)
    if (!payload || !['owner', 'manager'].includes(payload.role)) {
      return NextResponse.json(
        { success: false, message: 'Admin access required' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { type, recipient } = testNotificationSchema.parse(body)

    // Test notification
    const success = await notificationService.testNotification(type, recipient)

    return NextResponse.json({
      success,
      message: success ? 'Test notification sent successfully' : 'Test notification failed'
    })

  } catch (error) {
    console.error('Test notification error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: 'Invalid input', errors: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}