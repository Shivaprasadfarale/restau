import { NextRequest, NextResponse } from 'next/server'
import { ImageService } from '@/lib/services/image-service'
import { z } from 'zod'

const transformImageSchema = z.object({
  publicId: z.string().min(1, 'Public ID is required'),
  width: z.number().min(1).max(5000).optional(),
  height: z.number().min(1).max(5000).optional(),
  quality: z.number().min(1).max(100).optional(),
  format: z.enum(['auto', 'jpg', 'png', 'webp']).optional(),
  crop: z.enum(['fill', 'fit', 'scale', 'crop']).optional()
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { publicId, width, height, quality, format, crop } = transformImageSchema.parse(body)

    // Generate optimized image URL
    const optimizedUrl = ImageService.generateImageUrl(publicId, {
      width,
      height,
      quality,
      format,
      crop
    })

    return NextResponse.json({
      success: true,
      data: {
        originalPublicId: publicId,
        optimizedUrl,
        transformations: {
          width,
          height,
          quality,
          format,
          crop
        }
      }
    })

  } catch (error) {
    console.error('Image transformation error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid request parameters',
          details: error.errors
        },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to transform image' 
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const publicId = searchParams.get('publicId')
    const width = searchParams.get('width') ? parseInt(searchParams.get('width')!) : undefined
    const height = searchParams.get('height') ? parseInt(searchParams.get('height')!) : undefined
    const quality = searchParams.get('quality') ? parseInt(searchParams.get('quality')!) : undefined
    const format = searchParams.get('format') as 'auto' | 'jpg' | 'png' | 'webp' | undefined
    const crop = searchParams.get('crop') as 'fill' | 'fit' | 'scale' | 'crop' | undefined

    if (!publicId) {
      return NextResponse.json(
        { success: false, error: 'Public ID is required' },
        { status: 400 }
      )
    }

    // Generate optimized image URL
    const optimizedUrl = ImageService.generateImageUrl(publicId, {
      width,
      height,
      quality,
      format,
      crop
    })

    return NextResponse.json({
      success: true,
      data: {
        originalPublicId: publicId,
        optimizedUrl,
        transformations: {
          width,
          height,
          quality,
          format,
          crop
        }
      }
    })

  } catch (error) {
    console.error('Image transformation error:', error)
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to transform image' 
      },
      { status: 500 }
    )
  }
}