'use client'

import React, { useState, useEffect } from 'react'
import { X, CheckCircle, Clock, Truck, ChefHat, Package, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface OrderNotificationProps {
  orderId: string
  status: string
  message?: string
  timestamp: Date
  onDismiss?: () => void
  onViewOrder?: () => void
  autoHide?: boolean
  hideDelay?: number
}

const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50 border-yellow-200',
    title: 'Order Placed'
  },
  confirmed: {
    icon: CheckCircle,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 border-blue-200',
    title: 'Order Confirmed'
  },
  preparing: {
    icon: ChefHat,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 border-orange-200',
    title: 'Preparing Your Order'
  },
  ready: {
    icon: Package,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 border-purple-200',
    title: 'Order Ready'
  },
  out_for_delivery: {
    icon: Truck,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50 border-indigo-200',
    title: 'Out for Delivery'
  },
  delivered: {
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-50 border-green-200',
    title: 'Order Delivered'
  },
  cancelled: {
    icon: AlertCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-50 border-red-200',
    title: 'Order Cancelled'
  }
}

const DEFAULT_MESSAGES = {
  pending: 'Your order has been placed successfully.',
  confirmed: 'Your order has been confirmed and will be prepared soon.',
  preparing: 'Our kitchen is preparing your delicious meal.',
  ready: 'Your order is ready for pickup or delivery.',
  out_for_delivery: 'Your order is on its way to you.',
  delivered: 'Your order has been delivered successfully!',
  cancelled: 'Your order has been cancelled.'
}

export function OrderNotification({
  orderId,
  status,
  message,
  timestamp,
  onDismiss,
  onViewOrder,
  autoHide = true,
  hideDelay = 5000
}: OrderNotificationProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [isAnimating, setIsAnimating] = useState(false)

  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]
  const Icon = config?.icon || Clock
  const displayMessage = message || DEFAULT_MESSAGES[status as keyof typeof DEFAULT_MESSAGES] || 'Order status updated'

  useEffect(() => {
    // Entrance animation
    setIsAnimating(true)
    const animationTimer = setTimeout(() => setIsAnimating(false), 300)

    // Auto-hide timer
    let hideTimer: NodeJS.Timeout
    if (autoHide) {
      hideTimer = setTimeout(() => {
        handleDismiss()
      }, hideDelay)
    }

    return () => {
      clearTimeout(animationTimer)
      if (hideTimer) clearTimeout(hideTimer)
    }
  }, [autoHide, hideDelay])

  const handleDismiss = () => {
    setIsVisible(false)
    setTimeout(() => {
      onDismiss?.()
    }, 300) // Wait for exit animation
  }

  const handleViewOrder = () => {
    onViewOrder?.()
    handleDismiss()
  }

  if (!isVisible) {
    return null
  }

  return (
    <div className={cn(
      'fixed top-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)]',
      'transform transition-all duration-300 ease-out',
      isAnimating ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100',
      !isVisible && 'translate-x-full opacity-0'
    )}>
      <Card className={cn(
        'border-l-4 shadow-lg',
        config?.bgColor || 'bg-gray-50 border-gray-200'
      )}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={cn(
              'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
              config?.color || 'text-gray-600'
            )}>
              <Icon className="h-5 w-5" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-semibold text-sm">
                  {config?.title || 'Order Update'}
                </h4>
                <Badge variant="outline" className="text-xs">
                  #{orderId.slice(-8)}
                </Badge>
              </div>
              
              <p className="text-sm text-gray-700 mb-2">
                {displayMessage}
              </p>
              
              <p className="text-xs text-gray-500">
                {timestamp.toLocaleTimeString()}
              </p>
              
              {onViewOrder && (
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleViewOrder}
                    className="text-xs"
                  >
                    View Order
                  </Button>
                </div>
              )}
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="flex-shrink-0 h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Notification Manager Component
interface OrderNotificationManagerProps {
  notifications: Array<{
    id: string
    orderId: string
    status: string
    message?: string
    timestamp: Date
  }>
  onDismiss: (id: string) => void
  onViewOrder: (orderId: string) => void
}

export function OrderNotificationManager({
  notifications,
  onDismiss,
  onViewOrder
}: OrderNotificationManagerProps) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {notifications.map((notification, index) => (
        <div
          key={notification.id}
          style={{ 
            transform: `translateY(${index * 8}px)`,
            zIndex: 50 - index
          }}
        >
          <OrderNotification
            orderId={notification.orderId}
            status={notification.status}
            message={notification.message}
            timestamp={notification.timestamp}
            onDismiss={() => onDismiss(notification.id)}
            onViewOrder={() => onViewOrder(notification.orderId)}
            autoHide={true}
            hideDelay={6000 + (index * 1000)} // Stagger auto-hide
          />
        </div>
      ))}
    </div>
  )
}

// Hook for managing notifications
export function useOrderNotifications() {
  const [notifications, setNotifications] = useState<Array<{
    id: string
    orderId: string
    status: string
    message?: string
    timestamp: Date
  }>>([])

  const addNotification = (orderId: string, status: string, message?: string) => {
    const notification = {
      id: `${orderId}-${status}-${Date.now()}`,
      orderId,
      status,
      message,
      timestamp: new Date()
    }

    setNotifications(prev => [notification, ...prev.slice(0, 4)]) // Keep max 5 notifications
  }

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const clearAllNotifications = () => {
    setNotifications([])
  }

  return {
    notifications,
    addNotification,
    dismissNotification,
    clearAllNotifications
  }
}