'use client'

import React, { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { 
  getOptimizedImageUrl, 
  generateSrcSet, 
  generateBlurPlaceholder,
  createImageObserver,
  ImageTransformOptions 
} from '@/lib/image-utils'

interface OptimizedImageProps {
  publicId: string
  alt: string
  width?: number
  height?: number
  className?: string
  containerClassName?: string
  transformOptions?: ImageTransformOptions
  lazy?: boolean
  priority?: boolean
  sizes?: string
  aspectRatio?: number
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down'
  placeholder?: 'blur' | 'empty'
  onLoad?: () => void
  onError?: () => void
  fallbackSrc?: string
}

export function OptimizedImage({
  publicId,
  alt,
  width,
  height,
  className,
  containerClassName,
  transformOptions = {},
  lazy = true,
  priority = false,
  sizes,
  aspectRatio,
  objectFit = 'cover',
  placeholder = 'blur',
  onLoad,
  onError,
  fallbackSrc = '/images/placeholder.jpg'
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isInView, setIsInView] = useState(!lazy || priority)
  const [hasError, setHasError] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Set up intersection observer for lazy loading
  useEffect(() => {
    if (!lazy || priority || isInView) return

    const observer = createImageObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true)
            observer.disconnect()
          }
        })
      },
      { rootMargin: '50px' }
    )

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => observer.disconnect()
  }, [lazy, priority, isInView])

  // Generate image URLs
  const optimizedUrl = getOptimizedImageUrl(publicId, {
    width,
    height,
    ...transformOptions
  })

  const srcSet = generateSrcSet(publicId, [300, 600, 900, 1200])

  // Calculate container aspect ratio
  const containerAspectRatio = aspectRatio || (width && height ? width / height : undefined)

  // Handle image load
  const handleLoad = () => {
    setIsLoaded(true)
    onLoad?.()
  }

  // Handle image error
  const handleError = () => {
    setHasError(true)
    onError?.()
  }

  // Generate blur placeholder
  const blurPlaceholder = placeholder === 'blur' 
    ? generateBlurPlaceholder(width || 400, height || 300)
    : undefined

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden',
        containerAspectRatio && 'aspect-[var(--aspect-ratio)]',
        containerClassName
      )}
      style={{
        '--aspect-ratio': containerAspectRatio?.toString()
      } as React.CSSProperties}
    >
      {/* Placeholder */}
      {!isLoaded && placeholder === 'blur' && (
        <img
          src={blurPlaceholder}
          alt=""
          className={cn(
            'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
            isLoaded ? 'opacity-0' : 'opacity-100'
          )}
          aria-hidden="true"
        />
      )}

      {/* Loading skeleton */}
      {!isLoaded && placeholder === 'empty' && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse" />
      )}

      {/* Main image */}
      {(isInView || priority) && (
        <img
          ref={imgRef}
          src={hasError ? fallbackSrc : optimizedUrl}
          srcSet={hasError ? undefined : srcSet}
          sizes={sizes}
          alt={alt}
          width={width}
          height={height}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className={cn(
            'w-full h-full transition-opacity duration-300',
            `object-${objectFit}`,
            isLoaded ? 'opacity-100' : 'opacity-0',
            className
          )}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}

      {/* Error state */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-gray-400">
          <div className="text-center">
            <div className="text-sm">Failed to load image</div>
            <div className="text-xs mt-1">{alt}</div>
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {!isLoaded && !hasError && isInView && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400" />
        </div>
      )}
    </div>
  )
}

// Specialized components for common use cases
export function MenuItemImage({
  publicId,
  alt,
  className,
  ...props
}: Omit<OptimizedImageProps, 'transformOptions'>) {
  return (
    <OptimizedImage
      publicId={publicId}
      alt={alt}
      className={className}
      transformOptions={{
        width: 400,
        height: 300,
        crop: 'fill',
        quality: 85,
        format: 'auto'
      }}
      aspectRatio={4 / 3}
      {...props}
    />
  )
}

export function ThumbnailImage({
  publicId,
  alt,
  size = 100,
  className,
  ...props
}: Omit<OptimizedImageProps, 'width' | 'height' | 'transformOptions'> & {
  size?: number
}) {
  return (
    <OptimizedImage
      publicId={publicId}
      alt={alt}
      width={size}
      height={size}
      className={className}
      transformOptions={{
        width: size,
        height: size,
        crop: 'fill',
        quality: 80,
        format: 'auto'
      }}
      aspectRatio={1}
      {...props}
    />
  )
}

export function HeroImage({
  publicId,
  alt,
  className,
  ...props
}: Omit<OptimizedImageProps, 'transformOptions' | 'priority'>) {
  return (
    <OptimizedImage
      publicId={publicId}
      alt={alt}
      className={className}
      transformOptions={{
        width: 1920,
        height: 1080,
        crop: 'fill',
        quality: 90,
        format: 'auto'
      }}
      aspectRatio={16 / 9}
      priority={true}
      lazy={false}
      {...props}
    />
  )
}

export default OptimizedImage