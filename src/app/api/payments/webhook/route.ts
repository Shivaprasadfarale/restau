import { NextRequest, NextResponse } from 'next/server'
import { createPaymentService } from '@/lib/services/payment-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('x-razorpay-signature')

    if (!signature) {
      return NextResponse.json({
        success: false,
        error: 'Missing webhook signature'
      }, { status: 400 })
    }

    const paymentService = createPaymentService()
    
    // Verify webhook signature
    const isValidSignature = await paymentService.verifyWebhookSignature(body, signature)
    
    if (!isValidSignature) {
      console.error('Invalid webhook signature')
      return NextResponse.json({
        success: false,
        error: 'Invalid webhook signature'
      }, { status: 400 })
    }

    // Parse webhook payload
    const payload = JSON.parse(body)
    
    // Process webhook
    const result = await paymentService.processWebhook(payload)
    
    if (!result.success) {
      console.error('Webhook processing failed:', result.error)
      return NextResponse.json({
        success: false,
        error: result.error
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Webhook processed successfully'
    })

  } catch (error) {
    console.error('Webhook processing error:', error)
    return NextResponse.json({
      success: false,
      error: 'Webhook processing failed'
    }, { status: 500 })
  }
}

// Handle other HTTP methods
export async function GET() {
  return NextResponse.json({
    success: false,
    error: 'Method not allowed'
  }, { status: 405 })
}

export async function PUT() {
  return NextResponse.json({
    success: false,
    error: 'Method not allowed'
  }, { status: 405 })
}

export async function DELETE() {
  return NextResponse.json({
    success: false,
    error: 'Method not allowed'
  }, { status: 405 })
}