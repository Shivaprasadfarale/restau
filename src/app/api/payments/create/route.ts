import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { connectToDatabase } from '@/lib/mongodb'
import { Order } from '@/models/Order'
import { createPaymentService } from '@/lib/services/payment-service'
import { verifyToken } from '@/lib/auth/jwt'

const createPaymentSchema = z.object({
  orderId: z.string(),
  paymentMethod: z.enum(['razorpay', 'stripe']).default('razorpay'),
  upiIntent: z.boolean().optional()
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
    const validatedData = createPaymentSchema.parse(body)

    await connectToDatabase()

    // Find and validate order
    const order = await Order.findOne({
      _id: validatedData.orderId,
      userId: decoded.userId,
      tenantId: decoded.tenantId || 'default',
      status: 'pending'
    })

    if (!order) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found or not eligible for payment'
        }
      }, { status: 404 })
    }

    // Check if payment already exists
    if (order.paymentId && order.paymentId !== '') {
      return NextResponse.json({
        success: false,
        error: {
          code: 'PAYMENT_EXISTS',
          message: 'Payment already initiated for this order'
        }
      }, { status: 400 })
    }

    const paymentService = createPaymentService()
    
    // Create payment order based on method
    let paymentResult
    
    if (validatedData.paymentMethod === 'razorpay') {
      if (validatedData.upiIntent) {
        paymentResult = await paymentService.createUPIIntent(
          order._id.toString(),
          Math.round(order.total.total * 100) // Convert to paise
        )
      } else {
        paymentResult = await paymentService.createRazorpayOrder({
          orderId: order._id.toString(),
          amount: Math.round(order.total.total * 100), // Convert to paise
          currency: 'INR',
          receipt: `receipt_${order._id}`,
          notes: {
            orderId: order._id.toString(),
            userId: decoded.userId,
            tenantId: decoded.tenantId || 'default'
          }
        })
      }
    } else {
      // Stripe implementation would go here
      return NextResponse.json({
        success: false,
        error: {
          code: 'PAYMENT_METHOD_NOT_SUPPORTED',
          message: 'Stripe integration not yet implemented'
        }
      }, { status: 400 })
    }

    if (!paymentResult.success) {
      return NextResponse.json({
        success: false,
        error: paymentResult.error
      }, { status: 400 })
    }

    // Return payment details for frontend
    return NextResponse.json({
      success: true,
      data: {
        paymentOrderId: paymentResult.data.id,
        amount: paymentResult.data.amount,
        currency: paymentResult.data.currency,
        orderId: order._id,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID,
        upiIntent: validatedData.upiIntent || false
      }
    })

  } catch (error) {
    console.error('Payment creation error:', error)
    
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
        message: 'Failed to create payment'
      }
    }, { status: 500 })
  }
}