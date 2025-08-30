'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuth } from '@/lib/auth-context'

export interface OrderStatus {
  orderId: string
  status: string
  timeline: Array<{
    status: string
    timestamp: string
    notes?: string
    updatedBy: string
  }>
  estimatedDeliveryTime?: string
  deliveryInfo?: {
    deliveryPersonId?: string
    location?: {
      lat: number
      lng: number
    }
    estimatedArrival?: string
  }
}

export interface OrderUpdate {
  orderId: string
  status: string
  timeline: any[]
  updatedBy: string
  updatedAt: string
  message?: string
}

export interface ConnectionState {
  connected: boolean
  connecting: boolean
  error: string | null
  reconnectAttempts: number
}

export function useOrderTracking(orderId?: string) {
  const { user, token } = useAuth()
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    connected: false,
    connecting: false,
    error: null,
    reconnectAttempts: 0
  })
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null)
  const [lastUpdate, setLastUpdate] = useState<OrderUpdate | null>(null)
  
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>()
  const maxReconnectAttempts = 5
  const reconnectDelay = 1000 // Start with 1 second

  const connect = useCallback(() => {
    if (!user || !token || connectionState.connecting) return

    setConnectionState(prev => ({ ...prev, connecting: true, error: null }))

    const socketInstance = io(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000', {
      auth: {
        token
      },
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: false // We'll handle reconnection manually
    })

    socketInstance.on('connect', () => {
      console.log('WebSocket connected')
      setConnectionState({
        connected: true,
        connecting: false,
        error: null,
        reconnectAttempts: 0
      })
      
      // Subscribe to order updates if orderId is provided
      if (orderId) {
        socketInstance.emit('subscribe:order', orderId)
      }
    })

    socketInstance.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason)
      setConnectionState(prev => ({
        ...prev,
        connected: false,
        connecting: false
      }))
      
      // Attempt reconnection if not manually disconnected
      if (reason !== 'io client disconnect') {
        scheduleReconnect()
      }
    })

    socketInstance.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error)
      setConnectionState(prev => ({
        ...prev,
        connected: false,
        connecting: false,
        error: error.message
      }))
      scheduleReconnect()
    })

    socketInstance.on('error', (error) => {
      console.error('WebSocket error:', error)
      setConnectionState(prev => ({ ...prev, error: error.message }))
    })

    // Order-specific events
    socketInstance.on('order:status', (data: OrderStatus) => {
      setOrderStatus(data)
    })

    socketInstance.on('order:updated', (data: OrderUpdate) => {
      setLastUpdate(data)
      setOrderStatus(prev => prev ? {
        ...prev,
        status: data.status,
        timeline: data.timeline
      } : null)
    })

    socketInstance.on('order:status_changed', (data: OrderUpdate) => {
      setLastUpdate(data)
      setOrderStatus(prev => prev ? {
        ...prev,
        status: data.status,
        timeline: data.timeline
      } : null)
    })

    socketInstance.on('delivery:updated', (data: any) => {
      setOrderStatus(prev => prev ? {
        ...prev,
        deliveryInfo: {
          deliveryPersonId: data.deliveryPersonId,
          location: data.location,
          estimatedArrival: data.estimatedArrival
        }
      } : null)
    })

    socketInstance.on('payment:updated', (data: any) => {
      console.log('Payment updated:', data)
      // Handle payment status updates
    })

    setSocket(socketInstance)
  }, [user, token, orderId, connectionState.connecting])

  const scheduleReconnect = useCallback(() => {
    if (connectionState.reconnectAttempts >= maxReconnectAttempts) {
      setConnectionState(prev => ({
        ...prev,
        error: 'Maximum reconnection attempts reached'
      }))
      return
    }

    const delay = reconnectDelay * Math.pow(2, connectionState.reconnectAttempts) // Exponential backoff
    
    reconnectTimeoutRef.current = setTimeout(() => {
      setConnectionState(prev => ({
        ...prev,
        reconnectAttempts: prev.reconnectAttempts + 1
      }))
      connect()
    }, delay)
  }, [connectionState.reconnectAttempts, connect])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    
    if (socket) {
      socket.disconnect()
      setSocket(null)
    }
    
    setConnectionState({
      connected: false,
      connecting: false,
      error: null,
      reconnectAttempts: 0
    })
  }, [socket])

  const subscribeToOrder = useCallback((newOrderId: string) => {
    if (socket && connectionState.connected) {
      socket.emit('subscribe:order', newOrderId)
    }
  }, [socket, connectionState.connected])

  const updateOrderStatus = useCallback((orderId: string, status: string, notes?: string) => {
    if (socket && connectionState.connected) {
      socket.emit('update:order', {
        orderId,
        status,
        notes,
        updatedBy: user?.id
      })
    }
  }, [socket, connectionState.connected, user?.id])

  const updateDeliveryStatus = useCallback((orderId: string, deliveryPersonId: string, location?: { lat: number; lng: number }) => {
    if (socket && connectionState.connected) {
      socket.emit('update:delivery', {
        orderId,
        deliveryPersonId,
        location
      })
    }
  }, [socket, connectionState.connected])

  const sendPresenceUpdate = useCallback((status: 'online' | 'away' | 'busy') => {
    if (socket && connectionState.connected) {
      socket.emit('presence:update', status)
    }
  }, [socket, connectionState.connected])

  // Auto-connect when user and token are available
  useEffect(() => {
    if (user && token && !socket && !connectionState.connecting) {
      connect()
    }

    return () => {
      disconnect()
    }
  }, [user, token, socket, connectionState.connecting, connect, disconnect])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      disconnect()
    }
  }, [disconnect])

  // Ping to keep connection alive
  useEffect(() => {
    if (socket && connectionState.connected) {
      const pingInterval = setInterval(() => {
        socket.emit('ping')
      }, 30000) // Ping every 30 seconds

      return () => clearInterval(pingInterval)
    }
  }, [socket, connectionState.connected])

  return {
    // Connection state
    connected: connectionState.connected,
    connecting: connectionState.connecting,
    error: connectionState.error,
    reconnectAttempts: connectionState.reconnectAttempts,
    
    // Order data
    orderStatus,
    lastUpdate,
    
    // Actions
    connect,
    disconnect,
    subscribeToOrder,
    updateOrderStatus,
    updateDeliveryStatus,
    sendPresenceUpdate,
    
    // Manual reconnect
    reconnect: () => {
      disconnect()
      setTimeout(connect, 1000)
    }
  }
}

