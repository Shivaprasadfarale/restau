# Analytics and Reporting System

## Overview

The Analytics and Reporting System provides comprehensive insights into restaurant performance through data collection, analysis, and visualization. It includes real-time revenue tracking, conversion funnel analysis, item performance metrics, and automated email reports.

## Features

### 1. Analytics Data Collection
- **Privacy-First**: IP addresses are hashed, PII is minimized
- **Tenant Scoping**: All data is isolated by tenant/restaurant
- **Event Tracking**: Page views, menu interactions, cart actions, payments
- **Device Detection**: Automatic mobile/desktop/tablet classification
- **Session Management**: Anonymous session tracking with UUID

### 2. Sales Dashboard
- **Cohort Analysis**: Customer retention by acquisition month
- **Funnel Metrics**: View → Add to Cart → Checkout → Payment conversion rates
- **Time-of-Day Patterns**: Hourly revenue and order breakdowns
- **Growth Metrics**: Period-over-period revenue growth calculations
- **Payment Method Analysis**: Breakdown by UPI, cards, wallets, etc.

### 3. Item Performance Tracking
- **Top Items**: Best sellers by revenue and popularity
- **Popularity Trends**: View counts and conversion rates per item
- **Category Performance**: Analytics grouped by menu categories
- **Trend Direction**: Up/down/stable indicators for each item

### 4. Real-Time Revenue Tracking
- **Live Updates**: WebSocket-based real-time order notifications
- **Hourly Breakdown**: Current day revenue by hour with growth indicators
- **Recent Orders**: Live feed of new orders with amounts
- **Daily Totals**: Running totals for revenue, orders, and AOV

### 5. Scheduled Email Reports
- **Automated Reports**: Daily, weekly, monthly report generation
- **Multiple Recipients**: Send to owners, managers, and staff
- **Rich HTML Format**: Professional email templates with charts
- **Export Options**: CSV and Excel export functionality

## Architecture

### Data Models

#### AnalyticsEvent
```typescript
interface AnalyticsEvent {
  eventType: 'page_view' | 'menu_item_view' | 'add_to_cart' | 'remove_from_cart' | 'checkout_start' | 'payment_success' | 'payment_failed' | 'order_placed'
  userId?: string // Optional for anonymous tracking
  sessionId: string // Anonymous session ID
  restaurantId: string
  metadata: {
    menuItemId?: string
    categoryId?: string
    orderValue?: number
    paymentMethod?: string
    deviceType?: 'mobile' | 'desktop' | 'tablet'
    userAgent?: string
    referrer?: string
    timeOnPage?: number
  }
  timestamp: Date
  ipHash?: string // Hashed IP for privacy
}
```

#### DailyMetrics
```typescript
interface DailyMetrics {
  restaurantId: string
  date: Date
  metrics: {
    totalViews: number
    uniqueVisitors: number
    totalOrders: number
    totalRevenue: number
    averageOrderValue: number
    conversionRate: number
    topItems: Array<{
      itemId: string
      name: string
      views: number
      orders: number
      revenue: number
    }>
    hourlyBreakdown: Array<{
      hour: number
      views: number
      orders: number
      revenue: number
    }>
    deviceBreakdown: {
      mobile: number
      desktop: number
      tablet: number
    }
    paymentMethodBreakdown: {
      card: number
      upi_intent: number
      upi_collect: number
      wallet: number
      netbanking: number
    }
  }
}
```

### API Endpoints

#### Analytics Tracking
- `POST /api/analytics/track` - Track user events
- `POST /api/analytics/aggregate` - Aggregate daily metrics (cron job)

#### Analytics Retrieval
- `GET /api/analytics/sales` - Get sales analytics with filters
- `GET /api/analytics/items` - Get item performance metrics
- `GET /api/analytics/revenue` - Get revenue metrics with growth
- `GET /api/analytics/export` - Export data in CSV/Excel format

#### Email Reports
- `POST /api/analytics/reports/schedule` - Schedule/send email reports
- `GET /api/analytics/reports/schedule` - Get report recipients

### Client-Side Integration

#### Analytics Hook
```typescript
import { useAnalytics } from '@/lib/hooks/use-analytics'

function MenuPage() {
  const { trackMenuItemView, trackAddToCart } = useAnalytics({
    restaurantId: 'restaurant-123',
    userId: 'user-456', // Optional
    enableAutoTracking: true
  })

  const handleItemView = (itemId: string) => {
    trackMenuItemView(itemId, 'main-course')
  }

  const handleAddToCart = (itemId: string, price: number) => {
    trackAddToCart(itemId, price)
  }

  // Auto-tracks page views and time on page
  return <div>...</div>
}
```

