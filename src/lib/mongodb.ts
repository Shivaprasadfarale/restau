import mongoose from 'mongoose'
import { env } from './env'

interface ConnectionState {
  isConnected: boolean
  connection?: typeof mongoose
}

const connection: ConnectionState = {
  isConnected: false
}

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (connection.isConnected && connection.connection) {
    return connection.connection
  }

  try {
    const db = await mongoose.connect(env.MONGODB_URI, {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4, // Use IPv4, skip trying IPv6
      retryWrites: true,
      w: 'majority',
      readPreference: 'primary',
      compressors: ['zlib'],
    })

    connection.isConnected = db.connections[0].readyState === 1
    connection.connection = db

    // Set up connection event listeners
    db.connection.on('error', (error) => {
      console.error('MongoDB connection error:', error)
    })

    db.connection.on('disconnected', () => {
      console.log('MongoDB disconnected')
      connection.isConnected = false
    })

    db.connection.on('reconnected', () => {
      console.log('MongoDB reconnected')
      connection.isConnected = true
    })

    console.log('Connected to MongoDB')
    return db
  } catch (error) {
    console.error('MongoDB connection error:', error)
    throw error
  }
}

export async function disconnectFromDatabase(): Promise<void> {
  if (connection.isConnected && connection.connection) {
    await connection.connection.disconnect()
    connection.isConnected = false
    connection.connection = undefined
    console.log('Disconnected from MongoDB')
  }
}

// Enhanced tenant-aware middleware for multi-tenancy with data isolation
export function createTenantMiddleware(tenantId: string) {
  return {
    // Pre-save middleware to ensure tenantId is set
    preSave: function(this: any, next: any) {
      if (!this.tenantId) {
        this.tenantId = tenantId
      } else if (this.tenantId !== tenantId) {
        return next(new Error('Tenant ID mismatch - data isolation violation'))
      }
      next()
    },

    // Pre-find middleware to filter by tenantId
    preFind: function(this: any, next: any) {
      if (!this.getQuery().tenantId) {
        this.where({ tenantId })
      }
      next()
    },

    // Pre-update middleware to ensure tenant isolation
    preUpdate: function(this: any, next: any) {
      if (!this.getQuery().tenantId) {
        this.where({ tenantId })
      }
      // Prevent updating tenantId
      if (this.getUpdate().$set?.tenantId && this.getUpdate().$set.tenantId !== tenantId) {
        return next(new Error('Cannot modify tenantId - data isolation violation'))
      }
      next()
    },

    // Pre-delete middleware to ensure tenant isolation
    preDelete: function(this: any, next: any) {
      if (!this.getQuery().tenantId) {
        this.where({ tenantId })
      }
      next()
    }
  }
}

// Enhanced audit trail middleware with user context
export function createAuditMiddleware(userId?: string, userRole?: string) {
  return {
    preSave: function(this: any, next: any) {
      const now = new Date()
      
      if (this.isNew) {
        this.createdAt = now
        this.updatedAt = now
        if (userId) {
          this.createdBy = userId
        }
      } else {
        this.updatedAt = now
        if (userId) {
          this.updatedBy = userId
        }
      }
      next()
    },

    preUpdate: function(this: any, next: any) {
      const update = this.getUpdate()
      if (!update.$set) {
        update.$set = {}
      }
      update.$set.updatedAt = new Date()
      if (userId) {
        update.$set.updatedBy = userId
      }
      next()
    }
  }
}

// Enhanced soft delete middleware with audit trail
export function createSoftDeleteMiddleware(userId?: string) {
  return {
    // Override find operations to exclude soft-deleted documents
    preFind: function(this: any, next: any) {
      if (!this.getQuery().hasOwnProperty('isDeleted')) {
        this.where({ isDeleted: { $ne: true } })
      }
      next()
    },

    // Soft delete method
    softDelete: function(this: any, reason?: string) {
      this.isDeleted = true
      this.deletedAt = new Date()
      if (userId) {
        this.deletedBy = userId
      }
      if (reason) {
        this.deletionReason = reason
      }
      return this.save()
    },

    // Restore method
    restore: function(this: any) {
      this.isDeleted = false
      this.deletedAt = undefined
      this.deletedBy = undefined
      this.deletionReason = undefined
      return this.save()
    }
  }
}

// Database health check utility
export async function checkDatabaseHealth(): Promise<{
  status: 'healthy' | 'unhealthy'
  details: {
    connected: boolean
    readyState: number
    host?: string
    name?: string
    collections?: number
  }
}> {
  try {
    if (!connection.isConnected || !connection.connection) {
      return {
        status: 'unhealthy',
        details: {
          connected: false,
          readyState: 0
        }
      }
    }

    const db = connection.connection.connection.db
    const admin = db.admin()
    const status = await admin.ping()
    const collections = await db.listCollections().toArray()

    return {
      status: 'healthy',
      details: {
        connected: true,
        readyState: connection.connection.connection.readyState,
        host: connection.connection.connection.host,
        name: connection.connection.connection.name,
        collections: collections.length
      }
    }
  } catch (error) {
    console.error('Database health check failed:', error)
    return {
      status: 'unhealthy',
      details: {
        connected: false,
        readyState: connection.connection?.connection.readyState || 0
      }
    }
  }
}

// Index management utilities
export async function ensureIndexes(): Promise<void> {
  try {
    const db = connection.connection?.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    console.log('Ensuring database indexes...')

    // Get all collections
    const collections = await db.listCollections().toArray()
    
    for (const collection of collections) {
      const coll = db.collection(collection.name)
      
      // Ensure common indexes exist
      const indexes = await coll.indexes()
      const indexNames = indexes.map(idx => idx.name)
      
      // Ensure tenantId index exists for tenant-aware collections
      if (!indexNames.includes('tenantId_1')) {
        try {
          await coll.createIndex({ tenantId: 1 })
          console.log(`Created tenantId index for ${collection.name}`)
        } catch (error) {
          // Index might already exist or collection might not have tenantId field
          console.log(`Skipped tenantId index for ${collection.name}`)
        }
      }
      
      // Ensure createdAt index for time-based queries
      if (!indexNames.includes('createdAt_-1')) {
        try {
          await coll.createIndex({ createdAt: -1 })
          console.log(`Created createdAt index for ${collection.name}`)
        } catch (error) {
          console.log(`Skipped createdAt index for ${collection.name}`)
        }
      }
    }

    console.log('Database indexes ensured')
  } catch (error) {
    console.error('Error ensuring indexes:', error)
    throw error
  }
}

// Connection pool monitoring
export function getConnectionStats() {
  if (!connection.connection) {
    return null
  }

  const conn = connection.connection.connection
  return {
    readyState: conn.readyState,
    host: conn.host,
    port: conn.port,
    name: conn.name,
    // Note: Connection pool stats are not directly accessible in Mongoose
    // This would require using the native MongoDB driver directly
  }
}

// Legacy middleware functions for backward compatibility
export function addTenantFilter(tenantId: string) {
  const middleware = createTenantMiddleware(tenantId)
  return middleware.preFind
}

export function addAuditTrail(userId?: string) {
  const middleware = createAuditMiddleware(userId)
  return middleware.preSave
}

export function addSoftDelete() {
  const middleware = createSoftDeleteMiddleware()
  return middleware.preFind
}

export default mongoose