// Hook for multiple orders (admin dashboard)
export function useOrdersTracking(restaurantId?: string) {
  const { user, token } = useAuth()
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    connected: false,
    connecting: false,
    error: null,
    reconnectAttempts: 0
  })
  const [orders, setOrders] = useState<Map<string, OrderStatus>>(new Map())
  const [newOrders, setNewOrders] = useState<any[]>([])
  const [presenceMap, setPresenceMap] = useState<Map<string, { status: string; timestamp: string }>>(new Map())

  const connect = useCallback(() => {
    if (!user || !token || connectionState.connecting) return

    setConnectionState(prev => ({ ...prev, connecting: true, error: null }))

    const socketInstance = io(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000', {
      auth: {
        token
      },
      transports: ['websocket', 'polling']
    })

    socketInstance.on('connect', () => {
      setConnectionState({
        connected: true,
        connecting: false,
        error: null,
        reconnectAttempts: 0
      })
    })

    socketInstance.on('order:new', (order) => {
      setNewOrders(prev => [order, ...prev.slice(0, 9)]) // Keep last 10 new orders
    })

    socketInstance.on('order:updated', (data: OrderUpdate) => {
      setOrders(prev => {
        const updated = new Map(prev)
        const existing = updated.get(data.orderId)
        if (existing) {
          updated.set(data.orderId, {
            ...existing,
            status: data.status,
            timeline: data.timeline
          })
        }
        return updated
      })
    })

    socketInstance.on('presence:updated', (data) => {
      setPresenceMap(prev => {
        const updated = new Map(prev)
        updated.set(data.userId, {
          status: data.status,
          timestamp: data.timestamp
        })
        return updated
      })
    })

    setSocket(socketInstance)
  }, [user, token, connectionState.connecting])

  useEffect(() => {
    if (user && token && ['owner', 'manager', 'staff'].includes(user.role)) {
      connect()
    }

    return () => {
      if (socket) {
        socket.disconnect()
      }
    }
  }, [user, token, connect, socket])

  return {
    connected: connectionState.connected,
    connecting: connectionState.connecting,
    error: connectionState.error,
    orders: Array.from(orders.values()),
    newOrders,
    presenceMap: Array.from(presenceMap.entries()),
    clearNewOrders: () => setNewOrders([])
  }
}