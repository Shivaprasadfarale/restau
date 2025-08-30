import crypto from 'crypto'
import { connectToDatabase } from '@/lib/mongodb'
import { Order } from '@/models/Order'

export interface PaymentConfig {
  razorpay: {
    keyId: string
    keySecret: string
    webhookSecret: string
  }
  stripe?: {
    publishableKey: string
    secretKey: string
    webhookSecret: string
  }
}

export interface CreatePaymentOrderRequest {
  orderId: string
  amount: number // in paise for Razorpay
  currency: string
  receipt: string
  notes?: Record<string, string>
}

export interface PaymentVerificationRequest {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

export interface RefundRequest {
  paymentId: string
  amount?: number // partial refund amount in paise
  notes?: Record<string, string>
  receipt?: string
}

export interface PaymentWebhookPayload {
  entity: string
  account_id: string
  event: string
  contains: string[]
  payload: {
    payment: {
      entity: any
    }
    order?: {
      entity: any
    }
  }
  created_at: number
}

export class PaymentService {
  private config: PaymentConfig

  constructor(config: PaymentConfig) {
    this.config = config
  }

  // Razorpay Integration
  async createRazorpayOrder(request: CreatePaymentOrderRequest) {
    const Razorpay = (await import('razorpay')).default
    
    const razorpay = new Razorpay({
      key_id: this.config.razorpay.keyId,
      key_secret: this.config.razorpay.keySecret,
    })

    try {
      const options = {
        amount: request.amount,
        currency: request.currency,
        receipt: request.receipt,
        notes: request.notes || {},
        payment_capture: 1 // Auto capture
      }

      const order = await razorpay.orders.create(options)
      
      // Store payment order details
      await this.storePaymentOrder({
        orderId: request.orderId,
        paymentOrderId: order.id,
        amount: request.amount,
        currency: request.currency,
        provider: 'razorpay',
        status: 'created',
        metadata: order
      })

      return {
        success: true,
        data: {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
          receipt: order.receipt,
          status: order.status
        }
      }
    } catch (error: any) {
      console.error('Razorpay order creation failed:', error)
      return {
        success: false,
        error: {
          code: 'PAYMENT_ORDER_FAILED',
          message: error.message || 'Failed to create payment order'
        }
      }
    }
  }

  async verifyRazorpayPayment(verification: PaymentVerificationRequest) {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = verification

      // Generate expected signature
      const body = razorpay_order_id + '|' + razorpay_payment_id
      const expectedSignature = crypto
        .createHmac('sha256', this.config.razorpay.keySecret)
        .update(body.toString())
        .digest('hex')

      const isSignatureValid = expectedSignature === razorpay_signature

      if (!isSignatureValid) {
        return {
          success: false,
          error: {
            code: 'INVALID_SIGNATURE',
            message: 'Payment signature verification failed'
          }
        }
      }

      // Fetch payment details from Razorpay
      const Razorpay = (await import('razorpay')).default
      const razorpay = new Razorpay({
        key_id: this.config.razorpay.keyId,
        key_secret: this.config.razorpay.keySecret,
      })

      const payment = await razorpay.payments.fetch(razorpay_payment_id)
      
      // Update payment record
      await this.updatePaymentStatus({
        paymentOrderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        status: payment.status,
        metadata: payment
      })

      return {
        success: true,
        data: {
          paymentId: razorpay_payment_id,
          orderId: razorpay_order_id,
          status: payment.status,
          amount: payment.amount,
          method: payment.method
        }
      }
    } catch (error: any) {
      console.error('Payment verification failed:', error)
      return {
        success: false,
        error: {
          code: 'VERIFICATION_FAILED',
          message: error.message || 'Payment verification failed'
        }
      }
    }
  }

  async processRefund(request: RefundRequest) {
    try {
      const Razorpay = (await import('razorpay')).default
      const razorpay = new Razorpay({
        key_id: this.config.razorpay.keyId,
        key_secret: this.config.razorpay.keySecret,
      })

      const refundOptions: any = {
        notes: request.notes || {},
        receipt: request.receipt
      }

      if (request.amount) {
        refundOptions.amount = request.amount
      }

      const refund = await razorpay.payments.refund(request.paymentId, refundOptions)

      // Store refund record
      await this.storeRefundRecord({
        paymentId: request.paymentId,
        refundId: refund.id,
        amount: refund.amount,
        status: refund.status,
        metadata: refund
      })

      return {
        success: true,
        data: {
          refundId: refund.id,
          amount: refund.amount,
          status: refund.status
        }
      }
    } catch (error: any) {
      console.error('Refund processing failed:', error)
      return {
        success: false,
        error: {
          code: 'REFUND_FAILED',
          message: error.message || 'Refund processing failed'
        }
      }
    }
  }

  async verifyWebhookSignature(payload: string, signature: string): Promise<boolean> {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.config.razorpay.webhookSecret)
        .update(payload)
        .digest('hex')

