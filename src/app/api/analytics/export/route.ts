import { NextRequest, NextResponse } from 'next/server'
import { analyticsService } from '@/lib/services/analytics-service'
import { verifyAdminAuth } from '@/lib/auth/admin-middleware'
import { z } from 'zod'

const exportQuerySchema = z.object({
  type: z.enum(['sales', 'items', 'customers']),
  format: z.enum(['csv', 'excel']).default('csv'),
  startDate: z.string(),
  endDate: z.string(),
  restaurantId: z.string().min(1)
})

function arrayToCSV(headers: string[], rows: any[][]): string {
  const csvContent = [
    headers.join(','),
    ...rows.map(row => 
      row.map(cell => {
        // Escape commas and quotes in CSV
        const stringCell = String(cell || '')
        if (stringCell.includes(',') || stringCell.includes('"') || stringCell.includes('\n')) {
          return `"${stringCell.replace(/"/g, '""')}"`
        }
        return stringCell
      }).join(',')
    )
  ].join('\n')
  
  return csvContent
}

export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const authResult = await verifyAdminAuth(request)
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { user, tenantId } = authResult

    // Check permissions
    if (!['owner', 'manager'].includes(user.role)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const queryData = {
      type: searchParams.get('type'),
      format: searchParams.get('format') || 'csv',
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
      restaurantId: searchParams.get('restaurantId') || ''
    }

    const validatedQuery = exportQuerySchema.parse(queryData)

    const startDate = new Date(validatedQuery.startDate)
    const endDate = new Date(validatedQuery.endDate)

    // Validate date range (max 1 year)
    const maxRange = 365 * 24 * 60 * 60 * 1000 // 1 year in milliseconds
    if (endDate.getTime() - startDate.getTime() > maxRange) {
      return NextResponse.json(
        { success: false, error: 'Date range cannot exceed 1 year' },
        { status: 400 }
      )
    }

    const exportData = await analyticsService.exportData(
      tenantId,
      validatedQuery.restaurantId,
      validatedQuery.type,
      validatedQuery.format,
      startDate,
      endDate
    )

    if (validatedQuery.format === 'csv') {
      const csvContent = arrayToCSV(exportData.headers, exportData.rows)
      
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${exportData.filename}.csv"`
        }
      })
    } else {
      // For Excel format, we'll return JSON that the frontend can convert
      // In a production app, you might want to use a library like exceljs
      return NextResponse.json({
        success: true,
        data: {
          headers: exportData.headers,
          rows: exportData.rows,
          filename: exportData.filename,
          format: 'excel'
        }
      })
    }
  } catch (error) {
    console.error('Export analytics error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid query parameters',
          details: error.errors 
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to export analytics data' 
      },
      { status: 500 }
    )
  }
}