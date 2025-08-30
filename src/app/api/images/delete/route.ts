import { NextRequest, NextResponse } from 'next/server'
import { ImageService } from '@/lib/services/image-service'
import { verifyAuth } from '@/lib/auth/middleware'
import { auditLog } from '@/lib/audit-logger'
import { rateLimit } from '@/lib/rate-limiter'
import { z } from 'zod'

const deleteImageSchema = z.object({
  publicId: z.string().min(1, 'Public ID is required'),
  publicIds: z.array(z.string()).optional()
})

export async function DELETE(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 'image-delete', 20, 60) // 20 deletes per minute
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Rate limit exceeded. Please try again later.' 
        },
        { status: 429 }
      )
    }

    // Verify authentication
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { user } = authResult

    // Check if user has permission to delete images
    if (!['owner', 'manager', 'staff'].includes(user.role)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { publicId, publicIds } = deleteImageSchema.parse(body)

    if (publicIds && publicIds.length > 0) {
      // Bulk delete
      // Verify all images belong to the user's tenant
      for (const id of publicIds) {
        if (!id.startsWith(user.tenantId)) {
          return NextResponse.json(
            { success: false, error: 'Unauthorized to delete this image' },
            { status: 403 }
          )
        }
      }

      await ImageService.bulkDeleteImages(publicIds)

      // Log the bulk delete action
      await auditLog({
        action: 'bulk_image_delete',
        resourceType: 'image',
        resourceId: publicIds.join(','),
        userId: user.id,
        tenantId: user.tenantId,
        details: {
          count: publicIds.length,
          publicIds
        }
      })

      return NextResponse.json({
        success: true,
        message: `Successfully deleted ${publicIds.length} images`
      })
    } else {
      // Single delete
      // Verify image belongs to the user's tenant
      if (!publicId.startsWith(user.tenantId)) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized to delete this image' },
          { status: 403 }
        )
      }

      await ImageService.deleteImage(publicId)

      // Log the delete action
      await auditLog({
        action: 'image_delete',
        resourceType: 'image',
        resourceId: publicId,
        userId: user.id,
        tenantId: user.tenantId,
        details: { publicId }
      })

      return NextResponse.json({
        success: true,
        message: 'Image deleted successfully'
      })
    }

  } catch (error) {
    console.error('Image deletion error:', error)
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to delete image' 
      },
      { status: 500 }
    )
  }
}