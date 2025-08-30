import { connectToDatabase } from '@/lib/mongodb'
import { Schema, model, models } from 'mongoose'

export interface AuditLog {
  action: string
  userId: string | null
  tenantId: string | null
  ipAddress: string
  userAgent: string
  details: Record<string, any>
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  timestamp: Date
  requestId?: string
}

const auditLogSchema = new Schema<AuditLog>({
  action: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: String,
    index: true,
    default: null
  },
  tenantId: {
    type: String,
    index: true,
    default: null
  },
  ipAddress: {
    type: String,
    required: true,
    index: true
  },
  userAgent: {
    type: String,
    required: true
  },
  details: {
    type: Schema.Types.Mixed,
    default: {}
  },
  severity: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  requestId: {
    type: String,
    index: true
  }
}, {
  timestamps: false // We use our own timestamp field
})

// Compound indexes for efficient querying
auditLogSchema.index({ tenantId: 1, timestamp: -1 })
auditLogSchema.index({ userId: 1, timestamp: -1 })
auditLogSchema.index({ action: 1, timestamp: -1 })
auditLogSchema.index({ severity: 1, timestamp: -1 })

// TTL index to automatically delete old logs after 1 year
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 })

const AuditLogModel = models.AuditLog || model<AuditLog>('AuditLog', auditLogSchema)

class AuditLogger {
  /**
   * Log an audit event
   */
  async log(logData: Omit<AuditLog, 'timestamp'>): Promise<void> {
    try {
      await connectToDatabase()
      
      // Sanitize sensitive data from details
      const sanitizedDetails = this.sanitizeDetails(logData.details)
      
      const auditLog = new AuditLogModel({
        ...logData,
        details: sanitizedDetails,
        timestamp: new Date()
      })
      
      await auditLog.save()
      
      // For critical events, also log to console for immediate visibility
      if (logData.severity === 'CRITICAL') {
        console.error('CRITICAL AUDIT EVENT:', {
          action: logData.action,
          userId: logData.userId,
          tenantId: logData.tenantId,
          ipAddress: logData.ipAddress,
          details: sanitizedDetails
        })
      }
    } catch (error) {
      // Don't throw errors from audit logging to avoid breaking main functionality
      console.error('Failed to write audit log:', error)
    }
  }

  /**
   * Log admin action with automatic context
   */
  async logAdminAction(
    action: string,
    userId: string,
    tenantId: string,
    ipAddress: string,
    userAgent: string,
    details: Record<string, any> = {},
    severity: AuditLog['severity'] = 'MEDIUM'
  ): Promise<void> {
    await this.log({
      action: `ADMIN_${action}`,
      userId,
      tenantId,
      ipAddress,
      userAgent,
      details,
      severity
    })
  }

  /**
   * Log destructive action (requires higher severity)
   */
  async logDestructiveAction(
    action: string,
    userId: string,
    tenantId: string,
    ipAddress: string,
    userAgent: string,
    details: Record<string, any> = {}
  ): Promise<void> {
    await this.log({
      action: `DESTRUCTIVE_${action}`,
      userId,
      tenantId,
      ipAddress,
      userAgent,
      details,
      severity: 'HIGH'
    })
  }

  /**
   * Get audit logs with filtering
   */
  async getLogs(filters: {
    tenantId?: string
    userId?: string
    action?: string
    severity?: AuditLog['severity']
    startDate?: Date
    endDate?: Date
    limit?: number
    offset?: number
  }): Promise<{ logs: AuditLog[]; total: number }> {
    try {
      await connectToDatabase()
      
      const query: any = {}
      
      if (filters.tenantId) query.tenantId = filters.tenantId
      if (filters.userId) query.userId = filters.userId
      if (filters.action) query.action = new RegExp(filters.action, 'i')
      if (filters.severity) query.severity = filters.severity
      
      if (filters.startDate || filters.endDate) {
        query.timestamp = {}
        if (filters.startDate) query.timestamp.$gte = filters.startDate
        if (filters.endDate) query.timestamp.$lte = filters.endDate
      }
      
      const limit = Math.min(filters.limit || 50, 1000) // Max 1000 records
      const offset = filters.offset || 0
      
      const [logs, total] = await Promise.all([
        AuditLogModel.find(query)
          .sort({ timestamp: -1 })
          .limit(limit)
          .skip(offset)
          .lean(),
        AuditLogModel.countDocuments(query)
      ])
      
      return { logs, total }
    } catch (error) {
      console.error('Failed to retrieve audit logs:', error)
      return { logs: [], total: 0 }
    }
  }

