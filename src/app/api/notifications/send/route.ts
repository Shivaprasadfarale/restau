import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { connectToDatabase } from '@/lib/mongodb'
import { notificationService } from '@/lib/services/notification-service'
import { verifyToken } from '@/lib/auth/jwt'
import { rateLimiter } from '@/lib/rate-limiter'

const sendNotificationSchema = z.object({
    templateKey: z.string(),
    recipient: z.object({
        phone: z.string().optional(),
        email: z.string().email().optional(),
        preferences: z.object({
            sms: z.boolean().default(true),
            whatsapp: z.boolean().default(true),
            email: z.boolean().default(true),
            push: z.boolean().default(true)
        }),
        language: z.enum(['en', 'hi']).default('en')
    }),
    context: z.object({
        customerName: z.string(),
        orderId: z.string(),
        restaurantName: z.string(),
        orderTotal: z.string().optional(),
        estimatedTime: z.string().optional(),
        trackingUrl: z.string().optional(),
        items: z.array(z.string()).optional()
    })
})

export async function POST(request: NextRequest) {
    try {
        // Rate limiting
        const clientIP = request.headers.get('x-forwarded-for') || 'unknown'
        const rateLimitResult = await rateLimiter.checkLimit(
            `notification:${clientIP}`,
            10, // 10 notifications per minute
            60 * 1000
        )

        if (!rateLimitResult.allowed) {
            return NextResponse.json(
                { success: false, message: 'Rate limit exceeded' },
                { status: 429 }
            )
        }

        // Verify authentication
        const authHeader = request.headers.get('authorization')
        if (!authHeader) {
            return NextResponse.json(
                { success: false, message: 'Authentication required' },
                { status: 401 }
            )
        }

        const token = authHeader.replace('Bearer ', '')
        const payload = await verifyToken(token)
        if (!payload) {
            return NextResponse.json(
                { success: false, message: 'Invalid token' },
                { status: 401 }
            )
        }

        await connectToDatabase()

        const body = await request.json()
        const { templateKey, recipient, context } = sendNotificationSchema.parse(body)

        // Send notification
        const result = await notificationService.sendNotification(
            templateKey,
            context,
            recipient
        )

        return NextResponse.json({
            success: result.success,
            deliveredVia: result.deliveredVia,
            errors: result.errors
        })

    } catch (error) {
        console.error('Send notification error:', error)

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

export async function GET(request: NextRequest) {
    try {
        // Get available templates
        const templates = notificationService.getTemplates()

        return NextResponse.json({
            success: true,
            templates
        })
    } catch (error) {
        console.error('Get templates error:', error)
        return NextResponse.json(
            { success: false, message: 'Internal server error' },
            { status: 500 }
        )
    }
}