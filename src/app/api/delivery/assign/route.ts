import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { connectToDatabase } from '@/lib/mongodb'
import { deliveryService } from '@/lib/services/delivery-service'
import { verifyToken } from '@/lib/auth/jwt'
import { rbacService } from '@/lib/auth/rbac'

const assignDeliverySchema = z.object({
  orderId: z.string(),
  deliveryPersonId: z.string(),
  estimatedDeliveryTime: z.string().transform(str => new Date(str))
})

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { success: false, message: 'Authentication required' },
        { status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json(
        { success: false, message: 'Invalid token' },
        { status: 401 }
      )
    }

    // Check permissions
    if (!rbacService.hasPermission(payload.role as any, 'delivery:manage' as any)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    await connectToDatabase()

    const body = await request.json()
    const { orderId, deliveryPersonId, estimatedDeliveryTime } = assignDeliverySchema.parse(body)

    const result = await deliveryService.assignOrder(
      orderId,
      deliveryPersonId,
      estimatedDeliveryTime
    )

    return NextResponse.json(result)

  } catch (error) {
    console.error('Assign delivery error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: 'Invalid input', errors: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}