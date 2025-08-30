import { analyticsService } from './analytics-service'
import { connectToDatabase } from '@/lib/mongodb'
import { User } from '@/models/User'

interface EmailReportConfig {
  tenantId: string
  restaurantId: string
  recipients: string[]
  frequency: 'daily' | 'weekly' | 'monthly'
  reportTypes: ('sales' | 'items' | 'customers')[]
  timezone: string
}

interface ReportData {
  period: string
  salesSummary: {
    totalRevenue: number
    totalOrders: number
    averageOrderValue: number
    revenueGrowth: number
  }
  topItems: Array<{
    name: string
    orders: number
    revenue: number
  }>
  customerMetrics: {
    newCustomers: number
    returningCustomers: number
    retentionRate: number
  }
  peakHours: Array<{
    hour: number
    revenue: number
  }>
}

class EmailReportService {
  async generateReport(config: EmailReportConfig): Promise<ReportData> {
    await connectToDatabase()

    const now = new Date()
    let startDate: Date
    let endDate = now

    // Calculate date range based on frequency
    switch (config.frequency) {
      case 'daily':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        break
      case 'weekly':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
        break
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    }

    // Get analytics data
    const [salesAnalytics, revenueMetrics, itemPerformance] = await Promise.all([
      analyticsService.getSalesAnalytics(
        config.tenantId,
        config.restaurantId,
        config.frequency === 'monthly' ? 'monthly' : 'daily',
        startDate,
        endDate
      ),
      analyticsService.getRevenueMetrics(
        config.tenantId,
        config.restaurantId,
        startDate,
        endDate
      ),
      analyticsService.getItemPerformance(
        config.tenantId,
        config.restaurantId,
        startDate,
        endDate
      )
    ])

    // Calculate customer metrics (simplified)
    const totalCustomers = salesAnalytics.orderCount // Simplified - should be unique customers
    const newCustomers = Math.floor(totalCustomers * 0.3) // Estimated 30% new customers
    const returningCustomers = totalCustomers - newCustomers
    const retentionRate = totalCustomers > 0 ? (returningCustomers / totalCustomers) * 100 : 0

    return {
      period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
      salesSummary: {
        totalRevenue: salesAnalytics.totalSales,
        totalOrders: salesAnalytics.orderCount,
        averageOrderValue: salesAnalytics.averageOrderValue,
        revenueGrowth: revenueMetrics.revenueGrowth
      },
      topItems: itemPerformance.slice(0, 5).map(item => ({
        name: item.name,
        orders: item.totalOrders,
        revenue: item.totalRevenue
      })),
      customerMetrics: {
        newCustomers,
        returningCustomers,
        retentionRate
      },
      peakHours: revenueMetrics.peakHours.slice(0, 3)
    }
  }

