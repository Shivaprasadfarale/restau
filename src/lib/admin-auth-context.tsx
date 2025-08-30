'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Permission } from '@/lib/auth/rbac';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'manager' | 'staff' | 'courier';
  tenantId: string;
  permissions: Permission[];
  lastLogin: Date;
  sessionInfo?: {
    id: string;
    lastActivity: Date;
    deviceInfo: string;
  };
}

export interface AdminSession {
  id: string;
  deviceInfo: string;
  ipAddress: string;
  lastActivity: Date;
  isCurrent: boolean;
  createdAt: Date;
}

interface AdminAuthContextType {
  user: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string, options?: { rememberMe?: boolean; deviceInfo?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
  hasRole: (roles: string | string[]) => boolean;
  getSessions: () => Promise<AdminSession[]>;
  revokeSessions: (sessionIds?: string[], revokeAll?: boolean) => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    checkAuth();
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, []);

  const getDeviceInfo = () => {
    const userAgent = navigator.userAgent;
    const platform = navigator.platform;
    return `${platform} - ${userAgent.split(' ')[0]}`;
  };

  const getStoredToken = () => {
    if (typeof document !== 'undefined') {
      const cookies = document.cookie.split(';');
      const tokenCookie = cookies.find(cookie => cookie.trim().startsWith('admin-token='));
      return tokenCookie ? tokenCookie.split('=')[1] : null;
    }
    return null;
  };
  
  const setStoredToken = (token: string) => {
    if (typeof document !== 'undefined') {
      document.cookie = `admin-token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; secure; samesite=strict`;
    }
  };
  
  const removeStoredToken = () => {
    if (typeof document !== 'undefined') {
      document.cookie = 'admin-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }
  };

  const checkAuth = async () => {
    try {
      const token = getStoredToken();
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await fetch('/api/admin/auth/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const { user: userData } = await response.json();
        setUser(userData);
        setupTokenRefresh();
      } else {
        removeStoredToken();
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      removeStoredToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const setupTokenRefresh = () => {
    // Refresh token every 30 minutes
    const interval = setInterval(async () => {
      try {
        await refreshToken();
      } catch (error) {
        console.error('Token refresh failed:', error);
        await logout();
      }
    }, 30 * 60 * 1000);

    setRefreshInterval(interval);
  };

  const login = async (
    email: string, 
    password: string, 
    options: { rememberMe?: boolean; deviceInfo?: string } = {}
  ) => {
    const deviceInfo = options.deviceInfo || getDeviceInfo();
    
    console.log('Making login request to /api/admin/auth/login')
    const response = await fetch('/api/admin/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        email, 
        password, 
        deviceInfo,
        rememberMe: options.rememberMe || false
      }),
    });

    console.log('Login response status:', response.status)
    
    if (!response.ok) {
      const error = await response.json();
      console.log('Login error response:', error)
      throw new Error(error.message || 'Login failed');
    }

    const data = await response.json();
    console.log('Login success response:', data)
    
    if (data.success && data.user && data.tokens) {
      console.log('Setting token and user')
      setStoredToken(data.tokens.accessToken);
      setUser(data.user);
      setupTokenRefresh();
    } else {
      console.log('Login failed - invalid response format')
      throw new Error('Invalid response format');
    }
  };

  const logout = async () => {
    try {
      const token = getStoredToken();
      if (token) {
        await fetch('/api/admin/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      removeStoredToken();
      setUser(null);
      if (refreshInterval) {
        clearInterval(refreshInterval);
        setRefreshInterval(null);
      }
    }
  };

  const refreshToken = async () => {
    const response = await fetch('/api/admin/auth/refresh', {
      method: 'POST',
      credentials: 'include', // Include cookies for refresh token
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const { accessToken } = await response.json();
    setStoredToken(accessToken);
  };

  const hasPermission = useCallback((permission: Permission): boolean => {
    return user?.permissions.includes(permission) || false;
  }, [user]);

  const hasRole = useCallback((roles: string | string[]): boolean => {
    if (!user) return false;
    const roleArray = Array.isArray(roles) ? roles : [roles];
    return roleArray.includes(user.role);
  }, [user]);

  const getSessions = async (): Promise<AdminSession[]> => {
    const token = getStoredToken();
    if (!token) throw new Error('No token available');

    const response = await fetch('/api/admin/auth/sessions', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch sessions');
    }

    const { sessions } = await response.json();
    return sessions;
  };

  const revokeSessions = async (sessionIds?: string[], revokeAll?: boolean) => {
    const token = getStoredToken();
    if (!token) throw new Error('No token available');

    const response = await fetch('/api/admin/auth/sessions', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sessionIds, revokeAll }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to revoke sessions');
    }
  };

  return (
    <AdminAuthContext.Provider value={{ 
      user, 
      loading, 
      login, 
      logout, 
      refreshToken,
      hasPermission,
      hasRole,
      getSessions,
      revokeSessions
    }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (context === undefined) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
}