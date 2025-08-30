import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { connectToDatabase } from '@/lib/mongodb'
import { Order } from '@/models/Order'
import { createPaymentService } from '@/lib/services/payment-service'
import { verifyToken } from '@/lib/auth/jwt'

const verifyPaymentSchema = z.object({
  orderId: z.string(),
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string()
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
    const validatedData = verifyPaymentSchema.parse(body)

    await connectToDatabase()

    // Find and validate order
    const order = await Order.findOne({
      _id: validatedData.orderId,
      userId: decoded.userId,
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

    // Verify payment with Razorpay
    const paymentService = createPaymentService()
    const verificationResult = await paymentService.verifyRazorpayPayment({
      razorpay_order_id: validatedData.razorpay_order_id,
      razorpay_payment_id: validatedData.razorpay_payment_id,
      razorpay_signature: validatedData.razorpay_signature
    })

    if (!verificationResult.success) {
      // Log failed payment attempt
      order.timeline.push({
        status: order.status,
        timestamp: new Date(),
        updatedBy: decoded.userId,
        notes: `Payment verification failed: ${verificationResult.error?.message}`
      })
      await order.save()

      return NextResponse.json({
        success: false,
        error: verificationResult.error
      }, { status: 400 })
    }

    // Update order with payment details
    order.paymentId = validatedData.razorpay_payment_id
    order.updateStatus('confirmed', decoded.userId, 'Payment verified and confirmed')
    
    // Store payment metadata
    order.metadata = {
      ...order.metadata,
      paymentVerification: {
        razorpay_order_id: validatedData.razorpay_order_id,
        razorpay_payment_id: validatedData.razorpay_payment_id,
        verifiedAt: new Date(),
        method: verificationResult.data.method,
        amount: verificationResult.data.amount
      }
    }

    await order.save()

    return NextResponse.json({
      success: true,
      data: {
        orderId: order._id,
        paymentId: validatedData.razorpay_payment_id,
        status: 'confirmed',
        amount: verificationResult.data.amount,
        method: verificationResult.data.method
      },
      message: 'Payment verified successfully'
    })

  } catch (error) {
    console.error('Payment verification error:', error)
    
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
        message: 'Failed to verify payment'
      }
    }, { status: 500 })
  }
}