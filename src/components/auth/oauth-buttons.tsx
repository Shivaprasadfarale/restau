'use client'

import React from 'react'
import { Button } from '@/components/ui/button'

export function OAuthButtons() {
  const handleGoogleLogin = () => {
    // TODO: Implement Google OAuth
    console.log('Google login clicked')
  }

  const handleFacebookLogin = () => {
    // TODO: Implement Facebook OAuth
    console.log('Facebook login clicked')
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        onClick={handleGoogleLogin}
        className="w-full"
      >
        Continue with Google
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={handleFacebookLogin}
        className="w-full"
      >
        Continue with Facebook
      </Button>
    </div>
  )
}