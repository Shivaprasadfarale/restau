import { NextRequest, NextResponse } from 'next/server'
import { analyticsService } from '@/lib/services/analytics-service'
import { withAdminAuth, ADMIN_MIDDLEWARE_CONFIGS } from '@/lib/auth/admin-middleware'
import { z } from 'zod'

const salesQuerySchema = z.object({
  period: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  restaurantId: z.string().min(1)
})

export const GET = withAdminAuth(async (request: NextRequest, context) => {
  try {
    const { searchParams } = new URL(request.url)
    const queryData = {
      period: searchParams.get('period') || 'daily',
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
      restaurantId: searchParams.get('restaurantId') || ''
    }

    const validatedQuery = salesQuerySchema.parse(queryData)

    const startDate = validatedQuery.startDate ? new Date(validatedQuery.startDate) : undefined
    const endDate = validatedQuery.endDate ? new Date(validatedQuery.endDate) : undefined

    const salesAnalytics = await analyticsService.getSalesAnalytics(
      context.tenantId,
      validatedQuery.restaurantId,
      validatedQuery.period,
      startDate,
      endDate
    )

    return NextResponse.json({
      success: true,
      data: salesAnalytics
    })
  } catch (error) {
    console.error('Sales analytics error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid query parameters',
          details: error.issues 
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch sales analytics' 
      },
      { status: 500 }
    )
  }
}, ADMIN_MIDDLEWARE_CONFIGS.ANALYTICS_ACCESS)