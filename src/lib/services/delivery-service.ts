import { DeliveryPerson, Order, User } from '@/models'
import { Types } from 'mongoose'

export interface DeliveryAssignment {
  orderId: string
  deliveryPersonId: string
  assignedAt: Date
  estimatedDeliveryTime: Date
  actualDeliveryTime?: Date
  status: 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'failed'
}

export interface DeliveryMetrics {
  totalDeliveries: number
  completedDeliveries: number
  averageDeliveryTime: number
  onTimeDeliveryRate: number
  customerRating: number
}

export interface RouteOptimization {
  deliveryPersonId: string
  orders: string[]
  estimatedRoute: {
    orderId: string
    address: string
    estimatedArrival: Date
    distance: number
  }[]
  totalDistance: number
  totalTime: number
}

class DeliveryService {
  /**
   * Get available delivery persons
   */
  async getAvailableDeliveryPersons(tenantId: string): Promise<any[]> {
    const now = new Date()
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'lowercase' }) as keyof any

    return await DeliveryPerson.find({
      tenantId,
      status: 'active',
      isVerified: true,
      [`availabilitySchedule.${currentDay}.isAvailable`]: true
    }).populate('userId', 'name email phone')
  }

  /**
   * Assign order to delivery person
   */
  async assignOrder(
    orderId: string,
    deliveryPersonId: string,
    estimatedDeliveryTime: Date
  ): Promise<{ success: boolean; message: string }> {
    try {
      const order = await Order.findById(orderId)
      if (!order) {
        return { success: false, message: 'Order not found' }
      }

      const deliveryPerson = await DeliveryPerson.findById(deliveryPersonId)
      if (!deliveryPerson) {
        return { success: false, message: 'Delivery person not found' }
      }

      // Check if delivery person is available
      if (deliveryPerson.status !== 'active') {
        return { success: false, message: 'Delivery person not available' }
      }

      // Update order with delivery assignment
      order.deliveryInfo = {
        deliveryPersonId: new Types.ObjectId(deliveryPersonId),
        assignedAt: new Date(),
        estimatedDeliveryTime,
        status: 'assigned'
      }
      order.status = 'assigned_for_delivery'
      await order.save()

      // Update delivery person stats
      deliveryPerson.deliveryStats.totalDeliveries += 1
      await deliveryPerson.save()

      return { success: true, message: 'Order assigned successfully' }
    } catch (error) {
      console.error('Assign order error:', error)
      return { success: false, message: 'Failed to assign order' }
    }
  }

  /**
   * Update delivery status
   */
  async updateDeliveryStatus(
    orderId: string,
    status: 'picked_up' | 'in_transit' | 'delivered' | 'failed',
    location?: { lat: number; lng: number },
    notes?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const order = await Order.findById(orderId)
      if (!order || !order.deliveryInfo) {
        return { success: false, message: 'Order or delivery info not found' }
      }

      // Update delivery status
      order.deliveryInfo.status = status
      
      if (status === 'delivered') {
        order.deliveryInfo.actualDeliveryTime = new Date()
        order.status = 'delivered'
        
        // Update delivery person stats
        const deliveryPerson = await DeliveryPerson.findById(order.deliveryInfo.deliveryPersonId)
        if (deliveryPerson) {
          deliveryPerson.deliveryStats.completedDeliveries += 1
          
          // Calculate average delivery time
          const deliveryTime = (order.deliveryInfo.actualDeliveryTime.getTime() - 
                               order.deliveryInfo.assignedAt.getTime()) / (1000 * 60) // minutes
          
          const totalCompletedDeliveries = deliveryPerson.deliveryStats.completedDeliveries
          const currentAverage = deliveryPerson.deliveryStats.averageDeliveryTime || 0
          
          deliveryPerson.deliveryStats.averageDeliveryTime = 
            ((currentAverage * (totalCompletedDeliveries - 1)) + deliveryTime) / totalCompletedDeliveries
          
          await deliveryPerson.save()
        }
      } else if (status === 'failed') {
        order.status = 'delivery_failed'
        
        // Update delivery person stats
        const deliveryPerson = await DeliveryPerson.findById(order.deliveryInfo.deliveryPersonId)
        if (deliveryPerson) {
          deliveryPerson.deliveryStats.cancelledDeliveries += 1
          await deliveryPerson.save()
        }
      }

      // Add status update to timeline
      if (!order.timeline) order.timeline = []
      order.timeline.push({
        status: status === 'delivered' ? 'delivered' : 'in_transit',
        timestamp: new Date(),
        location,
        notes
      })

      await order.save()

      return { success: true, message: 'Delivery status updated successfully' }
    } catch (error) {
      console.error('Update delivery status error:', error)
      return { success: false, message: 'Failed to update delivery status' }
    }
  }

  /**
   * Get delivery person performance metrics
   */
  async getDeliveryPersonMetrics(deliveryPersonId: string): Promise<DeliveryMetrics> {
    const deliveryPerson = await DeliveryPerson.findById(deliveryPersonId)
    if (!deliveryPerson) {
      throw new Error('Delivery person not found')
    }

    const stats = deliveryPerson.deliveryStats

    // Calculate on-time delivery rate
    const completedOrders = await Order.find({
      'deliveryInfo.deliveryPersonId': deliveryPersonId,
      'deliveryInfo.status': 'delivered'
    })

    let onTimeDeliveries = 0
    completedOrders.forEach(order => {
      if (order.deliveryInfo?.actualDeliveryTime && order.deliveryInfo?.estimatedDeliveryTime) {
        if (order.deliveryInfo.actualDeliveryTime <= order.deliveryInfo.estimatedDeliveryTime) {
          onTimeDeliveries++
        }
      }
    })

    const onTimeDeliveryRate = completedOrders.length > 0 ? 
      (onTimeDeliveries / completedOrders.length) * 100 : 0

    return {
      totalDeliveries: stats.totalDeliveries,
      completedDeliveries: stats.completedDeliveries,
      averageDeliveryTime: stats.averageDeliveryTime,
      onTimeDeliveryRate,
      customerRating: stats.averageRating
    }
  }

  /**
   * Estimate delivery time based on distance and current load
   */
  estimateDeliveryTime(
    restaurantLocation: { lat: number; lng: number },
    deliveryLocation: { lat: number; lng: number },
    currentLoad: number = 0
  ): Date {
    // Calculate distance (simplified Haversine formula)
    const distance = this.calculateDistance(restaurantLocation, deliveryLocation)
    
    // Base time: 2 minutes per km + preparation time + current load factor
    const baseTimeMinutes = (distance * 2) + 15 + (currentLoad * 5)
    
    const estimatedTime = new Date()
    estimatedTime.setMinutes(estimatedTime.getMinutes() + baseTimeMinutes)
    
    return estimatedTime
  }

  /**
   * Calculate distance between two points (in km)
   */
  private calculateDistance(
    point1: { lat: number; lng: number },
    point2: { lat: number; lng: number }
  ): number {
    const R = 6371 // Earth's radius in km
    const dLat = this.toRadians(point2.lat - point1.lat)
    const dLng = this.toRadians(point2.lng - point1.lng)
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(point1.lat)) * Math.cos(this.toRadians(point2.lat)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2)
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180)
  }

  /**
   * Get delivery person current location and orders
   */
  async getDeliveryPersonStatus(deliveryPersonId: string): Promise<{
    deliveryPerson: any
    activeOrders: any[]
    currentLocation?: { lat: number; lng: number }
  }> {
    const deliveryPerson = await DeliveryPerson.findById(deliveryPersonId)
      .populate('userId', 'name email phone')
    
    if (!deliveryPerson) {
      throw new Error('Delivery person not found')
    }

    const activeOrders = await Order.find({
      'deliveryInfo.deliveryPersonId': deliveryPersonId,
      'deliveryInfo.status': { $in: ['assigned', 'picked_up', 'in_transit'] }
    }).populate('userId', 'name phone')

    return {
      deliveryPerson,
      activeOrders,
      currentLocation: deliveryPerson.currentLocation
    }
  }

  /**
   * Update delivery person location
   */
  async updateDeliveryPersonLocation(
    deliveryPersonId: string,
    location: { lat: number; lng: number }
  ): Promise<void> {
    await DeliveryPerson.findByIdAndUpdate(deliveryPersonId, {
      currentLocation: {
        ...location,
        lastUpdated: new Date()
      }
    })
  }

  /**
   * Basic route optimization (foundation for future enhancement)
   */
  async optimizeRoute(deliveryPersonId: string, orderIds: string[]): Promise<RouteOptimization> {
    const deliveryPerson = await DeliveryPerson.findById(deliveryPersonId)
    if (!deliveryPerson) {
      throw new Error('Delivery person not found')
    }

    const orders = await Order.find({
      _id: { $in: orderIds.map(id => new Types.ObjectId(id)) }
    })

    // Simple optimization: sort by distance from current location
    const currentLocation = deliveryPerson.currentLocation || { lat: 0, lng: 0 }
    
    const routePoints = orders.map(order => ({
      orderId: order._id.toString(),
      address: `${order.deliveryAddress.street}, ${order.deliveryAddress.city}`,
      location: order.deliveryAddress.coordinates || { lat: 0, lng: 0 },
      estimatedArrival: new Date(),
      distance: this.calculateDistance(currentLocation, order.deliveryAddress.coordinates || { lat: 0, lng: 0 })
    }))

    // Sort by distance (nearest first)
    routePoints.sort((a, b) => a.distance - b.distance)

    // Calculate cumulative time and distance
    let totalDistance = 0
    let totalTime = 0
    let currentPos = currentLocation

    routePoints.forEach((point, index) => {
      const distance = this.calculateDistance(currentPos, point.location)
      totalDistance += distance
      totalTime += (distance * 2) + 5 // 2 min per km + 5 min delivery time
      
      point.distance = distance
      point.estimatedArrival = new Date(Date.now() + totalTime * 60 * 1000)
      currentPos = point.location
    })

    return {
      deliveryPersonId,
      orders: orderIds,
      estimatedRoute: routePoints,
      totalDistance,
      totalTime
    }
  }

  /**
   * Get delivery analytics for admin dashboard
   */
  async getDeliveryAnalytics(tenantId: string, dateRange?: { start: Date; end: Date }): Promise<{
    totalDeliveries: number
    completedDeliveries: number
    averageDeliveryTime: number
    onTimeDeliveryRate: number
    activeDeliveryPersons: number
    deliveryPersonPerformance: any[]
  }> {
    const matchQuery: any = { tenantId }
    if (dateRange) {
      matchQuery.createdAt = { $gte: dateRange.start, $lte: dateRange.end }
    }

    const deliveryStats = await Order.aggregate([
      { $match: { ...matchQuery, 'deliveryInfo': { $exists: true } } },
      {
        $group: {
          _id: null,
          totalDeliveries: { $sum: 1 },
          completedDeliveries: {
            $sum: { $cond: [{ $eq: ['$deliveryInfo.status', 'delivered'] }, 1, 0] }
          },
          averageDeliveryTime: {
            $avg: {
              $cond: [
                { $eq: ['$deliveryInfo.status', 'delivered'] },
                {
                  $divide: [
                    { $subtract: ['$deliveryInfo.actualDeliveryTime', '$deliveryInfo.assignedAt'] },
                    1000 * 60 // Convert to minutes
                  ]
                },
                null
              ]
            }
          }
        }
      }
    ])

    const stats = deliveryStats[0] || {
      totalDeliveries: 0,
      completedDeliveries: 0,
      averageDeliveryTime: 0
    }

    const activeDeliveryPersons = await DeliveryPerson.countDocuments({
      tenantId,
      status: 'active'
    })

    const deliveryPersonPerformance = await DeliveryPerson.find({ tenantId })
      .populate('userId', 'name')
      .select('userId deliveryStats')
      .limit(10)

    return {
      ...stats,
      onTimeDeliveryRate: stats.completedDeliveries > 0 ? 
        (stats.completedDeliveries / stats.totalDeliveries) * 100 : 0,
      activeDeliveryPersons,
      deliveryPersonPerformance
    }
  }
}

export const deliveryService = new DeliveryService()