import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { OrderService } from '@/lib/services/order-service'
import { verifyToken } from '@/lib/auth/jwt'

const addressSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['home', 'work', 'other']),
  street: z.string().min(1).max(200),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  zipCode: z.string().regex(/^\d{6}$/, 'Invalid ZIP code'),
  landmark: z.string().max(200).optional()
})

const createOrderSchema = z.object({
  items: z.array(z.object({
    menuItemId: z.string(),
    name: z.string(),
    price: z.number().min(0),
    quantity: z.number().min(1).max(50),
    selectedModifiers: z.array(z.object({
      modifierId: z.string(),
      optionId: z.string(),
      name: z.string(),
      price: z.number()
    })),
    specialInstructions: z.string().max(500).optional(),
    totalPrice: z.number().min(0)
  })).min(1).max(20),
  deliveryAddress: addressSchema,
  deliveryInfo: z.object({
    name: z.string().min(1).max(100),
    phone: z.string().regex(/^\+?[\d\s-()]{10,15}$/, 'Invalid phone number'),
    specialInstructions: z.string().max(500).optional()
  }),
  paymentMethod: z.enum(['card', 'upi_intent', 'upi_collect', 'wallet', 'netbanking']),
  totals: z.object({
    subtotal: z.number().min(0),
    tax: z.number().min(0),
    deliveryFee: z.number().min(0),
    discount: z.number().min(0),
    total: z.number().min(0),
    gstBreakdown: z.object({
      cgst: z.number().min(0),
      sgst: z.number().min(0),
      igst: z.number().min(0)
    }),
    roundingAdjustment: z.number(),
    itemCount: z.number().min(1).optional()
  }),
  estimatedDeliveryTime: z.string().datetime(),
  scheduledFor: z.string().datetime().optional(),
  restaurantId: z.string(),
  tenantId: z.string(),
  idempotencyKey: z.string()
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
    const validatedData = createOrderSchema.parse(body)
    
    // Prepare order data for service
    const orderData = {
      tenantId: validatedData.tenantId,
      userId: decoded.userId,
      restaurantId: validatedData.restaurantId,
      items: validatedData.items,
      deliveryAddress: validatedData.deliveryAddress,
      deliveryInfo: validatedData.deliveryInfo,
      paymentMethod: validatedData.paymentMethod,
      totals: validatedData.totals,
      estimatedDeliveryTime: new Date(validatedData.estimatedDeliveryTime),
      scheduledFor: validatedData.scheduledFor ? new Date(validatedData.scheduledFor) : undefined,
      idempotencyKey: validatedData.idempotencyKey,
      metadata: {
        userAgent: request.headers.get('user-agent') || '',
        ipAddress: request.headers.get('x-forwarded-for') || 
                   request.headers.get('x-real-ip') || 
                   'unknown'
      }
    }

    // Create order using service
    const order = await OrderService.createOrder(orderData)

    return NextResponse.json({
      success: true,
      data: {
        id: order._id,
        status: order.status,
        total: order.total,
        estimatedDeliveryTime: order.estimatedDeliveryTime,
        items: order.items
      },
      message: order.metadata?.idempotencyKey === validatedData.idempotencyKey && 
               order.createdAt < new Date(Date.now() - 1000) ? 
               'Order already exists' : 'Order placed successfully'
    })

  } catch (error) {
    console.error('Order creation error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.issues
        }
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to create order'
      }
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50)
    const status = searchParams.get('status')
    const restaurantId = searchParams.get('restaurantId')
    const search = searchParams.get('search') || ''
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const paymentMethod = searchParams.get('paymentMethod')
    const sortBy = searchParams.get('sortBy') || 'createdAt'
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc'

    // Build filters
    const filters: any = {}
    
    if (status) {
      filters.status = status.includes(',') ? status.split(',') : [status]
    }
    
    if (paymentMethod) {
      filters.paymentMethod = paymentMethod.includes(',') ? paymentMethod.split(',') : [paymentMethod]
    }
    
    if (startDate || endDate) {
      filters.dateRange = {}
      if (startDate) filters.dateRange.start = new Date(startDate)
      if (endDate) filters.dateRange.end = new Date(endDate)
    }
    
    if (restaurantId && ['owner', 'manager'].includes(decoded.role)) {
      filters.restaurantId = restaurantId
    }

    // Use OrderService for search
    const result = await OrderService.searchOrders(
      decoded.tenantId || 'default',
      search,
      filters,
      page,
      limit,
      sortBy,
      sortOrder,
      decoded.role,
      decoded.userId,
      decoded.restaurantId
    )

    // Get summary statistics for admin users
    let summary = null
    if (['owner', 'manager', 'staff'].includes(decoded.role)) {
      const dateRange = filters.dateRange || {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        end: new Date()
      }
      
      summary = await OrderService.getOrderStats(
        decoded.tenantId || 'default',
        decoded.restaurantId || filters.restaurantId,
        dateRange
      )
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      meta: {
        ...result.meta,
        summary
      }
    })

  } catch (error) {
    console.error('Get orders error:', error)
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch orders'
      }
    }, { status: 500 })
  }
}