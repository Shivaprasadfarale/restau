import { Schema, model, models } from 'mongoose'
import { 
  TenantDocument, 
  tenantSchema,
  addressSchema,
  cartTotalSchema
} from './base'

// Selected modifier schema
const selectedModifierSchema = new Schema({
  modifierId: {
    type: Schema.Types.ObjectId,
    required: true
  },
  optionId: {
    type: Schema.Types.ObjectId,
    required: true
  },
  name: {
    type: String,
    required: true,
    maxlength: 100
  },
  price: {
    type: Number,
    required: true,
    min: 0,
    max: 10000
  }
}, { _id: false })

// Order item schema
const orderItemSchema = new Schema({
  menuItemId: {
    type: Schema.Types.ObjectId,
    ref: 'MenuItem',
    required: true
  },
  name: {
    type: String,
    required: true,
    maxlength: 200
  },
  price: {
    type: Number,
    required: true,
    min: 0,
    max: 100000
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    max: 50
  },
  selectedModifiers: [selectedModifierSchema],
  specialInstructions: {
    type: String,
    maxlength: 500
  },
  totalPrice: {
    type: Number,
    required: true,
    min: 0,
    max: 100000
  }
}, { _id: true })

// Order timeline event schema
const orderTimelineEventSchema = new Schema({
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  notes: {
    type: String,
    maxlength: 500
  }
}, { _id: true })

export interface IOrder extends TenantDocument {
  userId: string
  restaurantId: string
  items: any[]
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled'
  total: any
  deliveryAddress: any
  deliveryInfo?: {
    name: string
    phone: string
    specialInstructions?: string
  }
  paymentMethod: 'card' | 'upi_intent' | 'upi_collect' | 'wallet' | 'netbanking'
  paymentId: string
  estimatedDeliveryTime: Date
  actualDeliveryTime?: Date
  scheduledFor?: Date
  timeline: any[]
  metadata?: {
    idempotencyKey: string
    userAgent?: string
    ipAddress?: string
  }
}

const orderSchema = new Schema<IOrder>({
  ...tenantSchema,
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  restaurantId: {
    type: Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
  items: {
    type: [orderItemSchema],
    required: true,
    validate: {
      validator: function(items: any[]) {
        return items.length > 0 && items.length <= 20
      },
      message: 'Order must have between 1 and 20 items'
    }
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'],
    default: 'pending',
    required: true
  },
  total: {
    type: cartTotalSchema,
    required: true
  },
  deliveryAddress: {
    type: addressSchema,
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['card', 'upi_intent', 'upi_collect', 'wallet', 'netbanking'],
    required: true
  },
  paymentId: {
    type: String,
    required: true,
    maxlength: 100
  },
  estimatedDeliveryTime: {
    type: Date,
    required: true
  },
  actualDeliveryTime: {
    type: Date
  },
  scheduledFor: {
    type: Date
  },
  deliveryInfo: {
    name: {
      type: String,
      required: true,
      maxlength: 100
    },
    phone: {
      type: String,
      required: true,
      maxlength: 15
    },
    specialInstructions: {
      type: String,
      maxlength: 500
    }
  },
  timeline: {
    type: [orderTimelineEventSchema],
    default: function() {
      return [{
        status: 'pending',
        timestamp: new Date(),
        updatedBy: this.createdBy
      }]
    }
  },
  metadata: {
    idempotencyKey: {
      type: String,
      required: true,
      maxlength: 100
    },
    userAgent: {
      type: String,
      maxlength: 500
    },
    ipAddress: {
      type: String,
      maxlength: 45
    }
  }
}, {
  timestamps: true
})

// Enhanced compound indexes for performance as per requirements
orderSchema.index({ tenantId: 1, userId: 1, createdAt: -1 }) // User order history
orderSchema.index({ tenantId: 1, restaurantId: 1, status: 1, createdAt: -1 }) // Admin order management
orderSchema.index({ tenantId: 1, status: 1, createdAt: -1 }) // Status-based queries
orderSchema.index({ tenantId: 1, paymentId: 1 }) // Payment reconciliation
orderSchema.index({ 'metadata.idempotencyKey': 1 }, { unique: true }) // Prevent duplicate orders
orderSchema.index({ estimatedDeliveryTime: 1 }) // Delivery scheduling
orderSchema.index({ scheduledFor: 1 }) // Scheduled orders
orderSchema.index({ tenantId: 1, 'timeline.status': 1, 'timeline.timestamp': -1 }) // Order timeline queries
orderSchema.index({ tenantId: 1, restaurantId: 1, createdAt: -1 }) // Restaurant analytics
orderSchema.index({ tenantId: 1, isDeleted: 1 }) // Soft delete filtering

// Instance methods
orderSchema.methods.updateStatus = function(newStatus: string, updatedBy: string, notes?: string) {
  this.status = newStatus
  this.timeline.push({
    status: newStatus,
    timestamp: new Date(),
    updatedBy,
    notes
  })
  
  if (newStatus === 'delivered' && !this.actualDeliveryTime) {
    this.actualDeliveryTime = new Date()
  }
}

orderSchema.methods.calculateTotal = function() {
  const subtotal = this.items.reduce((sum: number, item: any) => sum + item.totalPrice, 0)
  
  // Recalculate totals (this would typically be done by a service)
  this.total.subtotal = subtotal
  this.total.total = subtotal + this.total.tax + this.total.deliveryFee - this.total.discount
  
  return this.total
}

// Static methods
orderSchema.statics.findByUser = function(tenantId: string, userId: string, limit = 20) {
  return this.find({ tenantId, userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('items.menuItemId', 'name image')
}

orderSchema.statics.findByStatus = function(tenantId: string, restaurantId: string, status: string) {
  return this.find({ tenantId, restaurantId, status })
    .sort({ createdAt: -1 })
    .populate('userId', 'name phone email')
}

orderSchema.statics.findLiveOrders = function(tenantId: string, restaurantId: string) {
  return this.find({ 
    tenantId, 
    restaurantId, 
    status: { $in: ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'] }
  })
    .sort({ createdAt: 1 })
    .populate('userId', 'name phone email')
}

orderSchema.statics.findByDateRange = function(tenantId: string, restaurantId: string, startDate: Date, endDate: Date) {
  return this.find({
    tenantId,
    restaurantId,
    createdAt: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ createdAt: -1 })
}

orderSchema.statics.getOrderStats = function(tenantId: string, restaurantId: string, startDate?: Date, endDate?: Date) {
  const matchStage: any = { tenantId, restaurantId }
  
  if (startDate && endDate) {
    matchStage.createdAt = { $gte: startDate, $lte: endDate }
  }
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        pendingOrders: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        },
        completedOrders: {
          $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
        },
        cancelledOrders: {
          $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
        },
        totalRevenue: { $sum: '$total.total' },
        averageOrderValue: { $avg: '$total.total' }
      }
    }
  ])
}

export const Order = models.Order || model<IOrder>('Order', orderSchema)