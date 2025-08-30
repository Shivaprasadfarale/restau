'use client'

import { useAdminAuth } from '@/lib/admin-auth-context'
import { AnalyticsDashboard } from '@/components/analytics/analytics-dashboard'

export default function AnalyticsPage() {
  const { user } = useAdminAuth()

  // Default restaurant ID - in a real app, this would come from user context or URL params
  const restaurantId = user?.restaurantId || 'default-restaurant-id'

  return (
    <div className="container mx-auto py-6">
      <AnalyticsDashboard restaurantId={restaurantId} />
    </div>
  )
}