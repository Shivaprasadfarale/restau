'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Clock, CheckCircle, XCircle, Search, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/lib/auth-context'
import { useOrderTracking } from '@/lib/hooks/use-order-tracking'
import { OrderStatusBadge, CompactOrderStatus } from '@/components/orders/order-status-badge'
import Link from 'next/link'

interface OrderItem {
  menuItemId: string
  name: string
  price: number
  quantity: number
  totalPrice: number
}

interface Order {
  id: string
  status: string
  items: OrderItem[]
  total: {
    total: number
  }
  estimatedDeliveryTime: string
  createdAt: string
  timeline: Array<{
    status: string
    timestamp: string
  }>
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
  ready: 'Ready',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
}

const STATUS_ICONS = {
  pending: Clock,
  confirmed: CheckCircle,
  preparing: Clock,
  ready: CheckCircle,
  out_for_delivery: Clock,
  delivered: CheckCircle,
  cancelled: XCircle
}

export default function OrderHistoryPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { connected, lastUpdate } = useOrderTracking()
  
  const [orders, setOrders] = useState<Order[]>([])
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('newest')

  useEffect(() => {
    if (!user) {
      router.push('/auth?redirect=/orders')
      return
    }

    fetchOrders()
  }, [user, router])

  // Update orders when WebSocket receives updates
  useEffect(() => {
    if (lastUpdate) {
      setOrders(prevOrders => 
        prevOrders.map(order => 
          order.id === lastUpdate.orderId 
            ? { ...order, status: lastUpdate.status, timeline: lastUpdate.timeline }
            : order
        )
      )
    }
  }, [lastUpdate])

  const fetchOrders = async () => {
    try {
      const response = await fetch('/api/orders')
      const result = await response.json()

      if (result.success) {
        setOrders(result.data)
      } else {
        setError(result.error?.message || 'Failed to load orders')
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error)
      setError('Failed to load orders')
    } finally {
      setIsLoading(false)
    }
  }

  // Filter and sort orders
  useEffect(() => {
    let filtered = [...orders]

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(order => 
        order.id.toLowerCase().includes(query) ||
        order.items.some(item => item.name.toLowerCase().includes(query))
      )
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(order => order.status === statusFilter)
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        case 'amount_high':
          return b.total.total - a.total.total
        case 'amount_low':
          return a.total.total - b.total.total
        default:
          return 0
      }
    })

    setFilteredOrders(filtered)
  }, [orders, searchQuery, statusFilter, sortBy])

  const getStatusIcon = (status: string) => {
    const IconComponent = STATUS_ICONS[status as keyof typeof STATUS_ICONS] || Clock
    return <IconComponent className="h-4 w-4" />
  }

  const getOrderProgress = (order: Order) => {
    const statusOrder = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered']
    const currentIndex = statusOrder.indexOf(order.status)
    const progress = order.status === 'cancelled' ? 0 : ((currentIndex + 1) / statusOrder.length) * 100
    return Math.max(0, Math.min(100, progress))
  }

  const isActiveOrder = (status: string) => {
    return !['delivered', 'cancelled'].includes(status)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading your orders...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={fetchOrders}>Try Again</Button>
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
            <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Your Orders</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{filteredOrders.length} orders</span>
                {connected && (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span>Live updates</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Search and Filters */}
        <div className="mb-6 space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search orders or items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex gap-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Orders</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="preparing">Preparing</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="amount_high">Amount: High to Low</SelectItem>
                <SelectItem value="amount_low">Amount: Low to High</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Orders List */}
        {filteredOrders.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              {orders.length === 0 ? 'No orders yet' : 'No orders found'}
            </h3>
            <p className="text-muted-foreground mb-4">
              {orders.length === 0 
                ? 'Start by placing your first order!' 
                : 'Try adjusting your search or filters'
              }
            </p>
            {orders.length === 0 && (
              <Button onClick={() => router.push('/')}>
                Browse Menu
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order) => (
              <Card key={order.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <OrderStatusBadge 
                          status={order.status}
                          showProgress={isActiveOrder(order.status)}
                        />
                        <span className="text-sm text-muted-foreground">
                          #{order.id.slice(-8)}
                        </span>
                      </div>
                      
                      <p className="text-sm text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString('en-IN', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                    
                    <div className="text-right">
                      <p className="font-semibold text-lg">₹{order.total.total.toFixed(2)}</p>
                      <p className="text-sm text-muted-foreground">
                        {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

                  {/* Progress Bar for Active Orders */}
                  {isActiveOrder(order.status) && (
                    <div className="mb-4">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Order Progress</span>
                        <span>{Math.round(getOrderProgress(order))}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div 
                          className="bg-primary rounded-full h-2 transition-all duration-300"
                          style={{ width: `${getOrderProgress(order)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Order Items Preview */}
                  <div className="mb-4">
                    <div className="space-y-1">
                      {order.items.slice(0, 2).map((item, index) => (
                        <div key={index} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {item.quantity}x {item.name}
                          </span>
                          <span>₹{item.totalPrice.toFixed(2)}</span>
                        </div>
                      ))}
                      {order.items.length > 2 && (
                        <p className="text-sm text-muted-foreground">
                          +{order.items.length - 2} more item{order.items.length - 2 !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <Link href={`/orders/${order.id}`} className="flex-1">
                      <Button variant="outline" className="w-full">
                        View Details
                      </Button>
                    </Link>
                    
                    {isActiveOrder(order.status) && (
                      <Link href={`/orders/${order.id}`} className="flex-1">
                        <Button className="w-full">
                          Track Order
                        </Button>
                      </Link>
                    )}
                    
                    {order.status === 'delivered' && (
                      <Button variant="outline" className="flex-1">
                        Reorder
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}