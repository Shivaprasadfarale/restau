'use client'

import React, { useState, useEffect } from 'react'
import { Clock, CheckCircle, AlertCircle, Truck, ChefHat, Package, MapPin, Phone } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useOrderTracking } from '@/lib/hooks/use-order-tracking'

interface OrderTrackingWidgetProps {
  orderId: string
  initialOrder?: any
  showFullDetails?: boolean
  onOrderUpdate?: (order: any) => void
}

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
  preparing: 'bg-orange-100 text-orange-800 border-orange-200',
  ready: 'bg-purple-100 text-purple-800 border-purple-200',
  out_for_delivery: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  delivered: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200'
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

const STATUS_MESSAGES = {
  pending: 'Your order has been placed and is awaiting confirmation.',
  confirmed: 'Your order has been confirmed and will be prepared soon.',
  preparing: 'Our kitchen is preparing your delicious meal.',
  ready: 'Your order is ready for pickup or delivery.',
  out_for_delivery: 'Your order is on its way to you.',
  delivered: 'Your order has been delivered successfully!',
  cancelled: 'Your order has been cancelled.'
}

export function OrderTrackingWidget({ 
  orderId, 
  initialOrder, 
  showFullDetails = false,
  onOrderUpdate 
}: OrderTrackingWidgetProps) {
  const { 
    connected, 
    connecting, 
    error: wsError, 
    orderStatus, 
    lastUpdate,
    subscribeToOrder,
    reconnect
  } = useOrderTracking(orderId)
  
  const [order, setOrder] = useState(initialOrder)
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null)

  // Subscribe to order updates
  useEffect(() => {
    if (connected && orderId) {
      subscribeToOrder(orderId)
    }
  }, [connected, orderId, subscribeToOrder])

  // Handle real-time updates
  useEffect(() => {
    if (lastUpdate && lastUpdate.orderId === orderId) {
      setOrder((prevOrder: any) => {
        const updatedOrder = prevOrder ? {
          ...prevOrder,
          status: lastUpdate.status,
          timeline: lastUpdate.timeline
        } : null
        
        if (onOrderUpdate && updatedOrder) {
          onOrderUpdate(updatedOrder)
        }
        
        return updatedOrder
      })
      setLastUpdateTime(new Date())
    }
  }, [lastUpdate, orderId, onOrderUpdate])

  // Handle WebSocket order status updates
  useEffect(() => {
    if (orderStatus && orderStatus.orderId === orderId) {
      setOrder((prevOrder: any) => {
        const updatedOrder = prevOrder ? {
          ...prevOrder,
          status: orderStatus.status,
          timeline: orderStatus.timeline,
          estimatedDeliveryTime: orderStatus.estimatedDeliveryTime || prevOrder.estimatedDeliveryTime,
          deliveryInfo: orderStatus.deliveryInfo || prevOrder.deliveryInfo
        } : null
        
        if (onOrderUpdate && updatedOrder) {
          onOrderUpdate(updatedOrder)
        }
        
        return updatedOrder
      })
      setLastUpdateTime(new Date())
    }
  }, [orderStatus, orderId, onOrderUpdate])

  if (!order) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading order details...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'cancelled':
        return <AlertCircle className="h-5 w-5 text-red-600" />
      case 'preparing':
        return <ChefHat className="h-5 w-5 text-orange-600" />
      case 'ready':
        return <Package className="h-5 w-5 text-purple-600" />
      case 'out_for_delivery':
        return <Truck className="h-5 w-5 text-indigo-600" />
      default:
        return <Clock className="h-5 w-5 text-blue-600" />
    }
  }

  const getEstimatedTime = () => {
    if (order.status === 'delivered') {
      return `Delivered at ${new Date(order.actualDeliveryTime || order.estimatedDeliveryTime).toLocaleTimeString()}`
    }
    
    if (order.status === 'cancelled') {
      return 'Order cancelled'
    }

    const estimatedTime = new Date(order.estimatedDeliveryTime)
    const now = new Date()
    const diffMinutes = Math.ceil((estimatedTime.getTime() - now.getTime()) / (1000 * 60))
    
    if (diffMinutes <= 0) {
      return 'Should arrive any moment'
    } else if (diffMinutes <= 60) {
      return `Estimated in ${diffMinutes} minutes`
    } else {
      return `Estimated at ${estimatedTime.toLocaleTimeString()}`
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Order Tracking</CardTitle>
          <div className="flex items-center gap-2">
            {connected ? (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>Live</span>
              </div>
            ) : connecting ? (
              <div className="flex items-center gap-1 text-xs text-yellow-600">
                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                <span>Connecting...</span>
              </div>
            ) : (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={reconnect}
                className="text-xs"
              >
                Reconnect
              </Button>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Order #{orderId.slice(-8)}
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Connection Error */}
        {wsError && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Real-time updates unavailable. Refresh to get latest status.
            </AlertDescription>
          </Alert>
        )}

        {/* Current Status */}
        <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
          {getStatusIcon(order.status)}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge 
                variant="outline" 
                className={STATUS_COLORS[order.status as keyof typeof STATUS_COLORS]}
              >
                {STATUS_LABELS[order.status as keyof typeof STATUS_LABELS]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {STATUS_MESSAGES[order.status as keyof typeof STATUS_MESSAGES]}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {getEstimatedTime()}
            </p>
          </div>
        </div>

        {/* Progress Steps */}
        <OrderProgressSteps status={order.status} />

        {/* Delivery Information */}
        {order.deliveryInfo?.location && order.status === 'out_for_delivery' && (
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">Delivery in Progress</span>
            </div>
            <p className="text-sm text-blue-700">
              Your delivery partner is on the way
            </p>
            {order.deliveryInfo.estimatedArrival && (
              <p className="text-xs text-blue-600 mt-1">
                ETA: {new Date(order.deliveryInfo.estimatedArrival).toLocaleTimeString()}
              </p>
            )}
          </div>
        )}

        {/* Last Update Time */}
        {lastUpdateTime && (
          <p className="text-xs text-muted-foreground text-center">
            Last updated: {lastUpdateTime.toLocaleTimeString()}
          </p>
        )}

        {/* Timeline (if showing full details) */}
        {showFullDetails && order.timeline && (
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Order Timeline</h4>
            <div className="space-y-2">
              {order.timeline.slice().reverse().map((event: any, index: number) => (
                <div key={index} className="flex gap-3 text-sm">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {STATUS_LABELS[event.status as keyof typeof STATUS_LABELS]}
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(event.timestamp).toLocaleString()}
                      </span>
                    </div>
                    {event.notes && (
                      <p className="text-muted-foreground mt-1">{event.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Progress Steps Component
function OrderProgressSteps({ status }: { status: string }) {
  const steps = [
    { key: 'pending', label: 'Placed', icon: CheckCircle },
    { key: 'confirmed', label: 'Confirmed', icon: CheckCircle },
    { key: 'preparing', label: 'Preparing', icon: ChefHat },
    { key: 'ready', label: 'Ready', icon: Package },
    { key: 'out_for_delivery', label: 'Delivery', icon: Truck },
    { key: 'delivered', label: 'Delivered', icon: CheckCircle }
  ]

  const currentStepIndex = steps.findIndex(step => step.key === status)
  
  return (
    <div className="relative">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const Icon = step.icon
          const isCompleted = index <= currentStepIndex
          const isCurrent = index === currentStepIndex
          
          return (
            <div key={step.key} className="flex flex-col items-center">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center mb-1 transition-all duration-300
                ${isCompleted 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted text-muted-foreground'
                }
                ${isCurrent ? 'ring-2 ring-primary ring-offset-1' : ''}
              `}>
                <Icon className="h-4 w-4" />
              </div>
              <span className={`
                text-xs font-medium transition-colors duration-300
                ${isCompleted ? 'text-primary' : 'text-muted-foreground'}
              `}>
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
      
      {/* Progress Line */}
      <div className="absolute top-4 left-4 right-4 h-0.5 bg-muted -z-10"></div>
      <div 
        className="absolute top-4 left-4 h-0.5 bg-primary -z-10 transition-all duration-500"
        style={{ 
          width: `calc(${currentStepIndex >= 0 ? (currentStepIndex / (steps.length - 1)) * 100 : 0}% - 2rem)` 
        }}
      ></div>
    </div>
  )
}