#### Manual Event Tracking
```typescript
// Track custom events
trackEvent({
  eventType: 'checkout_start',
  restaurantId: 'restaurant-123',
  metadata: {
    orderValue: 1500,
    paymentMethod: 'upi_intent'
  }
})
```

## Privacy and Security

### Data Minimization
- IP addresses are hashed with salt before storage
- User agents are truncated to remove identifying information
- Session IDs are anonymous UUIDs, not tied to user accounts
- PII is never stored in analytics events

### Tenant Isolation
- All analytics data is scoped by `tenantId`
- Database queries include tenant filtering
- API endpoints verify tenant access permissions

### Data Retention
- Analytics events have TTL of 90 days (configurable)
- Daily metrics are retained longer for historical analysis
- Aggregated data removes individual user traces

## Performance Optimizations

### Database Indexes
```javascript
// Analytics Events
{ tenantId: 1, restaurantId: 1, eventType: 1, timestamp: -1 }
{ tenantId: 1, restaurantId: 1, timestamp: -1 }
{ tenantId: 1, sessionId: 1, timestamp: -1 }
{ tenantId: 1, 'metadata.menuItemId': 1, eventType: 1 }

// Daily Metrics
{ tenantId: 1, restaurantId: 1, date: 1 } // unique
```

### Caching Strategy
- Redis caching for frequently accessed metrics
- ISR (Incremental Static Regeneration) for dashboard pages
- Tag-based cache invalidation on data updates

### Aggregation Jobs
- Daily metrics aggregation runs via cron job
- Reduces real-time query load on analytics endpoints
- Pre-calculated metrics for faster dashboard loading

## Configuration

### Environment Variables
```bash
# Analytics Configuration
ANALYTICS_SALT=your_analytics_salt_for_ip_hashing
ANALYTICS_CRON_SECRET=your_cron_job_secret_for_aggregation
REPORTS_EMAIL_FROM=reports@yourrestaurant.com

# Email Service (choose one)
SENDGRID_API_KEY=your_sendgrid_api_key
# or
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

### Scheduled Jobs
Set up cron jobs for automated tasks:

```bash
# Daily metrics aggregation (runs at 1 AM)
0 1 * * * curl -X POST https://yourapp.com/api/analytics/aggregate \
  -H "Content-Type: application/json" \
  -d '{"tenantId":"tenant-123","restaurantId":"restaurant-456","secret":"your_cron_secret"}'

# Weekly email reports (runs Sunday at 9 AM)
0 9 * * 0 curl -X POST https://yourapp.com/api/analytics/reports/schedule \
  -H "Content-Type: application/json" \
  -d '{"frequency":"weekly","reportTypes":["sales","items"],"recipients":["owner@restaurant.com"]}'
```

## Usage Examples

### Dashboard Integration
```typescript
import { AnalyticsDashboard } from '@/components/analytics/analytics-dashboard'

function AdminAnalyticsPage() {
  return (
    <AnalyticsDashboard restaurantId="restaurant-123" />
  )
}
```

### Real-Time Revenue
```typescript
import { RealtimeRevenue } from '@/components/analytics/real-time-revenue'

function DashboardPage() {
  return (
    <div>
      <RealtimeRevenue restaurantId="restaurant-123" />
    </div>
  )
}
```

### Export Data
```typescript
const exportSalesData = async () => {
  const response = await fetch('/api/analytics/export?type=sales&format=csv&startDate=2024-01-01&endDate=2024-01-31&restaurantId=restaurant-123')
  const blob = await response.blob()
  
  // Download CSV file
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'sales-report.csv'
  a.click()
}
```

## Testing

### Unit Tests
```bash
npm run test -- src/test/analytics-basic.test.ts --run
```

### Integration Tests
```bash
npm run test -- src/test/analytics-system.test.ts --run
```

### Manual Testing
1. Navigate to `/admin/analytics`
2. Verify dashboard loads with sample data
3. Test real-time updates by placing orders
4. Export data in different formats
5. Schedule email reports

## Monitoring and Alerts

### Key Metrics to Monitor
- Analytics event ingestion rate
- Dashboard query performance
- Email report delivery success rate
- Data aggregation job completion

### Error Handling
- Analytics failures are logged but don't break user flows
- Graceful degradation when analytics service is unavailable
- Retry logic for failed email reports
- Dead letter queues for failed events

## Future Enhancements

### Advanced Analytics
- Customer lifetime value calculations
- Predictive analytics for demand forecasting
- A/B testing framework for menu optimization
- Geographic analysis of orders

### Enhanced Reporting
- Custom report builder interface
- Automated insights and recommendations
- Integration with business intelligence tools
- Mobile app for analytics on-the-go

### Performance Improvements
- Stream processing for real-time analytics
- Data warehouse integration for historical analysis
- Machine learning for trend prediction
- Advanced caching strategies