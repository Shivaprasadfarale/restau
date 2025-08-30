import { Schema, model, models } from 'mongoose'
import { 
  TenantDocument, 
  tenantSchema, 
  softDeleteSchema,
  addressSchema
} from './base'

// Delivery stats schema (embedded)
const deliveryStatsSchema = new Schema({
  totalDeliveries: {
    type: Number,
    default: 0,
    min: 0
  },
  completedDeliveries: {
    type: Number,
    default: 0,
    min: 0
  },
  cancelledDeliveries: {
    type: Number,
    default: 0,
    min: 0
  },
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalRatings: {
    type: Number,
    default: 0,
    min: 0
  },
  averageDeliveryTime: {
    type: Number,
    default: 0,
    min: 0 // in minutes
  }
}, { _id: false })

// Vehicle info schema (embedded)
const vehicleInfoSchema = new Schema({
  type: {
    type: String,
    enum: ['bike', 'scooter', 'bicycle', 'car', 'walking'],
    required: true
  },
  model: {
    type: String,
    maxlength: 100
  },
  licensePlate: {
    type: String,
    maxlength: 20
  },
  color: {
    type: String,
    maxlength: 50
  }
}, { _id: false })

// Availability schedule schema (embedded)
const availabilityScheduleSchema = new Schema({
  monday: {
    isAvailable: { type: Boolean, default: true },
    startTime: { type: String, maxlength: 5 }, // HH:MM format
    endTime: { type: String, maxlength: 5 }
  },
  tuesday: {
    isAvailable: { type: Boolean, default: true },
    startTime: { type: String, maxlength: 5 },
    endTime: { type: String, maxlength: 5 }
  },
  wednesday: {
    isAvailable: { type: Boolean, default: true },
    startTime: { type: String, maxlength: 5 },
    endTime: { type: String, maxlength: 5 }
  },
  thursday: {
    isAvailable: { type: Boolean, default: true },
    startTime: { type: String, maxlength: 5 },
    endTime: { type: String, maxlength: 5 }
  },
  friday: {
    isAvailable: { type: Boolean, default: true },
    startTime: { type: String, maxlength: 5 },
    endTime: { type: String, maxlength: 5 }
  },
  saturday: {
    isAvailable: { type: Boolean, default: true },
    startTime: { type: String, maxlength: 5 },
    endTime: { type: String, maxlength: 5 }
  },
  sunday: {
    isAvailable: { type: Boolean, default: true },
    startTime: { type: String, maxlength: 5 },
    endTime: { type: String, maxlength: 5 }
  }
}, { _id: false })

export interface IDeliveryPerson extends TenantDocument {
  userId: string
  restaurantId: string
  name: string
  phone: string
  email?: string
  address: any
  vehicleInfo: any
  licenseNumber?: string
  status: 'active' | 'inactive' | 'busy' | 'offline'
  currentLocation?: {
    lat: number
    lng: number
    lastUpdated: Date
  }
  availabilitySchedule: any
  deliveryStats: any
  isVerified: boolean
  joinedAt: Date
  lastActiveAt: Date
}

