// Export all authentication utilities
export { jwtService } from './jwt'
export type { JWTPayload, TokenPair, TokenValidationResult } from './jwt'

export { rbacService, Permission, rolePermissions, createAuthContext } from './rbac'
export type { UserRole, AuthContext } from './rbac'

export { passwordService } from './password'
export type { PasswordValidationResult, PasswordResetToken } from './password'

export { 
  authMiddleware, 
  withAuth, 
  withOptionalAuth, 
  auditLog,
  cleanupRateLimit 
} from './middleware'
export type { AuthenticatedRequest, MiddlewareOptions } from './middleware'