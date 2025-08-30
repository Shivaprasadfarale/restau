import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { OrderService } from '@/lib/services/order-service'
import { verifyToken } from '@/lib/auth/jwt'

const statsQuerySchema = z.object({
  restaurantId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  period: z.enum(['today', 'week', 'month', 'custom']).default('today')
})

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ||
                  request.cookies.get('auth-token')?.value

    if (!token) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      }, { status: 401 })
    }

    const decoded = await verifyToken(token)
    if (!decoded) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired token'
        }
      }, { status: 401 })
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const queryData = {
      restaurantId: searchParams.get('restaurantId') || decoded.restaurantId,
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
      period: searchParams.get('period') || 'today'
    }

    const validatedQuery = statsQuerySchema.parse(queryData)

    // Check permissions
    if (decoded.role === 'customer') {
      return NextResponse.json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required'
        }
      }, { status: 403 })
    }

    // Calculate date range based on period
    let dateRange: { start: Date; end: Date } | undefined

    if (validatedQuery.period === 'custom' && validatedQuery.startDate && validatedQuery.endDate) {
      dateRange = {
        start: new Date(validatedQuery.startDate),
        end: new Date(validatedQuery.endDate)
      }
    } else {
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      
      switch (validatedQuery.period) {
        case 'today':
          dateRange = {
            start: today,
            end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
          }
          break
        case 'week':
          const weekStart = new Date(today)
          weekStart.setDate(today.getDate() - today.getDay()) // Start of week (Sunday)
          dateRange = {
            start: weekStart,
            end: now
          }
          break
        case 'month':
          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
          dateRange = {
            start: monthStart,
            end: now
          }
          break
      }
    }

    // Get order statistics
    const stats = await OrderService.getOrderStats(
      decoded.tenantId || 'default',
      validatedQuery.restaurantId,
      dateRange
    )

    // Get hourly breakdown for today
    let hourlyBreakdown = null
    if (validatedQuery.period === 'today' && validatedQuery.restaurantId) {
      hourlyBreakdown = await getHourlyOrderBreakdown(
        decoded.tenantId || 'default',
        validatedQuery.restaurantId,
        dateRange!
      )
    }

    // Get top items for the period
    let topItems = null
    if (validatedQuery.restaurantId) {
      topItems = await getTopItems(
        decoded.tenantId || 'default',
        validatedQuery.restaurantId,
        dateRange!
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        stats,
        hourlyBreakdown,
        topItems,
        period: validatedQuery.period,
        dateRange: dateRange ? {
          start: dateRange.start.toISOString(),
          end: dateRange.end.toISOString()
        } : null
      }
    })

  } catch (error) {
    console.error('Get order stats error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: error.issues
        }
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch order statistics'
      }
    }, { status: 500 })
  }
}

async function getHourlyOrderBreakdown(
  tenantId: string,
  restaurantId: string,
  dateRange: { start: Date; end: Date }
) {
  try {
    const { connectToDatabase } = await import('@/lib/mongodb')
    const { Order } = await import('@/models/Order')
    
    await connectToDatabase()

    const pipeline = [
      {
        $match: {
          tenantId,
          restaurantId,
          createdAt: {
            $gte: dateRange.start,
            $lte: dateRange.end
          }
        }
      },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          orderCount: { $sum: 1 },
          revenue: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, '$total.total', 0] } },
          avgOrderValue: { $avg: { $cond: [{ $eq: ['$status', 'delivered'] }, '$total.total', null] } }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]

    const result = await Order.aggregate(pipeline)
    
    // Fill in missing hours with zero values
    const hourlyData = Array.from({ length: 24 }, (_, hour) => {
      const existing = result.find(r => r._id === hour)
      return {
        hour,
        orderCount: existing?.orderCount || 0,
        revenue: existing?.revenue || 0,
        avgOrderValue: existing?.avgOrderValue || 0
      }
    })

    return hourlyData
  } catch (error) {
    console.error('Error getting hourly breakdown:', error)
    return null
  }
}

async function getTopItems(
  tenantId: string,
  restaurantId: string,
  dateRange: { start: Date; end: Date }
) {
  try {
    const { connectToDatabase } = await import('@/lib/mongodb')
    const { Order } = await import('@/models/Order')
    
    await connectToDatabase()

    const pipeline = [
      {
        $match: {
          tenantId,
          restaurantId,
          status: 'delivered',
          createdAt: {
            $gte: dateRange.start,
            $lte: dateRange.end
          }
        }
      },
      {
        $unwind: '$items'
      },
      {
        $group: {
          _id: {
            menuItemId: '$items.menuItemId',
            name: '$items.name'
          },
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.totalPrice' },
          orderCount: { $sum: 1 }
        }
      },
      {
        $sort: { totalQuantity: -1 }
      },
      {
        $limit: 10
      },
      {
        $project: {
          _id: 0,
          menuItemId: '$_id.menuItemId',
          name: '$_id.name',
          totalQuantity: 1,
          totalRevenue: 1,
          orderCount: 1,
          avgPrice: { $divide: ['$totalRevenue', '$totalQuantity'] }
        }
      }
    ]

    return await Order.aggregate(pipeline)
  } catch (error) {
    console.error('Error getting top items:', error)
    return null
  }
}