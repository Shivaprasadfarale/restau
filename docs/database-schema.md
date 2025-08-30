# Database Schema Documentation

## Overview

This document describes the MongoDB database schema for the restaurant website template. The system uses a multi-tenant architecture with data isolation and comprehensive audit trails.

## Core Principles

### Multi-Tenancy
- All collections include a `tenantId` field for data isolation
- Tenant-aware middleware ensures queries are automatically scoped
- Cross-tenant data access is prevented at the schema level

### Audit Trail
- All documents include `createdAt`, `updatedAt`, `createdBy`, `updatedBy` fields
- Soft delete functionality with `isDeleted`, `deletedAt`, `deletedBy`, `deletionReason`
- Complete change history for compliance and debugging

### Performance Optimization
- Compound indexes for common query patterns
- Text indexes for search functionality
- Geospatial indexes for location-based queries

## Collections

### Users Collection

**Purpose:** Store user accounts for customers, staff, and delivery personnel.

**Schema:**
```typescript
{
  _id: ObjectId,
  tenantId: ObjectId, // Multi-tenant isolation
  email: String, // Unique per tenant
  phone: String,
  passwordHash: String, // bcrypt hashed
  name: String,
  role: 'customer' | 'owner' | 'manager' | 'staff' | 'courier',
  addresses: [AddressSchema],
  preferences: UserPreferencesSchema,
  sessions: [UserSessionSchema], // Active sessions
  isVerified: Boolean,
  lastLogin: Date,
  // Audit fields
  isDeleted: Boolean,
  deletedAt: Date,
  deletedBy: ObjectId,
  deletionReason: String,
  createdAt: Date,
  updatedAt: Date,
  createdBy: ObjectId,
  updatedBy: ObjectId
}
```

**Key Indexes:**
- `{ tenantId: 1, email: 1 }` (unique)
- `{ tenantId: 1, role: 1 }`
- `{ tenantId: 1, isDeleted: 1 }`
- `{ 'sessions.lastActivity': 1 }`

### Restaurants Collection

**Purpose:** Store restaurant configuration and settings.

**Schema:**
```typescript
{
  _id: ObjectId,
  tenantId: ObjectId, // One restaurant per tenant
  name: String,
  description: String,
  logo: String,
  coverImage: String,
  address: AddressSchema,
  contact: ContactInfoSchema,
  operatingHours: OperatingHoursSchema,
  deliveryRadius: Number, // km
  minimumOrderValue: Number,
  taxRate: Number, // GST rate
  deliveryFee: Number,
  paymentMethods: [String],
  settings: RestaurantSettingsSchema,
  maxOrdersPerSlot: Number,
  slotDuration: Number, // minutes
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date,
  createdBy: ObjectId,
  updatedBy: ObjectId
}
```

**Key Indexes:**
- `{ tenantId: 1 }` (unique)
- `{ tenantId: 1, isActive: 1 }`
- `{ 'address.coordinates': '2dsphere' }` (geospatial)

### Categories Collection

**Purpose:** Organize menu items into categories.

**Schema:**
```typescript
{
  _id: ObjectId,
  tenantId: ObjectId,
  restaurantId: ObjectId,
  name: String,
  description: String,
  image: String,
  sortOrder: Number,
  isActive: Boolean,
  // Soft delete fields
  isDeleted: Boolean,
  deletedAt: Date,
  deletedBy: ObjectId,
  deletionReason: String,
  createdAt: Date,
  updatedAt: Date,
  createdBy: ObjectId,
  updatedBy: ObjectId
}
```

**Key Indexes:**
- `{ tenantId: 1, restaurantId: 1, sortOrder: 1 }`
- `{ tenantId: 1, restaurantId: 1, name: 1 }` (unique)
- `{ tenantId: 1, isDeleted: 1 }`

### MenuItems Collection

**Purpose:** Store menu items with pricing, modifiers, and availability.

**Schema:**
```typescript
{
  _id: ObjectId,
  tenantId: ObjectId,
  restaurantId: ObjectId,
  name: String,
  description: String,
  price: Number,
  image: String,
  category: String,
  modifiers: [ModifierSchema],
  availability: Boolean,
  preparationTime: Number, // minutes
  nutritionalInfo: NutritionalInfoSchema,
  tags: [String],
  dietaryInfo: DietaryInfoSchema,
  badges: [String], // 'bestseller', 'new', 'spicy', etc.
  lastModifiedAt: Date,
  // Soft delete fields
  isDeleted: Boolean,
  deletedAt: Date,
  deletedBy: ObjectId,
  deletionReason: String,
  createdAt: Date,
  updatedAt: Date,
  createdBy: ObjectId,
  updatedBy: ObjectId
}
```

**Key Indexes:**
- `{ tenantId: 1, restaurantId: 1, category: 1 }` (menu display)
- `{ tenantId: 1, restaurantId: 1, availability: 1 }`
- `{ name: 'text', description: 'text', tags: 'text' }` (search)
- `{ tenantId: 1, isDeleted: 1 }`

### Orders Collection

**Purpose:** Store customer orders with complete order lifecycle.

**Schema:**
```typescript
{
  _id: ObjectId,
  tenantId: ObjectId,
  userId: ObjectId,
  restaurantId: ObjectId,
  items: [OrderItemSchema],
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled',
  total: CartTotalSchema,
  deliveryAddress: AddressSchema,
  paymentMethod: String,
  paymentId: String,
  estimatedDeliveryTime: Date,
  actualDeliveryTime: Date,
  scheduledFor: Date,
  timeline: [OrderTimelineEventSchema],
  idempotencyKey: String, // Prevent duplicate orders
  createdAt: Date,
  updatedAt: Date,
  createdBy: ObjectId,
  updatedBy: ObjectId
}
```

