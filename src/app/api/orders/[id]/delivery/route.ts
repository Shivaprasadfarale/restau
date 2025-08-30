import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { OrderService } from '@/lib/services/order-service'
import { verifyToken } from '@/lib/auth/jwt'

const assignDeliverySchema = z.object({
  deliveryPersonId: z.string().optional(),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180)
  }).optional(),
  estimatedArrival: z.string().optional(),
  notes: z.string().max(500).optional()
})

export async function POST(
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

    // Check permissions
    if (!['owner', 'manager', 'staff', 'courier'].includes(decoded.role)) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions'
        }
      }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = assignDeliverySchema.parse(body)

    // Prepare update data
    const updateData: any = {}
    
    if (validatedData.deliveryPersonId) {
      updateData.deliveryPersonId = validatedData.deliveryPersonId
    }
    
    if (validatedData.location) {
      updateData.location = validatedData.location
    }
    
    if (validatedData.estimatedArrival) {
      updateData.estimatedArrival = new Date(validatedData.estimatedArrival)
    }
    
    if (validatedData.notes) {
      updateData.notes = validatedData.notes
    }

    // Update order with delivery information
    const order = await OrderService.updateOrderStatus(
      params.id,
      decoded.tenantId || 'default',
      decoded.userId,
      updateData,
      decoded.role
    )

    return NextResponse.json({
      success: true,
      data: {
        orderId: order._id,
        deliveryInfo: order.metadata?.delivery,
        status: order.status,
        timeline: order.timeline
      },
      message: 'Delivery information updated successfully'
    })

  } catch (error) {
    console.error('Delivery assignment error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid delivery data',
          details: error.issues
        }
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to update delivery information'
      }
    }, { status: 500 })
  }
}

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

    // Get order with delivery information
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
      data: {
        orderId: order._id,
        status: order.status,
        deliveryInfo: order.metadata?.delivery || {},
        deliveryAddress: order.deliveryAddress,
        estimatedDeliveryTime: order.estimatedDeliveryTime,
        actualDeliveryTime: order.actualDeliveryTime,
        timeline: order.timeline
      }
    })

  } catch (error) {
    console.error('Get delivery info error:', error)
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch delivery information'
      }
    }, { status: 500 })
  }
}