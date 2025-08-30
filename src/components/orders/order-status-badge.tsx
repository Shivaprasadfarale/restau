'use client'

import React from 'react'
import { Clock, CheckCircle, AlertCircle, Truck, ChefHat, Package } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface OrderStatusBadgeProps {
  status: string
  showIcon?: boolean
  showProgress?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const STATUS_CONFIG = {
  pending: {
    label: 'Order Placed',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    icon: Clock,
    progress: 16
  },
  confirmed: {
    label: 'Confirmed',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: CheckCircle,
    progress: 33
  },
  preparing: {
    label: 'Preparing',
    color: 'bg-orange-100 text-orange-800 border-orange-200',
    icon: ChefHat,
    progress: 50
  },
  ready: {
    label: 'Ready',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    icon: Package,
    progress: 66
  },
  out_for_delivery: {
    label: 'Out for Delivery',
    color: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    icon: Truck,
    progress: 83
  },
  delivered: {
    label: 'Delivered',
    color: 'bg-green-100 text-green-800 border-green-200',
    icon: CheckCircle,
    progress: 100
  },
  cancelled: {
    label: 'Cancelled',
    color: 'bg-red-100 text-red-800 border-red-200',
    icon: AlertCircle,
    progress: 0
  }
}

export function OrderStatusBadge({ 
  status, 
  showIcon = true, 
  showProgress = false,
  size = 'md',
  className 
}: OrderStatusBadgeProps) {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]
  
  if (!config) {
    return (
      <Badge variant="outline" className={cn('bg-gray-100 text-gray-800', className)}>
        Unknown Status
      </Badge>
    )
  }

  const Icon = config.icon
  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-2'
  }

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Badge 
        variant="outline" 
        className={cn(
          config.color,
          sizeClasses[size],
          'flex items-center gap-1 font-medium'
        )}
      >
        {showIcon && <Icon className={iconSizes[size]} />}
        {config.label}
      </Badge>
      
      {showProgress && status !== 'cancelled' && (
        <div className="w-full bg-muted rounded-full h-1">
          <div 
            className="bg-primary rounded-full h-1 transition-all duration-300"
            style={{ width: `${config.progress}%` }}
          />
        </div>
      )}
    </div>
  )
}

// Animated version for real-time updates
export function AnimatedOrderStatusBadge({ 
  status, 
  previousStatus,
  showIcon = true, 
  showProgress = false,
  size = 'md',
  className 
}: OrderStatusBadgeProps & { previousStatus?: string }) {
  const [isAnimating, setIsAnimating] = React.useState(false)

  React.useEffect(() => {
    if (previousStatus && previousStatus !== status) {
      setIsAnimating(true)
      const timer = setTimeout(() => setIsAnimating(false), 1000)
      return () => clearTimeout(timer)
    }
  }, [status, previousStatus])

  return (
    <div className={cn(
      'transition-all duration-300',
      isAnimating && 'scale-105 ring-2 ring-primary ring-offset-2',
      className
    )}>
      <OrderStatusBadge 
        status={status}
        showIcon={showIcon}
        showProgress={showProgress}
        size={size}
      />
    </div>
  )
}

// Compact version for lists
export function CompactOrderStatus({ status, className }: { status: string; className?: string }) {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]
  
  if (!config) {
    return <div className={cn('w-2 h-2 bg-gray-400 rounded-full', className)} />
  }

  const colorMap = {
    pending: 'bg-yellow-500',
    confirmed: 'bg-blue-500',
    preparing: 'bg-orange-500',
    ready: 'bg-purple-500',
    out_for_delivery: 'bg-indigo-500',
    delivered: 'bg-green-500',
    cancelled: 'bg-red-500'
  }

  return (
    <div 
      className={cn(
        'w-2 h-2 rounded-full',
        colorMap[status as keyof typeof colorMap] || 'bg-gray-400',
        className
      )}
      title={config.label}
    />
  )
}