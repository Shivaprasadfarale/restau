# Image Upload and Management System

## Overview

The image upload and management system provides comprehensive functionality for handling restaurant images with optimization, validation, and CDN integration. This system is designed to be secure, performant, and scalable.

## Features

### 1. Image Upload Service (`ImageService`)

- **Validation**: File type, size, and dimension validation
- **Processing**: Automatic image optimization and compression using Sharp
- **Upload**: Cloudinary integration with secure upload
- **Transformation**: Dynamic image transformations and optimization
- **Security**: SSRF protection and file type validation using magic numbers

### 2. API Endpoints

#### Upload Image (`POST /api/images/upload`)
- Handles multipart form data uploads
- Rate limiting (10 uploads per minute)
- Authentication and authorization checks
- Automatic image processing and optimization
- Audit logging for all uploads

#### Delete Image (`DELETE /api/images/delete`)
- Single and bulk image deletion
- Tenant isolation for security
- Rate limiting (20 deletes per minute)
- Audit logging for deletions

#### Transform Image (`GET/POST /api/images/transform`)
- Generate optimized image URLs with transformations
- Support for width, height, quality, format, and crop parameters
- Automatic format selection (WebP, AVIF, etc.)

### 3. React Components

#### ImageUpload Component
- Drag and drop functionality
- File validation on client side
- Progress indication during upload
- Preview functionality
- Error handling and user feedback
- Support for single and multiple file uploads

#### ImageGallery Component
- Grid and list view modes
- Search and filtering capabilities
- Bulk selection and operations
- Lazy loading for performance
- Image preview modal
- Responsive design

#### OptimizedImage Component
- Lazy loading with intersection observer
- Responsive image generation
- Automatic format optimization
- Blur placeholder support
- Error handling with fallback images
- Specialized variants (MenuItemImage, ThumbnailImage, HeroImage)

### 4. Utility Functions

#### Image Utils (`image-utils.ts`)
- URL generation for optimized images
- Responsive image srcSet generation
- File validation helpers
- Image metadata extraction
- Blur placeholder generation
- Preloading and lazy loading utilities

## Configuration

### Environment Variables

```env
# Cloudinary Configuration (Required)
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

### Image Processing Settings

- **Max File Size**: 10MB
- **Allowed Formats**: JPEG, PNG, WebP
- **Max Dimensions**: 5000x5000 pixels
- **Default Quality**: 85%
- **Auto Format**: WebP for better compression, PNG preserved for transparency

## Security Features

### 1. File Validation
- Magic number validation to prevent file type spoofing
- File size limits to prevent DoS attacks
- Dimension validation to prevent memory exhaustion
- Virus scanning integration ready

### 2. Access Control
- Role-based access control (owner, manager, staff)
- Tenant isolation for multi-restaurant support
- Rate limiting to prevent abuse
- Audit logging for compliance

### 3. SSRF Protection
- URL validation for external image sources
- Restricted file upload sources
- Content-Type validation

## Performance Optimizations

### 1. Image Processing
- Automatic compression and optimization
- Format conversion (JPEG → WebP)
- Responsive image generation
- Progressive JPEG support

### 2. CDN Integration
- Cloudinary CDN for global distribution
- Cache invalidation support
- Automatic format selection based on browser support
- Responsive breakpoints

### 3. Frontend Optimizations
- Lazy loading with intersection observer
- Blur placeholders for better UX
- Progressive image loading
- Client-side caching

## Usage Examples

### Basic Image Upload

```tsx
import ImageUpload from '@/components/ui/image-upload'

function MenuItemForm() {
  const handleUploadComplete = (result) => {
    console.log('Image uploaded:', result.url)
  }

  return (
    <ImageUpload
      onUploadComplete={handleUploadComplete}
      options={{
        folder: 'menu-items',
        width: 800,
        height: 600,
        quality: 85
      }}
      multiple={false}
      showPreview={true}
    />
  )
}
```

### Optimized Image Display

```tsx
import { MenuItemImage } from '@/components/ui/optimized-image'

function MenuCard({ item }) {
  return (
    <MenuItemImage
      publicId={item.imagePublicId}
      alt={item.name}
      className="w-full h-48 object-cover"
      lazy={true}
      placeholder="blur"
    />
  )
}
```

### Image Gallery Management

```tsx
import ImageGallery from '@/components/ui/image-gallery'

function AdminImageManager() {
  const handleImageSelect = (image) => {
    console.log('Selected image:', image)
  }

  const handleBulkDelete = (publicIds) => {
    console.log('Deleting images:', publicIds)
  }

  return (
    <ImageGallery
      images={images}
      onImageSelect={handleImageSelect}
      onBulkDelete={handleBulkDelete}
      selectable={true}
      multiple={true}
      showUpload={true}
    />
  )
}
```

## API Usage

### Upload Image

```javascript
const formData = new FormData()
formData.append('file', imageFile)
formData.append('folder', 'menu-items')
formData.append('width', '800')
formData.append('height', '600')

const response = await fetch('/api/images/upload', {
  method: 'POST',
  body: formData,
  credentials: 'include'
})

const result = await response.json()
console.log('Upload result:', result.data)
```

### Generate Optimized URL

```javascript
const optimizedUrl = getOptimizedImageUrl(publicId, {
  width: 400,
  height: 300,
  quality: 80,
  format: 'webp',
  crop: 'fill'
})
```

## Testing

The system includes comprehensive tests covering:

- Image validation and processing
- Upload and deletion functionality
- URL generation and transformations
- Component rendering and interactions
- Error handling and edge cases

Run tests with:
```bash
npm run test -- src/test/image-upload.test.ts
```

## Monitoring and Analytics

### Audit Logging
All image operations are logged with:
- User ID and tenant ID
- Action type (upload, delete, transform)
- Resource details (file size, format, dimensions)
- Timestamp and IP address

### Performance Metrics
- Upload success/failure rates
- Image processing times
- CDN cache hit rates
- Storage usage by tenant

## Troubleshooting

### Common Issues

1. **Upload Fails with "File too large"**
   - Check file size limit (10MB)
   - Verify client-side validation

2. **Images not displaying**
   - Verify Cloudinary configuration
   - Check public ID format
   - Ensure proper URL generation

3. **Slow image loading**
   - Enable lazy loading
   - Use appropriate image sizes
   - Check CDN configuration

### Debug Mode

Enable debug logging by setting:
```env
DEBUG=image-service:*
```

## Future Enhancements

1. **Advanced Features**
   - AI-powered image tagging
   - Automatic alt text generation
   - Image similarity detection
   - Batch processing workflows

2. **Performance Improvements**
   - WebP and AVIF format support
   - Client-side image compression
   - Progressive image loading
   - Edge caching optimization

3. **Security Enhancements**
   - Advanced virus scanning
   - Content moderation
   - Watermarking support
   - Digital rights management

## Compliance

The system is designed to comply with:
- GDPR data protection requirements
- Accessibility standards (WCAG 2.1)
- Performance best practices
- Security standards (OWASP)