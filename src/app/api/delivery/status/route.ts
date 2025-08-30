import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { connectToDatabase } from '@/lib/mongodb'
import { deliveryService } from '@/lib/services/delivery-service'
import { verifyToken } from '@/lib/auth/jwt'

const updateStatusSchema = z.object({
  orderId: z.string(),
  status: z.enum(['picked_up', 'in_transit', 'delivered', 'failed']),
  location: z.object({
    lat: z.number(),
    lng: z.number()
  }).optional(),
  notes: z.string().optional()
})

export async function PUT(request: NextRequest) {
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

    await connectToDatabase()

    const body = await request.json()
    const { orderId, status, location, notes } = updateStatusSchema.parse(body)

    const result = await deliveryService.updateDeliveryStatus(
      orderId,
      status,
      location,
      notes
    )

    return NextResponse.json(result)

  } catch (error) {
    console.error('Update delivery status error:', error)
    
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