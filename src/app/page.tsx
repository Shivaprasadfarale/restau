'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useAuthModal, AuthModal } from '@/components/auth'
import { Button } from '@/components/ui/button'
import { User, LogOut, Settings, Package, Search } from 'lucide-react'
import Link from 'next/link'

export default function HomePage() {
  const router = useRouter()
  const { user, isAuthenticated, logout } = useAuth()
  const authModal = useAuthModal()

  const handleLogout = async () => {
    await logout()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">
                Restaurant Template
              </h1>
            </div>

            <div className="flex items-center space-x-4">
              {/* Navigation Links */}
              <nav className="hidden md:flex items-center space-x-4">
                <Link href="/track">
                  <Button variant="ghost" size="sm">
                    <Search className="h-4 w-4 mr-2" />
                    Track Order
                  </Button>
                </Link>
                {isAuthenticated && (
                  <Link href="/orders">
                    <Button variant="ghost" size="sm">
                      <Package className="h-4 w-4 mr-2" />
                      My Orders
                    </Button>
                  </Link>
                )}
              </nav>

              {isAuthenticated ? (
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <User className="h-5 w-5 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">
                      {user?.name}
                    </span>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      {user?.role}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </Button>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    onClick={authModal.openLogin}
                  >
                    Sign In
                  </Button>
                  <Button
                    onClick={authModal.openRegister}
                  >
                    Sign Up
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Welcome to Restaurant Template
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            A complete restaurant website template with authentication, ordering system, and admin panel.
          </p>

          {isAuthenticated ? (
            <div className="bg-white rounded-lg shadow p-6 max-w-md mx-auto">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <User className="w-8 h-8 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Welcome back, {user?.name}!
                  </h3>
                  <p className="text-gray-600">
                    You are logged in as a {user?.role}
                  </p>
                </div>
                <div className="space-y-2 text-sm text-gray-500">
                  <p>Email: {user?.email}</p>
                  {user?.phone && <p>Phone: {user?.phone}</p>}
                  <p>Tenant ID: {user?.tenantId}</p>
                  <p>
                    Status: {user?.isVerified ? (
                      <span className="text-green-600">Verified</span>
                    ) : (
                      <span className="text-yellow-600">Unverified</span>
                    )}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Account Settings
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-gray-600">
                Please sign in to access your account and start ordering.
              </p>
              <div className="flex justify-center space-x-4">
                <Button
                  size="lg"
                  onClick={authModal.openLogin}
                >
                  Sign In
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={authModal.openRegister}
                >
                  Create Account
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="mt-8 flex justify-center space-x-4">
          <Button
            variant="outline"
            size="lg"
            onClick={() => window.location.href = '/menu'}
          >
            View Menu
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => window.location.href = '/admin'}
            className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
          >
            <Settings className="h-4 w-4 mr-2" />
            Admin Panel
          </Button>
        </div>

        {/* Feature Cards */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-2">Secure Authentication</h3>
            <p className="text-gray-600">
              JWT-based authentication with refresh tokens, RBAC, and multi-factor authentication support.
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-2">Order Management</h3>
            <p className="text-gray-600">
              Complete ordering system with real-time updates, payment integration, and order tracking.
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-2">Admin Dashboard</h3>
            <p className="text-gray-600">
              Comprehensive admin panel for managing menus, orders, users, and restaurant settings.
            </p>
          </div>
        </div>
      </main>

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModal.isOpen}
        onClose={authModal.close}
        defaultMode={authModal.mode}
      />
    </div>
  )
}