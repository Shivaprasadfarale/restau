import { NextRequest, NextResponse } from 'next/server'
import { emailReportService } from '@/lib/services/email-report-service'
import { verifyAdminAuth } from '@/lib/auth/admin-middleware'
import { z } from 'zod'

const scheduleReportSchema = z.object({
  restaurantId: z.string().min(1),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  reportTypes: z.array(z.enum(['sales', 'items', 'customers'])).min(1),
  recipients: z.array(z.string().email()).min(1).max(10),
  timezone: z.string().default('Asia/Kolkata')
})

export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const validatedData = scheduleReportSchema.parse(body)

    // Generate and send report immediately (for testing)
    const success = await emailReportService.sendReport({
      tenantId,
      ...validatedData
    })

    if (success) {
      return NextResponse.json({
        success: true,
        message: 'Report scheduled and sent successfully'
      })
    } else {
      return NextResponse.json(
        { success: false, error: 'Failed to send report' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Schedule report error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid request data',
          details: error.errors 
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to schedule report' 
      },
      { status: 500 }
    )
  }
}

// Get report recipients for a restaurant
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAdminAuth(request)
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { user, tenantId } = authResult
    const { searchParams } = new URL(request.url)
    const restaurantId = searchParams.get('restaurantId')

    if (!restaurantId) {
      return NextResponse.json(
        { success: false, error: 'Restaurant ID is required' },
        { status: 400 }
      )
    }

    const recipients = await emailReportService.getReportRecipients(tenantId, restaurantId)

    return NextResponse.json({
      success: true,
      data: { recipients }
    })
  } catch (error) {
    console.error('Get report recipients error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get report recipients' },
      { status: 500 }
    )
  }
}