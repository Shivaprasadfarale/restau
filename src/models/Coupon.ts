import { Schema, model, models } from 'mongoose'
import { 
  TenantDocument, 
  tenantSchema, 
  softDeleteSchema
} from './base'

export interface ICoupon extends TenantDocument {
  restaurantId: string
  code: string
  active: boolean
  discountType: 'percentage' | 'fixed'
  discountValue: number
  minOrderValue: number
  maxUsage: number
  currentUsage: number
  validFrom: Date
  validTo: Date
  applicableItems?: string[]
  applicableCategories?: string[]
  userRestrictions?: {
    maxUsagePerUser: number
    newUsersOnly: boolean
    firstOrderOnly: boolean
  }
}

const couponSchema = new Schema<ICoupon>({
  ...tenantSchema,
  ...softDeleteSchema,
  restaurantId: {
    type: Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true
  },
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    maxlength: 20,
    match: [/^[A-Z0-9]+$/, 'Coupon code must contain only uppercase letters and numbers']
  },
  active: {
    type: Boolean,
    default: true,
    index: true
  },
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true
  },
  discountValue: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: function(value: number) {
        if (this.discountType === 'percentage') {
          return value <= 100 // Max 100% discount
        }
        return value <= 10000 // Max ₹10,000 fixed discount
      },
      message: 'Invalid discount value for the discount type'
    }
  },
  minOrderValue: {
    type: Number,
    required: true,
    min: 0,
    max: 100000
  },
  maxUsage: {
    type: Number,
    required: true,
    min: 1,
    max: 100000
  },
  currentUsage: {
    type: Number,
    default: 0,
    min: 0
  },
  validFrom: {
    type: Date,
    required: true
  },
  validTo: {
    type: Date,
    required: true,
    validate: {
      validator: function(value: Date) {
        return value > this.validFrom
      },
      message: 'Valid to date must be after valid from date'
    }
  },
  applicableItems: [{
    type: Schema.Types.ObjectId,
    ref: 'MenuItem'
  }],
  applicableCategories: [{
    type: String,
    maxlength: 100
  }],
  userRestrictions: {
    maxUsagePerUser: {
      type: Number,
      min: 1,
      max: 100,
      default: 1
    },
    newUsersOnly: {
      type: Boolean,
      default: false
    },
    firstOrderOnly: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true
})

// Compound indexes
couponSchema.index({ tenantId: 1, restaurantId: 1, code: 1 }, { unique: true })
couponSchema.index({ tenantId: 1, restaurantId: 1, active: 1 })
couponSchema.index({ tenantId: 1, validFrom: 1, validTo: 1 })
couponSchema.index({ tenantId: 1, isDeleted: 1 })

// Instance methods
couponSchema.methods.isValid = function(orderValue?: number): { valid: boolean; reason?: string } {
  if (!this.active) {
    return { valid: false, reason: 'Coupon is not active' }
  }
  
  if (this.isDeleted) {
    return { valid: false, reason: 'Coupon not found' }
  }
  
  const now = new Date()
  if (now < this.validFrom) {
    return { valid: false, reason: 'Coupon is not yet valid' }
  }
  
  if (now > this.validTo) {
    return { valid: false, reason: 'Coupon has expired' }
  }
  
  if (this.currentUsage >= this.maxUsage) {
    return { valid: false, reason: 'Coupon usage limit reached' }
  }
  
  if (orderValue !== undefined && orderValue < this.minOrderValue) {
    return { 
      valid: false, 
      reason: `Minimum order value of ₹${this.minOrderValue} required` 
    }
  }
  
  return { valid: true }
}

couponSchema.methods.calculateDiscount = function(orderValue: number): number {
  const validation = this.isValid(orderValue)
  if (!validation.valid) {
    return 0
  }
  
  if (this.discountType === 'percentage') {
    return Math.round((orderValue * this.discountValue) / 100)
  } else {
    return Math.min(this.discountValue, orderValue)
  }
}

couponSchema.methods.incrementUsage = function(): void {
  this.currentUsage += 1
}

// Static methods
couponSchema.statics.findByCode = function(tenantId: string, restaurantId: string, code: string) {
  return this.findOne({ 
    tenantId, 
    restaurantId, 
    code: code.toUpperCase(),
    active: true,
    isDeleted: { $ne: true }
  })
}

couponSchema.statics.findActive = function(tenantId: string, restaurantId: string) {
  const now = new Date()
  return this.find({
    tenantId,
    restaurantId,
    active: true,
    validFrom: { $lte: now },
    validTo: { $gte: now },
    currentUsage: { $lt: this.maxUsage },
    isDeleted: { $ne: true }
  }).sort({ validTo: 1 })
}

// Pre-save validation
couponSchema.pre('save', function(next) {
  if (this.currentUsage > this.maxUsage) {
    this.active = false
  }
  next()
})

// Soft delete middleware
couponSchema.pre(/^find/, function(next) {
  this.where({ isDeleted: { $ne: true } })
  next()
})

export const Coupon = models.Coupon || model<ICoupon>('Coupon', couponSchema)