  /**
   * Get security events (failed logins, access denials, etc.)
   */
  async getSecurityEvents(
    tenantId: string,
    hours: number = 24
  ): Promise<AuditLog[]> {
    try {
      await connectToDatabase()
      
      const startDate = new Date(Date.now() - hours * 60 * 60 * 1000)
      
      const securityActions = [
        'ADMIN_LOGIN_FAILED',
        'ADMIN_ACCESS_DENIED',
        'ADMIN_LOGIN_RATE_LIMITED',
        'ADMIN_SESSION_HIJACK_ATTEMPT',
        'ADMIN_SUSPICIOUS_ACTIVITY'
      ]
      
      const logs = await AuditLogModel.find({
        tenantId,
        action: { $in: securityActions },
        timestamp: { $gte: startDate }
      })
      .sort({ timestamp: -1 })
      .limit(100)
      .lean()
      
      return logs
    } catch (error) {
      console.error('Failed to retrieve security events:', error)
      return []
    }
  }

  /**
   * Sanitize sensitive data from log details
   */
  private sanitizeDetails(details: Record<string, any>): Record<string, any> {
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'hash']
    const sanitized = { ...details }
    
    const sanitizeObject = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) {
        return obj
      }
      
      if (Array.isArray(obj)) {
        return obj.map(sanitizeObject)
      }
      
      const result: any = {}
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase()
        if (sensitiveFields.some(field => lowerKey.includes(field))) {
          result[key] = '[REDACTED]'
        } else if (typeof value === 'object') {
          result[key] = sanitizeObject(value)
        } else {
          result[key] = value
        }
      }
      return result
    }
    
    return sanitizeObject(sanitized)
  }

  /**
   * Clean up old logs (manual cleanup, in addition to TTL)
   */
  async cleanupOldLogs(daysToKeep: number = 365): Promise<number> {
    try {
      await connectToDatabase()
      
      const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000)
      
      const result = await AuditLogModel.deleteMany({
        timestamp: { $lt: cutoffDate }
      })
      
      return result.deletedCount || 0
    } catch (error) {
      console.error('Failed to cleanup old audit logs:', error)
      return 0
    }
  }
}

export const auditLogger = new AuditLogger()

// Export common audit actions for consistency
export const AUDIT_ACTIONS = {
  // Authentication
  ADMIN_LOGIN_SUCCESS: 'ADMIN_LOGIN_SUCCESS',
  ADMIN_LOGIN_FAILED: 'ADMIN_LOGIN_FAILED',
  ADMIN_LOGOUT: 'ADMIN_LOGOUT',
  ADMIN_TOKEN_REFRESHED: 'ADMIN_TOKEN_REFRESHED',
  ADMIN_ACCESS_DENIED: 'ADMIN_ACCESS_DENIED',
  ADMIN_LOGIN_RATE_LIMITED: 'ADMIN_LOGIN_RATE_LIMITED',
  
  // User Management
  ADMIN_USER_CREATED: 'ADMIN_USER_CREATED',
  ADMIN_USER_UPDATED: 'ADMIN_USER_UPDATED',
  ADMIN_USER_DELETED: 'ADMIN_USER_DELETED',
  ADMIN_USER_ROLE_CHANGED: 'ADMIN_USER_ROLE_CHANGED',
  
  // Menu Management
  ADMIN_MENU_ITEM_CREATED: 'ADMIN_MENU_ITEM_CREATED',
  ADMIN_MENU_ITEM_UPDATED: 'ADMIN_MENU_ITEM_UPDATED',
  ADMIN_MENU_ITEM_DELETED: 'ADMIN_MENU_ITEM_DELETED',
  ADMIN_MENU_BULK_UPDATE: 'ADMIN_MENU_BULK_UPDATE',
  
  // Order Management
  ADMIN_ORDER_STATUS_CHANGED: 'ADMIN_ORDER_STATUS_CHANGED',
  ADMIN_ORDER_CANCELLED: 'ADMIN_ORDER_CANCELLED',
  ADMIN_ORDER_REFUNDED: 'ADMIN_ORDER_REFUNDED',
  
  // Settings
  ADMIN_SETTINGS_UPDATED: 'ADMIN_SETTINGS_UPDATED',
  ADMIN_RESTAURANT_CONFIG_CHANGED: 'ADMIN_RESTAURANT_CONFIG_CHANGED',
  
  // Security
  ADMIN_SESSION_REVOKED: 'ADMIN_SESSION_REVOKED',
  ADMIN_SUSPICIOUS_ACTIVITY: 'ADMIN_SUSPICIOUS_ACTIVITY',
  ADMIN_PERMISSION_ESCALATION_ATTEMPT: 'ADMIN_PERMISSION_ESCALATION_ATTEMPT'
} as const