import { connectToDatabase } from '@/lib/mongodb'
import { Order, IOrder } from '@/models/Order'
import { User } from '@/models/User'
import { Restaurant } from '@/models/Restaurant'
import { CartService } from './cart-service'
import { getWebSocketService } from './websocket-service'
import { getRedisClient } from '@/lib/redis'

export interface OrderCreateData {
  tenantId: string
  userId: string
  restaurantId: string
  items: any[]
  deliveryAddress: any
  deliveryInfo: {
    name: string
    phone: string
    specialInstructions?: string
  }
  paymentMethod: string
  totals: any
  estimatedDeliveryTime: Date
  scheduledFor?: Date
  idempotencyKey: string
  metadata?: {
    userAgent?: string
    ipAddress?: string
  }
}

export interface OrderUpdateData {
  status?: string
  notes?: string
  deliveryPersonId?: string
  location?: {
    lat: number
    lng: number
  }
  estimatedArrival?: Date
}

export interface OrderSearchFilters {
  status?: string[]
  dateRange?: {
    start?: Date
    end?: Date
  }
  paymentMethod?: string[]
  restaurantId?: string
  userId?: string
}

export interface OrderStats {
  totalOrders: number
  pendingOrders: number
  confirmedOrders: number
  preparingOrders: number
  readyOrders: number
  deliveredOrders: number
  cancelledOrders: number
  totalRevenue: number
  averageOrderValue: number
  cancellationRate: number
}

