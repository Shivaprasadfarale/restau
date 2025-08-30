import { Schema, model, models } from 'mongoose'
import bcrypt from 'bcryptjs'
import { 
  TenantDocument, 
  tenantSchema, 
  softDeleteSchema,
  addressSchema,
  userSessionSchema,
  userPreferencesSchema
} from './base'

export interface IUser extends TenantDocument {
  email: string
  phone?: string
  passwordHash: string
  name: string
  role: 'customer' | 'owner' | 'manager' | 'staff' | 'courier'
  addresses: any[]
  preferences: any
  sessions: any[]
  isVerified: boolean
  lastLogin: Date
  comparePassword(password: string): Promise<boolean>
  addSession(deviceInfo: string, ipAddress: string, deviceFingerprint: string): void
  revokeSession(sessionId: string): void
  revokeAllSessions(): void
}

const userSchema = new Schema<IUser>({
  ...tenantSchema,
  ...softDeleteSchema,
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 255,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
  },
  phone: {
    type: String,
    trim: true,
    maxlength: 15,
    match: [/^\+?[\d\s-()]+$/, 'Please enter a valid phone number']
  },
  passwordHash: {
    type: String,
    required: true,
    minlength: 60 // bcrypt hash length
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  role: {
    type: String,
    enum: ['customer', 'owner', 'manager', 'staff', 'courier'],
    default: 'customer',
    required: true
  },
  addresses: [addressSchema],
  preferences: userPreferencesSchema,
  sessions: [userSessionSchema],
  isVerified: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.passwordHash
      delete ret.__v
      return ret
    }
  }
})

// Indexes for performance
userSchema.index({ tenantId: 1, email: 1 }, { unique: true })
userSchema.index({ tenantId: 1, role: 1 })
userSchema.index({ tenantId: 1, isDeleted: 1 })
userSchema.index({ 'sessions.lastActivity': 1 })

// Pre-save middleware for password hashing
userSchema.pre('save', async function(next) {
  if (!this.isModified('passwordHash')) return next()
  
  try {
    const salt = await bcrypt.genSalt(12)
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt)
    next()
  } catch (error: any) {
    next(error)
  }
})

// Instance methods
userSchema.methods.comparePassword = async function(password: string): Promise<boolean> {
  return bcrypt.compare(password, this.passwordHash)
}

userSchema.methods.addSession = function(deviceInfo: string, ipAddress: string, deviceFingerprint: string): void {
  // Limit to 5 active sessions per user
  if (this.sessions.length >= 5) {
    // Remove oldest non-active session
    const oldestSession = this.sessions
      .filter((s: any) => !s.isRevoked)
      .sort((a: any, b: any) => a.lastActivity - b.lastActivity)[0]
    
    if (oldestSession) {
      oldestSession.isRevoked = true
      oldestSession.revokedAt = new Date()
      oldestSession.revokedReason = 'Session limit exceeded'
    } else {
      this.sessions.shift() // Remove oldest if all are revoked
    }
  }
  
  this.sessions.push({
    deviceInfo,
    deviceFingerprint,
    ipAddress,
    lastActivity: new Date(),
    isRevoked: false
  })
}

userSchema.methods.revokeSession = function(sessionId: string, reason?: string): void {
  const session = this.sessions.id(sessionId)
  if (session) {
    session.isRevoked = true
    session.revokedAt = new Date()
    session.revokedReason = reason || 'Manual revocation'
  }
}

userSchema.methods.revokeAllSessions = function(reason?: string): void {
  this.sessions.forEach((session: any) => {
    if (!session.isRevoked) {
      session.isRevoked = true
      session.revokedAt = new Date()
      session.revokedReason = reason || 'All sessions revoked'
    }
  })
}

// Static methods
userSchema.statics.findByEmail = function(tenantId: string, email: string) {
  return this.findOne({ tenantId, email, isDeleted: { $ne: true } })
}

userSchema.statics.findByRole = function(tenantId: string, role: string) {
  return this.find({ tenantId, role, isDeleted: { $ne: true } })
}

// Soft delete middleware
userSchema.pre(/^find/, function(next) {
  this.where({ isDeleted: { $ne: true } })
  next()
})

export const User = models.User || model<IUser>('User', userSchema)