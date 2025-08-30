import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { analyticsService } from '@/lib/services/analytics-service'
import { AnalyticsEvent, DailyMetrics } from '@/models/Analytics'
import { Order } from '@/models/Order'
import { connectToDatabase } from '@/lib/mongodb'

// Mock the database connection
vi.mock('@/lib/mongodb', () => ({
  connectDB: vi.fn()
}))

// Mock the models
vi.mock('@/models/Analytics', () => ({
  AnalyticsEvent: {
    find: vi.fn(),
    aggregate: vi.fn(),
    prototype: {
      save: vi.fn()
    }
  },
  DailyMetrics: {
    findOneAndUpdate: vi.fn()
  }
}))

vi.mock('@/models/Order', () => ({
  Order: {
    find: vi.fn(),
    aggregate: vi.fn()
  }
}))

describe('Analytics System', () => {
  const mockTenantId = 'tenant-123'
  const mockRestaurantId = 'restaurant-456'
  const mockUserId = 'user-789'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Event Tracking', () => {
    it('should track analytics events with PII minimization', async () => {
      const mockSave = vi.fn().mockResolvedValue({})
      const mockAnalyticsEvent = {
        save: mockSave
      }
      
      // Mock the AnalyticsEvent constructor
      vi.mocked(AnalyticsEvent).mockImplementation(() => mockAnalyticsEvent as any)

      const eventData = {
        eventType: 'menu_item_view' as const,
        sessionId: 'session-123',
        restaurantId: mockRestaurantId,
        userId: mockUserId,
        metadata: {
          menuItemId: 'item-123',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        ipAddress: '192.168.1.1'
      }

      await analyticsService.trackEvent(mockTenantId, eventData)

      expect(connectDB).toHaveBeenCalled()
      expect(mockSave).toHaveBeenCalled()
    })

    it('should handle tracking errors gracefully', async () => {
      const mockSave = vi.fn().mockRejectedValue(new Error('Database error'))
      const mockAnalyticsEvent = {
        save: mockSave
      }
      
      vi.mocked(AnalyticsEvent).mockImplementation(() => mockAnalyticsEvent as any)

      const eventData = {
        eventType: 'page_view' as const,
        sessionId: 'session-123',
        restaurantId: mockRestaurantId
      }

      // Should not throw error - analytics failures should be silent
      await expect(analyticsService.trackEvent(mockTenantId, eventData)).resolves.toBeUndefined()
    })
  })

  describe('Sales Analytics', () => {
    it('should calculate sales analytics correctly', async () => {
      const mockOrders = [
        {
          _id: 'order-1',
          total: { total: 1000 },
          items: [
            {
              menuItemId: { _id: 'item-1', category: 'Main Course' },
              name: 'Butter Chicken',
              quantity: 2,
              totalPrice: 800
            }
          ],
          createdAt: new Date('2024-01-15T12:00:00Z')
        },
        {
          _id: 'order-2',
          total: { total: 1500 },
          items: [
            {
              menuItemId: { _id: 'item-2', category: 'Appetizer' },
              name: 'Samosa',
              quantity: 4,
              totalPrice: 400
            }
          ],
          createdAt: new Date('2024-01-15T19:00:00Z')
        }
      ]

      const mockEvents = [
        {
          eventType: 'page_view',
          timestamp: new Date('2024-01-15T11:00:00Z')
        },
        {
          eventType: 'add_to_cart',
          timestamp: new Date('2024-01-15T11:30:00Z')
        },
        {
          eventType: 'payment_success',
          timestamp: new Date('2024-01-15T12:00:00Z')
        }
      ]

      vi.mocked(Order.find).mockResolvedValue(mockOrders as any)
      vi.mocked(AnalyticsEvent.find).mockResolvedValue(mockEvents as any)
      vi.mocked(AnalyticsEvent.aggregate).mockResolvedValue([
        { _id: 'item-1', viewCount: 10 },
        { _id: 'item-2', viewCount: 8 }
      ])

      const result = await analyticsService.getSalesAnalytics(
        mockTenantId,
        mockRestaurantId,
        'daily',
        new Date('2024-01-15'),
        new Date('2024-01-15')
      )

      expect(result.totalSales).toBe(2500)
      expect(result.orderCount).toBe(2)
      expect(result.averageOrderValue).toBe(1250)
      expect(result.conversionFunnel.views).toBe(1)
      expect(result.conversionFunnel.payments).toBe(1)
    })

    it('should handle empty data gracefully', async () => {
      vi.mocked(Order.find).mockResolvedValue([])
      vi.mocked(AnalyticsEvent.find).mockResolvedValue([])
      vi.mocked(AnalyticsEvent.aggregate).mockResolvedValue([])

      const result = await analyticsService.getSalesAnalytics(
        mockTenantId,
        mockRestaurantId,
        'daily'
      )

      expect(result.totalSales).toBe(0)
      expect(result.orderCount).toBe(0)
      expect(result.averageOrderValue).toBe(0)
    })
  })

  describe('Item Performance', () => {
    it('should calculate item performance metrics', async () => {
      const mockViewEvents = [
        { _id: 'item-1', viewCount: 50 },
        { _id: 'item-2', viewCount: 30 }
      ]

      const mockOrders = [
        {
          items: [
            {
              menuItemId: { _id: 'item-1', category: 'Main Course' },
              name: 'Butter Chicken',
              quantity: 5,
              totalPrice: 2500
            }
          ]
        }
      ]

      vi.mocked(AnalyticsEvent.aggregate).mockResolvedValue(mockViewEvents)
      vi.mocked(Order.find).mockResolvedValue(mockOrders as any)

      const result = await analyticsService.getItemPerformance(
        mockTenantId,
        mockRestaurantId,
        new Date('2024-01-01'),
        new Date('2024-01-31')
      )

      expect(result).toHaveLength(1)
      expect(result[0].itemId).toBe('item-1')
      expect(result[0].viewCount).toBe(50)
      expect(result[0].totalOrders).toBe(5)
      expect(result[0].totalRevenue).toBe(2500)
      expect(result[0].conversionRate).toBe(10) // 5 orders / 50 views * 100
    })
  })

  describe('Revenue Metrics', () => {
    it('should calculate revenue metrics with growth', async () => {
      const currentOrders = [
        { total: { total: 1000 }, createdAt: new Date('2024-01-15T12:00:00Z'), paymentMethod: 'upi_intent' },
        { total: { total: 1500 }, createdAt: new Date('2024-01-15T19:00:00Z'), paymentMethod: 'card' }
      ]

      const previousOrders = [
        { total: { total: 800 }, createdAt: new Date('2024-01-08T12:00:00Z'), paymentMethod: 'upi_intent' }
      ]

      vi.mocked(Order.find)
        .mockResolvedValueOnce(currentOrders as any) // Current period
        .mockResolvedValueOnce(previousOrders as any) // Previous period

      const result = await analyticsService.getRevenueMetrics(
        mockTenantId,
        mockRestaurantId,
        new Date('2024-01-15'),
        new Date('2024-01-15')
      )

      expect(result.totalRevenue).toBe(2500)
      expect(result.orderCount).toBe(2)
      expect(result.averageOrderValue).toBe(1250)
      expect(result.revenueGrowth).toBeCloseTo(212.5) // (2500 - 800) / 800 * 100
      expect(result.paymentMethodBreakdown.upi_intent).toBe(1000)
      expect(result.paymentMethodBreakdown.card).toBe(1500)
    })
  })

  describe('Data Export', () => {
    it('should export sales data in correct format', async () => {
      const mockOrders = [
        {
          _id: 'order-1',
          createdAt: new Date('2024-01-15'),
          userId: { name: 'John Doe', email: 'john@example.com' },
          status: 'delivered',
          items: [{ name: 'Item 1' }, { name: 'Item 2' }],
          total: { subtotal: 1000, tax: 100, deliveryFee: 50, total: 1150 },
          paymentMethod: 'upi_intent'
        }
      ]

      vi.mocked(Order.find).mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockOrders)
      } as any)

      const result = await analyticsService.exportData(
        mockTenantId,
        mockRestaurantId,
        'sales',
        'csv',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      )

      expect(result.headers).toContain('Order ID')
      expect(result.headers).toContain('Total')
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]).toContain('order-1')
      expect(result.rows[0]).toContain('John Doe')
      expect(result.filename).toContain('sales-report')
    })
  })

  describe('Daily Metrics Aggregation', () => {
    it('should aggregate daily metrics correctly', async () => {
      const mockEvents = [
        {
          eventType: 'page_view',
          sessionId: 'session-1',
          timestamp: new Date('2024-01-15T10:00:00Z'),
          metadata: { deviceType: 'mobile' }
        },
        {
          eventType: 'menu_item_view',
          sessionId: 'session-2',
          timestamp: new Date('2024-01-15T11:00:00Z'),
          metadata: { menuItemId: 'item-1', deviceType: 'desktop' }
        }
      ]

      const mockOrders = [
        {
          total: { total: 1000 },
          createdAt: new Date('2024-01-15T12:00:00Z'),
          paymentMethod: 'upi_intent',
          items: [
            {
              menuItemId: { _id: 'item-1' },
              name: 'Test Item',
              quantity: 2,
              totalPrice: 800
            }
          ]
        }
      ]

      vi.mocked(AnalyticsEvent.find).mockResolvedValue(mockEvents as any)
      vi.mocked(Order.find).mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockOrders)
      } as any)
      vi.mocked(DailyMetrics.findOneAndUpdate).mockResolvedValue({})

      await analyticsService.aggregateDailyMetrics(
        mockTenantId,
        mockRestaurantId,
        new Date('2024-01-15')
      )

      expect(DailyMetrics.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: mockTenantId,
          restaurantId: mockRestaurantId
        }),
        expect.objectContaining({
          metrics: expect.objectContaining({
            totalViews: 2,
            uniqueVisitors: 2,
            totalOrders: 1,
            totalRevenue: 1000
          })
        }),
        { upsert: true, new: true }
      )
    })
  })

  describe('Conversion Funnel', () => {
    it('should calculate conversion funnel correctly', async () => {
      const events = [
        { eventType: 'page_view' },
        { eventType: 'page_view' },
        { eventType: 'menu_item_view' },
        { eventType: 'add_to_cart' },
        { eventType: 'checkout_start' },
        { eventType: 'payment_success' }
      ]

      const funnel = (analyticsService as any).calculateConversionFunnel(events)

      expect(funnel.views).toBe(3) // page_view + menu_item_view
      expect(funnel.addToCarts).toBe(1)
      expect(funnel.checkouts).toBe(1)
      expect(funnel.payments).toBe(1)
      expect(funnel.viewToCartRate).toBeCloseTo(33.33) // 1/3 * 100
      expect(funnel.cartToCheckoutRate).toBe(100) // 1/1 * 100
      expect(funnel.checkoutToPaymentRate).toBe(100) // 1/1 * 100
      expect(funnel.overallConversionRate).toBeCloseTo(33.33) // 1/3 * 100
    })
  })

  describe('Cohort Analysis', () => {
    it('should calculate customer cohorts', async () => {
      const mockOrders = [
        {
          userId: 'user-1',
          createdAt: new Date('2024-01-15'),
          status: 'delivered'
        },
        {
          userId: 'user-1',
          createdAt: new Date('2024-02-15'),
          status: 'delivered'
        },
        {
          userId: 'user-2',
          createdAt: new Date('2024-01-20'),
          status: 'delivered'
        }
      ]

      vi.mocked(Order.find).mockReturnValue({
        sort: vi.fn().mockResolvedValue(mockOrders)
      } as any)

      const cohorts = await (analyticsService as any).getCohortAnalysis(
        mockTenantId,
        mockRestaurantId,
        new Date('2024-01-01'),
        new Date('2024-02-28')
      )

      expect(cohorts).toHaveLength(2) // January and February cohorts
      expect(cohorts[0].cohortMonth).toBe('2024-01')
      expect(cohorts[0].customersAcquired).toBe(2)
      expect(cohorts[1].cohortMonth).toBe('2024-02')
      expect(cohorts[1].customersAcquired).toBe(1)
    })
  })
})