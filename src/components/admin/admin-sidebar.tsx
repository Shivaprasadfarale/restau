'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard, 
  ShoppingBag, 
  Users, 
  Settings, 
  BarChart3,
  Menu,
  Truck,
  LogOut,
  Shield,
  Activity
} from 'lucide-react';
import { useAdminAuth } from '@/lib/admin-auth-context';
import { RBACWrapper, RoleBadge } from './rbac-wrapper';
import { Permission } from '@/lib/auth/rbac';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: Permission;
  roles?: string[];
  badge?: string;
}

const navigation: NavigationItem[] = [
  { 
    name: 'Dashboard', 
    href: '/admin', 
    icon: LayoutDashboard 
  },
  { 
    name: 'Orders', 
    href: '/admin/orders', 
    icon: ShoppingBag,
    permission: Permission.VIEW_ORDERS
  },
  { 
    name: 'Menu', 
    href: '/admin/menu', 
    icon: Menu,
    permission: Permission.VIEW_MENU
  },
  { 
    name: 'Customers', 
    href: '/admin/customers', 
    icon: Users,
    permission: Permission.VIEW_USERS
  },
  { 
    name: 'Delivery', 
    href: '/admin/delivery', 
    icon: Truck,
    permission: Permission.VIEW_DELIVERY
  },
  { 
    name: 'Analytics', 
    href: '/admin/analytics', 
    icon: BarChart3,
    permission: Permission.VIEW_ANALYTICS
  },
  { 
    name: 'Settings', 
    href: '/admin/settings', 
    icon: Settings,
    permission: Permission.VIEW_SETTINGS,
    roles: ['owner', 'manager']
  },
  { 
    name: 'Audit Logs', 
    href: '/admin/audit', 
    icon: Shield,
    roles: ['owner'],
    badge: 'Owner Only'
  },
  { 
    name: 'Sessions', 
    href: '/admin/sessions', 
    icon: Activity
  }
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAdminAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="flex flex-col w-64 bg-white shadow-lg border-r">
      {/* Header */}
      <div className="flex items-center justify-center h-16 px-4 bg-primary">
        <h1 className="text-xl font-bold text-white">Restaurant Admin</h1>
      </div>

      {/* User Info */}
      {user && (
        <div className="p-4 border-b bg-gray-50">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-medium">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user.name}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user.email}
              </p>
            </div>
          </div>
          <div className="mt-2">
            <RoleBadge />
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          
          return (
            <RBACWrapper
              key={item.name}
              permission={item.permission}
              role={item.roles}
            >
              <Link
                href={item.href}
                className={cn(
                  'group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors',
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                <span className="flex-1">{item.name}</span>
                {item.badge && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                    {item.badge}
                  </span>
                )}
              </Link>
            </RBACWrapper>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t">
        <Separator className="mb-4" />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="w-full justify-start text-gray-600 hover:text-gray-900"
        >
          <LogOut className="mr-3 h-4 w-4" />
          Sign Out
        </Button>
        
        {/* Session Info */}
        {user?.sessionInfo && (
          <div className="mt-3 text-xs text-gray-500">
            <p>Last activity:</p>
            <p>{new Date(user.sessionInfo.lastActivity).toLocaleString()}</p>
          </div>
        )}
      </div>
    </div>
  );
}