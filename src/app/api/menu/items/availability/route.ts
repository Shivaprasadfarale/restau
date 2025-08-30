import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { menuService } from '@/lib/services/menu-service'
import { withOptionalAuth } from '@/lib/auth/middleware'

const availabilityCheckSchema = z.object({
  tenantId: z.string().optional(),
  restaurantId: z.string().optional(),
  itemIds: z.array(z.string()).min(1, 'At least one item ID is required').max(20, 'Maximum 20 items allowed'),
  scheduledFor: z.string().transform(val => val ? new Date(val) : undefined).optional()
})

export const POST = withOptionalAuth(async (request: NextRequest, { authContext }) => {
  try {
    const body = await request.json()
    const validatedData = availabilityCheckSchema.parse(body)

    // Determine tenant and restaurant ID
    let tenantId = validatedData.tenantId
    let restaurantId = validatedData.restaurantId

    if (authContext) {
      tenantId = authContext.tenantId
      
      if (!restaurantId && authContext.role === 'customer') {
        if (!validatedData.restaurantId) {
          return NextResponse.json({
            success: false,
            error: {
              code: 'RESTAURANT_ID_REQUIRED',
              message: 'Restaurant ID is required'
            }
          }, { status: 400 })
        }
        restaurantId = validatedData.restaurantId
      }
      
      if (['owner', 'manager', 'staff'].includes(authContext.role)) {
        restaurantId = validatedData.restaurantId || authContext.tenantId
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

    // Validate scheduled time if provided
    if (validatedData.scheduledFor) {
      const now = new Date()
      if (validatedData.scheduledFor <= now) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'INVALID_SCHEDULE_TIME',
            message: 'Scheduled time must be in the future'
          }
        }, { status: 400 })
      }

      // Check if scheduled time is too far in the future (e.g., more than 7 days)
      const maxScheduleTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      if (validatedData.scheduledFor > maxScheduleTime) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'SCHEDULE_TOO_FAR',
            message: 'Cannot schedule orders more than 7 days in advance'
          }
        }, { status: 400 })
      }
    }

    // Check availability for each item
    const availabilityResults = await Promise.all(
      validatedData.itemIds.map(async (itemId) => {
        const result = await menuService.validateItemAvailability(itemId, {
          tenantId,
          restaurantId
        }, validatedData.scheduledFor)

        return {
          itemId,
          ...result
        }
      })
    )

    // Separate available and unavailable items
    const availableItems = availabilityResults.filter(item => item.isAvailable)
    const unavailableItems = availabilityResults.filter(item => !item.isAvailable)

    // Get restaurant availability info
    const restaurantAvailability = await menuService.checkRestaurantAvailability({
      tenantId,
      restaurantId
    })

    return NextResponse.json({
      success: true,
      data: {
        restaurant: {
          isOpen: restaurantAvailability.isOpen,
          nextOpenTime: restaurantAvailability.nextOpenTime,
          operatingHours: restaurantAvailability.operatingHours
        },
        items: {
          available: availableItems,
          unavailable: unavailableItems
        },
        summary: {
          totalItems: validatedData.itemIds.length,
          availableCount: availableItems.length,
          unavailableCount: unavailableItems.length,
          allAvailable: unavailableItems.length === 0
        },
        scheduledFor: validatedData.scheduledFor,
        checkedAt: new Date().toISOString()
      }
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate', // Availability should not be cached
        'Vary': 'Authorization'
      }
    })

  } catch (error: any) {
    console.error('Check availability error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid availability check data',
          details: error.issues
        }
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'AVAILABILITY_CHECK_ERROR',
        message: 'Failed to check item availability'
      }
    }, { status: 500 })
  }
}, {
  rateLimitKey: 'menu-availability',
  rateLimitMax: 100,
  rateLimitWindow: 3600
})