'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  ShoppingCart, 
  Users, 
  Eye,
  Download,
  Calendar,
  BarChart3,
  PieChart,
  Activity
} from 'lucide-react'
import { SalesChart } from './sales-chart'
import { ConversionFunnelChart } from './conversion-funnel-chart'
import { ItemPerformanceTable } from './item-performance-table'
import { RevenueMetricsCards } from './revenue-metrics-cards'
import { CohortAnalysisChart } from './cohort-analysis-chart'
import { RealtimeRevenue } from './real-time-revenue'

interface AnalyticsDashboardProps {
  restaurantId: string
}

export function AnalyticsDashboard({ restaurantId }: AnalyticsDashboardProps) {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  })
  const [salesData, setSalesData] = useState<any>(null)
  const [revenueData, setRevenueData] = useState<any>(null)
  const [itemData, setItemData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'realtime' | 'sales' | 'items' | 'customers'>('overview')

  useEffect(() => {
    fetchAnalyticsData()
  }, [period, dateRange, restaurantId])

  const fetchAnalyticsData = async () => {
    setLoading(true)
    try {
      const [salesResponse, revenueResponse, itemsResponse] = await Promise.all([
        fetch(`/api/analytics/sales?period=${period}&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&restaurantId=${restaurantId}`),
        fetch(`/api/analytics/revenue?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&restaurantId=${restaurantId}`),
        fetch(`/api/analytics/items?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&restaurantId=${restaurantId}&limit=20`)
      ])

      const [salesResult, revenueResult, itemsResult] = await Promise.all([
        salesResponse.json(),
        revenueResponse.json(),
        itemsResponse.json()
      ])

      if (salesResult.success) setSalesData(salesResult.data)
      if (revenueResult.success) setRevenueData(revenueResult.data)
      if (itemsResult.success) setItemData(itemsResult.data)
    } catch (error) {
      console.error('Failed to fetch analytics data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async (type: 'sales' | 'items' | 'customers', format: 'csv' | 'excel') => {
    try {
      const response = await fetch(
        `/api/analytics/export?type=${type}&format=${format}&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&restaurantId=${restaurantId}`
      )

      if (format === 'csv') {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${type}-report-${dateRange.startDate}-to-${dateRange.endDate}.csv`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        const result = await response.json()
        if (result.success) {
          // Convert to Excel format (simplified - in production use a proper Excel library)
          console.log('Excel export data:', result.data)
          alert('Excel export functionality would be implemented with a proper Excel library')
        }
      }
    } catch (error) {
      console.error('Export failed:', error)
      alert('Export failed. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Track your restaurant's performance and insights
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex gap-2">
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
              className="px-3 py-2 border rounded-md text-sm"
            />
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
              className="px-3 py-2 border rounded-md text-sm"
            />
          </div>
          
          <Select value={period} onValueChange={(value: any) => setPeriod(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-muted p-1 rounded-lg w-fit">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3 },
          { id: 'realtime', label: 'Real-time', icon: Activity },
          { id: 'sales', label: 'Sales', icon: DollarSign },
          { id: 'items', label: 'Items', icon: ShoppingCart },
          { id: 'customers', label: 'Customers', icon: Users }
        ].map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab(tab.id as any)}
            className="flex items-center gap-2"
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Real-time Tab */}
      {activeTab === 'realtime' && (
        <div className="space-y-6">
          <RealtimeRevenue restaurantId={restaurantId} />
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Revenue Metrics Cards */}
          {revenueData && <RevenueMetricsCards data={revenueData} />}
          
          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {salesData && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Sales Trend
                  </CardTitle>
                  <CardDescription>
                    Revenue and order trends over time
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SalesChart data={salesData.hourlyBreakdown} />
                </CardContent>
              </Card>
            )}
            
            {salesData && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChart className="h-5 w-5" />
                    Conversion Funnel
                  </CardTitle>
                  <CardDescription>
                    Customer journey from view to purchase
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ConversionFunnelChart data={salesData.conversionFunnel} />
                </CardContent>
              </Card>
            )}
          </div>

          {/* Top Items */}
          {itemData && (
            <Card>
              <CardHeader>
                <CardTitle>Top Performing Items</CardTitle>
                <CardDescription>
                  Best selling items by revenue and popularity
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ItemPerformanceTable 
                  data={itemData.items.slice(0, 10)} 
                  showActions={false}
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Sales Tab */}
      {activeTab === 'sales' && salesData && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Sales Analytics</h2>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleExport('sales', 'csv')}
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleExport('sales', 'excel')}
              >
                <Download className="h-4 w-4 mr-2" />
                Export Excel
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">₹{salesData.totalSales.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {salesData.orderCount} orders
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Average Order Value</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">₹{salesData.averageOrderValue.toFixed(0)}</div>
                <p className="text-xs text-muted-foreground">
                  Per order
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {salesData.conversionFunnel.overallConversionRate.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  View to purchase
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Hourly Sales Pattern</CardTitle>
              </CardHeader>
              <CardContent>
                <SalesChart data={salesData.hourlyBreakdown} />
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Cohort Analysis</CardTitle>
                <CardDescription>Customer retention by acquisition month</CardDescription>
              </CardHeader>
              <CardContent>
                <CohortAnalysisChart data={salesData.cohortAnalysis} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Items Tab */}
      {activeTab === 'items' && itemData && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Item Performance</h2>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleExport('items', 'csv')}
            >
              <Download className="h-4 w-4 mr-2" />
              Export Items Data
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>All Items Performance</CardTitle>
              <CardDescription>
                Detailed performance metrics for all menu items
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ItemPerformanceTable data={itemData.items} showActions={true} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Customers Tab */}
      {activeTab === 'customers' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Customer Analytics</h2>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleExport('customers', 'csv')}
            >
              <Download className="h-4 w-4 mr-2" />
              Export Customer Data
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Customer Acquisition</CardTitle>
                <CardDescription>New customers over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  Customer acquisition chart would be implemented here
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Customer Lifetime Value</CardTitle>
                <CardDescription>Average value per customer</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  CLV metrics would be implemented here
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}