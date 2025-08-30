import { Schema, model, models } from 'mongoose'
import { 
  TenantDocument, 
  tenantSchema,
  addressSchema
} from './base'

// Contact info schema
const contactInfoSchema = new Schema({
  phone: {
    type: String,
    required: true,
    trim: true,
    maxlength: 15
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    maxlength: 255
  },
  website: {
    type: String,
    trim: true,
    maxlength: 255
  }
}, { _id: false })

// Operating hours schema
const operatingHoursSchema = new Schema({
  monday: {
    open: { type: String, maxlength: 5 }, // HH:MM format
    close: { type: String, maxlength: 5 },
    isOpen: { type: Boolean, default: true }
  },
  tuesday: {
    open: { type: String, maxlength: 5 },
    close: { type: String, maxlength: 5 },
    isOpen: { type: Boolean, default: true }
  },
  wednesday: {
    open: { type: String, maxlength: 5 },
    close: { type: String, maxlength: 5 },
    isOpen: { type: Boolean, default: true }
  },
  thursday: {
    open: { type: String, maxlength: 5 },
    close: { type: String, maxlength: 5 },
    isOpen: { type: Boolean, default: true }
  },
  friday: {
    open: { type: String, maxlength: 5 },
    close: { type: String, maxlength: 5 },
    isOpen: { type: Boolean, default: true }
  },
  saturday: {
    open: { type: String, maxlength: 5 },
    close: { type: String, maxlength: 5 },
    isOpen: { type: Boolean, default: true }
  },
  sunday: {
    open: { type: String, maxlength: 5 },
    close: { type: String, maxlength: 5 },
    isOpen: { type: Boolean, default: true }
  }
}, { _id: false })

// Notification settings schema
const notificationSettingsSchema = new Schema({
  sms: { type: Boolean, default: true },
  email: { type: Boolean, default: true },
  whatsapp: { type: Boolean, default: false },
  push: { type: Boolean, default: true }
}, { _id: false })

// Restaurant settings schema
const restaurantSettingsSchema = new Schema({
  allowOnlineOrdering: { type: Boolean, default: true },
  allowScheduledOrders: { type: Boolean, default: false },
  maxOrdersPerSlot: { type: Number, min: 1, max: 100, default: 10 },
  preparationBuffer: { type: Number, min: 0, max: 120, default: 15 }, // minutes
  autoAcceptOrders: { type: Boolean, default: false },
  notificationSettings: notificationSettingsSchema
}, { _id: false })

export interface IRestaurant extends TenantDocument {
  name: string
  description: string
  logo: string
  coverImage: string
  address: any
  contact: any
  operatingHours: any
  deliveryRadius: number
  minimumOrderValue: number
  taxRate: number
  deliveryFee: number
  paymentMethods: string[]
  settings: any
  maxOrdersPerSlot: number
  slotDuration: number
  isActive: boolean
}

const restaurantSchema = new Schema<IRestaurant>({
  ...tenantSchema,
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
  logo: {
    type: String,
    required: true,
    maxlength: 500
  },
  coverImage: {
    type: String,
    required: true,
    maxlength: 500
  },
  address: {
    type: addressSchema,
    required: true
  },
  contact: {
    type: contactInfoSchema,
    required: true
  },
  operatingHours: {
    type: operatingHoursSchema,
    required: true
  },
  deliveryRadius: {
    type: Number,
    required: true,
    min: 1,
    max: 50 // km
  },
  minimumOrderValue: {
    type: Number,
    required: true,
    min: 0,
    max: 10000
  },
  taxRate: {
    type: Number,
    required: true,
    min: 0,
    max: 0.5 // 50% max
  },
  deliveryFee: {
    type: Number,
    required: true,
    min: 0,
    max: 1000
  },
  paymentMethods: [{
    type: String,
    enum: ['card', 'upi_intent', 'upi_collect', 'wallet', 'netbanking']
  }],
  settings: {
    type: restaurantSettingsSchema,
    required: true,
    default: {}
  },
  maxOrdersPerSlot: {
    type: Number,
    min: 1,
    max: 100,
    default: 10
  },
  slotDuration: {
    type: Number,
    min: 15,
    max: 120,
    default: 30 // minutes
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
})

// Indexes
restaurantSchema.index({ tenantId: 1 }, { unique: true })
restaurantSchema.index({ tenantId: 1, isActive: 1 })
restaurantSchema.index({ 'address.coordinates': '2dsphere' }) // For geospatial queries

// Instance methods
restaurantSchema.methods.isOpenNow = function(): boolean {
  const now = new Date()
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
  const currentTime = now.toTimeString().slice(0, 5) // HH:MM format
  
  const dayHours = this.operatingHours[dayName]
  if (!dayHours || !dayHours.isOpen) {
    return false
  }
  
  return currentTime >= dayHours.open && currentTime <= dayHours.close
}

restaurantSchema.methods.isWithinDeliveryRadius = function(lat: number, lng: number): boolean {
  if (!this.address.coordinates) {
    return true // If no coordinates set, assume within radius
  }
  
  // Simple distance calculation (for more accuracy, use proper geospatial queries)
  const R = 6371 // Earth's radius in km
  const dLat = (lat - this.address.coordinates.lat) * Math.PI / 180
  const dLng = (lng - this.address.coordinates.lng) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(this.address.coordinates.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  const distance = R * c
  
  return distance <= this.deliveryRadius
}

restaurantSchema.methods.canAcceptOrder = function(scheduledFor?: Date): boolean {
  if (!this.settings.allowOnlineOrdering) {
    return false
  }
  
  if (scheduledFor) {
    return this.settings.allowScheduledOrders
  }
  
  return this.isOpenNow()
}

// Static methods
restaurantSchema.statics.findByTenant = function(tenantId: string) {
  return this.findOne({ tenantId, isActive: true })
}

export const Restaurant = models.Restaurant || model<IRestaurant>('Restaurant', restaurantSchema)