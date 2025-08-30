import { AnalyticsEvent, DailyMetrics } from '@/models/Analytics'
import { Order } from '@/models/Order'
import { MenuItem } from '@/models/MenuItem'
import { createHash } from 'crypto'
import { connectToDatabase } from '@/lib/mongodb'

export interface AnalyticsEventData {
  eventType: 'page_view' | 'menu_item_view' | 'add_to_cart' | 'remove_from_cart' | 'checkout_start' | 'payment_success' | 'payment_failed' | 'order_placed'
  userId?: string
  sessionId: string
  restaurantId: string
  metadata?: {
    menuItemId?: string
    categoryId?: string
    orderValue?: number
    paymentMethod?: string
    deviceType?: 'mobile' | 'desktop' | 'tablet'
    userAgent?: string
    referrer?: string
    timeOnPage?: number
  }
  ipAddress?: string
}

export interface SalesAnalytics {
  period: string
  totalSales: number
  orderCount: number
  averageOrderValue: number
  topSellingItems: ItemPerformance[]
  hourlyBreakdown: HourlyMetrics[]
  conversionFunnel: ConversionFunnel
  cohortAnalysis: CohortData[]
}

export interface ItemPerformance {
  itemId: string
  name: string
  category: string
  totalOrders: number
  totalRevenue: number
  averageRating?: number
  viewCount: number
  conversionRate: number
  trendDirection: 'up' | 'down' | 'stable'
}

export interface HourlyMetrics {
  hour: number
  orders: number
  revenue: number
  averageOrderValue: number
}

export interface ConversionFunnel {
  views: number
  addToCarts: number
  checkouts: number
  payments: number
  viewToCartRate: number
  cartToCheckoutRate: number
  checkoutToPaymentRate: number
  overallConversionRate: number
}

export interface CohortData {
  cohortMonth: string
  customersAcquired: number
  retentionRates: number[] // [month1, month2, month3, ...]
}

export interface RevenueMetrics {
  totalRevenue: number
  revenueGrowth: number
  averageOrderValue: number
  orderCount: number
  peakHours: Array<{ hour: number; revenue: number }>
  paymentMethodBreakdown: Record<string, number>
}

export interface ExportData {
  headers: string[]
  rows: any[][]
  filename: string
}

class AnalyticsService {
  private hashIP(ip: string): string {
    return createHash('sha256').update(ip + process.env.ANALYTICS_SALT || 'default-salt').digest('hex')
  }

