import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { OrderService } from '@/lib/services/order-service'
import { verifyToken } from '@/lib/auth/jwt'

const searchOrdersSchema = z.object({
  query: z.string().min(1).max(100),
  filters: z.object({
    status: z.array(z.string()).optional(),
    dateRange: z.object({
      start: z.string().optional(),
      end: z.string().optional()
    }).optional(),
    paymentMethod: z.array(z.string()).optional(),
    restaurantId: z.string().optional()
  }).optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(50).default(10),
  sortBy: z.enum(['createdAt', 'total.total', 'status', 'deliveryInfo.name']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
})

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ||
                  request.cookies.get('auth-token')?.value

    if (!token) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      }, { status: 401 })
    }

    const decoded = await verifyToken(token)
    if (!decoded) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired token'
        }
      }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = searchOrdersSchema.parse(body)

    // Build filters
    const filters: any = {}
    
    if (validatedData.filters?.status) {
      filters.status = validatedData.filters.status
    }
    
    if (validatedData.filters?.paymentMethod) {
      filters.paymentMethod = validatedData.filters.paymentMethod
    }
    
    if (validatedData.filters?.dateRange) {
      filters.dateRange = {}
      if (validatedData.filters.dateRange.start) {
        filters.dateRange.start = new Date(validatedData.filters.dateRange.start)
      }
      if (validatedData.filters.dateRange.end) {
        filters.dateRange.end = new Date(validatedData.filters.dateRange.end)
      }
    }
    
    if (validatedData.filters?.restaurantId && ['owner', 'manager'].includes(decoded.role)) {
      filters.restaurantId = validatedData.filters.restaurantId
    }

    // Use OrderService for search
    const result = await OrderService.searchOrders(
      decoded.tenantId || 'default',
      validatedData.query,
      filters,
      validatedData.page,
      validatedData.limit,
      validatedData.sortBy,
      validatedData.sortOrder,
      decoded.role,
      decoded.userId,
      decoded.restaurantId
    )

    return NextResponse.json({
      success: true,
      data: result.data,
      meta: result.meta
    })

  } catch (error) {
    console.error('Order search error:', error)
    
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
        code: 'INTERNAL_ERROR',
        message: 'Search failed'
      }
    }, { status: 500 })
  }
}

// Removed - now handled by OrderService

// GET method for simple search
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    
    if (!query) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'MISSING_QUERY',
          message: 'Search query is required'
        }
      }, { status: 400 })
    }

    // Convert GET params to POST body format
    const searchData = {
      query,
      filters: {
        status: searchParams.get('status')?.split(','),
        paymentMethod: searchParams.get('paymentMethod')?.split(','),
        restaurantId: searchParams.get('restaurantId')
      },
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '10'),
      sortBy: searchParams.get('sortBy') || 'createdAt',
      sortOrder: searchParams.get('sortOrder') || 'desc'
    }

    // Create a new request with POST method and body
    const postRequest = new NextRequest(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(searchData)
    })

    return POST(postRequest)
  } catch (error) {
    console.error('GET search error:', error)
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Search failed'
      }
    }, { status: 500 })
  }
}