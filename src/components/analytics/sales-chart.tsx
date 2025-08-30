'use client'

import { useMemo } from 'react'
import { HourlyMetrics } from '@/lib/services/analytics-service'

interface SalesChartProps {
  data: HourlyMetrics[]
}

export function SalesChart({ data }: SalesChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return []
    
    const maxRevenue = Math.max(...data.map(d => d.revenue))
    const maxOrders = Math.max(...data.map(d => d.orders))
    
    return data.map(item => ({
      ...item,
      revenuePercentage: maxRevenue > 0 ? (item.revenue / maxRevenue) * 100 : 0,
      ordersPercentage: maxOrders > 0 ? (item.orders / maxOrders) * 100 : 0
    }))
  }, [data])

  const formatHour = (hour: number) => {
    const period = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
    return `${displayHour}${period}`
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No data available for the selected period
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Chart Legend */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded"></div>
          <span>Revenue</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded"></div>
          <span>Orders</span>
        </div>
      </div>

      {/* Chart */}
      <div className="relative h-64 bg-gray-50 rounded-lg p-4">
        <div className="flex items-end justify-between h-full gap-1">
          {chartData.map((item, index) => (
            <div key={item.hour} className="flex flex-col items-center flex-1 h-full">
              {/* Bars */}
              <div className="flex items-end justify-center gap-1 h-full w-full max-w-12">
                {/* Revenue Bar */}
                <div className="relative flex-1 bg-gray-200 rounded-t">
                  <div
                    className="bg-blue-500 rounded-t transition-all duration-300 hover:bg-blue-600"
                    style={{ height: `${item.revenuePercentage}%` }}
                    title={`Revenue: ₹${item.revenue.toLocaleString()}`}
                  ></div>
                </div>
                
                {/* Orders Bar */}
                <div className="relative flex-1 bg-gray-200 rounded-t">
                  <div
                    className="bg-green-500 rounded-t transition-all duration-300 hover:bg-green-600"
                    style={{ height: `${item.ordersPercentage}%` }}
                    title={`Orders: ${item.orders}`}
                  ></div>
                </div>
              </div>
              
              {/* Hour Label */}
              <div className="text-xs text-muted-foreground mt-2 transform -rotate-45 origin-center">
                {formatHour(item.hour)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="text-center">
          <div className="font-semibold">Peak Hour</div>
          <div className="text-muted-foreground">
            {formatHour(chartData.reduce((max, item) => 
              item.revenue > chartData[max].revenue ? chartData.indexOf(item) : max, 0
            ))}
          </div>
        </div>
        <div className="text-center">
          <div className="font-semibold">Total Revenue</div>
          <div className="text-muted-foreground">
            ₹{data.reduce((sum, item) => sum + item.revenue, 0).toLocaleString()}
          </div>
        </div>
        <div className="text-center">
          <div className="font-semibold">Total Orders</div>
          <div className="text-muted-foreground">
            {data.reduce((sum, item) => sum + item.orders, 0)}
          </div>
        </div>
      </div>
    </div>
  )
}