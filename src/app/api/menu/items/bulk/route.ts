import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { menuService } from '@/lib/services/menu-service'
import { withAuth } from '@/lib/auth/middleware'

const bulkUpdateSchema = z.object({
  itemIds: z.array(z.string()).min(1, 'At least one item ID is required').max(50, 'Maximum 50 items allowed'),
  action: z.enum(['enable', 'disable', 'update_price', 'update_preparation_time']),
  value: z.union([z.boolean(), z.number()]).optional(),
  dryRun: z.boolean().optional().default(false)
})

export const PATCH = withAuth(async (request: NextRequest, { authContext }) => {
  try {
    // Only restaurant staff can perform bulk operations
    if (!['owner', 'manager', 'staff'].includes(authContext.role)) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Only restaurant staff can perform bulk operations'
        }
      }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = bulkUpdateSchema.parse(body)

    const result = await menuService.bulkUpdateItems({
      tenantId: authContext.tenantId,
      restaurantId: authContext.tenantId, // Assuming restaurant staff belong to their restaurant
      itemIds: validatedData.itemIds,
      action: validatedData.action,
      value: validatedData.value,
      updatedBy: authContext.userId,
      dryRun: validatedData.dryRun
    })

    if (!validatedData.dryRun) {
      // Invalidate cache after actual update
      await menuService.invalidateMenuCache(authContext.tenantId, authContext.tenantId)
    }

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        message: validatedData.dryRun 
          ? 'Dry run completed - no changes made' 
          : 'Bulk update completed successfully'
      }
    })

  } catch (error: any) {
    console.error('Bulk update menu items error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid bulk update data',
          details: error.issues
        }
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'BULK_UPDATE_ERROR',
        message: 'Failed to perform bulk update'
      }
    }, { status: 500 })
  }
}, {
  rateLimitKey: 'menu-bulk-update',
  rateLimitMax: 10,
  rateLimitWindow: 3600
})