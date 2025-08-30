import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { menuService } from '@/lib/services/menu-service'
import { withOptionalAuth } from '@/lib/auth/middleware'

const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required').max(100, 'Search query too long'),
  tenantId: z.string().optional(),
  restaurantId: z.string().optional(),
  limit: z.string().transform(val => Math.min(parseInt(val) || 20, 50)).optional(),
  includeUnavailable: z.string().transform(val => val === 'true').optional(),
  useCache: z.string().transform(val => val !== 'false').optional()
})

export const GET = withOptionalAuth(async (request: NextRequest, { authContext }) => {
  try {
    const { searchParams } = new URL(request.url)
    const queryParams = Object.fromEntries(searchParams.entries())
    const validatedParams = searchQuerySchema.parse(queryParams)

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

    // Check If-None-Match header for ETag caching
    const ifNoneMatch = request.headers.get('if-none-match')

    const result = await menuService.searchItems(validatedParams.q, {
      tenantId,
      restaurantId,
      limit: validatedParams.limit,
      includeUnavailable: validatedParams.includeUnavailable,
      useCache: validatedParams.useCache
    })

    // Return 304 if ETag matches
    if (ifNoneMatch && ifNoneMatch === `"${result.etag}"`) {
      return new NextResponse(null, { 
        status: 304,
        headers: {
          'ETag': `"${result.etag}"`,
          'Last-Modified': result.lastModified.toUTCString(),
          'Cache-Control': 'public, max-age=600, stale-while-revalidate=1200'
        }
      })
    }

    // Check restaurant availability for customers
    let items = result.data
    if (authContext?.role === 'customer') {
      const availability = await menuService.checkRestaurantAvailability({
        tenantId,
        restaurantId
      })

      if (!availability.isOpen) {
        items = items.map((item: any) => ({
          ...item,
          availability: false,
          unavailableReason: 'Restaurant is currently closed'
        }))
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        items,
        query: validatedParams.q,
        meta: {
          count: items.length,
          limit: validatedParams.limit || 20,
          lastModified: result.lastModified
        }
      }
    }, {
      headers: {
        'ETag': `"${result.etag}"`,
        'Last-Modified': result.lastModified.toUTCString(),
        'Cache-Control': 'public, max-age=600, stale-while-revalidate=1200', // Shorter cache for search
        'Vary': 'Authorization'
      }
    })

  } catch (error: any) {
    console.error('Menu search error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid search parameters',
          details: error.issues
        }
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'SEARCH_ERROR',
        message: 'Failed to search menu items'
      }
    }, { status: 500 })
  }
}, {
  rateLimitKey: 'menu-search',
  rateLimitMax: 50,
  rateLimitWindow: 3600
})