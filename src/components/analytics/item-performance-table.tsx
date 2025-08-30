'use client'

import { useState } from 'react'
import { ItemPerformance } from '@/lib/services/analytics-service'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Eye, 
  ShoppingCart,
  DollarSign,
  ArrowUpDown
} from 'lucide-react'

interface ItemPerformanceTableProps {
  data: ItemPerformance[]
  showActions?: boolean
}

type SortField = 'name' | 'totalOrders' | 'totalRevenue' | 'viewCount' | 'conversionRate'
type SortDirection = 'asc' | 'desc'

export function ItemPerformanceTable({ data, showActions = false }: ItemPerformanceTableProps) {
  const [sortField, setSortField] = useState<SortField>('totalRevenue')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const sortedData = [...data].sort((a, b) => {
    let aValue = a[sortField]
    let bValue = b[sortField]
    
    if (typeof aValue === 'string') {
      aValue = aValue.toLowerCase()
      bValue = (bValue as string).toLowerCase()
    }
    
    if (sortDirection === 'asc') {
      return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
    } else {
      return aValue > bValue ? -1 : aValue < bValue ? 1 : 0
    }
  })

  const paginatedData = sortedData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const totalPages = Math.ceil(sortedData.length / itemsPerPage)

  const getTrendIcon = (direction: 'up' | 'down' | 'stable') => {
    switch (direction) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-500" />
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-500" />
      default:
        return <Minus className="h-4 w-4 text-gray-400" />
    }
  }

  const SortButton = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 hover:text-primary transition-colors"
    >
      {children}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  )

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No item performance data available
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3 font-medium">
                <SortButton field="name">Item Name</SortButton>
              </th>
              <th className="text-left p-3 font-medium">Category</th>
              <th className="text-right p-3 font-medium">
                <SortButton field="viewCount">
                  <Eye className="h-4 w-4" />
                  Views
                </SortButton>
              </th>
              <th className="text-right p-3 font-medium">
                <SortButton field="totalOrders">
                  <ShoppingCart className="h-4 w-4" />
                  Orders
                </SortButton>
              </th>
              <th className="text-right p-3 font-medium">
                <SortButton field="totalRevenue">
                  <DollarSign className="h-4 w-4" />
                  Revenue
                </SortButton>
              </th>
              <th className="text-right p-3 font-medium">
                <SortButton field="conversionRate">Conversion</SortButton>
              </th>
              <th className="text-center p-3 font-medium">Trend</th>
              {showActions && <th className="text-center p-3 font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((item, index) => (
              <tr key={item.itemId} className="border-b hover:bg-gray-50">
                <td className="p-3">
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">ID: {item.itemId.slice(-8)}</div>
                </td>
                <td className="p-3">
                  <Badge variant="secondary" className="text-xs">
                    {item.category}
                  </Badge>
                </td>
                <td className="p-3 text-right">
                  <div className="font-medium">{item.viewCount.toLocaleString()}</div>
                </td>
                <td className="p-3 text-right">
                  <div className="font-medium">{item.totalOrders.toLocaleString()}</div>
                </td>
                <td className="p-3 text-right">
                  <div className="font-medium">₹{item.totalRevenue.toLocaleString()}</div>
                </td>
                <td className="p-3 text-right">
                  <div className="font-medium">
                    {item.conversionRate.toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.viewCount > 0 ? `${item.totalOrders}/${item.viewCount}` : 'N/A'}
                  </div>
                </td>
                <td className="p-3 text-center">
                  {getTrendIcon(item.trendDirection)}
                </td>
                {showActions && (
                  <td className="p-3 text-center">
                    <Button variant="ghost" size="sm">
                      View Details
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
            {Math.min(currentPage * itemsPerPage, sortedData.length)} of{' '}
            {sortedData.length} items
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = i + 1
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    className="w-8 h-8 p-0"
                  >
                    {pageNum}
                  </Button>
                )
              })}
              {totalPages > 5 && (
                <>
                  <span className="text-muted-foreground">...</span>
                  <Button
                    variant={currentPage === totalPages ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(totalPages)}
                    className="w-8 h-8 p-0"
                  >
                    {totalPages}
                  </Button>
                </>
              )}
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
        <div className="text-center">
          <div className="text-lg font-semibold">
            {data.reduce((sum, item) => sum + item.viewCount, 0).toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">Total Views</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold">
            {data.reduce((sum, item) => sum + item.totalOrders, 0).toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">Total Orders</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold">
            ₹{data.reduce((sum, item) => sum + item.totalRevenue, 0).toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">Total Revenue</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold">
            {data.length > 0 
              ? (data.reduce((sum, item) => sum + item.conversionRate, 0) / data.length).toFixed(1)
              : 0}%
          </div>
          <div className="text-xs text-muted-foreground">Avg Conversion</div>
        </div>
      </div>
    </div>
  )
}