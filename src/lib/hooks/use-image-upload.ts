import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export interface ImageUploadOptions {
  folder?: string
  width?: number
  height?: number
  quality?: number
  onProgress?: (progress: number) => void
}

export interface ImageUploadResult {
  publicId: string
  url: string
  width: number
  height: number
  format: string
  bytes: number
}

export interface ImageUploadError {
  message: string
  code?: string
}

export function useImageUpload() {
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const queryClient = useQueryClient()

  const uploadMutation = useMutation({
    mutationFn: async ({ 
      file, 
      options = {} 
    }: { 
      file: File
      options?: ImageUploadOptions 
    }): Promise<ImageUploadResult> => {
      const formData = new FormData()
      formData.append('file', file)
      
      if (options.folder) formData.append('folder', options.folder)
      if (options.width) formData.append('width', options.width.toString())
      if (options.height) formData.append('height', options.height.toString())
      if (options.quality) formData.append('quality', options.quality.toString())

      const response = await fetch('/api/images/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to upload image')
      }

      const result = await response.json()
      return result.data
    },
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['menu-items'] })
      queryClient.invalidateQueries({ queryKey: ['images'] })
      setUploadProgress(0)
    },
    onError: () => {
      setUploadProgress(0)
    }
  })

  const deleteImageMutation = useMutation({
    mutationFn: async (publicId: string): Promise<void> => {
      const response = await fetch('/api/images/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ publicId }),
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete image')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items'] })
      queryClient.invalidateQueries({ queryKey: ['images'] })
    }
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: async (publicIds: string[]): Promise<void> => {
      const response = await fetch('/api/images/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ publicIds }),
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete images')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items'] })
      queryClient.invalidateQueries({ queryKey: ['images'] })
    }
  })

  const validateFile = useCallback((file: File): { isValid: boolean; error?: string } => {
    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      return { isValid: false, error: 'File size must be less than 10MB' }
    }

    // Check file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return { isValid: false, error: 'Only JPEG, PNG, and WebP images are allowed' }
    }

    return { isValid: true }
  }, [])

  const uploadImage = useCallback(async (
    file: File, 
    options: ImageUploadOptions = {}
  ): Promise<ImageUploadResult> => {
    // Validate file first
    const validation = validateFile(file)
    if (!validation.isValid) {
      throw new Error(validation.error)
    }

    // Set up progress tracking if callback provided
    if (options.onProgress) {
      setUploadProgress(0)
      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return prev
          }
          return prev + 10
        })
      }, 200)
    }

    return uploadMutation.mutateAsync({ file, options })
  }, [uploadMutation, validateFile])

  const deleteImage = useCallback((publicId: string) => {
    return deleteImageMutation.mutateAsync(publicId)
  }, [deleteImageMutation])

  const bulkDeleteImages = useCallback((publicIds: string[]) => {
    return bulkDeleteMutation.mutateAsync(publicIds)
  }, [bulkDeleteMutation])

  return {
    uploadImage,
    deleteImage,
    bulkDeleteImages,
    validateFile,
    uploadProgress,
    isUploading: uploadMutation.isPending,
    isDeleting: deleteImageMutation.isPending || bulkDeleteMutation.isPending,
    uploadError: uploadMutation.error as ImageUploadError | null,
    deleteError: deleteImageMutation.error as ImageUploadError | null
  }
}