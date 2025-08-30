/**
 * Image utility functions for optimized loading and display
 */

export interface ImageTransformOptions {
  width?: number
  height?: number
  quality?: number
  format?: 'auto' | 'jpg' | 'png' | 'webp'
  crop?: 'fill' | 'fit' | 'scale' | 'crop'
}

/**
 * Generate optimized image URL with transformations
 */
export function getOptimizedImageUrl(
  publicId: string,
  options: ImageTransformOptions = {}
): string {
  const {
    width,
    height,
    quality = 'auto',
    format = 'auto',
    crop = 'fill'
  } = options

  const params = new URLSearchParams()
  params.set('publicId', publicId)
  if (width) params.set('width', width.toString())
  if (height) params.set('height', height.toString())
  params.set('quality', quality.toString())
  params.set('format', format)
  params.set('crop', crop)

  return `/api/images/transform?${params.toString()}`
}

/**
 * Generate responsive image URLs for different screen sizes
 */
export function getResponsiveImageUrls(publicId: string) {
  return {
    thumbnail: getOptimizedImageUrl(publicId, { width: 150, height: 150, crop: 'fill' }),
    small: getOptimizedImageUrl(publicId, { width: 300, height: 200, crop: 'fill' }),
    medium: getOptimizedImageUrl(publicId, { width: 600, height: 400, crop: 'fill' }),
    large: getOptimizedImageUrl(publicId, { width: 1200, height: 800, crop: 'fit' }),
    original: getOptimizedImageUrl(publicId, { format: 'auto', quality: 90 })
  }
}

/**
 * Generate srcSet for responsive images
 */
export function generateSrcSet(publicId: string, sizes: number[] = [300, 600, 900, 1200]): string {
  return sizes
    .map(size => `${getOptimizedImageUrl(publicId, { width: size, format: 'auto' })} ${size}w`)
    .join(', ')
}

/**
 * Get image dimensions from URL or calculate aspect ratio
 */
export function getImageAspectRatio(width: number, height: number): number {
  return width / height
}

/**
 * Calculate responsive image sizes based on container width
 */
export function calculateResponsiveSizes(
  containerWidth: number,
  breakpoints: { [key: string]: number } = {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280
  }
): string {
  const sizes = []
  
  if (containerWidth <= breakpoints.sm) {
    sizes.push('(max-width: 640px) 100vw')
  }
  if (containerWidth <= breakpoints.md) {
    sizes.push('(max-width: 768px) 50vw')
  }
  if (containerWidth <= breakpoints.lg) {
    sizes.push('(max-width: 1024px) 33vw')
  }
  
  sizes.push('25vw')
  
  return sizes.join(', ')
}

/**
 * Validate image file on client side
 */
export function validateImageFile(file: File): { isValid: boolean; error?: string } {
  // Check file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    return {
      isValid: false,
      error: 'Only JPEG, PNG, and WebP images are allowed'
    }
  }

  // Check file size (10MB limit)
  const maxSize = 10 * 1024 * 1024
  if (file.size > maxSize) {
    return {
      isValid: false,
      error: 'File size must be less than 10MB'
    }
  }

  return { isValid: true }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Extract public ID from Cloudinary URL
 */
export function extractPublicIdFromUrl(url: string): string | null {
  try {
    // Handle Cloudinary URLs
    const cloudinaryMatch = url.match(/\/v\d+\/(.+)\.[a-zA-Z]+$/)
    if (cloudinaryMatch) {
      return cloudinaryMatch[1]
    }

    // Handle transformed URLs
    const transformMatch = url.match(/publicId=([^&]+)/)
    if (transformMatch) {
      return decodeURIComponent(transformMatch[1])
    }

    return null
  } catch (error) {
    console.error('Error extracting public ID from URL:', error)
    return null
  }
}

/**
 * Generate blur placeholder for images
 */
export function generateBlurPlaceholder(width: number = 10, height: number = 10): string {
  // Generate a simple SVG blur placeholder
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#f3f4f6;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#e5e7eb;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#grad)" />
    </svg>
  `
  
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

/**
 * Preload critical images
 */
export function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = reject
    img.src = src
  })
}

/**
 * Lazy load images with intersection observer
 */
export function createImageObserver(
  callback: (entries: IntersectionObserverEntry[]) => void,
  options: IntersectionObserverInit = {}
): IntersectionObserver {
  const defaultOptions = {
    root: null,
    rootMargin: '50px',
    threshold: 0.1,
    ...options
  }

  return new IntersectionObserver(callback, defaultOptions)
}

/**
 * Get image metadata from file
 */
export function getImageMetadata(file: File): Promise<{
  width: number
  height: number
  aspectRatio: number
}> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    
    img.onload = () => {
      const width = img.naturalWidth
      const height = img.naturalHeight
      const aspectRatio = width / height
      
      URL.revokeObjectURL(url)
      resolve({ width, height, aspectRatio })
    }
    
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    
    img.src = url
  })
}

export default {
  getOptimizedImageUrl,
  getResponsiveImageUrls,
  generateSrcSet,
  getImageAspectRatio,
  calculateResponsiveSizes,
  validateImageFile,
  formatFileSize,
  extractPublicIdFromUrl,
  generateBlurPlaceholder,
  preloadImage,
  createImageObserver,
  getImageMetadata
}