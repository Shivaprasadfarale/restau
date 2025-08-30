'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle, Clock, MapPin, Phone, User, Truck, ChefHat, Package, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuth } from '@/lib/auth-context'
import { useOrderTracking } from '@/lib/hooks/use-order-tracking'
import Image from 'next/image'

interface OrderItem {
  menuItemId: string
  name: string
  price: number
  quantity: number
  selectedModifiers: Array<{
    modifierId: string
    optionId: string
    name: string
    price: number
  }>
  specialInstructions?: string
  totalPrice: number
}

interface Order {
  id: string
  status: string
  items: OrderItem[]
  total: {
    subtotal: number
    tax: number
    deliveryFee: number
    discount: number
    total: number
    gstBreakdown: {
      cgst: number
      sgst: number
      igst: number
    }
  }
  deliveryAddress: {
    type: string
    street: string
    city: string
    state: string
    zipCode: string
    landmark?: string
  }
  deliveryInfo: {
    name: string
    phone: string
    specialInstructions?: string
  }
  estimatedDeliveryTime: string
  createdAt: string
  timeline: Array<{
    status: string
    timestamp: string
    notes?: string
  }>
}

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  preparing: 'bg-orange-100 text-orange-800',
  ready: 'bg-purple-100 text-purple-800',
  out_for_delivery: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800'
}

const STATUS_LABELS = {
  pending: 'Order Placed',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready for Pickup',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
}

