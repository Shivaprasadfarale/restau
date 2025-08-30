import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { OrderService } from '@/lib/services/order-service'
import { createPaymentService } from '@/lib/services/payment-service'
import { verifyToken } from '@/lib/auth/jwt'

const cancelOrderSchema = z.object({
  reason: z.string().min(1).max(500),
  refundAmount: z.number().min(0).optional(),
  notes: z.string().max(1000).optional()
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

    const body = await request.json()
    const validatedData = cancelOrderSchema.parse(body)

    // Cancel order using service
    const result = await OrderService.cancelOrder(
      params.id,
      decoded.tenantId || 'default',
      decoded.userId,
      validatedData.reason,
      validatedData.notes
    )

    // Process refund if payment exists and refund amount > 0
    let refundResult = null
    if (result.order.paymentId && result.refundAmount > 0) {
      const paymentService = createPaymentService()
      refundResult = await paymentService.processRefund({
        paymentId: result.order.paymentId,
        amount: Math.round(result.refundAmount * 100), // Convert to paise
        notes: {
          reason: validatedData.reason,
          orderId: result.order._id.toString(),
          cancelledBy: decoded.userId,
          originalAmount: result.order.total.total.toString()
        },
        receipt: `cancel_${result.order._id}_${Date.now()}`
      })

      if (!refundResult.success) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'REFUND_FAILED',
            message: 'Failed to process refund. Please try again or contact support.'
          }
        }, { status: 400 })
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        orderId: result.order._id,
        status: 'cancelled',
        refundAmount: result.refundAmount,
        refundPercentage: result.refundPercentage,
        refundId: refundResult?.data?.refundId,
        message: result.refundAmount > 0 
          ? `Order cancelled successfully. Refund of ₹${result.refundAmount.toFixed(2)} will be processed within 5-7 business days.`
          : 'Order cancelled successfully.'
      }
    })

  } catch (error) {
    console.error('Order cancellation error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid cancellation data',
          details: error.issues
        }
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to cancel order'
      }
    }, { status: 500 })
  }
}

// GET method to check cancellation eligibility
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

    // Check cancellation eligibility using service
    const cancellationInfo = OrderService.canCancelOrder(order)

    return NextResponse.json({
      success: true,
      data: {
        canCancel: cancellationInfo.canCancel,
        timeRemaining: Math.ceil(cancellationInfo.timeRemaining),
        refundPercentage: cancellationInfo.refundPercentage,
        estimatedRefund: (order.total.total * cancellationInfo.refundPercentage) / 100,
        cancellationWindow: 15, // From service constant
        orderStatus: order.status,
        reason: cancellationInfo.reason,
        reasons: [
          'Changed my mind',
          'Ordered by mistake',
          'Found better option',
          'Delivery taking too long',
          'Restaurant issue',
          'Other'
        ]
      }
    })

  } catch (error) {
    console.error('Cancellation eligibility check error:', error)
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to check cancellation eligibility'
      }
    }, { status: 500 })
  }
}