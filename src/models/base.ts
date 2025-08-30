import { Schema, Document } from 'mongoose'

// Base interface for all entities
export interface BaseDocument extends Document {
  id: string
  createdAt: Date
  updatedAt: Date
  createdBy?: string
  updatedBy?: string
}

// Base interface for tenant-aware entities
export interface TenantDocument extends BaseDocument {
  tenantId: string
}

// Base schema for all entities
export const baseSchema = {
  createdAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  updatedAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}

// Tenant-aware schema extension
export const tenantSchema = {
  ...baseSchema,
  tenantId: {
    type: Schema.Types.ObjectId,
    required: true
  }
}

// Enhanced soft delete schema extension with audit trail
export const softDeleteSchema = {
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date
  },
  deletedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  deletionReason: {
    type: String,
    maxlength: 500
  }
}

// Address schema (embedded)
export const addressSchema = new Schema({
  type: {
    type: String,
    enum: ['home', 'work', 'other'],
    required: true
  },
  street: {
    type: String,
    required: true,
    maxlength: 200
  },
  city: {
    type: String,
    required: true,
    maxlength: 100
  },
  state: {
    type: String,
    required: true,
    maxlength: 100
  },
  zipCode: {
    type: String,
    required: true,
    maxlength: 10
  },
  landmark: {
    type: String,
    maxlength: 200
  },
  coordinates: {
    lat: {
      type: Number,
      min: -90,
      max: 90
    },
    lng: {
      type: Number,
      min: -180,
      max: 180
    }
  }
}, { _id: true })

// User session schema (embedded)
export const userSessionSchema = new Schema({
  deviceInfo: {
    type: String,
    required: true,
    maxlength: 500
  },
  deviceFingerprint: {
    type: String,
    required: true,
    maxlength: 64
  },
  ipAddress: {
    type: String,
    required: true,
    maxlength: 45 // IPv6 max length
  },
  lastActivity: {
    type: Date,
    default: Date.now,
    required: true
  },
  isRevoked: {
    type: Boolean,
    default: false
  },
  revokedAt: {
    type: Date
  },
  revokedReason: {
    type: String,
    maxlength: 200
  }
}, { _id: true })

// User preferences schema (embedded)
export const userPreferencesSchema = new Schema({
  dietaryRestrictions: [{
    type: String,
    maxlength: 50
  }],
  spiceLevel: {
    type: String,
    enum: ['mild', 'medium', 'hot'],
    default: 'medium'
  },
  favoriteItems: [{
    type: Schema.Types.ObjectId,
    ref: 'MenuItem'
  }],
  defaultAddress: {
    type: Schema.Types.ObjectId
  }
}, { _id: false })

// Dietary info schema (embedded)
export const dietaryInfoSchema = new Schema({
  isVeg: {
    type: Boolean,
    default: false
  },
  isVegan: {
    type: Boolean,
    default: false
  },
  isGlutenFree: {
    type: Boolean,
    default: false
  },
  allergens: [{
    type: String,
    maxlength: 50
  }]
}, { _id: false })

// Nutritional info schema (embedded)
export const nutritionalInfoSchema = new Schema({
  calories: {
    type: Number,
    min: 0,
    max: 10000
  },
  protein: {
    type: Number,
    min: 0,
    max: 1000
  },
  carbs: {
    type: Number,
    min: 0,
    max: 1000
  },
  fat: {
    type: Number,
    min: 0,
    max: 1000
  },
  fiber: {
    type: Number,
    min: 0,
    max: 1000
  }
}, { _id: false })

// GST breakdown schema (embedded)
export const gstBreakdownSchema = new Schema({
  cgst: {
    type: Number,
    min: 0,
    max: 100000,
    default: 0
  },
  sgst: {
    type: Number,
    min: 0,
    max: 100000,
    default: 0
  },
  igst: {
    type: Number,
    min: 0,
    max: 100000,
    default: 0
  }
}, { _id: false })

// Cart total schema (embedded)
export const cartTotalSchema = new Schema({
  subtotal: {
    type: Number,
    required: true,
    min: 0,
    max: 1000000
  },
  tax: {
    type: Number,
    required: true,
    min: 0,
    max: 100000
  },
  deliveryFee: {
    type: Number,
    required: true,
    min: 0,
    max: 10000
  },
  discount: {
    type: Number,
    default: 0,
    min: 0,
    max: 100000
  },
  total: {
    type: Number,
    required: true,
    min: 0,
    max: 1000000
  },
  gstBreakdown: gstBreakdownSchema,
  roundingAdjustment: {
    type: Number,
    default: 0,
    min: -10,
    max: 10
  }
}, { _id: false })