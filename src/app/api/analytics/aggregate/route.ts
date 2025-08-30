import { NextRequest, NextResponse } from 'next/server'
import { analyticsService } from '@/lib/services/analytics-service'
import { z } from 'zod'

const aggregateSchema = z.object({
  tenantId: z.string().min(1),
  restaurantId: z.string().min(1),
  date: z.string().optional(),
  secret: z.string().min(1)
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = aggregateSchema.parse(body)

    // Verify the secret for scheduled job security
    if (validatedData.secret !== process.env.ANALYTICS_CRON_SECRET) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const date = validatedData.date ? new Date(validatedData.date) : new Date()
    
    await analyticsService.aggregateDailyMetrics(
      validatedData.tenantId,
      validatedData.restaurantId,
      date
    )

    return NextResponse.json({
      success: true,
      message: `Daily metrics aggregated for ${date.toISOString().split('T')[0]}`
    })
  } catch (error) {
    console.error('Analytics aggregation error:', error)

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

    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to aggregate analytics data' 
      },
      { status: 500 }
    )
  }
}

// Health check endpoint for the aggregation service
export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Analytics aggregation service is running',
    timestamp: new Date().toISOString()
  })
}