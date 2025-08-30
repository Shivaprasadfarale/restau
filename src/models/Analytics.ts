import { Schema, model, models } from 'mongoose'
import { TenantDocument, tenantSchema } from './base'

// Analytics Event for tracking user interactions with PII minimization
export interface IAnalyticsEvent extends TenantDocument {
  eventType: 'page_view' | 'menu_item_view' | 'add_to_cart' | 'remove_from_cart' | 'checkout_start' | 'payment_success' | 'payment_failed' | 'order_placed'
  userId?: string // Optional for anonymous tracking
  sessionId: string // Anonymous session tracking
  restaurantId: string
  metadata: {
    menuItemId?: string
    categoryId?: string
    orderValue?: number
    paymentMethod?: string
    deviceType?: 'mobile' | 'desktop' | 'tablet'
    userAgent?: string
    referrer?: string
    timeOnPage?: number
  }
  timestamp: Date
  ipHash?: string // Hashed IP for privacy
}

const analyticsEventSchema = new Schema<IAnalyticsEvent>({
  ...tenantSchema,
  eventType: {
    type: String,
    enum: ['page_view', 'menu_item_view', 'add_to_cart', 'remove_from_cart', 'checkout_start', 'payment_success', 'payment_failed', 'order_placed'],
    required: true,
    index: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    maxlength: 100,
    index: true
  },
  restaurantId: {
    type: Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true
  },
  metadata: {
    menuItemId: {
      type: Schema.Types.ObjectId,
      ref: 'MenuItem'
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Category'
    },
    orderValue: {
      type: Number,
      min: 0
    },
    paymentMethod: {
      type: String,
      enum: ['card', 'upi_intent', 'upi_collect', 'wallet', 'netbanking']
    },
    deviceType: {
      type: String,
      enum: ['mobile', 'desktop', 'tablet']
    },
    userAgent: {
      type: String,
      maxlength: 500
    },
    referrer: {
      type: String,
      maxlength: 500
    },
    timeOnPage: {
      type: Number,
      min: 0
    }
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  },
  ipHash: {
    type: String,
    maxlength: 64 // SHA-256 hash
  }
}, {
  timestamps: true
})

// Compound indexes for analytics queries
analyticsEventSchema.index({ tenantId: 1, restaurantId: 1, eventType: 1, timestamp: -1 })
analyticsEventSchema.index({ tenantId: 1, restaurantId: 1, timestamp: -1 })
analyticsEventSchema.index({ tenantId: 1, sessionId: 1, timestamp: -1 })
analyticsEventSchema.index({ tenantId: 1, 'metadata.menuItemId': 1, eventType: 1 })

// TTL index for data retention (90 days for events, configurable)
analyticsEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 }) // 90 days

// Daily aggregated metrics for performance
export interface IDailyMetrics extends TenantDocument {
  restaurantId: string
  date: Date
  metrics: {
    totalViews: number
    uniqueVisitors: number
    totalOrders: number
    totalRevenue: number
    averageOrderValue: number
    conversionRate: number
    topItems: Array<{
      itemId: string
      name: string
      views: number
      orders: number
      revenue: number
    }>
    hourlyBreakdown: Array<{
      hour: number
      views: number
      orders: number
      revenue: number
    }>
    deviceBreakdown: {
      mobile: number
      desktop: number
      tablet: number
    }
    paymentMethodBreakdown: {
      card: number
      upi_intent: number
      upi_collect: number
      wallet: number
      netbanking: number
    }
  }
}

const dailyMetricsSchema = new Schema<IDailyMetrics>({
  ...tenantSchema,
  restaurantId: {
    type: Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  metrics: {
    totalViews: { type: Number, default: 0 },
    uniqueVisitors: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    averageOrderValue: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 },
    topItems: [{
      itemId: { type: Schema.Types.ObjectId, ref: 'MenuItem' },
      name: String,
      views: { type: Number, default: 0 },
      orders: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 }
    }],
    hourlyBreakdown: [{
      hour: { type: Number, min: 0, max: 23 },
      views: { type: Number, default: 0 },
      orders: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 }
    }],
    deviceBreakdown: {
      mobile: { type: Number, default: 0 },
      desktop: { type: Number, default: 0 },
      tablet: { type: Number, default: 0 }
    },
    paymentMethodBreakdown: {
      card: { type: Number, default: 0 },
      upi_intent: { type: Number, default: 0 },
      upi_collect: { type: Number, default: 0 },
      wallet: { type: Number, default: 0 },
      netbanking: { type: Number, default: 0 }
    }
  }
}, {
  timestamps: true
})

// Unique constraint on tenant, restaurant, and date
dailyMetricsSchema.index({ tenantId: 1, restaurantId: 1, date: 1 }, { unique: true })

export const AnalyticsEvent = models.AnalyticsEvent || model<IAnalyticsEvent>('AnalyticsEvent', analyticsEventSchema)
export const DailyMetrics = models.DailyMetrics || model<IDailyMetrics>('DailyMetrics', dailyMetricsSchema)