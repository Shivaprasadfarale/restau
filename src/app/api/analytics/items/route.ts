import { NextRequest, NextResponse } from 'next/server'
import { analyticsService } from '@/lib/services/analytics-service'
import { withAdminAuth, ADMIN_MIDDLEWARE_CONFIGS } from '@/lib/auth/admin-middleware'
import { z } from 'zod'

const itemsQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  restaurantId: z.string().min(1),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 50)
})

export const GET = withAdminAuth(async (request: NextRequest, context) => {
  try {
    const { searchParams } = new URL(request.url)
    const queryData = {
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
      restaurantId: searchParams.get('restaurantId') || '',
      limit: searchParams.get('limit')
    }

    const validatedQuery = itemsQuerySchema.parse(queryData)

    // Default to last 30 days if no dates provided
    const now = new Date()
    const startDate = validatedQuery.startDate 
      ? new Date(validatedQuery.startDate) 
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const endDate = validatedQuery.endDate 
      ? new Date(validatedQuery.endDate) 
      : now

    const itemPerformance = await analyticsService.getItemPerformance(
      context.tenantId,
      validatedQuery.restaurantId,
      startDate,
      endDate
    )

    // Limit results
    const limitedResults = itemPerformance.slice(0, validatedQuery.limit)

    return NextResponse.json({
      success: true,
      data: {
        items: limitedResults,
        period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
        totalItems: itemPerformance.length
      }
    })
  } catch (error) {
    console.error('Item analytics error:', error)

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
        error: 'Failed to fetch item analytics' 
      },
      { status: 500 }
    )
  }
}, ADMIN_MIDDLEWARE_CONFIGS.ANALYTICS_ACCESS)