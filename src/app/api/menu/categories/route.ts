import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { menuService } from '@/lib/services/menu-service'
import { withOptionalAuth } from '@/lib/auth/middleware'

const categoriesQuerySchema = z.object({
  tenantId: z.string().optional(),
  restaurantId: z.string().optional(),
  useCache: z.string().transform(val => val !== 'false').optional()
})

export const GET = withOptionalAuth(async (request: NextRequest, { authContext }) => {
  try {
    const { searchParams } = new URL(request.url)
    const queryParams = Object.fromEntries(searchParams.entries())
    const validatedParams = categoriesQuerySchema.parse(queryParams)

    // Determine tenant and restaurant ID
    let tenantId = validatedParams.tenantId
    let restaurantId = validatedParams.restaurantId

    // If authenticated, use user's tenant
    if (authContext) {
      tenantId = authContext.tenantId
      
      // For customers, find their restaurant (in a real app, this might be based on location/selection)
      if (!restaurantId && authContext.role === 'customer') {
        // For now, we'll require restaurantId in query params for customers
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
        // In a real app, you'd get this from user's restaurant association
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

    const result = await menuService.getCategories({
      tenantId,
      restaurantId,
      useCache: validatedParams.useCache
    })

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

    return NextResponse.json({
      success: true,
      data: {
        categories: result.data,
        meta: {
          count: result.data.length,
          lastModified: result.lastModified
        }
      }
    }, {
      headers: {
        'ETag': `"${result.etag}"`,
        'Last-Modified': result.lastModified.toUTCString(),
        'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600',
        'Vary': 'Authorization'
      }
    })

  } catch (error: any) {
    console.error('Get categories error:', error)

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
        code: 'CATEGORIES_ERROR',
        message: 'Failed to fetch categories'
      }
    }, { status: 500 })
  }
}, {
  rateLimitKey: 'menu-categories',
  rateLimitMax: 100,
  rateLimitWindow: 3600
})