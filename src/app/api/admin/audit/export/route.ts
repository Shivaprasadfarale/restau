import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth, ADMIN_MIDDLEWARE_CONFIGS } from '@/lib/auth/admin-middleware'
import { auditLogger } from '@/lib/audit-logger'
import { z } from 'zod'

const exportSchema = z.object({
  format: z.enum(['csv', 'json']).optional().default('csv'),
  action: z.string().optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  userId: z.string().optional(),
  limit: z.string().optional().default('10000')
})

// GET /api/admin/audit/export - Export audit logs (Owner only)
export const GET = withAdminAuth(async (request, context) => {
  try {
    const { searchParams } = new URL(request.url)
    const query = exportSchema.parse(Object.fromEntries(searchParams))

    // Only owners can export audit logs
    if (context.role !== 'owner') {
      return NextResponse.json(
        { success: false, message: 'Access denied. Owner role required.' },
        { status: 403 }
      )
    }

    const limit = Math.min(parseInt(query.limit), 50000) // Max 50k records for export

    const filters: any = {
      tenantId: context.tenantId,
      limit,
      offset: 0
    }

    if (query.action) filters.action = query.action
    if (query.severity) filters.severity = query.severity
    if (query.userId) filters.userId = query.userId
    if (query.startDate) filters.startDate = new Date(query.startDate)
    if (query.endDate) filters.endDate = new Date(query.endDate)

    const { logs } = await auditLogger.getLogs(filters)

    if (query.format === 'json') {
      return NextResponse.json({
        success: true,
        logs,
        exportedAt: new Date().toISOString(),
        filters: query
      })
    }

    // Generate CSV
    const csvHeaders = [
      'Timestamp',
      'Action',
      'User ID',
      'IP Address',
      'Severity',
      'Details'
    ]

    const csvRows = logs.map(log => [
      new Date(log.timestamp).toISOString(),
      log.action,
      log.userId || 'N/A',
      log.ipAddress,
      log.severity,
      JSON.stringify(log.details).replace(/"/g, '""') // Escape quotes for CSV
    ])

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(field => `"${field}"`).join(','))
    ].join('\n')

    const response = new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`
      }
    })

    return response

  } catch (error) {
    console.error('Audit logs export error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Invalid query parameters',
          errors: error.errors 
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}, {
  ...ADMIN_MIDDLEWARE_CONFIGS.OWNER_ONLY,
  auditAction: 'AUDIT_LOGS_EXPORTED',
  rateLimit: { maxRequests: 5, windowMs: 60 * 1000 } // 5 exports per minute
})