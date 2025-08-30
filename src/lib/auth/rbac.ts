import { User } from '@/models'

export enum Permission {
  // Order permissions
  VIEW_ORDERS = 'orders:view',
  UPDATE_ORDERS = 'orders:update',
  CREATE_ORDERS = 'orders:create',
  DELETE_ORDERS = 'orders:delete',
  
  // Menu permissions
  VIEW_MENU = 'menu:view',
  MANAGE_MENU = 'menu:manage',
  CREATE_MENU_ITEMS = 'menu:create',
  UPDATE_MENU_ITEMS = 'menu:update',
  DELETE_MENU_ITEMS = 'menu:delete',
  
  // User permissions
  VIEW_USERS = 'users:view',
  MANAGE_USERS = 'users:manage',
  CREATE_USERS = 'users:create',
  UPDATE_USERS = 'users:update',
  DELETE_USERS = 'users:delete',
  
  // Analytics permissions
  VIEW_ANALYTICS = 'analytics:view',
  EXPORT_ANALYTICS = 'analytics:export',
  
  // Restaurant settings
  VIEW_SETTINGS = 'settings:view',
  MANAGE_SETTINGS = 'settings:manage',
  
  // Delivery permissions
  VIEW_DELIVERY = 'delivery:view',
  MANAGE_DELIVERY = 'delivery:manage',
  
  // Coupon permissions
  VIEW_COUPONS = 'coupons:view',
  MANAGE_COUPONS = 'coupons:manage',
  
  // System permissions
  SYSTEM_ADMIN = 'system:admin'
}

export type UserRole = 'customer' | 'owner' | 'manager' | 'staff' | 'courier'

// Role-based permission mapping
export const rolePermissions: Record<UserRole, Permission[]> = {
  customer: [
    Permission.VIEW_MENU,
    Permission.CREATE_ORDERS,
    Permission.VIEW_ORDERS // Only their own orders
  ],
  
  courier: [
    Permission.VIEW_ORDERS,
    Permission.UPDATE_ORDERS, // Only delivery status
    Permission.VIEW_DELIVERY,
    Permission.MANAGE_DELIVERY
  ],
  
  staff: [
    Permission.VIEW_ORDERS,
    Permission.UPDATE_ORDERS,
    Permission.VIEW_MENU,
    Permission.VIEW_DELIVERY,
    Permission.MANAGE_DELIVERY
  ],
  
  manager: [
    Permission.VIEW_ORDERS,
    Permission.UPDATE_ORDERS,
    Permission.DELETE_ORDERS,
    Permission.VIEW_MENU,
    Permission.MANAGE_MENU,
    Permission.CREATE_MENU_ITEMS,
    Permission.UPDATE_MENU_ITEMS,
    Permission.DELETE_MENU_ITEMS,
    Permission.VIEW_ANALYTICS,
    Permission.VIEW_DELIVERY,
    Permission.MANAGE_DELIVERY,
    Permission.VIEW_COUPONS,
    Permission.MANAGE_COUPONS,
    Permission.VIEW_USERS,
    Permission.VIEW_SETTINGS
  ],
  
  owner: [
    // Owners have all permissions except system admin
    ...Object.values(Permission).filter(p => p !== Permission.SYSTEM_ADMIN)
  ]
}

export interface AuthContext {
  userId: string
  tenantId: string
  role: UserRole
  sessionId: string
}

class RBACService {
  /**
   * Check if a role has a specific permission
   */
  hasPermission(role: UserRole, permission: Permission): boolean {
    const permissions = rolePermissions[role] || []
    return permissions.includes(permission)
  }

  /**
   * Check if user has permission (with context validation)
   */
  async validatePermission(
    authContext: AuthContext,
    permission: Permission,
    resourceContext?: {
      resourceUserId?: string
      resourceTenantId?: string
      resourceType?: string
    }
  ): Promise<{ authorized: boolean; reason?: string }> {
    // Check basic role permission
    if (!this.hasPermission(authContext.role, permission)) {
      return { 
        authorized: false, 
        reason: `Role '${authContext.role}' does not have permission '${permission}'` 
      }
    }

    // Additional context-based checks
    if (resourceContext) {
      // Tenant isolation check
      if (resourceContext.resourceTenantId && 
          resourceContext.resourceTenantId !== authContext.tenantId) {
        return { 
          authorized: false, 
          reason: 'Cross-tenant access denied' 
        }
      }

      // Resource ownership check (for customers viewing their own orders)
      if (authContext.role === 'customer' && 
          resourceContext.resourceUserId && 
          resourceContext.resourceUserId !== authContext.userId) {
        return { 
          authorized: false, 
          reason: 'Access denied: resource belongs to different user' 
        }
      }
    }

    // Validate session is still active
    try {
      const user = await User.findById(authContext.userId)
      if (!user || user.tenantId !== authContext.tenantId) {
        return { authorized: false, reason: 'User not found or tenant mismatch' }
      }

      const session = user.sessions.id(authContext.sessionId)
      if (!session || session.isRevoked) {
        return { authorized: false, reason: 'Session expired or revoked' }
      }

      // Update last activity
      session.lastActivity = new Date()
      await user.save()

      return { authorized: true }
    } catch (error) {
      return { authorized: false, reason: 'Session validation failed' }
    }
  }

  /**
   * Get all permissions for a role
   */
  getRolePermissions(role: UserRole): Permission[] {
    return rolePermissions[role] || []
  }

  /**
   * Check if user can access admin panel
   */
  canAccessAdmin(role: UserRole): boolean {
    return ['owner', 'manager', 'staff'].includes(role)
  }

  /**
   * Check if user can manage other users
   */
  canManageUsers(role: UserRole): boolean {
    return this.hasPermission(role, Permission.MANAGE_USERS)
  }

  /**
   * Check if user can view analytics
   */
  canViewAnalytics(role: UserRole): boolean {
    return this.hasPermission(role, Permission.VIEW_ANALYTICS)
  }

  /**
   * Get role hierarchy level (higher number = more permissions)
   */
  getRoleLevel(role: UserRole): number {
    const levels = {
      customer: 1,
      courier: 2,
      staff: 3,
      manager: 4,
      owner: 5
    }
    return levels[role] || 0
  }

  /**
   * Check if user can manage another user based on role hierarchy
   */
  canManageRole(managerRole: UserRole, targetRole: UserRole): boolean {
    if (!this.canManageUsers(managerRole)) {
      return false
    }
    
    // Owners can manage everyone except other owners
    if (managerRole === 'owner') {
      return targetRole !== 'owner'
    }
    
    // Managers can manage staff and couriers
    if (managerRole === 'manager') {
      return ['staff', 'courier'].includes(targetRole)
    }
    
    return false
  }

  /**
   * Filter permissions based on context
   */
  getContextualPermissions(
    role: UserRole,
    context: {
      isOwnResource?: boolean
      resourceType?: string
    }
  ): Permission[] {
    let permissions = this.getRolePermissions(role)

    // Customers can only view/update their own resources
    if (role === 'customer' && !context.isOwnResource) {
      permissions = permissions.filter(p => 
        p === Permission.VIEW_MENU || 
        p === Permission.CREATE_ORDERS
      )
    }

    return permissions
  }
}

export const rbacService = new RBACService()

// Utility function to create auth context from JWT payload
export function createAuthContext(payload: {
  userId: string
  tenantId: string
  role: string
  sessionId: string
}): AuthContext {
  return {
    userId: payload.userId,
    tenantId: payload.tenantId,
    role: payload.role as UserRole,
    sessionId: payload.sessionId
  }
}