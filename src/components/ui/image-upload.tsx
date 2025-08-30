'use client'

import React, { useCallback, useState, useRef } from 'react'
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useImageUpload, ImageUploadOptions } from '@/lib/hooks/use-image-upload'
import { cn } from '@/lib/utils'

interface ImageUploadProps {
  onUploadComplete?: (result: { publicId: string; url: string }) => void
  onUploadError?: (error: string) => void
  options?: ImageUploadOptions
  className?: string
  multiple?: boolean
  maxFiles?: number
  showPreview?: boolean
  disabled?: boolean
}

export function ImageUpload({
  onUploadComplete,
  onUploadError,
  options = {},
  className,
  multiple = false,
  maxFiles = 5,
  showPreview = true,
  disabled = false
}: ImageUploadProps) {
  const [dragActive, setDragActive] = useState(false)
  const [uploadedImages, setUploadedImages] = useState<Array<{ publicId: string; url: string; file: File }>>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const { 
    uploadImage, 
    deleteImage, 
    validateFile, 
    uploadProgress, 
    isUploading, 
    uploadError 
  } = useImageUpload()

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    
    // Check file limit
    if (multiple && uploadedImages.length + fileArray.length > maxFiles) {
      onUploadError?.(`Maximum ${maxFiles} files allowed`)
      return
    }

    if (!multiple && fileArray.length > 1) {
      onUploadError?.('Only one file allowed')
      return
    }

    for (const file of fileArray) {
      try {
        // Validate file
        const validation = validateFile(file)
        if (!validation.isValid) {
          onUploadError?.(validation.error || 'Invalid file')
          continue
        }

        // Upload file
        const result = await uploadImage(file, {
          ...options,
          onProgress: (progress) => {
            // Progress is handled by the hook
          }
        })

        const uploadedImage = {
          publicId: result.publicId,
          url: result.url,
          file
        }

        if (multiple) {
          setUploadedImages(prev => [...prev, uploadedImage])
        } else {
          setUploadedImages([uploadedImage])
        }

        onUploadComplete?.(result)
      } catch (error) {
        onUploadError?.(error instanceof Error ? error.message : 'Upload failed')
      }
    }
  }, [uploadImage, validateFile, onUploadComplete, onUploadError, options, multiple, maxFiles, uploadedImages.length])

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (disabled || isUploading) return

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      handleFiles(files)
    }
  }, [handleFiles, disabled, isUploading])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFiles(files)
    }
    // Reset input value to allow uploading the same file again
    e.target.value = ''
  }, [handleFiles])

  const handleRemoveImage = useCallback(async (publicId: string) => {
    try {
      await deleteImage(publicId)
      setUploadedImages(prev => prev.filter(img => img.publicId !== publicId))
    } catch (error) {
      onUploadError?.(error instanceof Error ? error.message : 'Failed to delete image')
    }
  }, [deleteImage, onUploadError])

  const openFileDialog = useCallback(() => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click()
    }
  }, [disabled, isUploading])

  return (
    <div className={cn('w-full', className)}>
      {/* Upload Area */}
      <div
        className={cn(
          'relative border-2 border-dashed rounded-lg p-6 transition-colors',
          dragActive ? 'border-primary bg-primary/5' : 'border-gray-300',
          disabled || isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary',
          'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20'
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={openFileDialog}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple={multiple}
          accept="image/jpeg,image/png,image/webp"
          onChange={handleInputChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={disabled || isUploading}
        />

        <div className="flex flex-col items-center justify-center text-center">
          {isUploading ? (
            <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
          ) : (
            <Upload className="h-10 w-10 text-gray-400 mb-4" />
          )}
          
          <div className="text-lg font-medium text-gray-900 mb-2">
            {isUploading ? 'Uploading...' : 'Drop images here or click to upload'}
          </div>
          
          <div className="text-sm text-gray-500">
            {multiple ? `Up to ${maxFiles} files` : 'Single file'} • JPEG, PNG, WebP • Max 10MB each
          </div>

          {isUploading && (
            <div className="w-full max-w-xs mt-4">
              <Progress value={uploadProgress} className="h-2" />
              <div className="text-xs text-gray-500 mt-1 text-center">
                {uploadProgress}% uploaded
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error Display */}
      {uploadError && (
        <div className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {uploadError.message}
        </div>
      )}

      {/* Image Previews */}
      {showPreview && uploadedImages.length > 0 && (
        <div className="mt-4">
          <div className="text-sm font-medium text-gray-700 mb-2">
            Uploaded Images ({uploadedImages.length})
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {uploadedImages.map((image) => (
              <div key={image.publicId} className="relative group">
                <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                  <img
                    src={image.url}
                    alt={image.file.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveImage(image.publicId)
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 truncate">
                  {image.file.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ImageUpload