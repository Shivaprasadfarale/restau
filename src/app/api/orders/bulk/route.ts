import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyToken } from '@/lib/auth/jwt'
import { OrderService } from '@/lib/services/order-service'
import { auditLog } from '@/lib/audit-logger'

const bulkOperationSchema = z.object({
  type: z.enum(['status_update', 'cancel', 'assign_delivery']),
  orderIds: z.array(z.string()).min(1).max(50),
  data: z.object({
    status: z.string().optional(),
    reason: z.string().optional(),
    notes: z.string().optional(),
    deliveryPersonId: z.string().optional()
  }),
  dryRun: z.boolean().default(true)
})

interface BulkOperationResult {
  success: boolean
  processed: number
  failed: number
  errors: Array<{
    orderId: string
    error: string
  }>
  results: Array<{
    orderId: string
    status: string
    previousStatus?: string
  }>
}

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

    // Check admin permissions
    if (!['owner', 'manager', 'staff'].includes(decoded.role)) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required'
        }
      }, { status: 403 })
    }

    // Parse and validate request body
    const body = await request.json()
    const validatedData = bulkOperationSchema.parse(body)

    const { type, orderIds, data, dryRun } = validatedData
    const tenantId = decoded.tenantId || 'default'
    const userId = decoded.userId
    const restaurantId = decoded.restaurantId

    // Initialize result tracking
    const result: BulkOperationResult = {
      success: true,
      processed: 0,
      failed: 0,
      errors: [],
      results: []
    }

    // Validate orders exist and user has access
    const orders = await Promise.all(
      orderIds.map(async (orderId) => {
        try {
          const order = await OrderService.getOrder(
            orderId,
            tenantId,
            userId,
            decoded.role
          )
          
          if (!order) {
            result.errors.push({
              orderId,
              error: 'Order not found or access denied'
            })
            return null
          }

          // Check restaurant access for staff
          if (restaurantId && order.restaurantId.toString() !== restaurantId) {
            result.errors.push({
              orderId,
              error: 'Order belongs to different restaurant'
            })
            return null
          }

          return order
        } catch (error) {
          result.errors.push({
            orderId,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
          return null
        }
      })
    )

    const validOrders = orders.filter(order => order !== null)

    if (validOrders.length === 0) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'NO_VALID_ORDERS',
          message: 'No valid orders found for bulk operation'
        },
        result
      }, { status: 400 })
    }

    // Dry run - validate operations without executing
    if (dryRun) {
      for (const order of validOrders) {
        try {
          const validation = await validateBulkOperation(type, order, data)
          
          if (validation.valid) {
            result.results.push({
              orderId: order._id.toString(),
              status: validation.newStatus || order.status,
              previousStatus: order.status
            })
          } else {
            result.errors.push({
              orderId: order._id.toString(),
              error: validation.error || 'Validation failed'
            })
          }
        } catch (error) {
          result.errors.push({
            orderId: order._id.toString(),
            error: error instanceof Error ? error.message : 'Validation error'
          })
        }
      }

      result.processed = result.results.length
      result.failed = result.errors.length

      return NextResponse.json({
        success: true,
        data: result,
        dryRun: true
      })
    }

    // Execute actual bulk operation
    const operationPromises = validOrders.map(async (order) => {
      try {
        let updatedOrder

        switch (type) {
          case 'status_update':
            if (!data.status) {
              throw new Error('Status is required for status update operation')
            }
            
            updatedOrder = await OrderService.updateOrderStatus(
              order._id.toString(),
              tenantId,
              userId,
              {
                status: data.status,
                notes: data.notes || `Bulk ${data.status} by ${decoded.role}`
              },
              decoded.role
            )
            break

          case 'cancel':
            updatedOrder = await OrderService.updateOrderStatus(
              order._id.toString(),
              tenantId,
              userId,
              {
                status: 'cancelled',
                notes: data.reason || data.notes || `Bulk cancellation by ${decoded.role}`
              },
              decoded.role
            )
            break

          case 'assign_delivery':
            if (!data.deliveryPersonId) {
              throw new Error('Delivery person ID is required for assignment')
            }
            
            updatedOrder = await OrderService.updateOrderStatus(
              order._id.toString(),
              tenantId,
              userId,
              {
                deliveryPersonId: data.deliveryPersonId,
                notes: data.notes || `Bulk delivery assignment by ${decoded.role}`
              },
              decoded.role
            )
            break

          default:
            throw new Error(`Unsupported bulk operation type: ${type}`)
        }

        result.results.push({
          orderId: order._id.toString(),
          status: updatedOrder.status,
          previousStatus: order.status
        })
        result.processed++

        // Log audit trail
        await auditLog({
          tenantId,
          userId,
          action: `bulk_${type}`,
          resourceType: 'order',
          resourceId: order._id.toString(),
          details: {
            previousStatus: order.status,
            newStatus: updatedOrder.status,
            bulkOperation: true,
            ...data
          },
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown'
        })

      } catch (error) {
        result.errors.push({
          orderId: order._id.toString(),
          error: error instanceof Error ? error.message : 'Operation failed'
        })
        result.failed++
      }
    })

    await Promise.all(operationPromises)

    // Log bulk operation summary
    await auditLog({
      tenantId,
      userId,
      action: 'bulk_operation_completed',
      resourceType: 'orders',
      resourceId: 'bulk',
      details: {
        type,
        totalOrders: orderIds.length,
        processed: result.processed,
        failed: result.failed,
        data
      },
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown'
    })

    return NextResponse.json({
      success: result.failed === 0,
      data: result,
      message: `Bulk operation completed. ${result.processed} orders processed, ${result.failed} failed.`
    })

  } catch (error) {
    console.error('Bulk operation error:', error)
    
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
        message: 'Bulk operation failed'
      }
    }, { status: 500 })
  }
}

async function validateBulkOperation(
  type: string,
  order: any,
  data: any
): Promise<{ valid: boolean; error?: string; newStatus?: string }> {
  switch (type) {
    case 'status_update':
      if (!data.status) {
        return { valid: false, error: 'Status is required' }
      }

      // Validate status transition
      const validTransitions: Record<string, string[]> = {
        pending: ['confirmed', 'cancelled'],
        confirmed: ['preparing', 'cancelled'],
        preparing: ['ready', 'cancelled'],
        ready: ['out_for_delivery', 'delivered'],
        out_for_delivery: ['delivered'],
        delivered: [],
        cancelled: []
      }

      const allowedStatuses = validTransitions[order.status] || []
      if (!allowedStatuses.includes(data.status)) {
        return {
          valid: false,
          error: `Cannot transition from ${order.status} to ${data.status}`
        }
      }

      return { valid: true, newStatus: data.status }

    case 'cancel':
      if (['delivered', 'cancelled'].includes(order.status)) {
        return {
          valid: false,
          error: `Cannot cancel order with status ${order.status}`
        }
      }

      return { valid: true, newStatus: 'cancelled' }

    case 'assign_delivery':
      if (!['ready', 'out_for_delivery'].includes(order.status)) {
        return {
          valid: false,
          error: `Cannot assign delivery for order with status ${order.status}`
        }
      }

      if (!data.deliveryPersonId) {
        return { valid: false, error: 'Delivery person ID is required' }
      }

      return { valid: true }

    default:
      return { valid: false, error: `Unsupported operation type: ${type}` }
  }
}