const deliveryPersonSchema = new Schema<IDeliveryPerson>({
  ...tenantSchema,
  ...softDeleteSchema,
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
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
  phone: {
    type: String,
    required: true,
    trim: true,
    maxlength: 15,
    match: [/^\+?[\d\s-()]+$/, 'Please enter a valid phone number']
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    maxlength: 255,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
  },
  address: {
    type: addressSchema,
    required: true
  },
  vehicleInfo: {
    type: vehicleInfoSchema,
    required: true
  },
  licenseNumber: {
    type: String,
    trim: true,
    maxlength: 50
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'busy', 'offline'],
    default: 'inactive',
    required: true,
    index: true
  },
  currentLocation: {
    lat: {
      type: Number,
      min: -90,
      max: 90
    },
    lng: {
      type: Number,
      min: -180,
      max: 180
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  availabilitySchedule: {
    type: availabilityScheduleSchema,
    required: true,
    default: {
      monday: { isAvailable: true, startTime: '09:00', endTime: '22:00' },
      tuesday: { isAvailable: true, startTime: '09:00', endTime: '22:00' },
      wednesday: { isAvailable: true, startTime: '09:00', endTime: '22:00' },
      thursday: { isAvailable: true, startTime: '09:00', endTime: '22:00' },
      friday: { isAvailable: true, startTime: '09:00', endTime: '22:00' },
      saturday: { isAvailable: true, startTime: '09:00', endTime: '22:00' },
      sunday: { isAvailable: true, startTime: '09:00', endTime: '22:00' }
    }
  },
  deliveryStats: {
    type: deliveryStatsSchema,
    required: true,
    default: {}
  },
  isVerified: {
    type: Boolean,
    default: false,
    index: true
  },
  joinedAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  lastActiveAt: {
    type: Date,
    default: Date.now,
    required: true
  }
}, {
  timestamps: true
})

// Compound indexes for performance
deliveryPersonSchema.index({ tenantId: 1, restaurantId: 1, status: 1 })
deliveryPersonSchema.index({ tenantId: 1, restaurantId: 1, isVerified: 1 })
deliveryPersonSchema.index({ tenantId: 1, userId: 1 }, { unique: true })
deliveryPersonSchema.index({ tenantId: 1, phone: 1 }, { unique: true })
deliveryPersonSchema.index({ tenantId: 1, isDeleted: 1 })
deliveryPersonSchema.index({ 'currentLocation.lastUpdated': 1 })
deliveryPersonSchema.index({ lastActiveAt: 1 })

// Geospatial index for location-based queries
deliveryPersonSchema.index({ 
  'currentLocation.lat': 1, 
  'currentLocation.lng': 1 
})

// Instance methods
deliveryPersonSchema.methods.updateLocation = function(lat: number, lng: number): void {
  this.currentLocation = {
    lat,
    lng,
    lastUpdated: new Date()
  }
  this.lastActiveAt = new Date()
}

deliveryPersonSchema.methods.updateStatus = function(status: string): void {
  this.status = status
  this.lastActiveAt = new Date()
}

deliveryPersonSchema.methods.isAvailableNow = function(): boolean {
  if (this.status !== 'active') {
    return false
  }
  
  const now = new Date()
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
  const currentTime = now.toTimeString().slice(0, 5) // HH:MM format
  
  const daySchedule = this.availabilitySchedule[dayName]
  if (!daySchedule || !daySchedule.isAvailable) {
    return false
  }
  
  return currentTime >= daySchedule.startTime && currentTime <= daySchedule.endTime
}

deliveryPersonSchema.methods.updateDeliveryStats = function(completed: boolean, deliveryTime?: number, rating?: number): void {
  this.deliveryStats.totalDeliveries += 1
  
  if (completed) {
    this.deliveryStats.completedDeliveries += 1
    
    if (deliveryTime) {
      // Update average delivery time
      const totalTime = this.deliveryStats.averageDeliveryTime * (this.deliveryStats.completedDeliveries - 1)
      this.deliveryStats.averageDeliveryTime = (totalTime + deliveryTime) / this.deliveryStats.completedDeliveries
    }
    
    if (rating) {
      // Update average rating
      const totalRating = this.deliveryStats.averageRating * this.deliveryStats.totalRatings
      this.deliveryStats.totalRatings += 1
      this.deliveryStats.averageRating = (totalRating + rating) / this.deliveryStats.totalRatings
    }
  } else {
    this.deliveryStats.cancelledDeliveries += 1
  }
}

// Static methods
deliveryPersonSchema.statics.findAvailable = function(tenantId: string, restaurantId: string) {
  return this.find({
    tenantId,
    restaurantId,
    status: 'active',
    isVerified: true,
    isDeleted: { $ne: true }
  }).sort({ 'deliveryStats.averageRating': -1, 'deliveryStats.completedDeliveries': -1 })
}

deliveryPersonSchema.statics.findByStatus = function(tenantId: string, restaurantId: string, status: string) {
  return this.find({
    tenantId,
    restaurantId,
    status,
    isDeleted: { $ne: true }
  }).sort({ lastActiveAt: -1 })
}

deliveryPersonSchema.statics.findNearby = function(tenantId: string, restaurantId: string, lat: number, lng: number, maxDistance = 10) {
  return this.find({
    tenantId,
    restaurantId,
    status: 'active',
    isVerified: true,
    isDeleted: { $ne: true },
    'currentLocation.lat': {
      $gte: lat - (maxDistance / 111), // Rough conversion: 1 degree ≈ 111 km
      $lte: lat + (maxDistance / 111)
    },
    'currentLocation.lng': {
      $gte: lng - (maxDistance / (111 * Math.cos(lat * Math.PI / 180))),
      $lte: lng + (maxDistance / (111 * Math.cos(lat * Math.PI / 180)))
    }
  }).sort({ 'deliveryStats.averageRating': -1 })
}

deliveryPersonSchema.statics.getPerformanceStats = function(tenantId: string, restaurantId: string, startDate?: Date, endDate?: Date) {
  const matchStage: any = { 
    tenantId, 
    restaurantId,
    isDeleted: { $ne: true }
  }
  
  if (startDate && endDate) {
    matchStage.createdAt = { $gte: startDate, $lte: endDate }
  }
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalDeliveryPersons: { $sum: 1 },
        activeDeliveryPersons: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
        },
        verifiedDeliveryPersons: {
          $sum: { $cond: ['$isVerified', 1, 0] }
        },
        averageRating: { $avg: '$deliveryStats.averageRating' },
        totalDeliveries: { $sum: '$deliveryStats.totalDeliveries' },
        totalCompletedDeliveries: { $sum: '$deliveryStats.completedDeliveries' },
        averageDeliveryTime: { $avg: '$deliveryStats.averageDeliveryTime' }
      }
    }
  ])
}

// Soft delete middleware
deliveryPersonSchema.pre(/^find/, function(next) {
  this.where({ isDeleted: { $ne: true } })
  next()
})

export const DeliveryPerson = models.DeliveryPerson || model<IDeliveryPerson>('DeliveryPerson', deliveryPersonSchema)