      return expectedSignature === signature
    } catch (error) {
      console.error('Webhook signature verification failed:', error)
      return false
    }
  }

  async processWebhook(payload: PaymentWebhookPayload) {
    try {
      const { event, payload: webhookPayload } = payload

      switch (event) {
        case 'payment.captured':
          await this.handlePaymentCaptured(webhookPayload.payment.entity)
          break
        case 'payment.failed':
          await this.handlePaymentFailed(webhookPayload.payment.entity)
          break
        case 'refund.processed':
          await this.handleRefundProcessed(webhookPayload.payment.entity)
          break
        case 'order.paid':
          await this.handleOrderPaid(webhookPayload.order?.entity)
          break
        default:
          console.log(`Unhandled webhook event: ${event}`)
      }

      return { success: true }
    } catch (error: any) {
      console.error('Webhook processing failed:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  // UPI Intent Flow
  async createUPIIntent(orderId: string, amount: number) {
    try {
      const paymentOrder = await this.createRazorpayOrder({
        orderId,
        amount,
        currency: 'INR',
        receipt: `receipt_${orderId}`,
        notes: { upi_intent: 'true' }
      })

      if (!paymentOrder.success) {
        return paymentOrder
      }

      return {
        success: true,
        data: {
          ...paymentOrder.data,
          upi_intent: true
        }
      }
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'UPI_INTENT_FAILED',
          message: error.message || 'UPI intent creation failed'
        }
      }
    }
  }

  // Payment retry logic
  async retryPayment(orderId: string, retryCount: number = 0) {
    const maxRetries = 3
    const backoffDelay = Math.pow(2, retryCount) * 1000 // Exponential backoff

    if (retryCount >= maxRetries) {
      return {
        success: false,
        error: {
          code: 'MAX_RETRIES_EXCEEDED',
          message: 'Maximum payment retry attempts exceeded'
        }
      }
    }

    try {
      await new Promise(resolve => setTimeout(resolve, backoffDelay))
      
      // Implement retry logic here
      // This would typically involve re-creating the payment order
      // and updating the order status
      
      return { success: true }
    } catch (error: any) {
      console.error(`Payment retry ${retryCount + 1} failed:`, error)
      return this.retryPayment(orderId, retryCount + 1)
    }
  }

  // Private helper methods
  private async storePaymentOrder(data: {
    orderId: string
    paymentOrderId: string
    amount: number
    currency: string
    provider: string
    status: string
    metadata: any
  }) {
    await connectToDatabase()
    
    // Store in a PaymentOrder collection or update Order model
    const order = await Order.findById(data.orderId)
    if (order) {
      order.paymentId = data.paymentOrderId
      order.metadata = {
        ...order.metadata,
        paymentOrder: data
      }
      await order.save()
    }
  }

  private async updatePaymentStatus(data: {
    paymentOrderId: string
    paymentId: string
    status: string
    metadata: any
  }) {
    await connectToDatabase()
    
    const order = await Order.findOne({ paymentId: data.paymentOrderId })
    if (order) {
      order.paymentId = data.paymentId
      order.metadata = {
        ...order.metadata,
        payment: data
      }
      
      // Update order status based on payment status
      if (data.status === 'captured') {
        order.updateStatus('confirmed', 'system', 'Payment confirmed')
      } else if (data.status === 'failed') {
        order.updateStatus('cancelled', 'system', 'Payment failed')
      }
      
      await order.save()
    }
  }

  private async storeRefundRecord(data: {
    paymentId: string
    refundId: string
    amount: number
    status: string
    metadata: any
  }) {
    await connectToDatabase()
    
    const order = await Order.findOne({ paymentId: data.paymentId })
    if (order) {
      order.metadata = {
        ...order.metadata,
        refunds: [
          ...(order.metadata?.refunds || []),
          data
        ]
      }
      await order.save()
    }
  }

  private async handlePaymentCaptured(payment: any) {
    await this.updatePaymentStatus({
      paymentOrderId: payment.order_id,
      paymentId: payment.id,
      status: 'captured',
      metadata: payment
    })
  }

  private async handlePaymentFailed(payment: any) {
    await this.updatePaymentStatus({
      paymentOrderId: payment.order_id,
      paymentId: payment.id,
      status: 'failed',
      metadata: payment
    })
  }

  private async handleRefundProcessed(payment: any) {
    // Handle refund processed webhook
    console.log('Refund processed:', payment.id)
  }

  private async handleOrderPaid(order: any) {
    // Handle order paid webhook
    console.log('Order paid:', order.id)
  }
}

// Factory function to create payment service instance
export function createPaymentService(): PaymentService {
  const config: PaymentConfig = {
    razorpay: {
      keyId: process.env.RAZORPAY_KEY_ID || '',
      keySecret: process.env.RAZORPAY_KEY_SECRET || '',
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || ''
    }
  }

  if (process.env.STRIPE_PUBLISHABLE_KEY) {
    config.stripe = {
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      secretKey: process.env.STRIPE_SECRET_KEY || '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || ''
    }
  }

  return new PaymentService(config)
}
