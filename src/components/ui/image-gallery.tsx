'use client'

import React, { useState, useCallback, useMemo } from 'react'
import { Search, Grid, List, Trash2, Download, Eye, Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useImageUpload } from '@/lib/hooks/use-image-upload'
import { cn } from '@/lib/utils'

interface ImageItem {
  publicId: string
  url: string
  secureUrl: string
  width: number
  height: number
  format: string
  bytes: number
  createdAt: string
  folder?: string
  tags?: string[]
}

interface ImageGalleryProps {
  images: ImageItem[]
  onImageSelect?: (image: ImageItem) => void
  onImageDelete?: (publicId: string) => void
  onBulkDelete?: (publicIds: string[]) => void
  selectable?: boolean
  multiple?: boolean
  className?: string
  showUpload?: boolean
  folder?: string
}

type ViewMode = 'grid' | 'list'
type SortBy = 'date' | 'name' | 'size' | 'format'
type FilterBy = 'all' | 'jpg' | 'png' | 'webp'

export function ImageGallery({
  images,
  onImageSelect,
  onImageDelete,
  onBulkDelete,
  selectable = false,
  multiple = false,
  className,
  showUpload = false,
  folder = 'gallery'
}: ImageGalleryProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('date')
  const [filterBy, setFilterBy] = useState<FilterBy>('all')
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set())
  const [previewImage, setPreviewImage] = useState<ImageItem | null>(null)

  const { bulkDeleteImages, isDeleting } = useImageUpload()

  // Filter and sort images
  const filteredAndSortedImages = useMemo(() => {
    let filtered = images

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(image => 
        image.publicId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        image.folder?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // Apply format filter
    if (filterBy !== 'all') {
      filtered = filtered.filter(image => image.format === filterBy)
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case 'name':
          return a.publicId.localeCompare(b.publicId)
        case 'size':
          return b.bytes - a.bytes
        case 'format':
          return a.format.localeCompare(b.format)
        default:
          return 0
      }
    })

    return filtered
  }, [images, searchQuery, sortBy, filterBy])

  const handleImageSelect = useCallback((image: ImageItem) => {
    if (!selectable) {
      onImageSelect?.(image)
      return
    }

    if (multiple) {
      setSelectedImages(prev => {
        const newSet = new Set(prev)
        if (newSet.has(image.publicId)) {
          newSet.delete(image.publicId)
        } else {
          newSet.add(image.publicId)
        }
        return newSet
      })
    } else {
      setSelectedImages(new Set([image.publicId]))
      onImageSelect?.(image)
    }
  }, [selectable, multiple, onImageSelect])

  const handleBulkDelete = useCallback(async () => {
    if (selectedImages.size === 0) return

    try {
      const publicIds = Array.from(selectedImages)
      await bulkDeleteImages(publicIds)
      onBulkDelete?.(publicIds)
      setSelectedImages(new Set())
    } catch (error) {
      console.error('Bulk delete failed:', error)
    }
  }, [selectedImages, bulkDeleteImages, onBulkDelete])

  const handleSelectAll = useCallback(() => {
    if (selectedImages.size === filteredAndSortedImages.length) {
      setSelectedImages(new Set())
    } else {
      setSelectedImages(new Set(filteredAndSortedImages.map(img => img.publicId)))
    }
  }, [selectedImages.size, filteredAndSortedImages])

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const generateOptimizedUrl = (publicId: string, width: number = 300, height: number = 300) => {
    // This would use your image transformation service
    return `/api/images/transform?publicId=${publicId}&width=${width}&height=${height}&quality=80&format=auto`
  }

  return (
    <div className={cn('w-full space-y-4', className)}>
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search images..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-64"
            />
          </div>
          
          <Select value={filterBy} onValueChange={(value: FilterBy) => setFilterBy(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="jpg">JPEG</SelectItem>
              <SelectItem value="png">PNG</SelectItem>
              <SelectItem value="webp">WebP</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(value: SortBy) => setSortBy(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Date</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="size">Size</SelectItem>
              <SelectItem value="format">Format</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          {selectable && selectedImages.size > 0 && (
            <>
              <span className="text-sm text-gray-600">
                {selectedImages.size} selected
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                disabled={isDeleting}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete Selected
              </Button>
            </>
          )}

          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className="rounded-r-none"
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="rounded-l-none"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Bulk Selection Controls */}
      {selectable && multiple && (
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
          <Checkbox
            checked={selectedImages.size === filteredAndSortedImages.length && filteredAndSortedImages.length > 0}
            onCheckedChange={handleSelectAll}
          />
          <span className="text-sm">Select All ({filteredAndSortedImages.length} images)</span>
        </div>
      )}

      {/* Images Display */}
      {filteredAndSortedImages.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <div className="text-lg font-medium mb-2">No images found</div>
          <div className="text-sm">
            {searchQuery || filterBy !== 'all' 
              ? 'Try adjusting your search or filters' 
              : 'Upload some images to get started'
            }
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {filteredAndSortedImages.map((image) => (
            <div
              key={image.publicId}
              className={cn(
                'relative group cursor-pointer rounded-lg overflow-hidden bg-gray-100 aspect-square',
                selectable && selectedImages.has(image.publicId) && 'ring-2 ring-primary'
              )}
              onClick={() => handleImageSelect(image)}
            >
              {selectable && (
                <Checkbox
                  checked={selectedImages.has(image.publicId)}
                  className="absolute top-2 left-2 z-10 bg-white"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              
              <img
                src={image.url}
                alt={image.publicId}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors">
                <div className="absolute bottom-0 left-0 right-0 p-2 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="truncate">{image.publicId.split('/').pop()}</div>
                  <div>{formatFileSize(image.bytes)} • {image.format.toUpperCase()}</div>
                </div>
                
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPreviewImage(image)
                    }}
                  >
                    <Eye className="h-3 w-3" />
                  </Button>
                  {onImageDelete && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-6 w-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        onImageDelete(image.publicId)
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredAndSortedImages.map((image) => (
            <div
              key={image.publicId}
              className={cn(
                'flex items-center gap-4 p-3 border rounded-lg cursor-pointer hover:bg-gray-50',
                selectable && selectedImages.has(image.publicId) && 'bg-primary/5 border-primary'
              )}
              onClick={() => handleImageSelect(image)}
            >
              {selectable && (
                <Checkbox
                  checked={selectedImages.has(image.publicId)}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              
              <img
                src={image.url}
                alt={image.publicId}
                className="w-12 h-12 object-cover rounded"
                loading="lazy"
              />
              
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{image.publicId.split('/').pop()}</div>
                <div className="text-sm text-gray-500">
                  {formatFileSize(image.bytes)} • {image.format.toUpperCase()} • {image.width}×{image.height}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation()
                    setPreviewImage(image)
                  }}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                {onImageDelete && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      onImageDelete(image.publicId)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="relative max-w-4xl max-h-full">
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-4 right-4 text-white hover:bg-white/20"
              onClick={() => setPreviewImage(null)}
            >
              <X className="h-4 w-4" />
            </Button>
            
            <img
              src={previewImage.secureUrl}
              alt={previewImage.publicId}
              className="max-w-full max-h-full object-contain"
            />
            
            <div className="absolute bottom-4 left-4 right-4 bg-black/50 text-white p-4 rounded">
              <div className="font-medium">{previewImage.publicId.split('/').pop()}</div>
              <div className="text-sm opacity-75">
                {formatFileSize(previewImage.bytes)} • {previewImage.format.toUpperCase()} • {previewImage.width}×{previewImage.height}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ImageGallery