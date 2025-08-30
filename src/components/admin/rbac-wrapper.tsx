'use client';

import React from 'react';
import { useAdminAuth } from '@/lib/admin-auth-context';
import { Permission } from '@/lib/auth/rbac';

interface RBACWrapperProps {
  children: React.ReactNode;
  permission?: Permission;
  role?: string | string[];
  fallback?: React.ReactNode;
  requireAll?: boolean; // If true, user must have ALL specified permissions/roles
}

/**
 * Component wrapper that conditionally renders children based on user permissions and roles
 */
export function RBACWrapper({ 
  children, 
  permission, 
  role, 
  fallback = null,
  requireAll = false 
}: RBACWrapperProps) {
  const { user, hasPermission, hasRole } = useAdminAuth();

  if (!user) {
    return <>{fallback}</>;
  }

  let hasAccess = true;

  // Check permission
  if (permission) {
    hasAccess = hasPermission(permission);
  }

  // Check role
  if (role && hasAccess) {
    hasAccess = hasRole(role);
  }

  // If requireAll is true and we have both permission and role checks
  if (requireAll && permission && role) {
    hasAccess = hasPermission(permission) && hasRole(role);
  }

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

/**
 * Hook for conditional rendering based on permissions
 */
export function useRBAC() {
  const { user, hasPermission, hasRole } = useAdminAuth();

  const canAccess = (permission?: Permission, role?: string | string[]) => {
    if (!user) return false;
    
    let access = true;
    if (permission) access = access && hasPermission(permission);
    if (role) access = access && hasRole(role);
    
    return access;
  };

  const canAccessAny = (permissions?: Permission[], roles?: string[]) => {
    if (!user) return false;
    
    let hasAnyPermission = !permissions || permissions.some(p => hasPermission(p));
    let hasAnyRole = !roles || roles.some(r => hasRole(r));
    
    return hasAnyPermission && hasAnyRole;
  };

  const canAccessAll = (permissions?: Permission[], roles?: string[]) => {
    if (!user) return false;
    
    let hasAllPermissions = !permissions || permissions.every(p => hasPermission(p));
    let hasAllRoles = !roles || roles.every(r => hasRole(r));
    
    return hasAllPermissions && hasAllRoles;
  };

  return {
    user,
    canAccess,
    canAccessAny,
    canAccessAll,
    hasPermission,
    hasRole
  };
}

/**
 * Higher-order component for role-based access control
 */
export function withRBAC<P extends object>(
  Component: React.ComponentType<P>,
  accessConfig: {
    permission?: Permission;
    role?: string | string[];
    fallback?: React.ComponentType<P>;
    requireAll?: boolean;
  }
) {
  return function RBACComponent(props: P) {
    const { user, hasPermission, hasRole } = useAdminAuth();

    if (!user) {
      return accessConfig.fallback ? <accessConfig.fallback {...props} /> : null;
    }

    let hasAccess = true;

    if (accessConfig.permission) {
      hasAccess = hasPermission(accessConfig.permission);
    }

    if (accessConfig.role && hasAccess) {
      hasAccess = hasRole(accessConfig.role);
    }

    if (accessConfig.requireAll && accessConfig.permission && accessConfig.role) {
      hasAccess = hasPermission(accessConfig.permission) && hasRole(accessConfig.role);
    }

    if (!hasAccess) {
      return accessConfig.fallback ? <accessConfig.fallback {...props} /> : null;
    }

    return <Component {...props} />;
  };
}

/**
 * Component for displaying user role badge
 */
export function RoleBadge({ className }: { className?: string }) {
  const { user } = useAdminAuth();

  if (!user) return null;

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'owner':
        return 'bg-purple-100 text-purple-800';
      case 'manager':
        return 'bg-blue-100 text-blue-800';
      case 'staff':
        return 'bg-green-100 text-green-800';
      case 'courier':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(user.role)} ${className || ''}`}>
      {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
    </span>
  );
}

/**
 * Component for displaying permission-based content
 */
interface PermissionGateProps {
  children: React.ReactNode;
  permissions: Permission[];
  mode?: 'any' | 'all'; // 'any' = user needs at least one permission, 'all' = user needs all permissions
  fallback?: React.ReactNode;
}

export function PermissionGate({ 
  children, 
  permissions, 
  mode = 'any', 
  fallback = null 
}: PermissionGateProps) {
  const { hasPermission } = useAdminAuth();

  const hasAccess = mode === 'all' 
    ? permissions.every(p => hasPermission(p))
    : permissions.some(p => hasPermission(p));

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

/**
 * Component for displaying role-based content
 */
interface RoleGateProps {
  children: React.ReactNode;
  roles: string[];
  mode?: 'any' | 'all';
  fallback?: React.ReactNode;
}

export function RoleGate({ 
  children, 
  roles, 
  mode = 'any', 
  fallback = null 
}: RoleGateProps) {
  const { hasRole } = useAdminAuth();

  const hasAccess = mode === 'all' 
    ? roles.every(r => hasRole(r))
    : roles.some(r => hasRole(r));

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}