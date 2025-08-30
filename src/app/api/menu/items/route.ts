import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { menuService } from '@/lib/services/menu-service'
import { withOptionalAuth } from '@/lib/auth/middleware'

const itemsQuerySchema = z.object({
  tenantId: z.string().optional(),
  restaurantId: z.string().optional(),
  categoryId: z.string().optional(),
  includeUnavailable: z.string().transform(val => val === 'true').optional(),
  includePricing: z.string().transform(val => val === 'true').optional(),
  useCache: z.string().transform(val => val !== 'false').optional()
})

export const GET = withOptionalAuth(async (request: NextRequest, { authContext }) => {
  try {
    const { searchParams } = new URL(request.url)
    const queryParams = Object.fromEntries(searchParams.entries())
    const validatedParams = itemsQuerySchema.parse(queryParams)

    // Determine tenant and restaurant ID
    let tenantId = validatedParams.tenantId
    let restaurantId = validatedParams.restaurantId

    // If authenticated, use user's tenant
    if (authContext) {
      tenantId = authContext.tenantId
      
      // For customers, require restaurant ID
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
      
      // For restaurant staff, use their restaurant
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

    // Check restaurant availability first
    const availability = await menuService.checkRestaurantAvailability({
      tenantId,
      restaurantId
    })

    // Check If-None-Match header for ETag caching
    const ifNoneMatch = request.headers.get('if-none-match')

    let result
    if (validatedParams.includePricing) {
      result = await menuService.getMenuWithPricing({
        tenantId,
        restaurantId,
        categoryId: validatedParams.categoryId,
        includeUnavailable: validatedParams.includeUnavailable,
        useCache: validatedParams.useCache
      })
    } else {
      result = await menuService.getMenuItems({
        tenantId,
        restaurantId,
        categoryId: validatedParams.categoryId,
        includeUnavailable: validatedParams.includeUnavailable,
        useCache: validatedParams.useCache
      })
    }

    // Return 304 if ETag matches
    if (ifNoneMatch && ifNoneMatch === `"${result.etag}"`) {
      return new NextResponse(null, { 
        status: 304,
        headers: {
          'ETag': `"${result.etag}"`,
          'Last-Modified': result.lastModified.toUTCString(),
          'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600'
        }
      })
    }

    // Filter items based on restaurant availability for customers
    let items = result.data
    if (authContext?.role === 'customer' && !availability.isOpen) {
      // Show items but mark as unavailable when restaurant is closed
      items = items.map((item: any) => ({
        ...item,
        availability: false,
        unavailableReason: 'Restaurant is currently closed'
      }))
    }

    const responseData: any = {
      items,
      meta: {
        count: items.length,
        lastModified: result.lastModified,
        restaurant: availability
      }
    }

    // Include restaurant info if pricing was requested
    if (validatedParams.includePricing && 'restaurant' in result) {
      responseData.restaurant = result.restaurant
    }

    return NextResponse.json({
      success: true,
      data: responseData
    }, {
      headers: {
        'ETag': `"${result.etag}"`,
        'Last-Modified': result.lastModified.toUTCString(),
        'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600',
        'Vary': 'Authorization'
      }
    })

  } catch (error: any) {
    console.error('Get menu items error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: error.issues
        }
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'MENU_ITEMS_ERROR',
        message: 'Failed to fetch menu items'
      }
    }, { status: 500 })
  }
}, {
  rateLimitKey: 'menu-items',
  rateLimitMax: 100,
  rateLimitWindow: 3600
})