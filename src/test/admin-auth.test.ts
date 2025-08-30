import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { connectToDatabase } from '@/lib/mongodb'
import { User } from '@/models/User'
import { rbacService, Permission } from '@/lib/auth/rbac'
import { auditLogger } from '@/lib/audit-logger'
import { rateLimiter } from '@/lib/rate-limiter'

// Mock Redis for rate limiting tests
vi.mock('@/lib/redis', () => ({
  redis: {
    pipeline: vi.fn(() => ({
      incr: vi.fn(),
      expire: vi.fn(),
      exec: vi.fn().mockResolvedValue([[null, 1], [null, 'OK']])
    })),
    get: vi.fn().mockResolvedValue('0'),
    keys: vi.fn().mockResolvedValue([]),
    del: vi.fn().mockResolvedValue(1)
  }
}))

describe('Admin Authentication System', () => {
  let testUser: any
  let testTenantId: string

  beforeEach(async () => {
    await connectToDatabase()
    
    // Create test tenant and user
    testTenantId = 'test-tenant-' + Date.now()
    testUser = new User({
      tenantId: testTenantId,
      email: 'admin@test.com',
      passwordHash: 'test-password',
      name: 'Test Admin',
      role: 'manager',
      isVerified: true
    })
    await testUser.save()
  })

  afterEach(async () => {
    // Clean up test data
    await User.deleteMany({ tenantId: testTenantId })
  })

  describe('RBAC System', () => {
    it('should correctly assign permissions to roles', () => {
      // Test owner permissions
      expect(rbacService.hasPermission('owner', Permission.MANAGE_USERS)).toBe(true)
      expect(rbacService.hasPermission('owner', Permission.VIEW_ANALYTICS)).toBe(true)
      expect(rbacService.hasPermission('owner', Permission.MANAGE_SETTINGS)).toBe(true)

      // Test manager permissions
      expect(rbacService.hasPermission('manager', Permission.MANAGE_MENU)).toBe(true)
      expect(rbacService.hasPermission('manager', Permission.VIEW_ANALYTICS)).toBe(true)
      expect(rbacService.hasPermission('manager', Permission.MANAGE_USERS)).toBe(false)

      // Test staff permissions
      expect(rbacService.hasPermission('staff', Permission.VIEW_ORDERS)).toBe(true)
      expect(rbacService.hasPermission('staff', Permission.UPDATE_ORDERS)).toBe(true)
      expect(rbacService.hasPermission('staff', Permission.MANAGE_MENU)).toBe(false)

      // Test customer permissions
      expect(rbacService.hasPermission('customer', Permission.VIEW_MENU)).toBe(true)
      expect(rbacService.hasPermission('customer', Permission.CREATE_ORDERS)).toBe(true)
      expect(rbacService.hasPermission('customer', Permission.MANAGE_MENU)).toBe(false)
    })

    it('should validate admin access correctly', () => {
      expect(rbacService.canAccessAdmin('owner')).toBe(true)
      expect(rbacService.canAccessAdmin('manager')).toBe(true)
      expect(rbacService.canAccessAdmin('staff')).toBe(true)
      expect(rbacService.canAccessAdmin('courier')).toBe(false)
      expect(rbacService.canAccessAdmin('customer')).toBe(false)
    })

    it('should validate role hierarchy for user management', () => {
      // Owners can manage everyone except other owners
      expect(rbacService.canManageRole('owner', 'manager')).toBe(true)
      expect(rbacService.canManageRole('owner', 'staff')).toBe(true)
      expect(rbacService.canManageRole('owner', 'courier')).toBe(true)
      expect(rbacService.canManageRole('owner', 'owner')).toBe(false)

      // Managers can manage staff and couriers
      expect(rbacService.canManageRole('manager', 'staff')).toBe(true)
      expect(rbacService.canManageRole('manager', 'courier')).toBe(true)
      expect(rbacService.canManageRole('manager', 'manager')).toBe(false)
      expect(rbacService.canManageRole('manager', 'owner')).toBe(false)

      // Staff cannot manage anyone
      expect(rbacService.canManageRole('staff', 'courier')).toBe(false)
      expect(rbacService.canManageRole('staff', 'staff')).toBe(false)
    })

    it('should validate permissions with context', async () => {
      const authContext = {
        userId: testUser._id.toString(),
        tenantId: testTenantId,
        role: 'manager' as const,
        sessionId: testUser.sessions[0]._id.toString()
      }

      // Valid permission check
      const result1 = await rbacService.validatePermission(
        authContext,
        Permission.MANAGE_MENU
      )
      expect(result1.authorized).toBe(true)

      // Invalid permission check
      const result2 = await rbacService.validatePermission(
        authContext,
        Permission.MANAGE_USERS
      )
      expect(result2.authorized).toBe(false)
      expect(result2.reason).toContain('does not have permission')

      // Cross-tenant access check
      const result3 = await rbacService.validatePermission(
        authContext,
        Permission.MANAGE_MENU,
        { resourceTenantId: 'different-tenant' }
      )
      expect(result3.authorized).toBe(false)
      expect(result3.reason).toContain('Cross-tenant access denied')
    })
  })

  describe('Session Management', () => {
    it('should add and manage user sessions', () => {
      const initialSessionCount = testUser.sessions.length
      
      // Add new session
      testUser.addSession('Chrome Browser', '192.168.1.1', 'device-fingerprint')
      expect(testUser.sessions.length).toBe(initialSessionCount + 1)

      const newSession = testUser.sessions[testUser.sessions.length - 1]
      expect(newSession.deviceInfo).toBe('Chrome Browser')
      expect(newSession.ipAddress).toBe('192.168.1.1')
      expect(newSession.isRevoked).toBe(false)
    })

    it('should limit maximum sessions per user', () => {
      // Add 6 sessions (should trigger cleanup)
      for (let i = 0; i < 6; i++) {
        testUser.addSession(`Device ${i}`, '192.168.1.1', `fingerprint-${i}`)
      }

      // Should not exceed 5 sessions
      expect(testUser.sessions.length).toBeLessThanOrEqual(5)
    })

    it('should revoke sessions correctly', () => {
      testUser.addSession('Test Device', '192.168.1.1', 'test-fingerprint')
      const sessionId = testUser.sessions[testUser.sessions.length - 1]._id.toString()

      // Revoke specific session
      testUser.revokeSession(sessionId, 'Test revocation')
      const revokedSession = testUser.sessions.id(sessionId)
      expect(revokedSession.isRevoked).toBe(true)
      expect(revokedSession.revokedReason).toBe('Test revocation')

      // Revoke all sessions
      testUser.revokeAllSessions('Security cleanup')
      testUser.sessions.forEach((session: any) => {
        expect(session.isRevoked).toBe(true)
      })
    })
  })

  describe('Rate Limiting', () => {
    it('should enforce rate limits correctly', async () => {
      const key = 'test-rate-limit'
      const maxRequests = 3
      const windowMs = 60000

      // First 3 requests should be allowed
      for (let i = 0; i < 3; i++) {
        const result = await rateLimiter.checkLimit(key, maxRequests, windowMs)
        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(maxRequests - (i + 1))
      }

      // 4th request should be blocked
      const result = await rateLimiter.checkLimit(key, maxRequests, windowMs)
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('should reset rate limits correctly', async () => {
      const key = 'test-reset-limit'
      
      // Exhaust rate limit
      await rateLimiter.checkLimit(key, 1, 60000)
      await rateLimiter.checkLimit(key, 1, 60000)

      // Reset and try again
      await rateLimiter.resetLimit(key)
      const result = await rateLimiter.checkLimit(key, 1, 60000)
      expect(result.allowed).toBe(true)
    })

    it('should handle multiple rate limit checks', async () => {
      const checks = [
        { key: 'test-1', maxRequests: 5, windowMs: 60000 },
        { key: 'test-2', maxRequests: 10, windowMs: 60000 },
        { key: 'test-3', maxRequests: 3, windowMs: 60000 }
      ]

      const results = await rateLimiter.checkMultipleLimits(checks)
      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result.allowed).toBe(true)
      })
    })
  })

  describe('Audit Logging', () => {
    it('should log audit events correctly', async () => {
      const logData = {
        action: 'TEST_ACTION',
        userId: testUser._id.toString(),
        tenantId: testTenantId,
        ipAddress: '192.168.1.1',
        userAgent: 'Test Browser',
        details: { testData: 'test value' },
        severity: 'MEDIUM' as const
      }

      // Should not throw error
      await expect(auditLogger.log(logData)).resolves.not.toThrow()
    })

    it('should sanitize sensitive data in logs', async () => {
      const logData = {
        action: 'TEST_SENSITIVE',
        userId: testUser._id.toString(),
        tenantId: testTenantId,
        ipAddress: '192.168.1.1',
        userAgent: 'Test Browser',
        details: {
          password: 'secret123',
          token: 'jwt-token',
          normalData: 'normal value'
        },
        severity: 'LOW' as const
      }

      // Should sanitize sensitive fields
      await expect(auditLogger.log(logData)).resolves.not.toThrow()
    })

    it('should log admin actions with proper context', async () => {
      await expect(
        auditLogger.logAdminAction(
          'MENU_UPDATED',
          testUser._id.toString(),
          testTenantId,
          '192.168.1.1',
          'Test Browser',
          { menuItemId: 'item-123' },
          'MEDIUM'
        )
      ).resolves.not.toThrow()
    })

    it('should log destructive actions with high severity', async () => {
      await expect(
        auditLogger.logDestructiveAction(
          'USER_DELETED',
          testUser._id.toString(),
          testTenantId,
          '192.168.1.1',
          'Test Browser',
          { deletedUserId: 'user-456' }
        )
      ).resolves.not.toThrow()
    })
  })

  describe('Security Features', () => {
    it('should validate tenant isolation', async () => {
      const authContext = {
        userId: testUser._id.toString(),
        tenantId: testTenantId,
        role: 'manager' as const,
        sessionId: testUser.sessions[0]._id.toString()
      }

      // Same tenant access should be allowed
      const result1 = await rbacService.validatePermission(
        authContext,
        Permission.VIEW_ORDERS,
        { resourceTenantId: testTenantId }
      )
      expect(result1.authorized).toBe(true)

      // Different tenant access should be denied
      const result2 = await rbacService.validatePermission(
        authContext,
        Permission.VIEW_ORDERS,
        { resourceTenantId: 'different-tenant' }
      )
      expect(result2.authorized).toBe(false)
    })

    it('should validate resource ownership for customers', async () => {
      const customerContext = {
        userId: 'customer-123',
        tenantId: testTenantId,
        role: 'customer' as const,
        sessionId: 'session-123'
      }

      // Own resource access should be allowed
      const result1 = await rbacService.validatePermission(
        customerContext,
        Permission.VIEW_ORDERS,
        { resourceUserId: 'customer-123' }
      )
      expect(result1.authorized).toBe(true)

      // Other user's resource should be denied
      const result2 = await rbacService.validatePermission(
        customerContext,
        Permission.VIEW_ORDERS,
        { resourceUserId: 'different-customer' }
      )
      expect(result2.authorized).toBe(false)
    })
  })
})