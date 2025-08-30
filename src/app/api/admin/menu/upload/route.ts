import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/admin-middleware'
import { auditLogger } from '@/lib/audit-logger'

// File validation schema
const fileValidationSchema = z.object({
  size: z.number().max(5 * 1024 * 1024), // 5MB max
  type: z.string().refine(type => 
    ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(type),
    'Only JPEG, PNG, and WebP images are allowed'
  )
})

// Simulated cloud storage service
class ImageUploadService {
  static async uploadImage(file: File, tenantId: string): Promise<{
    url: string
    publicId: string
    width: number
    height: number
  }> {
    // In a real implementation, this would upload to Cloudinary, AWS S3, etc.
    // For now, we'll simulate the upload process
    
    // Validate file
    fileValidationSchema.parse({
      size: file.size,
      type: file.type
    })

    // Simulate upload delay
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Generate mock URL (in real implementation, this would be the actual uploaded URL)
    const timestamp = Date.now()
    const filename = `${tenantId}/${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const mockUrl = `https://res.cloudinary.com/demo/image/upload/v1/${filename}`

    return {
      url: mockUrl,
      publicId: filename,
      width: 800, // Mock dimensions
      height: 600
    }
  }

  static async deleteImage(publicId: string): Promise<void> {
    // In a real implementation, this would delete from cloud storage
    console.log(`Deleting image: ${publicId}`)
  }

  static validateImageUrl(url: string): boolean {
    try {
      const urlObj = new URL(url)
      // Add your allowed domains here
      const allowedDomains = [
        'res.cloudinary.com',
        'images.unsplash.com',
        'via.placeholder.com',
        's3.amazonaws.com'
      ]
      
      return allowedDomains.some(domain => urlObj.hostname.includes(domain))
    } catch {
      return false
    }
  }
}

export const POST = withAuth(async (request: NextRequest, { authContext }) => {
  try {
    const formData = await request.formData()
    const file = formData.get('image') as File

    if (!file) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'NO_FILE',
          message: 'No image file provided'
        }
      }, { status: 400 })
    }

    // Validate file type and size
    try {
      fileValidationSchema.parse({
        size: file.size,
        type: file.type
      })
    } catch (error: any) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_FILE',
          message: 'Invalid file type or size',
          details: error.issues
        }
      }, { status: 400 })
    }

    // Check for malicious content (basic MIME type validation)
    const buffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(buffer)
    
    // Basic image signature validation
    const isValidImage = (
      // JPEG
      (uint8Array[0] === 0xFF && uint8Array[1] === 0xD8) ||
      // PNG
      (uint8Array[0] === 0x89 && uint8Array[1] === 0x50 && uint8Array[2] === 0x4E && uint8Array[3] === 0x47) ||
      // WebP
      (uint8Array[8] === 0x57 && uint8Array[9] === 0x45 && uint8Array[10] === 0x42 && uint8Array[11] === 0x50)
    )

    if (!isValidImage) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_IMAGE',
          message: 'File is not a valid image'
        }
      }, { status: 400 })
    }

    // Upload image
    const uploadResult = await ImageUploadService.uploadImage(file, authContext.tenantId)

    // Log audit event
    await auditLogger.log({
      tenantId: authContext.tenantId,
      userId: authContext.userId,
      action: 'image_uploaded',
      resourceType: 'image',
      resourceId: uploadResult.publicId,
      details: {
        filename: file.name,
        size: file.size,
        type: file.type,
        url: uploadResult.url
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        image: {
          url: uploadResult.url,
          publicId: uploadResult.publicId,
          width: uploadResult.width,
          height: uploadResult.height
        },
        message: 'Image uploaded successfully'
      }
    })

  } catch (error: any) {
    console.error('Image upload error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid file',
          details: error.issues
        }
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message: 'Failed to upload image'
      }
    }, { status: 500 })
  }
}, {
  requiredPermissions: ['menu:manage'],
  rateLimitKey: 'admin-image-upload',
  rateLimitMax: 10,
  rateLimitWindow: 3600
})

// DELETE - Delete uploaded image
const deleteImageSchema = z.object({
  publicId: z.string().min(1),
  url: z.string().url()
})

export const DELETE = withAuth(async (request: NextRequest, { authContext }) => {
  try {
    const body = await request.json()
    const { publicId, url } = deleteImageSchema.parse(body)

    // Validate that the image belongs to this tenant
    if (!publicId.startsWith(authContext.tenantId)) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'UNAUTHORIZED_IMAGE',
          message: 'You can only delete images uploaded by your restaurant'
        }
      }, { status: 403 })
    }

    // Delete from cloud storage
    await ImageUploadService.deleteImage(publicId)

    // Log audit event
    await auditLogger.log({
      tenantId: authContext.tenantId,
      userId: authContext.userId,
      action: 'image_deleted',
      resourceType: 'image',
      resourceId: publicId,
      details: {
        url,
        publicId
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        message: 'Image deleted successfully'
      }
    })

  } catch (error: any) {
    console.error('Image delete error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid delete request',
          details: error.issues
        }
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'DELETE_ERROR',
        message: 'Failed to delete image'
      }
    }, { status: 500 })
  }
}, {
  requiredPermissions: ['menu:manage'],
  rateLimitKey: 'admin-image-delete',
  rateLimitMax: 20,
  rateLimitWindow: 3600
})