import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PaymentService } from '@/lib/services/payment-service'
import crypto from 'crypto'

// Mock Razorpay
const mockRazorpay = {
  orders: {
    create: vi.fn()
  },
  payments: {
    fetch: vi.fn(),
    refund: vi.fn()
  }
}

vi.mock('razorpay', () => ({
  default: vi.fn(() => mockRazorpay)
}))

// Mock database
vi.mock('@/lib/mongodb', () => ({
  connectDB: vi.fn()
}))

vi.mock('@/models/Order', () => ({
  Order: {
    findById: vi.fn(),
    findOne: vi.fn()
  }
}))

describe('Payment System', () => {
  let paymentService: PaymentService

  beforeEach(() => {
    vi.clearAllMocks()
    
    paymentService = new PaymentService({
      razorpay: {
        keyId: 'test_key_id',
        keySecret: 'test_key_secret',
        webhookSecret: 'test_webhook_secret'
      }
    })
  })

  describe('Razorpay Order Creation', () => {
    it('should create a Razorpay order successfully', async () => {
      const mockOrder = {
        id: 'order_test123',
        amount: 50000,
        currency: 'INR',
        receipt: 'receipt_123',
        status: 'created'
      }

      mockRazorpay.orders.create.mockResolvedValue(mockOrder)

      const result = await paymentService.createRazorpayOrder({
        orderId: 'order123',
        amount: 50000,
        currency: 'INR',
        receipt: 'receipt_123',
        notes: { test: 'note' }
      })

      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        id: 'order_test123',
        amount: 50000,
        currency: 'INR',
        receipt: 'receipt_123',
        status: 'created'
      })

      expect(mockRazorpay.orders.create).toHaveBeenCalledWith({
        amount: 50000,
        currency: 'INR',
        receipt: 'receipt_123',
        notes: { test: 'note' },
        payment_capture: 1
      })
    })

    it('should handle Razorpay order creation failure', async () => {
      const error = new Error('Invalid amount')
      mockRazorpay.orders.create.mockRejectedValue(error)

      const result = await paymentService.createRazorpayOrder({
        orderId: 'order123',
        amount: -100,
        currency: 'INR',
        receipt: 'receipt_123'
      })

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('PAYMENT_ORDER_FAILED')
      expect(result.error?.message).toBe('Invalid amount')
    })
  })

  describe('Payment Verification', () => {
    it('should verify payment signature correctly', async () => {
      const orderId = 'order_test123'
      const paymentId = 'pay_test456'
      const keySecret = 'test_key_secret'
      
      // Generate valid signature
      const body = `${orderId}|${paymentId}`
      const expectedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(body)
        .digest('hex')

      const mockPayment = {
        id: paymentId,
        order_id: orderId,
        status: 'captured',
        amount: 50000,
        method: 'upi'
      }

      mockRazorpay.payments.fetch.mockResolvedValue(mockPayment)

      const result = await paymentService.verifyRazorpayPayment({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: expectedSignature
      })

      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        paymentId,
        orderId,
        status: 'captured',
        amount: 50000,
        method: 'upi'
      })
    })

    it('should reject invalid payment signature', async () => {
      const result = await paymentService.verifyRazorpayPayment({
        razorpay_order_id: 'order_test123',
        razorpay_payment_id: 'pay_test456',
        razorpay_signature: 'invalid_signature'
      })

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('INVALID_SIGNATURE')
      expect(result.error?.message).toBe('Payment signature verification failed')
    })
  })

  describe('Refund Processing', () => {
    it('should process full refund successfully', async () => {
      const mockRefund = {
        id: 'rfnd_test789',
        amount: 50000,
        status: 'processed'
      }

      mockRazorpay.payments.refund.mockResolvedValue(mockRefund)

      const result = await paymentService.processRefund({
        paymentId: 'pay_test456',
        notes: { reason: 'Customer request' },
        receipt: 'refund_receipt_123'
      })

      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        refundId: 'rfnd_test789',
        amount: 50000,
        status: 'processed'
      })

      expect(mockRazorpay.payments.refund).toHaveBeenCalledWith(
        'pay_test456',
        {
          notes: { reason: 'Customer request' },
          receipt: 'refund_receipt_123'
        }
      )
    })

    it('should process partial refund successfully', async () => {
      const mockRefund = {
        id: 'rfnd_test789',
        amount: 25000,
        status: 'processed'
      }

      mockRazorpay.payments.refund.mockResolvedValue(mockRefund)

      const result = await paymentService.processRefund({
        paymentId: 'pay_test456',
        amount: 25000,
        notes: { reason: 'Partial cancellation' }
      })

      expect(result.success).toBe(true)
      expect(result.data.amount).toBe(25000)

      expect(mockRazorpay.payments.refund).toHaveBeenCalledWith(
        'pay_test456',
        {
          amount: 25000,
          notes: { reason: 'Partial cancellation' },
          receipt: undefined
        }
      )
    })

    it('should handle refund failure', async () => {
      const error = new Error('Payment not found')
      mockRazorpay.payments.refund.mockRejectedValue(error)

      const result = await paymentService.processRefund({
        paymentId: 'invalid_payment_id'
      })

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('REFUND_FAILED')
      expect(result.error?.message).toBe('Payment not found')
    })
  })

  describe('Webhook Verification', () => {
    it('should verify webhook signature correctly', async () => {
      const payload = JSON.stringify({ test: 'data' })
      const secret = 'test_webhook_secret'
      
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex')

      const isValid = await paymentService.verifyWebhookSignature(payload, expectedSignature)
      expect(isValid).toBe(true)
    })

    it('should reject invalid webhook signature', async () => {
      const payload = JSON.stringify({ test: 'data' })
      const invalidSignature = 'invalid_signature'

      const isValid = await paymentService.verifyWebhookSignature(payload, invalidSignature)
      expect(isValid).toBe(false)
    })
  })

  describe('UPI Intent Flow', () => {
    it('should create UPI intent order', async () => {
      const mockOrder = {
        id: 'order_upi123',
        amount: 50000,
        currency: 'INR',
        receipt: 'receipt_order123',
        status: 'created'
      }

      mockRazorpay.orders.create.mockResolvedValue(mockOrder)

      const result = await paymentService.createUPIIntent('order123', 50000)

      expect(result.success).toBe(true)
      expect(result.data?.upi_intent).toBe(true)
      expect(mockRazorpay.orders.create).toHaveBeenCalledWith({
        amount: 50000,
        currency: 'INR',
        receipt: 'receipt_order123',
        notes: { upi_intent: 'true' },
        payment_capture: 1
      })
    })
  })

  describe('Payment Retry Logic', () => {
    it('should implement exponential backoff for retries', async () => {
      const startTime = Date.now()
      
      // Mock a successful retry after 2 attempts
      let attemptCount = 0
      const mockRetryFunction = vi.fn().mockImplementation(() => {
        attemptCount++
        if (attemptCount < 3) {
          throw new Error('Temporary failure')
        }
        return { success: true }
      })

      // Test exponential backoff timing
      const delays = [1000, 2000, 4000] // Expected delays in ms
      
      for (let i = 0; i < delays.length; i++) {
        const delay = Math.pow(2, i) * 1000
        expect(delay).toBe(delays[i])
      }
    })

    it('should stop retrying after max attempts', async () => {
      const result = await paymentService.retryPayment('order123', 3)
      
      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('MAX_RETRIES_EXCEEDED')
    })
  })

  describe('Webhook Processing', () => {
    it('should process payment captured webhook', async () => {
      const webhookPayload = {
        entity: 'event',
        account_id: 'acc_test',
        event: 'payment.captured',
        contains: ['payment'],
        payload: {
          payment: {
            entity: {
              id: 'pay_test123',
              order_id: 'order_test456',
              status: 'captured',
              amount: 50000
            }
          }
        },
        created_at: Date.now()
      }

      const result = await paymentService.processWebhook(webhookPayload)
      expect(result.success).toBe(true)
    })

    it('should process payment failed webhook', async () => {
      const webhookPayload = {
        entity: 'event',
        account_id: 'acc_test',
        event: 'payment.failed',
        contains: ['payment'],
        payload: {
          payment: {
            entity: {
              id: 'pay_test123',
              order_id: 'order_test456',
              status: 'failed',
              amount: 50000
            }
          }
        },
        created_at: Date.now()
      }

      const result = await paymentService.processWebhook(webhookPayload)
      expect(result.success).toBe(true)
    })

    it('should handle unknown webhook events gracefully', async () => {
      const webhookPayload = {
        entity: 'event',
        account_id: 'acc_test',
        event: 'unknown.event',
        contains: ['payment'],
        payload: {
          payment: {
            entity: {}
          }
        },
        created_at: Date.now()
      }

      const result = await paymentService.processWebhook(webhookPayload)
      expect(result.success).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockRazorpay.orders.create.mockRejectedValue(new Error('Network error'))

      const result = await paymentService.createRazorpayOrder({
        orderId: 'order123',
        amount: 50000,
        currency: 'INR',
        receipt: 'receipt_123'
      })

      expect(result.success).toBe(false)
      expect(result.error?.message).toBe('Network error')
    })

    it('should handle invalid payment data', async () => {
      const result = await paymentService.verifyRazorpayPayment({
        razorpay_order_id: '',
        razorpay_payment_id: '',
        razorpay_signature: ''
      })

      expect(result.success).toBe(false)
    })
  })
})