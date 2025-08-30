import { v2 as cloudinary } from 'cloudinary'
import sharp from 'sharp'
import { fileTypeFromBuffer } from 'file-type'
import { env } from '@/lib/env'

// Configure Cloudinary
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
})

export interface ImageUploadOptions {
  folder?: string
  width?: number
  height?: number
  quality?: number
  format?: 'auto' | 'jpg' | 'png' | 'webp'
  transformation?: string
}

export interface ImageUploadResult {
  publicId: string
  url: string
  secureUrl: string
  width: number
  height: number
  format: string
  bytes: number
  etag: string
}

export interface ImageValidationResult {
  isValid: boolean
  error?: string
  fileType?: string
  size?: number
}

export class ImageService {
  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
  private static readonly ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
  private static readonly ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']

  /**
   * Validate image file before processing
   */
  static async validateImage(buffer: Buffer): Promise<ImageValidationResult> {
    try {
      // Check file size
      if (buffer.length > this.MAX_FILE_SIZE) {
        return {
          isValid: false,
          error: `File size exceeds maximum limit of ${this.MAX_FILE_SIZE / (1024 * 1024)}MB`,
          size: buffer.length
        }
      }

      // Check file type using magic numbers
      const fileType = await fileTypeFromBuffer(buffer)
      if (!fileType) {
        return {
          isValid: false,
          error: 'Unable to determine file type'
        }
      }

      if (!this.ALLOWED_TYPES.includes(fileType.mime)) {
        return {
          isValid: false,
          error: `File type ${fileType.mime} is not allowed. Allowed types: ${this.ALLOWED_TYPES.join(', ')}`,
          fileType: fileType.mime
        }
      }

      // Additional validation using Sharp
      try {
        const metadata = await sharp(buffer).metadata()
        
        // Check if it's a valid image
        if (!metadata.width || !metadata.height) {
          return {
            isValid: false,
            error: 'Invalid image file'
          }
        }

        // Check dimensions (reasonable limits)
        if (metadata.width > 5000 || metadata.height > 5000) {
          return {
            isValid: false,
            error: 'Image dimensions too large (max 5000x5000)'
          }
        }

        return {
          isValid: true,
          fileType: fileType.mime,
          size: buffer.length
        }
      } catch (sharpError) {
        return {
          isValid: false,
          error: 'Invalid or corrupted image file'
        }
      }
    } catch (error) {
      return {
        isValid: false,
        error: 'Error validating image file'
      }
    }
  }

  /**
   * Process and optimize image
   */
  static async processImage(
    buffer: Buffer,
    options: ImageUploadOptions = {}
  ): Promise<Buffer> {
    const {
      width = 1200,
      height,
      quality = 85,
      format = 'auto'
    } = options

    let processor = sharp(buffer)

    // Resize if dimensions specified
    if (width || height) {
      processor = processor.resize(width, height, {
        fit: 'inside',
        withoutEnlargement: true
      })
    }

    // Set quality and format
    if (format === 'auto') {
      // Auto-detect best format
      const metadata = await sharp(buffer).metadata()
      if (metadata.format === 'png' && metadata.channels === 4) {
        // Keep PNG for images with transparency
        processor = processor.png({ quality })
      } else {
        // Convert to WebP for better compression
        processor = processor.webp({ quality })
      }
    } else if (format === 'webp') {
      processor = processor.webp({ quality })
    } else if (format === 'jpg') {
      processor = processor.jpeg({ quality })
    } else if (format === 'png') {
      processor = processor.png({ quality })
    }

    return processor.toBuffer()
  }

  /**
   * Upload image to Cloudinary
   */
  static async uploadImage(
    buffer: Buffer,
    options: ImageUploadOptions = {}
  ): Promise<ImageUploadResult> {
    const {
      folder = 'restaurant-images',
      transformation
    } = options

    try {
      // Validate image first
      const validation = await this.validateImage(buffer)
      if (!validation.isValid) {
        throw new Error(validation.error)
      }

      // Process image
      const processedBuffer = await this.processImage(buffer, options)

      // Upload to Cloudinary
      const result = await new Promise<any>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: 'image',
            transformation: transformation ? [{ raw_transformation: transformation }] : undefined,
            // Security settings
            invalidate: true,
            overwrite: false,
            unique_filename: true,
            use_filename: false,
          },
          (error, result) => {
            if (error) reject(error)
            else resolve(result)
          }
        )

        uploadStream.end(processedBuffer)
      })

      return {
        publicId: result.public_id,
        url: result.url,
        secureUrl: result.secure_url,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
        etag: result.etag
      }
    } catch (error) {
      console.error('Image upload error:', error)
      throw new Error(`Failed to upload image: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Delete image from Cloudinary
   */
  static async deleteImage(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId)
    } catch (error) {
      console.error('Image deletion error:', error)
      throw new Error(`Failed to delete image: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Generate optimized image URLs with transformations
   */
  static generateImageUrl(
    publicId: string,
    options: {
      width?: number
      height?: number
      quality?: number
      format?: string
      crop?: string
    } = {}
  ): string {
    const {
      width,
      height,
      quality = 'auto',
      format = 'auto',
      crop = 'fill'
    } = options

    return cloudinary.url(publicId, {
      width,
      height,
      quality,
      format,
      crop,
      fetch_format: 'auto',
      dpr: 'auto',
      responsive: true,
      secure: true
    })
  }

  /**
   * Bulk delete images
   */
  static async bulkDeleteImages(publicIds: string[]): Promise<void> {
    try {
      await cloudinary.api.delete_resources(publicIds)
    } catch (error) {
      console.error('Bulk image deletion error:', error)
      throw new Error(`Failed to delete images: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get image metadata
   */
  static async getImageMetadata(publicId: string) {
    try {
      return await cloudinary.api.resource(publicId)
    } catch (error) {
      console.error('Get image metadata error:', error)
      throw new Error(`Failed to get image metadata: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Invalidate CDN cache for image
   */
  static async invalidateCache(publicIds: string[]): Promise<void> {
    try {
      await cloudinary.api.delete_resources(publicIds, {
        invalidate: true
      })
    } catch (error) {
      console.error('Cache invalidation error:', error)
      throw new Error(`Failed to invalidate cache: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

export default ImageService