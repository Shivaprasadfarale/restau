import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { menuService } from '@/lib/services/menu-service'
import { withOptionalAuth } from '@/lib/auth/middleware'

const availabilityQuerySchema = z.object({
  tenantId: z.string().optional(),
  restaurantId: z.string().optional()
})

export const GET = withOptionalAuth(async (request: NextRequest, { authContext }) => {
  try {
    const { searchParams } = new URL(request.url)
    const queryParams = Object.fromEntries(searchParams.entries())
    const validatedParams = availabilityQuerySchema.parse(queryParams)

    // Determine tenant and restaurant ID
    let tenantId = validatedParams.tenantId
    let restaurantId = validatedParams.restaurantId

    if (authContext) {
      tenantId = authContext.tenantId
      
      if (!restaurantId && authContext.role === 'customer') {
        if (!validatedParams.restaurantId) {
          return NextResponse.json({
            success: false,
            error: {
              code: 'RESTAURANT_ID_REQUIRED',
              message: 'Restaurant ID is required'
            }
          }, { status: 400 })
        }
        restaurantId = validatedParams.restaurantId
      }
      
      if (['owner', 'manager', 'staff'].includes(authContext.role)) {
        restaurantId = validatedParams.restaurantId || authContext.tenantId
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

    const availability = await menuService.checkRestaurantAvailability({
      tenantId,
      restaurantId
    })

    // Get menu statistics
    const stats = await menuService.getMenuStats({
      tenantId,
      restaurantId
    })

    return NextResponse.json({
      success: true,
      data: {
        ...availability,
        menuStats: stats,
        timestamp: new Date().toISOString()
      }
    }, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600', // 5 minutes cache
        'Vary': 'Authorization'
      }
    })

  } catch (error: any) {
    console.error('Restaurant availability error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid parameters',
          details: error.errors
        }
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'AVAILABILITY_ERROR',
        message: 'Failed to check restaurant availability'
      }
    }, { status: 500 })
  }
}, {
  rateLimitKey: 'menu-availability',
  rateLimitMax: 200,
  rateLimitWindow: 3600
})