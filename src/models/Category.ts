import { Schema, model, models } from 'mongoose'
import { 
  TenantDocument, 
  tenantSchema, 
  softDeleteSchema
} from './base'

export interface ICategory extends TenantDocument {
  restaurantId: string
  name: string
  description?: string
  image?: string
  sortOrder: number
  isActive: boolean
}

const categorySchema = new Schema<ICategory>({
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
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  image: {
    type: String,
    maxlength: 500
  },
  sortOrder: {
    type: Number,
    required: true,
    min: 0,
    max: 1000,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
})

// Compound indexes
categorySchema.index({ tenantId: 1, restaurantId: 1, sortOrder: 1 })
categorySchema.index({ tenantId: 1, restaurantId: 1, isActive: 1 })
categorySchema.index({ tenantId: 1, restaurantId: 1, name: 1 }, { unique: true })
categorySchema.index({ tenantId: 1, isDeleted: 1 })

// Static methods
categorySchema.statics.findByRestaurant = function(tenantId: string, restaurantId: string) {
  return this.find({ 
    tenantId, 
    restaurantId, 
    isActive: true,
    isDeleted: { $ne: true }
  }).sort({ sortOrder: 1, name: 1 })
}

categorySchema.statics.reorderCategories = async function(tenantId: string, restaurantId: string, categoryIds: string[]) {
  const bulkOps = categoryIds.map((categoryId, index) => ({
    updateOne: {
      filter: { _id: categoryId, tenantId, restaurantId },
      update: { sortOrder: index }
    }
  }))
  
  return this.bulkWrite(bulkOps)
}

// Soft delete middleware
categorySchema.pre(/^find/, function(next) {
  this.where({ isDeleted: { $ne: true } })
  next()
})

export const Category = models.Category || model<ICategory>('Category', categorySchema)