export class OrderService {
  private static readonly ORDER_STATUS_TRANSITIONS = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['preparing', 'cancelled'],
    preparing: ['ready', 'cancelled'],
    ready: ['out_for_delivery', 'delivered'],
    out_for_delivery: ['delivered'],
    delivered: [],
    cancelled: []
  }

  private static readonly CANCELLATION_WINDOW_MINUTES = 15
  private static readonly PREPARATION_TIME_BUFFER = 5 // minutes

  /**
   * Create a new order with idempotency support
   */
  static async createOrder(data: OrderCreateData): Promise<IOrder> {
    await connectToDatabase()

    // Check for duplicate order using idempotency key
    const existingOrder = await Order.findOne({
      tenantId: data.tenantId,
      userId: data.userId,
      'metadata.idempotencyKey': data.idempotencyKey
    })

    if (existingOrder) {
      return existingOrder
    }

    // Validate user exists
    const user = await User.findById(data.userId)
    if (!user) {
      throw new Error('User not found')
    }

    // Validate restaurant exists and is active
    const restaurant = await Restaurant.findOne({
      _id: data.restaurantId,
      tenantId: data.tenantId,
      isDeleted: { $ne: true }
    })

    if (!restaurant) {
      throw new Error('Restaurant not found or inactive')
    }

    // Validate cart prices server-side
    const cartItems = data.items.map(item => ({
      id: `temp_${item.menuItemId}`,
      menuItemId: item.menuItemId,
      menuItem: {
        id: item.menuItemId,
        name: item.name,
        price: item.price,
        description: '',
        image: '',
        category: ''
      },
      quantity: item.quantity,
      selectedModifiers: item.selectedModifiers,
      specialInstructions: item.specialInstructions,
      unitPrice: item.price + item.selectedModifiers.reduce((sum: number, mod: any) => sum + mod.price, 0),
      totalPrice: item.totalPrice,
      addedAt: new Date()
    }))

    const priceValidation = await CartService.validateCartPrices(
      data.tenantId,
      data.restaurantId,
      cartItems
    )

    if (!priceValidation.valid) {
      throw new Error(`Price validation failed: ${priceValidation.errors?.join(', ')}`)
    }

    // Recalculate totals server-side
    const serverTotals = await CartService.calculateCartTotal(
      data.tenantId,
      data.restaurantId,
      cartItems
    )

    // Verify totals match (allow small rounding differences)
    if (Math.abs(serverTotals.total - data.totals.total) > 0.02) {
      throw new Error('Order total mismatch. Please refresh and try again.')
    }

    // Validate scheduled order time
    if (data.scheduledFor) {
      const now = new Date()
      const scheduledTime = new Date(data.scheduledFor)
      
      if (scheduledTime <= now) {
        throw new Error('Scheduled time must be in the future')
      }

      // Check if scheduled time is within restaurant operating hours
      if (!this.isWithinOperatingHours(restaurant, scheduledTime)) {
        throw new Error('Scheduled time is outside restaurant operating hours')
      }
    }

    // Calculate estimated delivery time
    const estimatedDeliveryTime = this.calculateEstimatedDeliveryTime(
      restaurant,
      data.items,
      data.scheduledFor
    )

    // Create order
    const order = new Order({
      tenantId: data.tenantId,
      userId: data.userId,
      restaurantId: data.restaurantId,
      items: data.items,
      status: 'pending',
      total: serverTotals,
      deliveryAddress: data.deliveryAddress,
      deliveryInfo: data.deliveryInfo,
      paymentMethod: data.paymentMethod,
      paymentId: '', // Will be updated after payment
      estimatedDeliveryTime,
      scheduledFor: data.scheduledFor,
      timeline: [{
        status: 'pending',
        timestamp: new Date(),
        updatedBy: data.userId,
        notes: 'Order placed'
      }],
      metadata: {
        idempotencyKey: data.idempotencyKey,
        userAgent: data.metadata?.userAgent || '',
        ipAddress: data.metadata?.ipAddress || 'unknown'
      },
      createdBy: data.userId
    })

    await order.save()

    // Clear user's cart after successful order
    await CartService.clearCart(data.tenantId, data.userId, data.restaurantId)

    // Cache order for quick access
    await this.cacheOrder(order)

    // Notify restaurant via WebSocket
    const wsService = getWebSocketService()
    if (wsService) {
      wsService.notifyNewOrder(data.restaurantId, order)
    }

    return order
  }

  /**
   * Update order status with state machine validation
   */
  static async updateOrderStatus(
    orderId: string,
    tenantId: string,
    updatedBy: string,
    updateData: OrderUpdateData,
    userRole: string = 'staff'
  ): Promise<IOrder> {
    await connectToDatabase()

    const order = await Order.findOne({
      _id: orderId,
      tenantId
    })

    if (!order) {
      throw new Error('Order not found')
    }

    // Validate status transition
    if (updateData.status) {
      if (!this.isValidStatusTransition(order.status, updateData.status)) {
        throw new Error(`Invalid status transition from ${order.status} to ${updateData.status}`)
      }

      // Update order status
      order.updateStatus(updateData.status, updatedBy, updateData.notes)

      // Handle special status updates
      if (updateData.status === 'delivered' && !order.actualDeliveryTime) {
        order.actualDeliveryTime = new Date()
      }
    }

    // Update delivery information
    if (updateData.deliveryPersonId || updateData.location || updateData.estimatedArrival) {
      order.metadata = {
        ...order.metadata,
        delivery: {
          ...order.metadata?.delivery,
          deliveryPersonId: updateData.deliveryPersonId,
          location: updateData.location,
          estimatedArrival: updateData.estimatedArrival,
          lastUpdate: new Date()
        }
      }
    }

    await order.save()

    // Update cache
    await this.cacheOrder(order)

    // Notify via WebSocket
    const wsService = getWebSocketService()
    if (wsService && updateData.status) {
      wsService.notifyOrderUpdate(orderId, updateData.status, updatedBy, updateData.notes)
    }

    return order
  }

  /**
   * Get order by ID with access control
   */
  static async getOrder(
    orderId: string,
    tenantId: string,
    userId?: string,
    userRole: string = 'customer'
  ): Promise<IOrder | null> {
    await connectToDatabase()

    // Try cache first
    const cachedOrder = await this.getCachedOrder(orderId)
    if (cachedOrder && cachedOrder.tenantId === tenantId) {
      // Verify access permissions
      if (this.hasOrderAccess(cachedOrder, userId, userRole)) {
        return cachedOrder
      }
    }

    // Build query based on role
    const query: any = { _id: orderId, tenantId }
    
    if (userRole === 'customer' && userId) {
      query.userId = userId
    }

    const order = await Order.findOne(query)
      .populate('restaurantId', 'name logo')
      .populate('userId', 'name phone email')

    if (order) {
      await this.cacheOrder(order)
    }

    return order
  }

  /**
   * Search orders with advanced filtering
   */
  static async searchOrders(
    tenantId: string,
    query: string,
    filters: OrderSearchFilters = {},
    page: number = 1,
    limit: number = 10,
    sortBy: string = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc',
    userRole: string = 'customer',
    userId?: string,
    restaurantId?: string
  ) {
    await connectToDatabase()

    // Build base query
    const baseQuery: any = { tenantId }

    // Role-based filtering
    if (userRole === 'customer' && userId) {
      baseQuery.userId = userId
    } else if (['owner', 'manager', 'staff'].includes(userRole) && restaurantId) {
      baseQuery.restaurantId = restaurantId
    }

    // Apply filters
    if (filters.status && filters.status.length > 0) {
      baseQuery.status = { $in: filters.status }
    }

    if (filters.paymentMethod && filters.paymentMethod.length > 0) {
      baseQuery.paymentMethod = { $in: filters.paymentMethod }
    }

    if (filters.dateRange) {
      const { start, end } = filters.dateRange
      if (start || end) {
        baseQuery.createdAt = {}
        if (start) baseQuery.createdAt.$gte = start
        if (end) baseQuery.createdAt.$lte = end
      }
    }

    if (filters.restaurantId && ['owner', 'manager'].includes(userRole)) {
      baseQuery.restaurantId = filters.restaurantId
    }

    // Build search query
    const searchRegex = new RegExp(query, 'i')
    const searchQuery = query ? {
      $or: [
        { 'deliveryInfo.name': searchRegex },
        { 'deliveryInfo.phone': searchRegex },
        { 'items.name': searchRegex },
        { paymentId: searchRegex },
        { 'deliveryAddress.street': searchRegex },
        { 'deliveryAddress.city': searchRegex }
      ]
    } : {}

    // Combine queries
    const finalQuery = query ? {
      $and: [baseQuery, searchQuery]
    } : baseQuery

    // Build sort object
    const sort: any = {}
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1

    // Execute search with aggregation
    const pipeline = [
      { $match: finalQuery },
      {
        $lookup: {
          from: 'restaurants',
          localField: 'restaurantId',
          foreignField: '_id',
          as: 'restaurant',
          pipeline: [{ $project: { name: 1, logo: 1 } }]
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'customer',
          pipeline: [{ $project: { name: 1, phone: 1, email: 1 } }]
        }
      }
    ]

    // Add relevance scoring for search queries
    if (query) {
      (pipeline as any[]).push({
        $addFields: {
          relevanceScore: {
            $sum: [
              { $cond: [{ $regexMatch: { input: '$deliveryInfo.name', regex: query, options: 'i' } }, 10, 0] },
              { $cond: [{ $regexMatch: { input: '$deliveryInfo.phone', regex: query, options: 'i' } }, 8, 0] },
              { $cond: [{ $regexMatch: { input: '$paymentId', regex: query, options: 'i' } }, 6, 0] }
            ]
          }
        }
      });
      (pipeline as any[]).push({ $sort: { relevanceScore: -1, ...sort } })
    } else {
      (pipeline as any[]).push({ $sort: sort })
    }

    (pipeline as any[]).push({
      $facet: {
        data: [
          { $skip: (page - 1) * limit },
          { $limit: limit }
        ],
        totalCount: [{ $count: 'count' }],
        aggregations: [
          {
            $group: {
              _id: null,
              statusCounts: { $push: { k: '$status', v: 1 } },
              paymentMethodCounts: { $push: { k: '$paymentMethod', v: 1 } },
              totalValue: { $sum: '$total.total' },
              avgOrderValue: { $avg: '$total.total' }
            }
          }
        ]
      }
    })

    const result = await Order.aggregate(pipeline)
    const orders = result[0].data
    const total = result[0].totalCount[0]?.count || 0
    const aggregations = result[0].aggregations[0] || {}

    // Generate search suggestions
    const suggestions = query ? await this.generateSearchSuggestions(query, baseQuery) : []

    return {
      data: orders,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        query,
        aggregations,
        suggestions
      }
    }
  }

  /**
   * Get order statistics
   */
  static async getOrderStats(
    tenantId: string,
    restaurantId?: string,
    dateRange?: { start: Date; end: Date }
  ): Promise<OrderStats> {
    await connectToDatabase()

    const matchStage: any = { tenantId }
    
    if (restaurantId) {
      matchStage.restaurantId = restaurantId
    }

    if (dateRange) {
      matchStage.createdAt = {
        $gte: dateRange.start,
        $lte: dateRange.end
      }
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          pendingOrders: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          confirmedOrders: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] } },
          preparingOrders: { $sum: { $cond: [{ $eq: ['$status', 'preparing'] }, 1, 0] } },
          readyOrders: { $sum: { $cond: [{ $eq: ['$status', 'ready'] }, 1, 0] } },
          deliveredOrders: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
          cancelledOrders: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          totalRevenue: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, '$total.total', 0] } },
          averageOrderValue: { $avg: { $cond: [{ $eq: ['$status', 'delivered'] }, '$total.total', null] } }
        }
      }
    ]

    const result = await Order.aggregate(pipeline)
    const stats = result[0] || {
      totalOrders: 0,
      pendingOrders: 0,
      confirmedOrders: 0,
      preparingOrders: 0,
      readyOrders: 0,
      deliveredOrders: 0,
      cancelledOrders: 0,
      totalRevenue: 0,
      averageOrderValue: 0
    }

    stats.cancellationRate = stats.totalOrders > 0 
      ? (stats.cancelledOrders / stats.totalOrders) * 100 
      : 0

    return stats
  }

  /**
   * Check if order can be cancelled
   */
  static canCancelOrder(order: IOrder): {
    canCancel: boolean
    timeRemaining: number
    refundPercentage: number
    reason?: string
  } {
    const now = new Date()
    const orderTime = new Date(order.createdAt)
    const minutesSinceOrder = (now.getTime() - orderTime.getTime()) / (1000 * 60)

    // Cannot cancel if already cancelled or delivered
    if (['cancelled', 'delivered'].includes(order.status)) {
      return {
        canCancel: false,
        timeRemaining: 0,
        refundPercentage: 0,
        reason: 'Order cannot be cancelled'
      }
    }

    // Full refund within cancellation window
    if (minutesSinceOrder <= this.CANCELLATION_WINDOW_MINUTES) {
      return {
        canCancel: true,
        timeRemaining: this.CANCELLATION_WINDOW_MINUTES - minutesSinceOrder,
        refundPercentage: 100
      }
    }

    // Partial refund for confirmed orders
    if (order.status === 'confirmed' && minutesSinceOrder <= 30) {
      return {
        canCancel: true,
        timeRemaining: 30 - minutesSinceOrder,
        refundPercentage: 75
      }
    }

    return {
      canCancel: false,
      timeRemaining: 0,
      refundPercentage: 0,
      reason: 'Cancellation window expired'
    }
  }

  /**
   * Cancel order with refund calculation
   */
  static async cancelOrder(
    orderId: string,
    tenantId: string,
    userId: string,
    reason: string,
    notes?: string
  ): Promise<{
    order: IOrder
    refundAmount: number
    refundPercentage: number
  }> {
    await connectToDatabase()

    const order = await Order.findOne({
      _id: orderId,
      tenantId,
      userId
    })

    if (!order) {
      throw new Error('Order not found')
    }

    const cancellationInfo = this.canCancelOrder(order)
    if (!cancellationInfo.canCancel) {
      throw new Error(cancellationInfo.reason || 'Order cannot be cancelled')
    }

    // Calculate refund amount
    const refundAmount = (order.total.total * cancellationInfo.refundPercentage) / 100

    // Update order status
    order.updateStatus('cancelled', userId, `${reason}${notes ? ` - ${notes}` : ''}`)
    order.metadata = {
      ...order.metadata,
      cancellation: {
        reason,
        notes,
        refundAmount,
        refundPercentage: cancellationInfo.refundPercentage,
        cancelledAt: new Date()
      }
    }

    await order.save()

    // Update cache
    await this.cacheOrder(order)

    // Notify via WebSocket
    const wsService = getWebSocketService()
    if (wsService) {
      wsService.notifyOrderUpdate(orderId, 'cancelled', userId, reason)
    }

    return {
      order,
      refundAmount,
      refundPercentage: cancellationInfo.refundPercentage
    }
  }

  /**
   * Get live orders for restaurant dashboard
   */
  static async getLiveOrders(tenantId: string, restaurantId: string) {
    await connectToDatabase()

    const liveStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery']
    
    return await Order.find({
      tenantId,
      restaurantId,
      status: { $in: liveStatuses }
    })
      .sort({ createdAt: 1 })
      .populate('userId', 'name phone email')
      .lean()
  }

  // Private helper methods

  private static isValidStatusTransition(currentStatus: string, newStatus: string): boolean {
    const allowedTransitions = this.ORDER_STATUS_TRANSITIONS[currentStatus as keyof typeof this.ORDER_STATUS_TRANSITIONS]
    return allowedTransitions?.includes(newStatus) || false
  }

  private static isWithinOperatingHours(restaurant: any, scheduledTime: Date): boolean {
    // Simplified check - in real implementation, check against restaurant.operatingHours
    const hour = scheduledTime.getHours()
    return hour >= 9 && hour <= 22 // 9 AM to 10 PM
  }

  private static calculateEstimatedDeliveryTime(
    restaurant: any,
    items: any[],
    scheduledFor?: Date
  ): Date {
    const baseTime = scheduledFor || new Date()
    
    // Calculate preparation time based on items
    const preparationTime = items.reduce((total, item) => {
      return total + (item.quantity * 3) // 3 minutes per item
    }, 15) // Base 15 minutes

    // Add delivery time (default 20 minutes)
    const deliveryTime = 20

    // Add buffer
    const totalTime = preparationTime + deliveryTime + this.PREPARATION_TIME_BUFFER

    return new Date(baseTime.getTime() + totalTime * 60000)
  }

  private static hasOrderAccess(order: any, userId?: string, userRole: string = 'customer'): boolean {
    if (userRole === 'customer') {
      return order.userId.toString() === userId
    }
    
    if (['owner', 'manager', 'staff', 'courier'].includes(userRole)) {
      return true // Admin users can access all orders in their tenant
    }

    return false
  }

  private static async cacheOrder(order: IOrder): Promise<void> {
    try {
      const redis = await getRedisClient()
      if (redis) {
        const cacheKey = `order:${order._id}`
        await redis.setex(cacheKey, 3600, JSON.stringify(order)) // Cache for 1 hour
      }
    } catch (error) {
      console.error('Failed to cache order:', error)
    }
  }

  private static async getCachedOrder(orderId: string): Promise<IOrder | null> {
    try {
      const redis = await getRedisClient()
      if (redis) {
        const cacheKey = `order:${orderId}`
        const cached = await redis.get(cacheKey)
        return cached ? JSON.parse(cached) : null
      }
    } catch (error) {
      console.error('Failed to get cached order:', error)
    }
    return null
  }

  private static async generateSearchSuggestions(query: string, baseQuery: any): Promise<string[]> {
    try {
      const suggestions: string[] = []
      
      // Get partial matches for customer names
      const nameMatches = await Order.aggregate([
        { $match: baseQuery },
        { $match: { 'deliveryInfo.name': { $regex: query, $options: 'i' } } },
        { $group: { _id: '$deliveryInfo.name' } },
        { $limit: 5 }
      ])
      
      suggestions.push(...nameMatches.map(m => m._id))

      // Get partial matches for menu items
      const itemMatches = await Order.aggregate([
        { $match: baseQuery },
        { $unwind: '$items' },
        { $match: { 'items.name': { $regex: query, $options: 'i' } } },
        { $group: { _id: '$items.name' } },
        { $limit: 5 }
      ])
      
      suggestions.push(...itemMatches.map(m => m._id))

      // Use Array.from to avoid downlevelIteration issues
      return Array.from(new Set(suggestions)).slice(0, 8)
    } catch (error) {
      console.error('Error generating suggestions:', error)
      return []
    }
  }
}