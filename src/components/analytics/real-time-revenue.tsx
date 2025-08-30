'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Activity,
  Clock
} from 'lucide-react'

interface RealtimeRevenueProps {
  restaurantId: string
}

interface RevenueUpdate {
  timestamp: Date
  amount: number
  orderCount: number
  averageOrderValue: number
}

interface DailyStats {
  totalRevenue: number
  totalOrders: number
  averageOrderValue: number
  hourlyRevenue: number[]
  lastUpdate: Date
}

export function RealtimeRevenue({ restaurantId }: RealtimeRevenueProps) {
  const [dailyStats, setDailyStats] = useState<DailyStats>({
    totalRevenue: 0,
    totalOrders: 0,
    averageOrderValue: 0,
    hourlyRevenue: new Array(24).fill(0),
    lastUpdate: new Date()
  })
  const [recentUpdates, setRecentUpdates] = useState<RevenueUpdate[]>([])
  const [isLive, setIsLive] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Initialize with current day's data
    fetchInitialData()
    
    // Set up real-time updates (WebSocket simulation with polling)
    startRealtimeUpdates()

    return () => {
      stopRealtimeUpdates()
    }
  }, [restaurantId])

  const fetchInitialData = async () => {
    try {
      const today = new Date()
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      
      const response = await fetch(
        `/api/analytics/revenue?restaurantId=${restaurantId}&startDate=${startOfDay.toISOString()}&endDate=${today.toISOString()}`
      )
      
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setDailyStats({
            totalRevenue: result.data.totalRevenue,
            totalOrders: result.data.orderCount,
            averageOrderValue: result.data.averageOrderValue,
            hourlyRevenue: result.data.peakHours.reduce((acc: number[], hour: any) => {
              acc[hour.hour] = hour.revenue
              return acc
            }, new Array(24).fill(0)),
            lastUpdate: new Date()
          })
        }
      }
    } catch (error) {
      console.error('Failed to fetch initial revenue data:', error)
    }
  }

  const startRealtimeUpdates = () => {
    setIsLive(true)
    
    // In a real implementation, you would use WebSocket
    // For now, we'll simulate with polling
    intervalRef.current = setInterval(async () => {
      try {
        // Simulate checking for new orders
        const response = await fetch(`/api/orders/stats?restaurantId=${restaurantId}&live=true`)
        
        if (response.ok) {
          const result = await response.json()
          if (result.success && result.data.hasNewOrders) {
            // Simulate a new order
            const newRevenue = Math.floor(Math.random() * 500) + 200 // ₹200-700
            const currentHour = new Date().getHours()
            
            setDailyStats(prev => ({
              ...prev,
              totalRevenue: prev.totalRevenue + newRevenue,
              totalOrders: prev.totalOrders + 1,
              averageOrderValue: (prev.totalRevenue + newRevenue) / (prev.totalOrders + 1),
              hourlyRevenue: prev.hourlyRevenue.map((revenue, hour) => 
                hour === currentHour ? revenue + newRevenue : revenue
              ),
              lastUpdate: new Date()
            }))

            // Add to recent updates
            const update: RevenueUpdate = {
              timestamp: new Date(),
              amount: newRevenue,
              orderCount: 1,
              averageOrderValue: newRevenue
            }

            setRecentUpdates(prev => [update, ...prev.slice(0, 9)]) // Keep last 10 updates
          }
        }
      } catch (error) {
        console.error('Failed to fetch live updates:', error)
      }
    }, 5000) // Check every 5 seconds
  }

  const stopRealtimeUpdates = () => {
    setIsLive(false)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }

  const formatCurrency = (amount: number) => `₹${amount.toLocaleString()}`
  const formatTime = (date: Date) => date.toLocaleTimeString('en-IN', { 
    hour: '2-digit', 
    minute: '2-digit' 
  })

  const getCurrentHourRevenue = () => {
    const currentHour = new Date().getHours()
    return dailyStats.hourlyRevenue[currentHour] || 0
  }

  const getPreviousHourRevenue = () => {
    const previousHour = new Date().getHours() - 1
    return dailyStats.hourlyRevenue[previousHour >= 0 ? previousHour : 23] || 0
  }

  const getHourlyGrowth = () => {
    const current = getCurrentHourRevenue()
    const previous = getPreviousHourRevenue()
    if (previous === 0) return 0
    return ((current - previous) / previous) * 100
  }

  return (
    <div className="space-y-6">
      {/* Live Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
          <span className="text-sm font-medium">
            {isLive ? 'Live Updates' : 'Offline'}
          </span>
          <Badge variant="outline" className="text-xs">
            Last updated: {formatTime(dailyStats.lastUpdate)}
          </Badge>
        </div>
        
        <button
          onClick={isLive ? stopRealtimeUpdates : startRealtimeUpdates}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          {isLive ? 'Stop Live Updates' : 'Start Live Updates'}
        </button>
      </div>

      {/* Today's Revenue Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(dailyStats.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              {dailyStats.totalOrders} orders completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Hour</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(getCurrentHourRevenue())}</div>
            <div className="flex items-center gap-1 text-xs">
              {getHourlyGrowth() >= 0 ? (
                <TrendingUp className="h-3 w-3 text-green-600" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-600" />
              )}
              <span className={getHourlyGrowth() >= 0 ? 'text-green-600' : 'text-red-600'}>
                {Math.abs(getHourlyGrowth()).toFixed(1)}% vs last hour
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(dailyStats.averageOrderValue)}</div>
            <p className="text-xs text-muted-foreground">
              Per order today
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Hourly Revenue Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Hourly Revenue Today
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>12 AM</span>
              <span>6 AM</span>
              <span>12 PM</span>
              <span>6 PM</span>
              <span>11 PM</span>
            </div>
            
            <div className="flex items-end justify-between h-32 gap-1">
              {dailyStats.hourlyRevenue.map((revenue, hour) => {
                const maxRevenue = Math.max(...dailyStats.hourlyRevenue)
                const height = maxRevenue > 0 ? (revenue / maxRevenue) * 100 : 0
                const isCurrentHour = hour === new Date().getHours()
                
                return (
                  <div
                    key={hour}
                    className="flex-1 flex flex-col items-center"
                  >
                    <div
                      className={`w-full rounded-t transition-all duration-300 ${
                        isCurrentHour 
                          ? 'bg-blue-500 animate-pulse' 
                          : revenue > 0 
                            ? 'bg-blue-400' 
                            : 'bg-gray-200'
                      }`}
                      style={{ height: `${height}%` }}
                      title={`${hour}:00 - ${formatCurrency(revenue)}`}
                    />
                  </div>
                )
              })}
            </div>
            
            <div className="flex justify-between text-xs text-muted-foreground">
              {[0, 6, 12, 18, 23].map(hour => (
                <span key={hour}>{formatCurrency(dailyStats.hourlyRevenue[hour])}</span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Updates */}
      {recentUpdates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentUpdates.map((update, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between p-3 rounded-lg transition-all duration-300 ${
                    index === 0 ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      index === 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                    }`} />
                    <div>
                      <div className="font-medium">{formatCurrency(update.amount)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatTime(update.timestamp)}
                      </div>
                    </div>
                  </div>
                  
                  <Badge variant={index === 0 ? "default" : "secondary"} className="text-xs">
                    New Order
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}