  generateEmailHTML(reportData: ReportData, config: EmailReportConfig): string {
    const formatCurrency = (amount: number) => `₹${amount.toLocaleString()}`
    const formatPercentage = (value: number) => `${value.toFixed(1)}%`

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Restaurant Analytics Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
        }
        .container {
            background: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            border-bottom: 2px solid #e9ecef;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #2c3e50;
            margin: 0;
            font-size: 28px;
        }
        .period {
            color: #6c757d;
            font-size: 14px;
            margin-top: 5px;
        }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            margin-bottom: 30px;
        }
        .metric-card {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 6px;
            text-align: center;
        }
        .metric-value {
            font-size: 24px;
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 5px;
        }
        .metric-label {
            font-size: 12px;
            color: #6c757d;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .growth {
            font-size: 12px;
            margin-top: 5px;
        }
        .growth.positive { color: #28a745; }
        .growth.negative { color: #dc3545; }
        .section {
            margin-bottom: 30px;
        }
        .section h2 {
            color: #2c3e50;
            font-size: 18px;
            margin-bottom: 15px;
            border-left: 4px solid #007bff;
            padding-left: 15px;
        }
        .item-list {
            list-style: none;
            padding: 0;
        }
        .item-list li {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid #e9ecef;
        }
        .item-list li:last-child {
            border-bottom: none;
        }
        .item-name {
            font-weight: 500;
        }
        .item-stats {
            text-align: right;
            font-size: 14px;
            color: #6c757d;
        }
        .footer {
            text-align: center;
            padding-top: 20px;
            border-top: 1px solid #e9ecef;
            color: #6c757d;
            font-size: 12px;
        }
        @media (max-width: 480px) {
            .metrics-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Analytics Report</h1>
            <div class="period">${reportData.period}</div>
        </div>

        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-value">${formatCurrency(reportData.salesSummary.totalRevenue)}</div>
                <div class="metric-label">Total Revenue</div>
                <div class="growth ${reportData.salesSummary.revenueGrowth >= 0 ? 'positive' : 'negative'}">
                    ${reportData.salesSummary.revenueGrowth >= 0 ? '↗' : '↘'} ${formatPercentage(Math.abs(reportData.salesSummary.revenueGrowth))}
                </div>
            </div>
            
            <div class="metric-card">
                <div class="metric-value">${reportData.salesSummary.totalOrders}</div>
                <div class="metric-label">Total Orders</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-value">${formatCurrency(reportData.salesSummary.averageOrderValue)}</div>
                <div class="metric-label">Avg Order Value</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-value">${formatPercentage(reportData.customerMetrics.retentionRate)}</div>
                <div class="metric-label">Customer Retention</div>
            </div>
        </div>

        <div class="section">
            <h2>🍽️ Top Performing Items</h2>
            <ul class="item-list">
                ${reportData.topItems.map(item => `
                    <li>
                        <div class="item-name">${item.name}</div>
                        <div class="item-stats">
                            ${item.orders} orders<br>
                            ${formatCurrency(item.revenue)}
                        </div>
                    </li>
                `).join('')}
            </ul>
        </div>

        <div class="section">
            <h2>👥 Customer Insights</h2>
            <ul class="item-list">
                <li>
                    <div class="item-name">New Customers</div>
                    <div class="item-stats">${reportData.customerMetrics.newCustomers}</div>
                </li>
                <li>
                    <div class="item-name">Returning Customers</div>
                    <div class="item-stats">${reportData.customerMetrics.returningCustomers}</div>
                </li>
                <li>
                    <div class="item-name">Retention Rate</div>
                    <div class="item-stats">${formatPercentage(reportData.customerMetrics.retentionRate)}</div>
                </li>
            </ul>
        </div>

        <div class="section">
            <h2>⏰ Peak Revenue Hours</h2>
            <ul class="item-list">
                ${reportData.peakHours.map(hour => `
                    <li>
                        <div class="item-name">${hour.hour}:00 - ${hour.hour + 1}:00</div>
                        <div class="item-stats">${formatCurrency(hour.revenue)}</div>
                    </li>
                `).join('')}
            </ul>
        </div>

        <div class="footer">
            <p>This is an automated report generated by your restaurant analytics system.</p>
            <p>Report generated on ${new Date().toLocaleString()}</p>
        </div>
    </div>
</body>
</html>
    `
  }

  async sendReport(config: EmailReportConfig): Promise<boolean> {
    try {
      const reportData = await this.generateReport(config)
      const htmlContent = this.generateEmailHTML(reportData, config)

      // In a real implementation, you would use an email service like:
      // - SendGrid
      // - AWS SES
      // - Nodemailer with SMTP
      // - Resend
      
      console.log('Email report generated for:', config.recipients)
      console.log('Report period:', reportData.period)
      console.log('Total revenue:', reportData.salesSummary.totalRevenue)
      
      // Mock email sending - replace with actual email service
      const emailPayload = {
        to: config.recipients,
        subject: `Restaurant Analytics Report - ${reportData.period}`,
        html: htmlContent,
        from: process.env.REPORTS_EMAIL_FROM || 'reports@restaurant.com'
      }

      // Simulate email sending delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      console.log('Email report sent successfully to:', config.recipients.join(', '))
      return true
    } catch (error) {
      console.error('Failed to send email report:', error)
      return false
    }
  }

  async getReportRecipients(tenantId: string, restaurantId: string): Promise<string[]> {
    await connectToDatabase()

    // Get all owners and managers for the restaurant
    const users = await User.find({
      tenantId,
      role: { $in: ['owner', 'manager'] },
      isVerified: true,
      email: { $exists: true, $ne: '' }
    }).select('email')

    return users.map(user => user.email).filter(Boolean)
  }

  async scheduleReports(): Promise<void> {
    // This would typically be called by a cron job or scheduled task
    // For now, it's a placeholder for the scheduling logic
    
    console.log('Scheduled reports would be processed here')
    
    // Example: Get all restaurants that have scheduled reports enabled
    // and send reports based on their configuration
    
    // In a real implementation, you might:
    // 1. Query a ReportSchedule collection for active schedules
    // 2. Check if it's time to send each report based on frequency
    // 3. Generate and send reports for each schedule
    // 4. Log the results and handle failures
  }
}

export const emailReportService = new EmailReportService()
