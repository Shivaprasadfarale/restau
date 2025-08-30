import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { connectToDatabase } from '@/lib/mongodb'
import { Order } from '@/models/Order'
import { createPaymentService } from '@/lib/services/payment-service'
import { verifyToken } from '@/lib/auth/jwt'

const refundSchema = z.object({
  orderId: z.string(),
  amount: z.number().optional(), // For partial refunds
  reason: z.string().min(1).max(500),
  notes: z.record(z.string()).optional()
})

export async function POST(request: NextRequest) {
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
    const validatedData = refundSchema.parse(body)

    await connectToDatabase()

    // Find and validate order
    const order = await Order.findOne({
      _id: validatedData.orderId,
      tenantId: decoded.tenantId || 'default'
    })

    if (!order) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found'
        }
      }, { status: 404 })
    }

    // Check permissions
    const isCustomer = decoded.role === 'customer'
    const isOrderOwner = order.userId.toString() === decoded.userId
    const isAdmin = ['owner', 'manager', 'staff'].includes(decoded.role)

    if (isCustomer && !isOrderOwner) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied'
        }
      }, { status: 403 })
    }

    // Validate order status for refund
    const refundableStatuses = ['confirmed', 'preparing', 'ready', 'delivered']
    if (!refundableStatuses.includes(order.status)) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_ORDER_STATUS',
          message: 'Order is not eligible for refund'
        }
      }, { status: 400 })
    }

    // Check if payment exists
    if (!order.paymentId) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'NO_PAYMENT_FOUND',
          message: 'No payment found for this order'
        }
      }, { status: 400 })
    }

    // Calculate refund amount
    let refundAmount = validatedData.amount
    if (!refundAmount) {
      refundAmount = Math.round(order.total.total * 100) // Full refund in paise
    } else {
      refundAmount = Math.round(refundAmount * 100) // Convert to paise
    }

    // Validate refund amount
    const maxRefundAmount = Math.round(order.total.total * 100)
    if (refundAmount > maxRefundAmount) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_REFUND_AMOUNT',
          message: 'Refund amount exceeds order total'
        }
      }, { status: 400 })
    }

    // Process refund
    const paymentService = createPaymentService()
    const refundResult = await paymentService.processRefund({
      paymentId: order.paymentId,
      amount: refundAmount,
      notes: {
        ...validatedData.notes,
        reason: validatedData.reason,
        orderId: order._id.toString(),
        processedBy: decoded.userId
      },
      receipt: `refund_${order._id}_${Date.now()}`
    })

    if (!refundResult.success) {
      return NextResponse.json({
        success: false,
        error: refundResult.error
      }, { status: 400 })
    }

    // Update order status and timeline
    const isFullRefund = refundAmount >= maxRefundAmount
    const newStatus = isFullRefund ? 'cancelled' : order.status
    
    order.updateStatus(
      newStatus, 
      decoded.userId, 
      `Refund processed: ₹${(refundAmount / 100).toFixed(2)}. Reason: ${validatedData.reason}`
    )

    // Store refund metadata
    order.metadata = {
      ...order.metadata,
      refunds: [
        ...(order.metadata?.refunds || []),
        {
          refundId: refundResult.data.refundId,
          amount: refundAmount,
          reason: validatedData.reason,
          processedBy: decoded.userId,
          processedAt: new Date(),
          status: refundResult.data.status
        }
      ]
    }

    await order.save()

    return NextResponse.json({
      success: true,
      data: {
        refundId: refundResult.data.refundId,
        amount: refundAmount / 100, // Convert back to rupees
        status: refundResult.data.status,
        orderId: order._id
      },
      message: 'Refund processed successfully'
    })

  } catch (error) {
    console.error('Refund processing error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.errors
        }
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to process refund'
      }
    }, { status: 500 })
  }
}