import { NextRequest, NextResponse } from 'next/server'
import { OrderService } from '@/lib/services/order-service'
import { verifyToken } from '@/lib/auth/jwt'

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

    // Check admin permissions
    if (!['owner', 'manager', 'staff'].includes(decoded.role)) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required'
        }
      }, { status: 403 })
    }

    const restaurantId = decoded.restaurantId || request.nextUrl.searchParams.get('restaurantId')
    
    if (!restaurantId) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'MISSING_RESTAURANT_ID',
          message: 'Restaurant ID is required'
        }
      }, { status: 400 })
    }

    // Get live orders
    const liveOrders = await OrderService.getLiveOrders(
      decoded.tenantId || 'default',
      restaurantId
    )

    // Get order statistics
    const stats = await OrderService.getOrderStats(
      decoded.tenantId || 'default',
      restaurantId,
      {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        end: new Date()
      }
    )

    return NextResponse.json({
      success: true,
      data: {
        orders: liveOrders,
        stats,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('Get live orders error:', error)
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch live orders'
      }
    }, { status: 500 })
  }
}