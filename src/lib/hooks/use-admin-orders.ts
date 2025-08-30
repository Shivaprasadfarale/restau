import { useState, useEffect, useRef, useCallback } from 'react'
import { useAdminAuth } from '@/lib/admin-auth-context'

interface Order {
  _id: string
  id: string
  customerName: string
  customerPhone: string
  items: Array<{
    name: string
    quantity: number
    price: number
    totalPrice: number
  }>
  total: {
    subtotal: number
    tax: number
    deliveryFee: number
    total: number
  }
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled'
  paymentStatus: 'pending' | 'paid' | 'failed'
  paymentMethod: string
  orderType: 'delivery' | 'pickup'
  deliveryAddress?: any
  deliveryInfo: {
    name: string
    phone: string
    specialInstructions?: string
  }
  createdAt: string
  updatedAt: string
  estimatedDeliveryTime?: string
  timeline: Array<{
    status: string
    timestamp: string
    updatedBy: string
    notes?: string
  }>
}

interface OrderStats {
  totalOrders: number
  pendingOrders: number
  confirmedOrders: number
  preparingOrders: number
  readyOrders: number
  deliveredOrders: number
  cancelledOrders: number
  totalRevenue: number
  averageOrderValue: number
}

interface UseAdminOrdersOptions {
  autoRefresh?: boolean
  refreshInterval?: number
  enableWebSocket?: boolean
  enableNotifications?: boolean
}

interface UseAdminOrdersReturn {
  orders: Order[]
  stats: OrderStats | null
  loading: boolean
  error: string | null
  wsConnected: boolean
  presenceUsers: Map<string, any>
  
  // Actions
  fetchOrders: () => Promise<void>
  updateOrderStatus: (orderId: string, status: string, notes?: string) => Promise<void>
  bulkUpdateOrders: (orderIds: string[], operation: any) => Promise<void>
  
  // WebSocket actions
  connectWebSocket: () => void
  disconnectWebSocket: () => void
  
  // Notification actions
  playNotificationSound: () => void
  showDesktopNotification: (title: string, body: string) => void
}