  private detectDeviceType(userAgent: string): 'mobile' | 'desktop' | 'tablet' {
    const ua = userAgent.toLowerCase()
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return 'mobile'
    }
    if (ua.includes('tablet') || ua.includes('ipad')) {
      return 'tablet'
    }
    return 'desktop'
  }

  async trackEvent(tenantId: string, eventData: AnalyticsEventData): Promise<void> {
    try {
      await connectToDatabase()

      const event = new AnalyticsEvent({
        tenantId,
        eventType: eventData.eventType,
        userId: eventData.userId,
        sessionId: eventData.sessionId,
        restaurantId: eventData.restaurantId,
        metadata: {
          ...eventData.metadata,
          deviceType: eventData.metadata?.userAgent 
            ? this.detectDeviceType(eventData.metadata.userAgent)
            : undefined
        },
        ipHash: eventData.ipAddress ? this.hashIP(eventData.ipAddress) : undefined,
        timestamp: new Date()
      })

      await event.save()
    } catch (error) {
      console.error('Failed to track analytics event:', error)
      // Don't throw - analytics should not break the main flow
    }
  }

  async getSalesAnalytics(
    tenantId: string, 
    restaurantId: string, 
    period: 'daily' | 'weekly' | 'monthly',
    startDate?: Date,
    endDate?: Date
  ): Promise<SalesAnalytics> {
    await connectToDatabase()

    const now = new Date()
    const defaultStartDate = new Date(now.getTime() - (period === 'daily' ? 24 * 60 * 60 * 1000 : 
                                                      period === 'weekly' ? 7 * 24 * 60 * 60 * 1000 :
                                                      30 * 24 * 60 * 60 * 1000))

    const start = startDate || defaultStartDate
    const end = endDate || now

    // Get order data for the period
    const orders = await Order.find({
      tenantId,
      restaurantId,
      status: { $in: ['delivered', 'confirmed', 'preparing', 'ready', 'out_for_delivery'] },
      createdAt: { $gte: start, $lte: end }
    }).populate('items.menuItemId', 'name category')

    // Calculate basic metrics
    const totalSales = orders.reduce((sum, order) => sum + order.total.total, 0)
    const orderCount = orders.length
    const averageOrderValue = orderCount > 0 ? totalSales / orderCount : 0

    // Get top selling items
    const itemSales = new Map<string, { name: string; category: string; orders: number; revenue: number }>()
    
    orders.forEach(order => {
      order.items.forEach((item: any) => {
        const key = item.menuItemId._id.toString()
        const existing = itemSales.get(key) || { 
          name: item.name, 
          category: item.menuItemId.category || 'Unknown',
          orders: 0, 
          revenue: 0 
        }
        existing.orders += item.quantity
        existing.revenue += item.totalPrice
        itemSales.set(key, existing)
      })
    })

    // Get analytics events for conversion funnel
    const events = await AnalyticsEvent.find({
      tenantId,
      restaurantId,
      timestamp: { $gte: start, $lte: end }
    })

    const conversionFunnel = this.calculateConversionFunnel(events)
    const topSellingItems = await this.getItemPerformance(tenantId, restaurantId, start, end)
    const hourlyBreakdown = this.calculateHourlyBreakdown(orders)
    const cohortAnalysis = await this.getCohortAnalysis(tenantId, restaurantId, start, end)

    return {
      period: `${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]}`,
      totalSales,
      orderCount,
      averageOrderValue,
      topSellingItems,
      hourlyBreakdown,
      conversionFunnel,
      cohortAnalysis
    }
  }

  async getItemPerformance(
    tenantId: string, 
    restaurantId: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<ItemPerformance[]> {
    await connectToDatabase()

    // Get item views from analytics events
    const viewEvents = await AnalyticsEvent.aggregate([
      {
        $match: {
          tenantId,
          restaurantId,
          eventType: 'menu_item_view',
          timestamp: { $gte: startDate, $lte: endDate },
          'metadata.menuItemId': { $exists: true }
        }
      },
      {
        $group: {
          _id: '$metadata.menuItemId',
          viewCount: { $sum: 1 }
        }
      }
    ])

    // Get item orders
    const orders = await Order.find({
      tenantId,
      restaurantId,
      status: { $in: ['delivered', 'confirmed', 'preparing', 'ready', 'out_for_delivery'] },
      createdAt: { $gte: startDate, $lte: endDate }
    }).populate('items.menuItemId', 'name category')

    const itemPerformance = new Map<string, ItemPerformance>()

    // Process views
    viewEvents.forEach(event => {
      const itemId = event._id.toString()
      itemPerformance.set(itemId, {
        itemId,
        name: '',
        category: '',
        totalOrders: 0,
        totalRevenue: 0,
        viewCount: event.viewCount,
        conversionRate: 0,
        trendDirection: 'stable'
      })
    })

    // Process orders
    orders.forEach(order => {
      order.items.forEach((item: any) => {
        const itemId = item.menuItemId._id.toString()
        const existing = itemPerformance.get(itemId) || {
          itemId,
          name: item.name,
          category: item.menuItemId.category || 'Unknown',
          totalOrders: 0,
          totalRevenue: 0,
          viewCount: 0,
          conversionRate: 0,
          trendDirection: 'stable' as const
        }
        
        existing.name = item.name
        existing.category = item.menuItemId.category || 'Unknown'
        existing.totalOrders += item.quantity
        existing.totalRevenue += item.totalPrice
        
        itemPerformance.set(itemId, existing)
      })
    })

    // Calculate conversion rates and trends
    const results = Array.from(itemPerformance.values()).map(item => ({
      ...item,
      conversionRate: item.viewCount > 0 ? (item.totalOrders / item.viewCount) * 100 : 0,
      trendDirection: 'stable' as const // TODO: Calculate based on historical data
    }))

    return results.sort((a, b) => b.totalRevenue - a.totalRevenue)
  }

  async getRevenueMetrics(
    tenantId: string, 
    restaurantId: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<RevenueMetrics> {
    await connectToDatabase()

    const orders = await Order.find({
      tenantId,
      restaurantId,
      status: { $in: ['delivered', 'confirmed', 'preparing', 'ready', 'out_for_delivery'] },
      createdAt: { $gte: startDate, $lte: endDate }
    })

    const totalRevenue = orders.reduce((sum, order) => sum + order.total.total, 0)
    const orderCount = orders.length
    const averageOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0

    // Calculate revenue growth (compare with previous period)
    const periodLength = endDate.getTime() - startDate.getTime()
    const previousStart = new Date(startDate.getTime() - periodLength)
    const previousEnd = startDate

    const previousOrders = await Order.find({
      tenantId,
      restaurantId,
      status: { $in: ['delivered', 'confirmed', 'preparing', 'ready', 'out_for_delivery'] },
      createdAt: { $gte: previousStart, $lte: previousEnd }
    })

    const previousRevenue = previousOrders.reduce((sum, order) => sum + order.total.total, 0)
    const revenueGrowth = previousRevenue > 0 ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 : 0

    // Calculate peak hours
    const hourlyRevenue = new Array(24).fill(0)
    orders.forEach(order => {
      const hour = order.createdAt.getHours()
      hourlyRevenue[hour] += order.total.total
    })

    const peakHours = hourlyRevenue
      .map((revenue, hour) => ({ hour, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)

    // Payment method breakdown
    const paymentMethodBreakdown: Record<string, number> = {}
    orders.forEach(order => {
      paymentMethodBreakdown[order.paymentMethod] = 
        (paymentMethodBreakdown[order.paymentMethod] || 0) + order.total.total
    })

    return {
      totalRevenue,
      revenueGrowth,
      averageOrderValue,
      orderCount,
      peakHours,
      paymentMethodBreakdown
    }
  }

  private calculateConversionFunnel(events: any[]): ConversionFunnel {
    const eventCounts = {
      views: events.filter(e => e.eventType === 'page_view' || e.eventType === 'menu_item_view').length,
      addToCarts: events.filter(e => e.eventType === 'add_to_cart').length,
      checkouts: events.filter(e => e.eventType === 'checkout_start').length,
      payments: events.filter(e => e.eventType === 'payment_success').length
    }

    return {
      views: eventCounts.views,
      addToCarts: eventCounts.addToCarts,
      checkouts: eventCounts.checkouts,
      payments: eventCounts.payments,
      viewToCartRate: eventCounts.views > 0 ? (eventCounts.addToCarts / eventCounts.views) * 100 : 0,
      cartToCheckoutRate: eventCounts.addToCarts > 0 ? (eventCounts.checkouts / eventCounts.addToCarts) * 100 : 0,
      checkoutToPaymentRate: eventCounts.checkouts > 0 ? (eventCounts.payments / eventCounts.checkouts) * 100 : 0,
      overallConversionRate: eventCounts.views > 0 ? (eventCounts.payments / eventCounts.views) * 100 : 0
    }
  }

  private calculateHourlyBreakdown(orders: any[]): HourlyMetrics[] {
    const hourlyData = new Array(24).fill(null).map((_, hour) => ({
      hour,
      orders: 0,
      revenue: 0,
      averageOrderValue: 0
    }))

    orders.forEach(order => {
      const hour = order.createdAt.getHours()
      hourlyData[hour].orders += 1
      hourlyData[hour].revenue += order.total.total
    })

    return hourlyData.map(data => ({
      ...data,
      averageOrderValue: data.orders > 0 ? data.revenue / data.orders : 0
    }))
  }

  private async getCohortAnalysis(
    tenantId: string, 
    restaurantId: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<CohortData[]> {
    // Simplified cohort analysis - track customers by their first order month
    // and their retention in subsequent months
    await connectToDatabase()

    const orders = await Order.find({
      tenantId,
      restaurantId,
      status: 'delivered',
      createdAt: { $gte: startDate, $lte: endDate }
    }).sort({ createdAt: 1 })

    const customerFirstOrder = new Map<string, Date>()
    const monthlyCustomers = new Map<string, Set<string>>()

    orders.forEach(order => {
      const userId = order.userId.toString()
      const orderMonth = `${order.createdAt.getFullYear()}-${String(order.createdAt.getMonth() + 1).padStart(2, '0')}`

      if (!customerFirstOrder.has(userId)) {
        customerFirstOrder.set(userId, order.createdAt)
      }

      if (!monthlyCustomers.has(orderMonth)) {
        monthlyCustomers.set(orderMonth, new Set())
      }
      monthlyCustomers.get(orderMonth)!.add(userId)
    })

    // Calculate retention rates (simplified version)
    const cohorts: CohortData[] = []
    const sortedMonths = Array.from(monthlyCustomers.keys()).sort()

    sortedMonths.forEach(month => {
      const customers = monthlyCustomers.get(month)!
      const retentionRates: number[] = []

      // Calculate retention for next 6 months
      for (let i = 1; i <= 6; i++) {
        const futureDate = new Date(month + '-01')
        futureDate.setMonth(futureDate.getMonth() + i)
        const futureMonth = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}`
        
        const futureCustomers = monthlyCustomers.get(futureMonth) || new Set()
        const retainedCustomers = Array.from(customers).filter(c => futureCustomers.has(c))
        const retentionRate = customers.size > 0 ? (retainedCustomers.length / customers.size) * 100 : 0
        
        retentionRates.push(retentionRate)
      }

      cohorts.push({
        cohortMonth: month,
        customersAcquired: customers.size,
        retentionRates
      })
    })

    return cohorts
  }

  async exportData(
    tenantId: string,
    restaurantId: string,
    type: 'sales' | 'items' | 'customers',
    format: 'csv' | 'excel',
    startDate: Date,
    endDate: Date
  ): Promise<ExportData> {
    await connectToDatabase()

    switch (type) {
      case 'sales':
        return this.exportSalesData(tenantId, restaurantId, startDate, endDate)
      case 'items':
        return this.exportItemsData(tenantId, restaurantId, startDate, endDate)
      case 'customers':
        return this.exportCustomersData(tenantId, restaurantId, startDate, endDate)
      default:
        throw new Error('Invalid export type')
    }
  }

  private async exportSalesData(
    tenantId: string,
    restaurantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ExportData> {
    const orders = await Order.find({
      tenantId,
      restaurantId,
      createdAt: { $gte: startDate, $lte: endDate }
    }).populate('userId', 'name email phone')

    const headers = [
      'Order ID', 'Date', 'Customer Name', 'Customer Email', 'Status',
      'Items Count', 'Subtotal', 'Tax', 'Delivery Fee', 'Total', 'Payment Method'
    ]

    const rows = orders.map(order => [
      order._id.toString(),
      order.createdAt.toISOString().split('T')[0],
      (order.userId as any)?.name || 'Guest',
      (order.userId as any)?.email || '',
      order.status,
      order.items.length,
      order.total.subtotal,
      order.total.tax,
      order.total.deliveryFee,
      order.total.total,
      order.paymentMethod
    ])

    return {
      headers,
      rows,
      filename: `sales-report-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}`
    }
  }

  private async exportItemsData(
    tenantId: string,
    restaurantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ExportData> {
    const itemPerformance = await this.getItemPerformance(tenantId, restaurantId, startDate, endDate)

    const headers = [
      'Item ID', 'Item Name', 'Category', 'Total Orders', 'Total Revenue',
      'View Count', 'Conversion Rate (%)', 'Trend'
    ]

    const rows = itemPerformance.map(item => [
      item.itemId,
      item.name,
      item.category,
      item.totalOrders,
      item.totalRevenue,
      item.viewCount,
      item.conversionRate.toFixed(2),
      item.trendDirection
    ])

    return {
      headers,
      rows,
      filename: `items-report-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}`
    }
  }

  private async exportCustomersData(
    tenantId: string,
    restaurantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ExportData> {
    const orders = await Order.aggregate([
      {
        $match: {
          tenantId,
          restaurantId,
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$userId',
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$total.total' },
          firstOrder: { $min: '$createdAt' },
          lastOrder: { $max: '$createdAt' },
          averageOrderValue: { $avg: '$total.total' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      }
    ])

    const headers = [
      'Customer ID', 'Customer Name', 'Email', 'Total Orders', 'Total Spent',
      'Average Order Value', 'First Order', 'Last Order'
    ]

    const rows = orders.map(customer => [
      customer._id.toString(),
      customer.user[0]?.name || 'Unknown',
      customer.user[0]?.email || '',
      customer.totalOrders,
      customer.totalSpent,
      customer.averageOrderValue.toFixed(2),
      customer.firstOrder.toISOString().split('T')[0],
      customer.lastOrder.toISOString().split('T')[0]
    ])

    return {
      headers,
      rows,
      filename: `customers-report-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}`
    }
  }

  // Aggregate daily metrics for performance (run as scheduled job)
  async aggregateDailyMetrics(tenantId: string, restaurantId: string, date: Date): Promise<void> {
    await connectToDatabase()

    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)
    
    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)

    // Get analytics events for the day
    const events = await AnalyticsEvent.find({
      tenantId,
      restaurantId,
      timestamp: { $gte: startOfDay, $lte: endOfDay }
    })

    // Get orders for the day
    const orders = await Order.find({
      tenantId,
      restaurantId,
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    }).populate('items.menuItemId', 'name')

    // Calculate metrics
    const uniqueVisitors = new Set(events.map(e => e.sessionId)).size
    const totalViews = events.filter(e => e.eventType === 'page_view' || e.eventType === 'menu_item_view').length
    const totalOrders = orders.length
    const totalRevenue = orders.reduce((sum, order) => sum + order.total.total, 0)
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0
    const conversionRate = totalViews > 0 ? (totalOrders / totalViews) * 100 : 0

    // Calculate hourly breakdown
    const hourlyBreakdown = new Array(24).fill(null).map((_, hour) => ({
      hour,
      views: 0,
      orders: 0,
      revenue: 0
    }))

    events.forEach(event => {
      const hour = event.timestamp.getHours()
      if (event.eventType === 'page_view' || event.eventType === 'menu_item_view') {
        hourlyBreakdown[hour].views++
      }
    })

    orders.forEach(order => {
      const hour = order.createdAt.getHours()
      hourlyBreakdown[hour].orders++
      hourlyBreakdown[hour].revenue += order.total.total
    })

    // Calculate device breakdown
    const deviceBreakdown = { mobile: 0, desktop: 0, tablet: 0 }
    events.forEach(event => {
      if (event.metadata?.deviceType) {
        deviceBreakdown[event.metadata.deviceType]++
      }
    })

    // Calculate payment method breakdown
    const paymentMethodBreakdown = { card: 0, upi_intent: 0, upi_collect: 0, wallet: 0, netbanking: 0 }
    orders.forEach(order => {
      if (paymentMethodBreakdown.hasOwnProperty(order.paymentMethod)) {
        paymentMethodBreakdown[order.paymentMethod as keyof typeof paymentMethodBreakdown]++
      }
    })

    // Calculate top items
    const itemStats = new Map()
    events.filter(e => e.eventType === 'menu_item_view' && e.metadata?.menuItemId).forEach(event => {
      const itemId = event.metadata!.menuItemId!
      const existing = itemStats.get(itemId) || { views: 0, orders: 0, revenue: 0, name: '' }
      existing.views++
      itemStats.set(itemId, existing)
    })

    orders.forEach(order => {
      order.items.forEach((item: any) => {
        const itemId = item.menuItemId._id.toString()
        const existing = itemStats.get(itemId) || { views: 0, orders: 0, revenue: 0, name: item.name }
        existing.orders += item.quantity
        existing.revenue += item.totalPrice
        existing.name = item.name
        itemStats.set(itemId, existing)
      })
    })

    const topItems = Array.from(itemStats.entries())
      .map(([itemId, stats]) => ({
        itemId,
        name: stats.name,
        views: stats.views,
        orders: stats.orders,
        revenue: stats.revenue
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)

    // Upsert daily metrics
    await DailyMetrics.findOneAndUpdate(
      { tenantId, restaurantId, date: startOfDay },
      {
        tenantId,
        restaurantId,
        date: startOfDay,
        metrics: {
          totalViews,
          uniqueVisitors,
          totalOrders,
          totalRevenue,
          averageOrderValue,
          conversionRate,
          topItems,
          hourlyBreakdown,
          deviceBreakdown,
          paymentMethodBreakdown
        }
      },
      { upsert: true, new: true }
    )
  }
}

export const analyticsService = new AnalyticsService()
