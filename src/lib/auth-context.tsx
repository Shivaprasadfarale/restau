'use client'

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { User } from '@/types'

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface AuthContextType {
  user: User | null
  tokens: AuthTokens | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string, tenantId?: string) => Promise<{ success: boolean; error?: string }>
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>
  logout: (logoutAll?: boolean) => Promise<void>
  refreshToken: () => Promise<boolean>
  fetchUserProfile: () => Promise<boolean>
  updateUser: (userData: Partial<User>) => void
}

export interface RegisterData {
  email: string
  password: string
  name: string
  phone?: string
  role?: string
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const TOKEN_KEY = 'auth_tokens'
const USER_KEY = 'auth_user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [tokens, setTokens] = useState<AuthTokens | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  const clearAuth = () => {
    setUser(null)
    setTokens(null)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  const fetchUserProfile = async (): Promise<boolean> => {
    try {
      if (!tokens?.accessToken) return false

      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
        },
      })

      const data = await response.json()

      if (data.success) {
        setUser(data.data.user)
        localStorage.setItem(USER_KEY, JSON.stringify(data.data.user))
        return true
      } else {
        clearAuth()
        return false
      }
    } catch (error) {
      console.error('Fetch user profile error:', error)
      clearAuth()
      return false
    }
  }

  const refreshTokens = async (refreshToken: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      })

      const data = await response.json()

      if (data.success) {
        const newTokens = data.data.tokens
        setTokens(newTokens)
        localStorage.setItem(TOKEN_KEY, JSON.stringify(newTokens))
        return true
      } else {
        clearAuth()
        return false
      }
    } catch (error) {
      console.error('Token refresh error:', error)
      clearAuth()
      return false
    }
  }

  // Initialize auth state from localStorage
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storedTokens = localStorage.getItem(TOKEN_KEY)
        const storedUser = localStorage.getItem(USER_KEY)

        if (storedTokens && storedUser) {
          const parsedTokens = JSON.parse(storedTokens)
          const parsedUser = JSON.parse(storedUser)

          // Check if tokens are expired
          const tokenExpiry = parsedTokens.expiresIn * 1000 + Date.now()
          if (tokenExpiry > Date.now()) {
            setTokens(parsedTokens)
            setUser(parsedUser)
            // Fetch fresh user profile to get latest data including addresses
            setTimeout(async () => {
              const response = await fetch('/api/auth/me', {
                headers: {
                  'Authorization': `Bearer ${parsedTokens.accessToken}`,
                },
              })
              const data = await response.json()
              if (data.success) {
                setUser(data.data.user)
                localStorage.setItem(USER_KEY, JSON.stringify(data.data.user))
              }
            }, 100)
          } else {
            // Try to refresh token
            const refreshed = await refreshTokens(parsedTokens.refreshToken)
            if (!refreshed) {
              clearAuth()
            }
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error)
        clearAuth()
      } finally {
        setIsLoading(false)
      }
    }

    initializeAuth()
  }, [])

  const saveAuth = (userData: User, tokenData: AuthTokens) => {
    setUser(userData)
    setTokens(tokenData)
    localStorage.setItem(USER_KEY, JSON.stringify(userData))
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokenData))
  }

  const login = async (email: string, password: string, tenantId?: string) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, tenantId }),
      })

      const data = await response.json()

      if (data.success) {
        saveAuth(data.data.user, data.data.tokens)
        return { success: true }
      } else {
        return { success: false, error: data.error?.message || 'Login failed' }
      }
    } catch (error) {
      console.error('Login error:', error)
      return { success: false, error: 'Network error. Please try again.' }
    }
  }

  const register = async (registerData: RegisterData) => {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(registerData),
      })

      const data = await response.json()

      if (data.success) {
        saveAuth(data.data.user, data.data.tokens)
        return { success: true }
      } else {
        return { success: false, error: data.error?.message || 'Registration failed' }
      }
    } catch (error) {
      console.error('Registration error:', error)
      return { success: false, error: 'Network error. Please try again.' }
    }
  }

  const logout = async (logoutAll = false) => {
    try {
      if (tokens) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tokens.accessToken}`,
          },
          body: JSON.stringify({ logoutAll }),
        })
      }
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      clearAuth()
      router.push('/login')
    }
  }

  const refreshToken = async (): Promise<boolean> => {
    if (!tokens?.refreshToken) return false
    return refreshTokens(tokens.refreshToken)
  }

  const updateUser = (userData: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...userData }
      setUser(updatedUser)
      localStorage.setItem(USER_KEY, JSON.stringify(updatedUser))
    }
  }

  const value: AuthContextType = {
    user,
    tokens,
    isLoading,
    isAuthenticated: !!user && !!tokens,
    login,
    register,
    logout,
    refreshToken,
    fetchUserProfile,
    updateUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Hook for protected routes
export function useRequireAuth() {
  const auth = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      router.push('/login')
    }
  }, [auth.isLoading, auth.isAuthenticated, router])

  return auth
}