export function useAdminOrders(options: UseAdminOrdersOptions = {}): UseAdminOrdersReturn {
  const {
    autoRefresh = true,
    refreshInterval = 30000,
    enableWebSocket = true,
    enableNotifications = true
  } = options

  const { user } = useAdminAuth()
  
  // State
  const [orders, setOrders] = useState<Order[]>([])
  const [stats, setStats] = useState<OrderStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [presenceUsers, setPresenceUsers] = useState<Map<string, any>>(new Map())
  
  // Refs
  const wsRef = useRef<WebSocket | null>(null)
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)

  // Initialize audio for notifications
  useEffect(() => {
    if (enableNotifications) {
      audioRef.current = new Audio('/sounds/notification.mp3')
      audioRef.current.volume = 0.7
    }
  }, [enableNotifications])

  // Fetch orders from API
  const fetchOrders = useCallback(async () => {
    if (!user?.token) return

    try {
      setError(null)
      const response = await fetch('/api/orders/live', {
        headers: {
          'Authorization': `Bearer ${user.token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      
      if (result.success) {
        setOrders(result.data.orders || [])
        setStats(result.data.stats || null)
      } else {
        throw new Error(result.error?.message || 'Failed to fetch orders')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch orders'
      setError(errorMessage)
      console.error('Failed to fetch orders:', err)
    } finally {
      setLoading(false)
    }
  }, [user?.token])

  // Update order status
  const updateOrderStatus = useCallback(async (orderId: string, status: string, notes?: string) => {
    if (!user?.token) throw new Error('No authentication token')

    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${user.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status, notes })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to update order status')
      }

      // Optimistically update local state
      setOrders(prev => prev.map(order => 
        order._id === orderId 
          ? { ...order, status: status as any, updatedAt: new Date().toISOString() }
          : order
      ))

      // Send WebSocket update if connected
      if (wsRef.current && wsConnected) {
        wsRef.current.send(JSON.stringify({
          type: 'update:order',
          payload: {
            orderId,
            status,
            notes,
            updatedBy: user.id
          }
        }))
      }

    } catch (err) {
      console.error('Failed to update order status:', err)
      throw err
    }
  }, [user?.token, user?.id, wsConnected])

  // Bulk update orders
  const bulkUpdateOrders = useCallback(async (orderIds: string[], operation: any) => {
    if (!user?.token) throw new Error('No authentication token')

    try {
      const response = await fetch('/api/orders/bulk', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...operation,
          orderIds,
          dryRun: false
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      
      if (!result.success) {
        throw new Error(result.error?.message || 'Bulk operation failed')
      }

      // Refresh orders after bulk operation
      await fetchOrders()

      return result.data
    } catch (err) {
      console.error('Bulk operation failed:', err)
      throw err
    }
  }, [user?.token, fetchOrders])

  // WebSocket connection management
  const connectWebSocket = useCallback(() => {
    if (!enableWebSocket || !user?.token) return

    try {
      const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000'}/ws`
      wsRef.current = new WebSocket(wsUrl)
      
      wsRef.current.onopen = () => {
        console.log('WebSocket connected')
        setWsConnected(true)
        setReconnectAttempts(0)
        
        // Authenticate
        wsRef.current?.send(JSON.stringify({
          type: 'auth',
          token: user.token
        }))
      }

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          handleWebSocketMessage(data)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected')
        setWsConnected(false)
        
        // Attempt to reconnect with exponential backoff
        if (reconnectAttempts < 5) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)
          reconnectTimeoutRef.current = setTimeout(() => {
            setReconnectAttempts(prev => prev + 1)
            connectWebSocket()
          }, delay)
        }
      }

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error)
      }
    } catch (error) {
      console.error('Failed to connect WebSocket:', error)
    }
  }, [enableWebSocket, user?.token, reconnectAttempts])

  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    setWsConnected(false)
  }, [])

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((data: any) => {
    switch (data.type) {
      case 'order:new':
        handleNewOrder(data.payload)
        break
      case 'order:updated':
        handleOrderUpdate(data.payload)
        break
      case 'presence:updated':
        handlePresenceUpdate(data.payload)
        break
      case 'order:status_changed':
        handleOrderStatusChange(data.payload)
        break
    }
  }, [])

  const handleNewOrder = useCallback((orderData: any) => {
    setOrders(prev => [orderData, ...prev])
    
    // Show notification
    if (enableNotifications) {
      showDesktopNotification('New Order', `Order #${orderData.id} from ${orderData.deliveryInfo.name}`)
      playNotificationSound()
    }
  }, [enableNotifications])

  const handleOrderUpdate = useCallback((updateData: any) => {
    setOrders(prev => prev.map(order => 
      order._id === updateData.orderId 
        ? { ...order, status: updateData.status, timeline: updateData.timeline }
        : order
    ))
  }, [])

  const handleOrderStatusChange = useCallback((data: any) => {
    setOrders(prev => prev.map(order => 
      order._id === data.orderId 
        ? { ...order, status: data.status, timeline: data.timeline }
        : order
    ))
  }, [])

  const handlePresenceUpdate = useCallback((data: any) => {
    setPresenceUsers(prev => {
      const newMap = new Map(prev)
      if (data.status === 'offline') {
        newMap.delete(data.userId)
      } else {
        newMap.set(data.userId, { ...data, lastSeen: new Date() })
      }
      return newMap
    })
  }, [])

  // Notification functions
  const playNotificationSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play().catch(console.error)
    }
  }, [])

  const showDesktopNotification = useCallback((title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { 
        body, 
        icon: '/icon-192x192.png',
        tag: 'order-notification'
      })
    }
  }, [])

  // Auto-refresh setup
  useEffect(() => {
    if (autoRefresh && !loading) {
      refreshIntervalRef.current = setInterval(fetchOrders, refreshInterval)
    } else {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [autoRefresh, refreshInterval, fetchOrders, loading])

  // Initialize
  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  useEffect(() => {
    if (enableWebSocket) {
      connectWebSocket()
    }

    return () => {
      disconnectWebSocket()
    }
  }, [enableWebSocket, connectWebSocket, disconnectWebSocket])

  return {
    orders,
    stats,
    loading,
    error,
    wsConnected,
    presenceUsers,
    
    fetchOrders,
    updateOrderStatus,
    bulkUpdateOrders,
    
    connectWebSocket,
    disconnectWebSocket,
    
    playNotificationSound,
    showDesktopNotification
  }
}