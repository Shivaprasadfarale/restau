import { NextRequest, NextResponse } from 'next/server'
import { ImageService } from '@/lib/services/image-service'
import { verifyAuth } from '@/lib/auth/middleware'
import { auditLog } from '@/lib/audit-logger'
import { rateLimit } from '@/lib/rate-limiter'

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 'image-upload', 10, 60) // 10 uploads per minute
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

    // Check if user has permission to upload images
    if (!['owner', 'manager', 'staff'].includes(user.role)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File
    const folder = formData.get('folder') as string || 'restaurant-images'
    const width = formData.get('width') ? parseInt(formData.get('width') as string) : undefined
    const height = formData.get('height') ? parseInt(formData.get('height') as string) : undefined
    const quality = formData.get('quality') ? parseInt(formData.get('quality') as string) : 85

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      )
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer())

    // Validate file size on server side as well
    if (buffer.length > 10 * 1024 * 1024) { // 10MB
      return NextResponse.json(
        { success: false, error: 'File size exceeds 10MB limit' },
        { status: 400 }
      )
    }

    // Upload image
    const uploadResult = await ImageService.uploadImage(buffer, {
      folder: `${user.tenantId}/${folder}`,
      width,
      height,
      quality
    })

    // Log the upload action
    await auditLog({
      action: 'image_upload',
      resourceType: 'image',
      resourceId: uploadResult.publicId,
      userId: user.id,
      tenantId: user.tenantId,
      details: {
        originalName: file.name,
        size: buffer.length,
        folder,
        url: uploadResult.secureUrl
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        publicId: uploadResult.publicId,
        url: uploadResult.secureUrl,
        width: uploadResult.width,
        height: uploadResult.height,
        format: uploadResult.format,
        bytes: uploadResult.bytes
      }
    })

  } catch (error) {
    console.error('Image upload error:', error)
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to upload image' 
      },
      { status: 500 }
    )
  }
}

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}