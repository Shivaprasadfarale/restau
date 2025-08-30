import { Schema, model, models } from 'mongoose'
import { 
  TenantDocument, 
  tenantSchema, 
  softDeleteSchema,
  dietaryInfoSchema,
  nutritionalInfoSchema
} from './base'

// Modifier option schema
const modifierOptionSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  price: {
    type: Number,
    required: true,
    min: 0,
    max: 100000
  }
}, { _id: true })

// Modifier schema
const modifierSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  type: {
    type: String,
    enum: ['radio', 'checkbox', 'select'],
    required: true
  },
  options: [modifierOptionSchema],
  required: {
    type: Boolean,
    default: false
  },
  maxSelections: {
    type: Number,
    min: 1,
    max: 20
  }
}, { _id: true })

export interface IMenuItem extends TenantDocument {
  restaurantId: string
  name: string
  description: string
  price: number
  image: string
  category: string
  modifiers: any[]
  availability: boolean
  preparationTime: number
  nutritionalInfo?: any
  tags: string[]
  dietaryInfo: any
  badges: string[]
  lastModifiedAt: Date
}

const menuItemSchema = new Schema<IMenuItem>({
  ...tenantSchema,
  ...softDeleteSchema,
  restaurantId: {
    type: Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  price: {
    type: Number,
    required: true,
    min: 0,
    max: 100000
  },
  image: {
    type: String,
    required: true,
    maxlength: 500
  },
  category: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
    index: true
  },
  modifiers: [modifierSchema],
  availability: {
    type: Boolean,
    default: true,
    index: true
  },
  preparationTime: {
    type: Number,
    required: true,
    min: 1,
    max: 180 // 3 hours max
  },
  nutritionalInfo: nutritionalInfoSchema,
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  dietaryInfo: {
    type: dietaryInfoSchema,
    required: true
  },
  badges: [{
    type: String,
    enum: ['bestseller', 'new', 'spicy', 'chef-special', 'healthy'],
    maxlength: 50
  }],
  lastModifiedAt: {
    type: Date,
    default: Date.now,
    required: true
  }
}, {
  timestamps: true
})

// Enhanced compound indexes for performance as per requirements
menuItemSchema.index({ tenantId: 1, restaurantId: 1, category: 1 }) // Category-based menu display
menuItemSchema.index({ tenantId: 1, restaurantId: 1, availability: 1 }) // Available items filtering
menuItemSchema.index({ tenantId: 1, restaurantId: 1, tags: 1 }) // Tag-based filtering
menuItemSchema.index({ tenantId: 1, isDeleted: 1 }) // Soft delete filtering
menuItemSchema.index({ lastModifiedAt: -1 }) // Cache invalidation
menuItemSchema.index({ tenantId: 1, restaurantId: 1, 'dietaryInfo.isVeg': 1 }) // Dietary filtering
menuItemSchema.index({ tenantId: 1, restaurantId: 1, badges: 1 }) // Badge-based filtering
menuItemSchema.index({ tenantId: 1, restaurantId: 1, price: 1 }) // Price-based sorting

// Text index for search
menuItemSchema.index({ 
  name: 'text', 
  description: 'text', 
  tags: 'text' 
}, {
  weights: {
    name: 10,
    description: 5,
    tags: 1
  }
})

// Pre-save middleware to update lastModifiedAt
menuItemSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.lastModifiedAt = new Date()
  }
  next()
})

// Static methods
menuItemSchema.statics.findByCategory = function(tenantId: string, restaurantId: string, category: string) {
  return this.find({ 
    tenantId, 
    restaurantId, 
    category, 
    isDeleted: { $ne: true },
    availability: true 
  }).sort({ name: 1 })
}

menuItemSchema.statics.findAvailable = function(tenantId: string, restaurantId: string) {
  return this.find({ 
    tenantId, 
    restaurantId, 
    availability: true,
    isDeleted: { $ne: true }
  }).sort({ category: 1, name: 1 })
}

menuItemSchema.statics.searchItems = function(tenantId: string, restaurantId: string, query: string) {
  return this.find({
    tenantId,
    restaurantId,
    availability: true,
    isDeleted: { $ne: true },
    $text: { $search: query }
  }, {
    score: { $meta: 'textScore' }
  }).sort({ score: { $meta: 'textScore' } })
}

// Soft delete middleware
menuItemSchema.pre(/^find/, function(next) {
  this.where({ isDeleted: { $ne: true } })
  next()
})

export const MenuItem = models.MenuItem || model<IMenuItem>('MenuItem', menuItemSchema)