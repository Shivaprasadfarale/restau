'use client'

import React, { useState } from 'react'
import { X } from 'lucide-react'
import { LoginForm } from './login-form'
import { RegisterForm } from './register-form'
import { OTPForm } from './otp-form'
import { PasswordResetForm } from './password-reset-form'
import { OAuthButtons } from './oauth-buttons'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'

type AuthMode = 'login' | 'register' | 'otp' | 'reset' | 'oauth'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  defaultMode?: AuthMode
  showTenantField?: boolean
  defaultTenantId?: string
  onSuccess?: () => void
}

export function AuthModal({ 
  isOpen, 
  onClose, 
  defaultMode = 'login',
  showTenantField = false,
  defaultTenantId,
  onSuccess 
}: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>(defaultMode)
  const { login, register } = useAuth()

  if (!isOpen) return null

  const handleSuccess = () => {
    onSuccess?.()
    onClose()
  }

  const handleOAuthSuccess = async (userData: any) => {
    // In a real implementation, this would handle OAuth callback
    // For now, we'll simulate a successful login
    try {
      // This would normally exchange OAuth code for tokens
      const result = await login(userData.email, 'oauth_login', defaultTenantId)
      if (result.success) {
        handleSuccess()
      }
    } catch (error) {
      console.error('OAuth login failed:', error)
    }
  }

  const renderContent = () => {
    switch (mode) {
      case 'login':
        return (
          <div className="space-y-6">
            <LoginForm
              onSuccess={handleSuccess}
              onSwitchToRegister={() => setMode('register')}
              onSwitchToOTP={() => setMode('otp')}
              showTenantField={showTenantField}
              defaultTenantId={defaultTenantId}
            />
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or continue with
                </span>
              </div>
            </div>

            <OAuthButtons
              mode="login"
              onSuccess={handleOAuthSuccess}
              onError={(error) => console.error('OAuth error:', error)}
            />

            <div className="text-center">
              <button
                type="button"
                onClick={() => setMode('reset')}
                className="text-sm text-primary hover:underline"
              >
                Forgot your password?
              </button>
            </div>
          </div>
        )

      case 'register':
        return (
          <div className="space-y-6">
            <RegisterForm
              onSuccess={handleSuccess}
              onSwitchToLogin={() => setMode('login')}
              defaultRole={showTenantField ? 'owner' : 'customer'}
            />
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or continue with
                </span>
              </div>
            </div>

            <OAuthButtons
              mode="register"
              onSuccess={handleOAuthSuccess}
              onError={(error) => console.error('OAuth error:', error)}
            />
          </div>
        )

      case 'otp':
        return (
          <OTPForm
            onSuccess={handleSuccess}
            onBack={() => setMode('login')}
            purpose="login"
            tenantId={defaultTenantId}
          />
        )

      case 'reset':
        return (
          <PasswordResetForm
            onBack={() => setMode('login')}
            tenantId={defaultTenantId}
          />
        )

      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-background rounded-lg shadow-lg w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold">
            {mode === 'login' && 'Sign In'}
            {mode === 'register' && 'Create Account'}
            {mode === 'otp' && 'Phone Verification'}
            {mode === 'reset' && 'Reset Password'}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6">
          {renderContent()}
        </div>
      </div>
    </div>
  )
}

// Hook for managing auth modal state
export function useAuthModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<AuthMode>('login')

  const openLogin = () => {
    setMode('login')
    setIsOpen(true)
  }

  const openRegister = () => {
    setMode('register')
    setIsOpen(true)
  }

  const openOTP = () => {
    setMode('otp')
    setIsOpen(true)
  }

  const close = () => {
    setIsOpen(false)
  }

  return {
    isOpen,
    mode,
    openLogin,
    openRegister,
    openOTP,
    close,
    setMode
  }
}