export default function OrderDetailsPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { user } = useAuth()
  const { connected, connecting, error: wsError, orderStatus, lastUpdate, subscribeToOrder } = useOrderTracking(params.id)
  const [order, setOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchOrder = async () => {
      if (!user) {
        router.push('/auth?redirect=/orders/' + params.id)
        return
      }

      try {
        const response = await fetch(`/api/orders/${params.id}`)
        const result = await response.json()

        if (result.success) {
          setOrder(result.data)
          // Subscribe to real-time updates for this order
          if (connected) {
            subscribeToOrder(params.id)
          }
        } else {
          setError(result.error?.message || 'Order not found')
        }
      } catch (error) {
        console.error('Failed to fetch order:', error)
        setError('Failed to load order details')
      } finally {
        setIsLoading(false)
      }
    }

    fetchOrder()
  }, [params.id, user, router, connected, subscribeToOrder])

  // Update order when WebSocket receives updates
  useEffect(() => {
    if (lastUpdate && lastUpdate.orderId === params.id && order) {
      setOrder(prevOrder => prevOrder ? {
        ...prevOrder,
        status: lastUpdate.status,
        timeline: lastUpdate.timeline
      } : null)
    }
  }, [lastUpdate, params.id, order])

  // Subscribe to order updates when WebSocket connects
  useEffect(() => {
    if (connected && order) {
      subscribeToOrder(params.id)
    }
  }, [connected, order, params.id, subscribeToOrder])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading order details...</p>
        </div>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Order not found'}</p>
          <Button onClick={() => router.push('/')}>Go Home</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Order Details</h1>
              <p className="text-sm text-muted-foreground">Order #{order.id.slice(-8)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="space-y-6">
          {/* Connection Status */}
          {wsError && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Real-time updates unavailable. {wsError}
              </AlertDescription>
            </Alert>
          )}

          {/* Order Status */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="flex-shrink-0">
                  {order.status === 'delivered' ? (
                    <CheckCircle className="h-12 w-12 text-green-600" />
                  ) : order.status === 'cancelled' ? (
                    <AlertCircle className="h-12 w-12 text-red-600" />
                  ) : (
                    <Clock className="h-12 w-12 text-blue-600" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={STATUS_COLORS[order.status as keyof typeof STATUS_COLORS]}>
                      {STATUS_LABELS[order.status as keyof typeof STATUS_LABELS]}
                    </Badge>
                    {connected && (
                      <div className="flex items-center gap-1 text-xs text-green-600">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span>Live</span>
                      </div>
                    )}
                  </div>
                  <h2 className="text-lg font-semibold">
                    {order.status === 'delivered' 
                      ? 'Order Delivered Successfully!' 
                      : order.status === 'cancelled'
                      ? 'Order Cancelled'
                      : 'Your order is being processed'}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {order.status === 'delivered' 
                      ? `Delivered on ${new Date(order.estimatedDeliveryTime).toLocaleString()}`
                      : `Estimated delivery: ${new Date(order.estimatedDeliveryTime).toLocaleString()}`
                    }
                  </p>
                </div>
              </div>

              {/* Progress Indicator */}
              {order.status !== 'cancelled' && <OrderProgressIndicator status={order.status} />}
            </CardContent>
          </Card>

          {/* Order Items */}
          <Card>
            <CardHeader>
              <CardTitle>Order Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {order.items.map((item, index) => (
                <div key={index} className="flex gap-4">
                  <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-lg font-bold">{item.name[0]}</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium">{item.name}</h4>
                    {item.selectedModifiers.length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {item.selectedModifiers.map(mod => mod.name).join(', ')}
                      </p>
                    )}
                    {item.specialInstructions && (
                      <p className="text-sm text-blue-600">
                        Note: {item.specialInstructions}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm text-muted-foreground">
                        ₹{item.price} × {item.quantity}
                      </span>
                      <span className="font-medium">₹{item.totalPrice.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ))}

              <Separator />

              {/* Order Total */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>₹{order.total.subtotal.toFixed(2)}</span>
                </div>
                {order.total.tax > 0 && (
                  <div className="flex justify-between">
                    <span>Tax & Fees</span>
                    <span>₹{order.total.tax.toFixed(2)}</span>
                  </div>
                )}
                {order.total.deliveryFee > 0 && (
                  <div className="flex justify-between">
                    <span>Delivery Fee</span>
                    <span>₹{order.total.deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                {order.total.discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-₹{order.total.discount.toFixed(2)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-semibold text-lg">
                  <span>Total Paid</span>
                  <span>₹{order.total.total.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Delivery Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Delivery Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <User className="h-5 w-5 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{order.deliveryInfo.name}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span>{order.deliveryInfo.phone}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 mt-0.5 text-muted-foreground" />
                <div>
                  <Badge variant="outline" className="mb-2">
                    {order.deliveryAddress.type}
                  </Badge>
                  <p className="text-sm">
                    {order.deliveryAddress.street}<br />
                    {order.deliveryAddress.city}, {order.deliveryAddress.state} {order.deliveryAddress.zipCode}
                  </p>
                  {order.deliveryAddress.landmark && (
                    <p className="text-sm text-muted-foreground">
                      Near {order.deliveryAddress.landmark}
                    </p>
                  )}
                </div>
              </div>

              {order.deliveryInfo.specialInstructions && (
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-sm font-medium mb-1">Special Instructions:</p>
                  <p className="text-sm text-muted-foreground">
                    {order.deliveryInfo.specialInstructions}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Order Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Order Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {order.timeline.map((event, index) => (
                  <div key={index} className="flex gap-4">
                    <div className="flex-shrink-0 w-2 h-2 bg-primary rounded-full mt-2"></div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {STATUS_LABELS[event.status as keyof typeof STATUS_LABELS]}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {new Date(event.timestamp).toLocaleString()}
                        </span>
                      </div>
                      {event.notes && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {event.notes}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-4">
            <Button onClick={() => router.push('/')} className="flex-1">
              Order Again
            </Button>
            {order.status !== 'delivered' && order.status !== 'cancelled' && (
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => router.push(`/track?orderId=${order.id}`)}
              >
                Share Tracking
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Progress Indicator Component
function OrderProgressIndicator({ status }: { status: string }) {
  const steps = [
    { key: 'pending', label: 'Order Placed', icon: CheckCircle },
    { key: 'confirmed', label: 'Confirmed', icon: CheckCircle },
    { key: 'preparing', label: 'Preparing', icon: ChefHat },
    { key: 'ready', label: 'Ready', icon: Package },
    { key: 'out_for_delivery', label: 'Out for Delivery', icon: Truck },
    { key: 'delivered', label: 'Delivered', icon: CheckCircle }
  ]

  const currentStepIndex = steps.findIndex(step => step.key === status)
  
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        {steps.map((step, index) => {
          const Icon = step.icon
          const isCompleted = index <= currentStepIndex
          const isCurrent = index === currentStepIndex
          
          return (
            <div key={step.key} className="flex flex-col items-center flex-1">
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-all duration-300
                ${isCompleted 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted text-muted-foreground'
                }
                ${isCurrent ? 'ring-2 ring-primary ring-offset-2' : ''}
              `}>
                <Icon className="h-5 w-5" />
              </div>
              <span className={`
                text-xs text-center font-medium transition-colors duration-300
                ${isCompleted ? 'text-primary' : 'text-muted-foreground'}
              `}>
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
      
      {/* Progress Bar */}
      <div className="relative">
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-muted transform -translate-y-1/2"></div>
        <div 
          className="absolute top-1/2 left-0 h-0.5 bg-primary transform -translate-y-1/2 transition-all duration-500"
          style={{ 
            width: `${currentStepIndex >= 0 ? (currentStepIndex / (steps.length - 1)) * 100 : 0}%` 
          }}
        ></div>
      </div>
    </div>
  )
}