**Key Indexes (as per requirements):**
- `{ tenantId: 1, userId: 1, createdAt: -1 }` (user order history)
- `{ tenantId: 1, status: 1, createdAt: -1 }` (status-based queries)
- `{ tenantId: 1, restaurantId: 1, status: 1, createdAt: -1 }` (admin management)
- `{ idempotencyKey: 1 }` (unique, prevent duplicates)

### Coupons Collection

**Purpose:** Store discount coupons and promotional codes.

**Schema:**
```typescript
{
  _id: ObjectId,
  tenantId: ObjectId,
  restaurantId: ObjectId,
  code: String,
  active: Boolean,
  discountType: 'percentage' | 'fixed',
  discountValue: Number,
  minOrderValue: Number,
  maxUsage: Number,
  currentUsage: Number,
  validFrom: Date,
  validTo: Date,
  userRestrictions: UserRestrictionsSchema,
  createdAt: Date,
  updatedAt: Date,
  createdBy: ObjectId,
  updatedBy: ObjectId
}
```

**Key Indexes:**
- `{ tenantId: 1, code: 1, active: 1 }`
- `{ tenantId: 1, validFrom: 1, validTo: 1 }`

### DeliveryPersons Collection

**Purpose:** Store delivery personnel information and performance metrics.

**Schema:**
```typescript
{
  _id: ObjectId,
  tenantId: ObjectId,
  userId: ObjectId, // Reference to User with role 'courier'
  restaurantId: ObjectId,
  name: String,
  phone: String,
  email: String,
  address: AddressSchema,
  vehicleInfo: VehicleInfoSchema,
  licenseNumber: String,
  status: 'active' | 'inactive' | 'busy' | 'offline',
  currentLocation: {
    lat: Number,
    lng: Number,
    lastUpdated: Date
  },
  availabilitySchedule: AvailabilityScheduleSchema,
  deliveryStats: DeliveryStatsSchema,
  isVerified: Boolean,
  joinedAt: Date,
  lastActiveAt: Date,
  // Soft delete fields
  isDeleted: Boolean,
  deletedAt: Date,
  deletedBy: ObjectId,
  deletionReason: String,
  createdAt: Date,
  updatedAt: Date,
  createdBy: ObjectId,
  updatedBy: ObjectId
}
```

**Key Indexes:**
- `{ tenantId: 1, restaurantId: 1, status: 1 }`
- `{ tenantId: 1, userId: 1 }` (unique)
- `{ 'currentLocation.lat': 1, 'currentLocation.lng': 1 }` (geospatial)
- `{ tenantId: 1, isDeleted: 1 }`

## Embedded Schemas

### AddressSchema
```typescript
{
  type: 'home' | 'work' | 'other',
  street: String,
  city: String,
  state: String,
  zipCode: String,
  landmark: String,
  coordinates: {
    lat: Number,
    lng: Number
  }
}
```

### ModifierSchema
```typescript
{
  name: String,
  type: 'radio' | 'checkbox' | 'select',
  options: [{
    name: String,
    price: Number
  }],
  required: Boolean,
  maxSelections: Number
}
```

### OrderTimelineEventSchema
```typescript
{
  status: String,
  timestamp: Date,
  updatedBy: ObjectId,
  notes: String
}
```

### DeliveryStatsSchema
```typescript
{
  totalDeliveries: Number,
  completedDeliveries: Number,
  cancelledDeliveries: Number,
  averageRating: Number,
  totalRatings: Number,
  averageDeliveryTime: Number // minutes
}
```

## Data Isolation and Security

### Tenant Isolation
- All queries automatically filtered by `tenantId`
- Middleware prevents cross-tenant data access
- Compound indexes include `tenantId` for performance

### Soft Deletes
- Documents marked as deleted with `isDeleted: true`
- Deletion metadata stored for audit purposes
- Automatic filtering in queries to exclude deleted documents

### Audit Trail
- Complete change history with user attribution
- Timestamps for all operations
- Deletion reasons for compliance

## Performance Considerations

### Indexing Strategy
- Compound indexes for common query patterns
- Text indexes for search functionality
- Geospatial indexes for location queries
- Background index creation to avoid blocking

### Query Optimization
- Tenant-scoped queries for data isolation
- Status-based indexes for order management
- Time-based indexes for analytics and reporting

### Caching Strategy
- Redis caching for frequently accessed data
- Cache invalidation on data changes
- ETags for conditional requests

## Migration and Maintenance

### Schema Migrations
- Versioned migration scripts
- Backward compatibility considerations
- Data validation and integrity checks

### Index Management
- Automated index creation and maintenance
- Performance monitoring and optimization
- Index usage analysis

### Data Cleanup
- Automated cleanup of old sessions
- Permanent deletion of old soft-deleted records
- Performance impact monitoring

## Usage Examples

### Common Queries

**Find user orders:**
```javascript
Order.find({ 
  tenantId: '507f1f77bcf86cd799439011',
  userId: '507f1f77bcf86cd799439012' 
}).sort({ createdAt: -1 })
```

**Find available menu items:**
```javascript
MenuItem.find({
  tenantId: '507f1f77bcf86cd799439011',
  restaurantId: '507f1f77bcf86cd799439013',
  availability: true,
  isDeleted: { $ne: true }
})
```

**Find active delivery persons:**
```javascript
DeliveryPerson.find({
  tenantId: '507f1f77bcf86cd799439011',
  restaurantId: '507f1f77bcf86cd799439013',
  status: 'active',
  isVerified: true
})
```

This schema provides a robust foundation for a multi-tenant restaurant management system with comprehensive audit trails, performance optimization, and data security.