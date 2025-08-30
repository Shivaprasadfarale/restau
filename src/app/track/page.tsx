'use client'

import React, { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { OrderTrackingWidget } from '@/components/orders/order-tracking-widget'

export default function TrackOrderPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [orderId, setOrderId] = useState(searchParams.get('orderId') || '')
  const [order, setOrder] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleTrackOrder = async () => {
    if (!orderId.trim()) {
      setError('Please enter an order ID')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Use public tracking API endpoint
      const response = await fetch(`/api/track/${orderId}`)
      const result = await response.json()

      if (result.success) {
        setOrder(result.data)
      } else {
        setError(result.error?.message || 'Order not found')
        setOrder(null)
      }
    } catch (error) {
      console.error('Failed to fetch order:', error)
      setError('Failed to load order. Please check your connection and try again.')
      setOrder(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTrackOrder()
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Track Your Order</h1>
              <p className="text-sm text-muted-foreground">
                Enter your order ID to get real-time updates
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-2xl">
        {/* Order ID Input */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Find Your Order
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orderId">Order ID</Label>
              <div className="flex gap-2">
                <Input
                  id="orderId"
                  placeholder="Enter your order ID (e.g., 12345678)"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="flex-1"
                />
                <Button 
                  onClick={handleTrackOrder}
                  disabled={isLoading || !orderId.trim()}
                >
                  {isLoading ? 'Searching...' : 'Track'}
                </Button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="text-sm text-muted-foreground">
              <p className="mb-2">You can find your order ID in:</p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Order confirmation email or SMS</li>
                <li>Receipt from your previous order</li>
                <li>Your order history (if you have an account)</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Order Tracking Widget */}
        {order && (
          <OrderTrackingWidget 
            orderId={orderId}
            initialOrder={order}
            showFullDetails={true}
            onOrderUpdate={(updatedOrder) => setOrder(updatedOrder)}
          />
        )}

        {/* Help Section */}
        {!order && !isLoading && (
          <Card>
            <CardHeader>
              <CardTitle>Need Help?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 text-sm">
                <div>
                  <h4 className="font-medium mb-1">Can't find your order ID?</h4>
                  <p className="text-muted-foreground">
                    Check your email or SMS for the order confirmation. The order ID is usually 
                    displayed prominently in the message.
                  </p>
                </div>
                
                <div>
                  <h4 className="font-medium mb-1">Order not found?</h4>
                  <p className="text-muted-foreground">
                    Make sure you've entered the correct order ID. If you're still having trouble, 
                    please contact our support team.
                  </p>
                </div>

                <div>
                  <h4 className="font-medium mb-1">Have an account?</h4>
                  <p className="text-muted-foreground">
                    Sign in to view all your orders and get automatic tracking updates.
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-2"
                    onClick={() => router.push('/auth?redirect=/orders')}
                  >
                    Sign In
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}