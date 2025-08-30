import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { menuService } from '@/lib/services/menu-service'
import { withAuth } from '@/lib/auth/middleware'
import { Permission } from '@/lib/auth/rbac'

const invalidateCacheSchema = z.object({
  tenantId: z.string().optional(),
  restaurantId: z.string().optional(),
  tags: z.array(z.string()).optional()
})

export const POST = withAuth(async (request: NextRequest, { authContext }) => {
  try {
    const body = await request.json()
    const validatedData = invalidateCacheSchema.parse(body)

    // Use authenticated user's tenant
    const tenantId = validatedData.tenantId || authContext.tenantId
    const restaurantId = validatedData.restaurantId || authContext.tenantId

    // Invalidate menu cache
    await menuService.invalidateMenuCache(tenantId, restaurantId)

    return NextResponse.json({
      success: true,
      data: {
        message: 'Menu cache invalidated successfully',
        tenantId,
        restaurantId,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error: any) {
    console.error('Cache invalidation error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid cache invalidation data',
          details: error.errors
        }
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'CACHE_INVALIDATION_ERROR',
        message: 'Failed to invalidate cache'
      }
    }, { status: 500 })
  }
}, {
  requiredPermission: Permission.MANAGE_MENU,
  rateLimitKey: 'cache-invalidate',
  rateLimitMax: 10,
  rateLimitWindow: 3600
})