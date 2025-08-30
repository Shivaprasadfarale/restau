import { NextRequest, NextResponse } from 'next/server'
import { OrderService } from '@/lib/services/order-service'
import { verifyToken } from '@/lib/auth/jwt'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Get order using service
    const order = await OrderService.getOrder(
      params.id,
      decoded.tenantId || 'default',
      decoded.userId,
      decoded.role
    )

    if (!order) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found'
        }
      }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: order
    })

  } catch (error) {
    console.error('Get order error:', error)
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch order'
      }
    }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const body = await request.json()
    const { status, notes, deliveryPersonId, location, estimatedArrival } = body

    // Prepare update data
    const updateData: any = {}
    if (status) updateData.status = status
    if (notes) updateData.notes = notes
    if (deliveryPersonId) updateData.deliveryPersonId = deliveryPersonId
    if (location) updateData.location = location
    if (estimatedArrival) updateData.estimatedArrival = new Date(estimatedArrival)

    // Update order using service
    const order = await OrderService.updateOrderStatus(
      params.id,
      decoded.tenantId || 'default',
      decoded.userId,
      updateData,
      decoded.role
    )

    return NextResponse.json({
      success: true,
      data: order,
      message: 'Order updated successfully'
    })

  } catch (error) {
    console.error('Update order error:', error)
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to update order'
      }
    }, { status: 500 })
  }
}