import { Server as SocketIOServer } from 'socket.io'
import { Server as HTTPServer } from 'http'
import { verifyToken } from '@/lib/auth/jwt'
import { Order } from '@/models/Order'

export interface SocketUser {
  userId: string
  tenantId: string
  role: string
  restaurantId?: string
}

export interface OrderUpdatePayload {
  orderId: string
  status: string
  timeline: any[]
  updatedBy: string
  notes?: string
}

export interface DeliveryUpdatePayload {
  orderId: string
  deliveryPersonId: string
  location?: {
    lat: number
    lng: number
  }
  estimatedArrival?: Date
}

export class WebSocketService {
  private io: SocketIOServer
  private connectedUsers: Map<string, SocketUser> = new Map()
  private userSockets: Map<string, Set<string>> = new Map() // userId -> Set of socketIds
  private restaurantSockets: Map<string, Set<string>> = new Map() // restaurantId -> Set of socketIds

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling']
    })

    this.setupEventHandlers()
  }

  private setupEventHandlers() {
    this.io.on('connection', async (socket) => {
      console.log(`Socket connected: ${socket.id}`)

      // Authenticate user
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '')
      
      if (!token) {
        socket.emit('error', { message: 'Authentication required' })
        socket.disconnect()
        return
      }

      try {
        const decoded = await verifyToken(token)
        if (!decoded) {
          socket.emit('error', { message: 'Invalid token' })
          socket.disconnect()
          return
        }

        const user: SocketUser = {
          userId: decoded.userId,
          tenantId: decoded.tenantId || 'default',
          role: decoded.role,
          restaurantId: decoded.restaurantId
        }

        // Store user connection
        this.connectedUsers.set(socket.id, user)
        
        // Add to user sockets map
        if (!this.userSockets.has(user.userId)) {
          this.userSockets.set(user.userId, new Set())
        }
        this.userSockets.get(user.userId)!.add(socket.id)

        // Add to restaurant sockets map for admin users
        if (user.restaurantId && ['owner', 'manager', 'staff'].includes(user.role)) {
          if (!this.restaurantSockets.has(user.restaurantId)) {
            this.restaurantSockets.set(user.restaurantId, new Set())
          }
          this.restaurantSockets.get(user.restaurantId)!.add(socket.id)
        }

        // Join user-specific room
        socket.join(`user:${user.userId}`)
        
        // Join restaurant room for admin users
        if (user.restaurantId) {
          socket.join(`restaurant:${user.restaurantId}`)
        }

        // Join tenant room
        socket.join(`tenant:${user.tenantId}`)

        socket.emit('connected', { 
          message: 'Connected successfully',
          userId: user.userId,
          role: user.role
        })

        // Handle order tracking subscription
        socket.on('subscribe:order', (orderId: string) => {
          this.handleOrderSubscription(socket, user, orderId)
        })

        // Handle order status updates (admin only)
        socket.on('update:order', (data: OrderUpdatePayload) => {
          this.handleOrderUpdate(socket, user, data)
        })

        // Handle delivery updates
        socket.on('update:delivery', (data: DeliveryUpdatePayload) => {
          this.handleDeliveryUpdate(socket, user, data)
        })

        // Handle presence updates
        socket.on('presence:update', (status: 'online' | 'away' | 'busy') => {
          this.handlePresenceUpdate(socket, user, status)
        })

        // Handle disconnection
        socket.on('disconnect', () => {
          this.handleDisconnection(socket, user)
        })

        // Handle ping for connection health
        socket.on('ping', () => {
          socket.emit('pong')
        })

      } catch (error) {
        console.error('Socket authentication error:', error)
        socket.emit('error', { message: 'Authentication failed' })
        socket.disconnect()
      }
    })
  }

  private async handleOrderSubscription(socket: any, user: SocketUser, orderId: string) {
    try {
      const { OrderService } = await import('./order-service')
      
      // Verify user can access this order
      const order = await OrderService.getOrder(
        orderId,
        user.tenantId,
        user.userId,
        user.role
      )
      
      if (!order) {
        socket.emit('error', { message: 'Order not found or access denied' })
        return
      }

      // Join order-specific room
      socket.join(`order:${orderId}`)
      
      // Send current order status
      socket.emit('order:status', {
        orderId,
        status: order.status,
        timeline: order.timeline,
        estimatedDeliveryTime: order.estimatedDeliveryTime
      })

    } catch (error) {
      console.error('Order subscription error:', error)
      socket.emit('error', { message: 'Failed to subscribe to order updates' })
    }
  }

  private async handleOrderUpdate(socket: any, user: SocketUser, data: OrderUpdatePayload) {
    try {
      // Verify admin permissions
      if (!['owner', 'manager', 'staff'].includes(user.role)) {
        socket.emit('error', { message: 'Insufficient permissions' })
        return
      }

      const { OrderService } = await import('./order-service')
      
      // Update order using service
      const order = await OrderService.updateOrderStatus(
        data.orderId,
        user.tenantId,
        user.userId,
        {
          status: data.status,
          notes: data.notes
        },
        user.role
      )

      // Broadcast update to all subscribers
      this.io.to(`order:${data.orderId}`).emit('order:updated', {
        orderId: data.orderId,
        status: data.status,
        timeline: order.timeline,
        updatedBy: user.userId,
        updatedAt: new Date()
      })

      // Notify customer specifically
      this.io.to(`user:${order.userId}`).emit('order:status_changed', {
        orderId: data.orderId,
        status: data.status,
        message: this.getStatusMessage(data.status),
        timeline: order.timeline
      })

    } catch (error) {
      console.error('Order update error:', error)
      socket.emit('error', { message: error.message || 'Failed to update order' })
    }
  }

  private async handleDeliveryUpdate(socket: any, user: SocketUser, data: DeliveryUpdatePayload) {
    try {
      // Verify delivery person or admin permissions
      if (!['owner', 'manager', 'staff', 'courier'].includes(user.role)) {
        socket.emit('error', { message: 'Insufficient permissions' })
        return
      }

      const { OrderService } = await import('./order-service')
      
      // Update delivery information using service
      await OrderService.updateOrderStatus(
        data.orderId,
        user.tenantId,
        user.userId,
        {
          deliveryPersonId: data.deliveryPersonId,
          location: data.location,
          estimatedArrival: data.estimatedArrival
        },
        user.role
      )

      // Broadcast delivery update
      this.io.to(`order:${data.orderId}`).emit('delivery:updated', {
        orderId: data.orderId,
        deliveryPersonId: data.deliveryPersonId,
        location: data.location,
        estimatedArrival: data.estimatedArrival
      })

    } catch (error) {
      console.error('Delivery update error:', error)
      socket.emit('error', { message: error.message || 'Failed to update delivery' })
    }
  }

  private handlePresenceUpdate(socket: any, user: SocketUser, status: string) {
    // Broadcast presence to restaurant team
    if (user.restaurantId) {
      socket.to(`restaurant:${user.restaurantId}`).emit('presence:updated', {
        userId: user.userId,
        status,
        timestamp: new Date()
      })
    }
  }

  private handleDisconnection(socket: any, user: SocketUser) {
    console.log(`Socket disconnected: ${socket.id}`)
    
    // Remove from connected users
    this.connectedUsers.delete(socket.id)
    
    // Remove from user sockets map
    const userSocketSet = this.userSockets.get(user.userId)
    if (userSocketSet) {
      userSocketSet.delete(socket.id)
      if (userSocketSet.size === 0) {
        this.userSockets.delete(user.userId)
      }
    }
    
    // Remove from restaurant sockets map
    if (user.restaurantId) {
      const restaurantSocketSet = this.restaurantSockets.get(user.restaurantId)
      if (restaurantSocketSet) {
        restaurantSocketSet.delete(socket.id)
        if (restaurantSocketSet.size === 0) {
          this.restaurantSockets.delete(user.restaurantId)
        }
      }
    }

    // Broadcast offline status to restaurant team
    if (user.restaurantId) {
      socket.to(`restaurant:${user.restaurantId}`).emit('presence:updated', {
        userId: user.userId,
        status: 'offline',
        timestamp: new Date()
      })
    }
  }

  // Public methods for external use
  public notifyOrderUpdate(orderId: string, status: string, updatedBy: string, notes?: string) {
    this.io.to(`order:${orderId}`).emit('order:updated', {
      orderId,
      status,
      updatedBy,
      notes,
      updatedAt: new Date()
    })
  }

  public notifyNewOrder(restaurantId: string, order: any) {
    this.io.to(`restaurant:${restaurantId}`).emit('order:new', {
      orderId: order._id,
      customerName: order.deliveryInfo.name,
      items: order.items,
      total: order.total,
      createdAt: order.createdAt
    })
  }

  public notifyPaymentUpdate(orderId: string, paymentStatus: string) {
    this.io.to(`order:${orderId}`).emit('payment:updated', {
      orderId,
      status: paymentStatus,
      timestamp: new Date()
    })
  }

  public getConnectedUsers(): number {
    return this.connectedUsers.size
  }

  public getRestaurantConnections(restaurantId: string): number {
    return this.restaurantSockets.get(restaurantId)?.size || 0
  }

  private getStatusMessage(status: string): string {
    const messages = {
      pending: 'Your order has been placed and is awaiting confirmation.',
      confirmed: 'Your order has been confirmed and is being prepared.',
      preparing: 'Your order is being prepared by the kitchen.',
      ready: 'Your order is ready for pickup/delivery.',
      out_for_delivery: 'Your order is out for delivery.',
      delivered: 'Your order has been delivered successfully.',
      cancelled: 'Your order has been cancelled.'
    }
    return messages[status as keyof typeof messages] || 'Order status updated.'
  }
}

// Singleton instance
let websocketService: WebSocketService | null = null

export function initializeWebSocketService(server: HTTPServer): WebSocketService {
  if (!websocketService) {
    websocketService = new WebSocketService(server)
  }
  return websocketService
}

export function getWebSocketService(): WebSocketService | null {
  return websocketService
}