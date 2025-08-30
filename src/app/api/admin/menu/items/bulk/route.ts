import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { MenuItem } from '@/models/MenuItem'
import { connectToDatabase } from '@/lib/mongodb'
import { withAuth } from '@/lib/auth/admin-middleware'
import { auditLogger } from '@/lib/audit-logger'
import { menuService } from '@/lib/services/menu-service'

const bulkOperationSchema = z.object({
  itemIds: z.array(z.string()).min(1).max(50),
  action: z.enum(['enable', 'disable', 'delete', 'update_price', 'update_preparation_time', 'update_category']),
  value: z.union([z.boolean(), z.number(), z.string()]).optional(),
  dryRun: z.boolean().default(false)
})

export const POST = withAuth(async (request: NextRequest, { authContext }) => {
  try {
    const body = await request.json()
    const { itemIds, action, value, dryRun } = bulkOperationSchema.parse(body)

    await connectToDatabase()

    // Validate action-specific requirements
    if ((action === 'update_price' || action === 'update_preparation_time') && typeof value !== 'number') {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_VALUE',
          message: `${action} requires a numeric value`
        }
      }, { status: 400 })
    }

    if (action === 'update_category' && typeof value !== 'string') {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_VALUE',
          message: 'update_category requires a string value'
        }
      }, { status: 400 })
    }

    if ((action === 'enable' || action === 'disable') && typeof value !== 'undefined' && typeof value !== 'boolean') {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_VALUE',
          message: 'enable/disable actions should not have a value or should be boolean'
        }
      }, { status: 400 })
    }

    // Validate price range
    if (action === 'update_price' && (value as number < 0 || value as number > 100000)) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_PRICE',
          message: 'Price must be between 0 and 100000'
        }
      }, { status: 400 })
    }

    // Validate preparation time range
    if (action === 'update_preparation_time' && (value as number < 1 || value as number > 180)) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_PREPARATION_TIME',
          message: 'Preparation time must be between 1 and 180 minutes'
        }
      }, { status: 400 })
    }

    // Get existing items to validate they exist and belong to the restaurant
    const existingItems = await MenuItem.find({
      _id: { $in: itemIds },
      tenantId: authContext.tenantId,
      restaurantId: authContext.tenantId,
      isDeleted: { $ne: true }
    }).select('_id name availability price preparationTime category').exec()

    const existingItemIds = existingItems.map(item => item._id.toString())
    const missingItemIds = itemIds.filter(id => !existingItemIds.includes(id))

    const results = {
      success: 0,
      failed: missingItemIds.length,
      errors: [] as any[],
      affectedItems: [] as any[]
    }

    if (missingItemIds.length > 0) {
      results.errors.push({
        type: 'ITEMS_NOT_FOUND',
        itemIds: missingItemIds,
        message: 'Some items were not found or do not belong to this restaurant'
      })
    }

    // Prepare update data based on action
    let updateData: any = {
      lastModifiedAt: new Date(),
      updatedBy: authContext.userId
    }

    switch (action) {
      case 'enable':
        updateData.availability = true
        break
      case 'disable':
        updateData.availability = false
        break
      case 'delete':
        updateData.isDeleted = true
        updateData.deletedAt = new Date()
        break
      case 'update_price':
        updateData.price = value
        break
      case 'update_preparation_time':
        updateData.preparationTime = value
        break
      case 'update_category':
        updateData.category = value
        break
    }

    // If dry run, return what would be affected
    if (dryRun) {
      results.affectedItems = existingItems.map(item => ({
        id: item._id,
        name: item.name,
        currentValue: action === 'enable' || action === 'disable' ? item.availability :
          action === 'update_price' ? item.price :
          action === 'update_preparation_time' ? item.preparationTime :
          action === 'update_category' ? item.category : null,
        newValue: action === 'enable' ? true :
          action === 'disable' ? false :
          action === 'delete' ? 'DELETED' :
          value
      }))
      results.success = existingItems.length

      return NextResponse.json({
        success: true,
        data: {
          dryRun: true,
          results
        }
      })
    }

    // Perform actual bulk update
    try {
      const updateResult = await MenuItem.updateMany(
        {
          _id: { $in: existingItemIds },
          tenantId: authContext.tenantId,
          restaurantId: authContext.tenantId,
          isDeleted: { $ne: true }
        },
        { $set: updateData },
        { runValidators: true }
      )

      results.success = updateResult.modifiedCount
      results.affectedItems = existingItems.map(item => ({
        id: item._id,
        name: item.name,
        updated: true
      }))

      // Log bulk operation for audit
      await auditLogger.log({
        tenantId: authContext.tenantId,
        userId: authContext.userId,
        action: `bulk_menu_${action}`,
        resourceType: 'menu_item',
        resourceId: 'bulk',
        details: {
          action,
          value,
          itemCount: results.success,
          itemIds: existingItemIds
        }
      })

      // Invalidate menu cache
      await menuService.invalidateMenuCache(authContext.tenantId, authContext.tenantId)

    } catch (error: any) {
      console.error('Bulk update error:', error)
      results.errors.push({
        type: 'UPDATE_ERROR',
        message: error.message
      })
      results.failed = existingItems.length
      results.success = 0
    }

    return NextResponse.json({
      success: results.success > 0,
      data: {
        results,
        message: `Bulk ${action} operation completed. ${results.success} items updated, ${results.failed} failed.`
      }
    })

  } catch (error: any) {
    console.error('Bulk menu operation error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid bulk operation data',
          details: error.issues
        }
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'BULK_OPERATION_ERROR',
        message: 'Failed to perform bulk operation'
      }
    }, { status: 500 })
  }
}, {
  requiredPermissions: ['menu:manage'],
  rateLimitKey: 'admin-menu-bulk',
  rateLimitMax: 10,
  rateLimitWindow: 3600
})