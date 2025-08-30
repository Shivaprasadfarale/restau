import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { menuService } from '@/lib/services/menu-service'
import { withOptionalAuth, withAuth } from '@/lib/auth/middleware'

const itemParamsSchema = z.object({
  id: z.string().min(1, 'Item ID is required')
})

const itemQuerySchema = z.object({
  tenantId: z.string().optional(),
  restaurantId: z.string().optional(),
  includePricing: z.string().transform(val => val === 'true').optional()
})

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withOptionalAuth(async (req: NextRequest, { authContext }) => {
    try {
      const validatedParams = itemParamsSchema.parse(params)
      const { searchParams } = new URL(request.url)
      const queryParams = Object.fromEntries(searchParams.entries())
      const validatedQuery = itemQuerySchema.parse(queryParams)

      // Determine tenant and restaurant ID
      let tenantId = validatedQuery.tenantId
      let restaurantId = validatedQuery.restaurantId

      if (authContext) {
        tenantId = authContext.tenantId
        
        if (!restaurantId && authContext.role === 'customer') {
          if (!validatedQuery.restaurantId) {
            return NextResponse.json({
              success: false,
              error: {
                code: 'RESTAURANT_ID_REQUIRED',
                message: 'Restaurant ID is required'
              }
            }, { status: 400 })
          }
          restaurantId = validatedQuery.restaurantId
        }
        
        if (['owner', 'manager', 'staff'].includes(authContext.role)) {
          restaurantId = validatedQuery.restaurantId || authContext.tenantId
        }
      }

      if (!tenantId || !restaurantId) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'MISSING_PARAMETERS',
            message: 'Tenant ID and Restaurant ID are required'
          }
        }, { status: 400 })
      }

      const item = await menuService.getMenuItem(validatedParams.id, {
        tenantId,
        restaurantId
      })

      if (!item) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'ITEM_NOT_FOUND',
            message: 'Menu item not found'
          }
        }, { status: 404 })
      }

      // Check restaurant availability for customers
      let itemData = item.toObject()
      if (authContext?.role === 'customer') {
        const availability = await menuService.checkRestaurantAvailability({
          tenantId,
          restaurantId
        })

        if (!availability.isOpen) {
          itemData.availability = false
          itemData.unavailableReason = 'Restaurant is currently closed'
        }
      }

      // Add pricing if requested
      if (validatedQuery.includePricing) {
        const restaurant = await menuService.checkRestaurantAvailability({
          tenantId,
          restaurantId
        })
        
        // This is a simplified version - in a real app you'd get restaurant tax rate
        const taxRate = 0.18 // 18% GST
        const basePrice = item.price
        const gstAmount = Math.round(basePrice * taxRate)
        const totalPrice = basePrice + gstAmount

        itemData.pricing = {
          basePrice,
          gstRate: taxRate,
          gstAmount,
          totalPrice
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          item: itemData
        }
      }, {
        headers: {
          'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600',
          'Vary': 'Authorization'
        }
      })

    } catch (error: any) {
      console.error('Get menu item error:', error)

      if (error instanceof z.ZodError) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid parameters',
            details: error.issues
          }
        }, { status: 400 })
      }

      return NextResponse.json({
        success: false,
        error: {
          code: 'MENU_ITEM_ERROR',
          message: 'Failed to fetch menu item'
        }
      }, { status: 500 })
    }
  }, {
    rateLimitKey: 'menu-item',
    rateLimitMax: 200,
    rateLimitWindow: 3600
  })(request)
}

// PATCH endpoint for updating menu item availability
const updateItemSchema = z.object({
  availability: z.boolean().optional(),
  price: z.number().min(0).max(100000).optional(),
  preparationTime: z.number().min(1).max(180).optional()
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(async (req: NextRequest, { authContext }) => {
    try {
      const validatedParams = itemParamsSchema.parse(params)
      
      // Only restaurant staff can update items
      if (!['owner', 'manager', 'staff'].includes(authContext.role)) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'Only restaurant staff can update menu items'
          }
        }, { status: 403 })
      }

      const body = await request.json()
      const validatedData = updateItemSchema.parse(body)

      // Check if restaurant is currently open for availability changes
      if (validatedData.availability !== undefined) {
        const restaurantAvailability = await menuService.checkRestaurantAvailability({
          tenantId: authContext.tenantId,
          restaurantId: authContext.tenantId // Assuming restaurant staff belong to their restaurant
        })

        // Allow availability toggle even when restaurant is closed for staff convenience
        // but log the action for audit purposes
        console.log(`Availability toggle by ${authContext.userId} for item ${validatedParams.id} - Restaurant open: ${restaurantAvailability.isOpen}`)
      }

      const updatedItem = await menuService.updateMenuItem(validatedParams.id, {
        tenantId: authContext.tenantId,
        restaurantId: authContext.tenantId,
        updates: validatedData,
        updatedBy: authContext.userId
      })

      if (!updatedItem) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'ITEM_NOT_FOUND',
            message: 'Menu item not found'
          }
        }, { status: 404 })
      }

      // Invalidate cache after update
      await menuService.invalidateMenuCache(authContext.tenantId, authContext.tenantId)

      return NextResponse.json({
        success: true,
        data: {
          item: updatedItem,
          message: 'Menu item updated successfully'
        }
      })

    } catch (error: any) {
      console.error('Update menu item error:', error)

      if (error instanceof z.ZodError) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid update data',
            details: error.issues
          }
        }, { status: 400 })
      }

      return NextResponse.json({
        success: false,
        error: {
          code: 'UPDATE_ERROR',
          message: 'Failed to update menu item'
        }
      }, { status: 500 })
    }
  }, {
    rateLimitKey: 'menu-item-update',
    rateLimitMax: 50,
    rateLimitWindow: 3600
  })(request)
}