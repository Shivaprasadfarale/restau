import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { menuService } from '@/lib/services/menu-service'
import { withOptionalAuth } from '@/lib/auth/middleware'

const selectedModifierSchema = z.object({
  modifierId: z.string(),
  optionId: z.string()
})

const cartItemSchema = z.object({
  itemId: z.string(),
  quantity: z.number().min(1).max(50),
  selectedModifiers: z.array(selectedModifierSchema).optional().default([])
})

const calculatePricingSchema = z.object({
  tenantId: z.string().optional(),
  restaurantId: z.string().optional(),
  items: z.array(cartItemSchema).min(1, 'At least one item is required').max(20, 'Maximum 20 items allowed')
})

export const POST = withOptionalAuth(async (request: NextRequest, { authContext }) => {
  try {
    const body = await request.json()
    const validatedData = calculatePricingSchema.parse(body)

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

    // Check restaurant availability
    const availability = await menuService.checkRestaurantAvailability({
      tenantId,
      restaurantId
    })

    if (!availability.isOpen && authContext?.role === 'customer') {
      return NextResponse.json({
        success: false,
        error: {
          code: 'RESTAURANT_CLOSED',
          message: 'Restaurant is currently closed',
          details: {
            nextOpenTime: availability.nextOpenTime
          }
        }
      }, { status: 400 })
    }

    // Calculate pricing
    const pricing = await menuService.calculateCartPricing(validatedData.items, {
      tenantId,
      restaurantId
    })

    return NextResponse.json({
      success: true,
      data: {
        pricing,
        restaurant: {
          isOpen: availability.isOpen,
          nextOpenTime: availability.nextOpenTime
        },
        calculatedAt: new Date().toISOString()
      }
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate', // Pricing should not be cached
        'Vary': 'Authorization'
      }
    })

  } catch (error: any) {
    console.error('Calculate pricing error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid pricing calculation data',
          details: error.issues
        }
      }, { status: 400 })
    }

    if (error.message.includes('not found or unavailable')) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'ITEM_UNAVAILABLE',
          message: error.message
        }
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'PRICING_ERROR',
        message: 'Failed to calculate pricing'
      }
    }, { status: 500 })
  }
}, {
  rateLimitKey: 'menu-pricing',
  rateLimitMax: 100,
  rateLimitWindow: 3600
})