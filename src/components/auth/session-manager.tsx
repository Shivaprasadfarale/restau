'use client'

import React, { useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'

interface SessionManagerProps {
  children: React.ReactNode
}

export function SessionManager({ children }: SessionManagerProps) {
  const { refreshToken, logout } = useAuth()

  useEffect(() => {
    // Set up token refresh interval
    const interval = setInterval(async () => {
      try {
        await refreshToken()
      } catch (error) {
        console.error('Token refresh failed:', error)
        // Optionally logout user if refresh fails
        // await logout()
      }
    }, 14 * 60 * 1000) // Refresh every 14 minutes

    return () => clearInterval(interval)
  }, [refreshToken, logout])

  // Handle page visibility change to refresh token when user returns
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        try {
          await refreshToken()
        } catch (error) {
          console.error('Token refresh on visibility change failed:', error)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [refreshToken])

  return <>{children}</>
}