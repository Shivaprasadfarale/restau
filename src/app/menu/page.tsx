'use client'

import React from 'react'
import { MenuProvider } from '@/lib/menu-context'
import { MenuDisplay } from '@/components/menu/menu-display'

export default function MenuPage() {
  // In a real app, this would come from URL params or props
  const restaurantId = 'default-restaurant'

  const handleCheckout = () => {
    // Navigate to checkout page or open checkout modal
    console.log('Navigating to checkout...')
    // router.push('/checkout')
  }

  return (
    <MenuProvider>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <MenuDisplay
            restaurantId={restaurantId}
            layout="grid"
            showCategories={true}
            showSearch={true}
            showCart={true}
            onCheckout={handleCheckout}
          />
        </div>
      </div>
    </MenuProvider>
  )
}