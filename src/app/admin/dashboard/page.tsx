'use client';

import { useAdminAuth } from '@/lib/admin-auth-context';
import { AdminLogin } from '@/components/admin/admin-login';
import { Card } from '@/components/ui/card';

export default function AdminDashboardPage() {
  const { user, loading } = useAdminAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AdminLogin />;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Simplified Sidebar */}
      <div className="w-64 bg-white shadow-lg">
        <div className="p-6">
          <h1 className="text-xl font-bold text-gray-800">Restaurant Admin</h1>
        </div>
        <nav className="mt-6">
          <a href="/admin" className="block px-6 py-3 text-gray-600 hover:bg-gray-100">Dashboard</a>
          <a href="/admin/orders" className="block px-6 py-3 text-gray-600 hover:bg-gray-100">Orders</a>
          <a href="/admin/menu" className="block px-6 py-3 text-gray-600 hover:bg-gray-100">Menu</a>
          <a href="/admin/analytics" className="block px-6 py-3 text-gray-600 hover:bg-gray-100">Analytics</a>
          <a href="/admin/customers" className="block px-6 py-3 text-gray-600 hover:bg-gray-100">Customers</a>
          <a href="/admin/delivery" className="block px-6 py-3 text-gray-600 hover:bg-gray-100">Delivery</a>
          <a href="/admin/settings" className="block px-6 py-3 text-gray-600 hover:bg-gray-100">Settings</a>
        </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600">Welcome back, {user.name}!</p>
          </div>

          {/* Dashboard Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="p-6">
              <h3 className="text-sm font-medium text-gray-500">Total Orders</h3>
              <p className="text-2xl font-bold text-gray-900">0</p>
            </Card>
            <Card className="p-6">
              <h3 className="text-sm font-medium text-gray-500">Revenue</h3>
              <p className="text-2xl font-bold text-gray-900">₹0</p>
            </Card>
            <Card className="p-6">
              <h3 className="text-sm font-medium text-gray-500">Menu Items</h3>
              <p className="text-2xl font-bold text-gray-900">6</p>
            </Card>
            <Card className="p-6">
              <h3 className="text-sm font-medium text-gray-500">Customers</h3>
              <p className="text-2xl font-bold text-gray-900">0</p>
            </Card>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
              <div className="space-y-2">
                <a href="/admin/menu" className="block p-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">
                  Manage Menu Items
                </a>
                <a href="/admin/orders" className="block p-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100">
                  View Orders
                </a>
                <a href="/admin/analytics" className="block p-3 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100">
                  View Analytics
                </a>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Restaurant Info</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <p><strong>Name:</strong> Spice Garden Restaurant</p>
                <p><strong>Status:</strong> <span className="text-green-600">Active</span></p>
                <p><strong>Role:</strong> {user.role}</p>
                <p><strong>Email:</strong> {user.email}</p>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}