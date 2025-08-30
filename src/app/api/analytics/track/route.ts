import { NextRequest, NextResponse } from 'next/server'
import { analyticsService } from '@/lib/services/analytics-service'
import { z } from 'zod'
import { headers } from 'next/headers'

const trackEventSchema = z.object({
  eventType: z.enum(['page_view', 'menu_item_view', 'add_to_cart', 'remove_from_cart', 'checkout_start', 'payment_success', 'payment_failed', 'order_placed']),
  sessionId: z.string().min(1).max(100),
  restaurantId: z.string().min(1),
  userId: z.string().optional(),
  metadata: z.object({
    menuItemId: z.string().optional(),
    categoryId: z.string().optional(),
    orderValue: z.number().min(0).optional(),
    paymentMethod: z.enum(['card', 'upi_intent', 'upi_collect', 'wallet', 'netbanking']).optional(),
    userAgent: z.string().max(500).optional(),
    referrer: z.string().max(500).optional(),
    timeOnPage: z.number().min(0).optional()
  }).optional()
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = trackEventSchema.parse(body)

    // Get tenant ID from headers or session
    const tenantId = request.headers.get('x-tenant-id') || 'default'
    
    // Get IP address for hashing (privacy-preserving)
    const headersList = headers()
    const forwardedFor = headersList.get('x-forwarded-for')
    const realIp = headersList.get('x-real-ip')
    const ipAddress = forwardedFor?.split(',')[0] || realIp || request.ip

    // Get user agent
    const userAgent = headersList.get('user-agent') || ''

    await analyticsService.trackEvent(tenantId, {
      ...validatedData,
      metadata: {
        ...validatedData.metadata,
        userAgent
      },
      ipAddress
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Event tracked successfully' 
    })
  } catch (error) {
    console.error('Analytics tracking error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid request data',
          details: error.errors 
        },
        { status: 400 }
      )
    }

    // Don't fail the request for analytics errors
    return NextResponse.json({ 
      success: true, 
      message: 'Event tracking failed silently' 
    })
  }
}