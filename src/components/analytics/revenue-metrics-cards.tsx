'use client'

import { RevenueMetrics } from '@/lib/services/analytics-service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  ShoppingCart, 
  Clock,
  CreditCard
} from 'lucide-react'

interface RevenueMetricsCardsProps {
  data: RevenueMetrics
}

export function RevenueMetricsCards({ data }: RevenueMetricsCardsProps) {
  const formatCurrency = (amount: number) => `₹${amount.toLocaleString()}`
  
  const getGrowthColor = (growth: number) => {
    if (growth > 0) return 'text-green-600'
    if (growth < 0) return 'text-red-600'
    return 'text-gray-600'
  }

  const getGrowthIcon = (growth: number) => {
    if (growth > 0) return <TrendingUp className="h-4 w-4" />
    if (growth < 0) return <TrendingDown className="h-4 w-4" />
    return null
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Revenue */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(data.totalRevenue)}</div>
          <div className={`flex items-center gap-1 text-xs ${getGrowthColor(data.revenueGrowth)}`}>
            {getGrowthIcon(data.revenueGrowth)}
            <span>
              {data.revenueGrowth > 0 ? '+' : ''}{data.revenueGrowth.toFixed(1)}% from last period
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Average Order Value */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Average Order Value</CardTitle>
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(data.averageOrderValue)}</div>
          <p className="text-xs text-muted-foreground">
            {data.orderCount} total orders
          </p>
        </CardContent>
      </Card>

      {/* Peak Revenue Hour */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Peak Revenue Hour</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {data.peakHours.length > 0 
              ? `${data.peakHours[0].hour}:00`
              : 'N/A'
            }
          </div>
          <p className="text-xs text-muted-foreground">
            {data.peakHours.length > 0 
              ? formatCurrency(data.peakHours[0].revenue)
              : 'No data'
            }
          </p>
        </CardContent>
      </Card>

      {/* Top Payment Method */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Top Payment Method</CardTitle>
          <CreditCard className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Object.entries(data.paymentMethodBreakdown)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 1)
              .map(([method, amount]) => (
                <div key={method}>
                  <div className="text-lg font-bold capitalize">
                    {method.replace('_', ' ')}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(amount)}
                  </p>
                </div>
              ))
            }
          </div>
        </CardContent>
      </Card>

      {/* Payment Methods Breakdown */}
      <Card className="md:col-span-2 lg:col-span-4">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Payment Methods Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(data.paymentMethodBreakdown)
              .sort(([,a], [,b]) => b - a)
              .map(([method, amount]) => {
                const percentage = data.totalRevenue > 0 
                  ? (amount / data.totalRevenue) * 100 
                  : 0
                
                return (
                  <div key={method} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="capitalize">
                        {method.replace('_', ' ')}
                      </Badge>
                      <div className="flex-1 bg-gray-200 rounded-full h-2 min-w-[100px]">
                        <div
                          className="bg-primary h-2 rounded-full transition-all duration-300"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatCurrency(amount)}</div>
                      <div className="text-xs text-muted-foreground">
                        {percentage.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                )
              })
            }
          </div>
        </CardContent>
      </Card>

      {/* Peak Hours */}
      <Card className="md:col-span-2 lg:col-span-4">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Top Revenue Hours</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {data.peakHours.slice(0, 5).map((hour, index) => (
              <div key={hour.hour} className="text-center">
                <div className="text-lg font-bold">
                  {hour.hour}:00
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatCurrency(hour.revenue)}
                </div>
                <Badge 
                  variant={index === 0 ? "default" : "secondary"}
                  className="text-xs mt-1"
                >
                  #{index + 1}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}