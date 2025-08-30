import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { Order } from '@/models/Order'

export async function GET(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    await connectToDatabase()

    const { orderId } = params

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: { message: 'Order ID is required' } },
        { status: 400 }
      )
    }

    // Find order by ID (public access for tracking)
    const order = await Order.findById(orderId)
      .select('-paymentId -metadata.idempotencyKey -userId') // Exclude sensitive fields
      .populate('restaurantId', 'name logo')
      .lean()

    if (!order) {
      return NextResponse.json(
        { success: false, error: { message: 'Order not found' } },
        { status: 404 }
      )
    }

    // Return limited order information for public tracking
    const publicOrderData = {
      id: order._id,
      status: order.status,
      items: order.items.map((item: any) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.totalPrice
      })),
      total: {
        subtotal: order.total.subtotal,
        tax: order.total.tax,
        deliveryFee: order.total.deliveryFee,
        discount: order.total.discount,
        total: order.total.total
      },
      estimatedDeliveryTime: order.estimatedDeliveryTime,
      actualDeliveryTime: order.actualDeliveryTime,
      timeline: order.timeline.map((event: any) => ({
        status: event.status,
        timestamp: event.timestamp,
        notes: event.notes
      })),
      restaurant: order.restaurantId,
      createdAt: order.createdAt
    }

    return NextResponse.json({
      success: true,
      data: publicOrderData
    })

  } catch (error) {
    console.error('Track order error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: { 
          message: 'Failed to fetch order details',
          code: 'TRACK_ORDER_ERROR'
        } 
      },
      { status: 500 }
    )
  }
}