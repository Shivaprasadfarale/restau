# API Documentation

## Overview

This document provides comprehensive API documentation for the Restaurant Template system.

## Base URL

```
Production: https://yourdomain.com/api
Development: http://localhost:3000/api
```

## Authentication

### JWT Token Authentication

Most endpoints require authentication via JWT tokens sent in the Authorization header:

```
Authorization: Bearer <token>
```

### Admin Authentication

Admin endpoints require admin JWT tokens:

```
Authorization: Bearer <admin-token>
```

## Rate Limiting

API endpoints are rate-limited:
- General endpoints: 100 requests per hour per IP
- Authentication endpoints: 10 requests per hour per IP
- Payment endpoints: 20 requests per hour per IP

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Request limit
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Reset timestamp

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error message",
  "type": "error_type",
  "details": {} // Optional additional details
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `409`: Conflict
- `429`: Rate Limited
- `500`: Internal Server Error

## Authentication Endpoints

### Register User

```http
POST /api/auth/register
```

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securePassword123",
  "phone": "+1234567890"
}
```

**Response:**
```json
{
  "user": {
    "id": "user_id",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890"
  },
  "token": "jwt_token",
  "refreshToken": "refresh_token"
}
```

### Login User

```http
POST /api/auth/login
```

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "user": {
    "id": "user_id",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "token": "jwt_token",
  "refreshToken": "refresh_token"
}
```

### Refresh Token

```http
POST /api/auth/refresh
```

**Request Body:**
```json
{
  "refreshToken": "refresh_token"
}
```

### Send OTP

```http
POST /api/auth/otp/send
```

**Request Body:**
```json
{
  "phone": "+1234567890"
}
```

### Verify OTP

```http
POST /api/auth/otp/verify
```

**Request Body:**
```json
{
  "phone": "+1234567890",
  "otp": "123456"
}
```

### Logout

```http
POST /api/auth/logout
```

**Headers:**
```
Authorization: Bearer <token>
```

## Menu Endpoints

### Get Menu Categories

```http
GET /api/menu/categories
```

**Response:**
```json
{
  "categories": [
    {
      "id": "category_id",
      "name": "Starters",
      "description": "Appetizers and starters",
      "image": "category_image_url",
      "sortOrder": 1,
      "isActive": true
    }
  ]
}
```

### Get Menu Items

```http
GET /api/menu/items?category=category_id&search=query&page=1&limit=20
```

**Query Parameters:**
- `category` (optional): Filter by category ID
- `search` (optional): Search query
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)

**Response:**
```json
{
  "items": [
    {
      "id": "item_id",
      "name": "Chicken Tikka",
      "description": "Grilled chicken with spices",
      "price": 299,
      "image": "item_image_url",
      "category": "category_id",
      "isAvailable": true,
      "isVegetarian": false,
      "spiceLevel": "medium",
      "preparationTime": 15,
      "modifiers": [
        {
          "name": "Size",
          "options": [
            { "name": "Regular", "price": 0 },
            { "name": "Large", "price": 50 }
          ]
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "pages": 3
  }
}
```

### Get Single Menu Item

```http
GET /api/menu/items/:id
```

**Response:**
```json
{
  "item": {
    "id": "item_id",
    "name": "Chicken Tikka",
    "description": "Grilled chicken with spices",
    "price": 299,
    "image": "item_image_url",
    "category": "category_id",
    "isAvailable": true,
    "nutritionalInfo": {
      "calories": 250,
      "protein": 25,
      "carbs": 5,
      "fat": 12
    }
  }
}
```

### Search Menu Items

```http
GET /api/menu/search?q=query&filters=vegetarian,spicy
```

## Cart Endpoints

### Add Item to Cart

```http
POST /api/cart/add
```

**Request Body:**
```json
{
  "itemId": "item_id",
  "quantity": 2,
  "modifiers": [
    {
      "name": "Size",
      "option": "Large"
    }
  ],
  "specialInstructions": "Extra spicy"
}
```

### Update Cart Item

```http
PUT /api/cart/update
```

**Request Body:**
```json
{
  "itemId": "item_id",
  "quantity": 3
}
```

### Remove Item from Cart

```http
DELETE /api/cart/remove
```

**Request Body:**
```json
{
  "itemId": "item_id"
}
```

### Get Cart

```http
GET /api/cart/get
```

**Response:**
```json
{
  "cart": {
    "items": [
      {
        "id": "cart_item_id",
        "item": {
          "id": "item_id",
          "name": "Chicken Tikka",
          "price": 299
        },
        "quantity": 2,
        "modifiers": [],
        "subtotal": 598
      }
    ],
    "subtotal": 598,
    "tax": 59.8,
    "deliveryFee": 50,
    "total": 707.8
  }
}
```

### Calculate Cart Total

```http
POST /api/cart/calculate
```

**Request Body:**
```json
{
  "couponCode": "SAVE10",
  "deliveryAddress": {
    "latitude": 12.9716,
    "longitude": 77.5946
  }
}
```

### Clear Cart

```http
DELETE /api/cart/clear
```

## Order Endpoints

### Create Order

```http
POST /api/orders
```

**Request Body:**
```json
{
  "deliveryAddress": {
    "street": "123 Main St",
    "city": "Bangalore",
    "state": "Karnataka",
    "pincode": "560001",
    "latitude": 12.9716,
    "longitude": 77.5946
  },
  "paymentMethod": "razorpay",
  "specialInstructions": "Ring the bell twice",
  "couponCode": "SAVE10"
}
```

**Response:**
```json
{
  "order": {
    "id": "order_id",
    "orderNumber": "ORD-001",
    "status": "pending",
    "total": 707.8,
    "estimatedDeliveryTime": "2024-01-15T14:30:00Z"
  },
  "paymentIntent": {
    "id": "payment_intent_id",
    "clientSecret": "client_secret"
  }
}
```

### Get Orders

```http
GET /api/orders?page=1&limit=10&status=delivered
```

**Headers:**
```
Authorization: Bearer <token>
```

### Get Single Order

```http
GET /api/orders/:id
```

**Headers:**
```
Authorization: Bearer <token>
```

### Cancel Order

```http
POST /api/orders/:id/cancel
```

**Headers:**
```
Authorization: Bearer <token>
```

### Track Order

```http
GET /api/track/:orderId
```

**Response:**
```json
{
  "order": {
    "id": "order_id",
    "status": "preparing",
    "estimatedDeliveryTime": "2024-01-15T14:30:00Z",
    "timeline": [
      {
        "status": "placed",
        "timestamp": "2024-01-15T13:00:00Z",
        "message": "Order placed successfully"
      },
      {
        "status": "confirmed",
        "timestamp": "2024-01-15T13:05:00Z",
        "message": "Order confirmed by restaurant"
      }
    ]
  }
}
```

## Payment Endpoints

### Create Payment Intent

```http
POST /api/payments/create
```

**Request Body:**
```json
{
  "orderId": "order_id",
  "amount": 707.8,
  "currency": "INR",
  "paymentMethod": "razorpay"
}
```

### Verify Payment

```http
POST /api/payments/verify
```

**Request Body:**
```json
{
  "orderId": "order_id",
  "paymentId": "payment_id",
  "signature": "payment_signature"
}
```

### Process Refund

```http
POST /api/payments/refund
```

**Request Body:**
```json
{
  "orderId": "order_id",
  "amount": 707.8,
  "reason": "Order cancelled"
}
```

## Admin Endpoints

### Admin Login

```http
POST /api/admin/auth/login
```

**Request Body:**
```json
{
  "email": "admin@restaurant.com",
  "password": "adminPassword"
}
```

### Get Dashboard Stats

```http
GET /api/admin/dashboard/stats
```

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "stats": {
    "todayOrders": 25,
    "todayRevenue": 15000,
    "pendingOrders": 5,
    "totalCustomers": 150
  }
}
```

### Manage Menu Items

```http
POST /api/admin/menu/items
PUT /api/admin/menu/items/:id
DELETE /api/admin/menu/items/:id
```

### Manage Orders

```http
GET /api/admin/orders
PUT /api/admin/orders/:id/status
```

**Update Order Status:**
```json
{
  "status": "preparing",
  "estimatedTime": 20
}
```

### Analytics

```http
GET /api/analytics/sales?period=week&start=2024-01-01&end=2024-01-07
GET /api/analytics/items?period=month
GET /api/analytics/revenue?period=day
```

## Notification Endpoints

### Send Notification

```http
POST /api/notifications/send
```

**Request Body:**
```json
{
  "type": "order_update",
  "recipient": {
    "phone": "+1234567890",
    "email": "customer@example.com"
  },
  "data": {
    "orderId": "order_id",
    "status": "preparing"
  }
}
```

### Test Notification

```http
POST /api/notifications/test
```

## Image Upload Endpoints

### Upload Image

```http
POST /api/images/upload
```

**Request Body:** (multipart/form-data)
```
file: <image_file>
type: menu_item | category | restaurant
```

**Response:**
```json
{
  "url": "https://cloudinary.com/image_url",
  "publicId": "image_public_id"
}
```

### Transform Image

```http
POST /api/images/transform
```

**Request Body:**
```json
{
  "publicId": "image_public_id",
  "transformations": {
    "width": 300,
    "height": 300,
    "crop": "fill"
  }
}
```

### Delete Image

```http
DELETE /api/images/delete
```

**Request Body:**
```json
{
  "publicId": "image_public_id"
}
```

## Webhook Endpoints

### Razorpay Webhook

```http
POST /api/payments/webhook/razorpay
```

### Stripe Webhook

```http
POST /api/payments/webhook/stripe
```

## Health Check Endpoints

### Basic Health Check

```http
GET /api/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T13:00:00Z"
}
```

### Detailed Health Check

```http
GET /api/health/detailed
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T13:00:00Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "payment": "operational"
  },
  "version": "1.0.0"
}
```

## WebSocket Events

### Real-time Order Updates

Connect to: `ws://localhost:3000/api/orders/live`

**Events:**
- `order_created`: New order placed
- `order_updated`: Order status changed
- `order_cancelled`: Order cancelled

**Event Format:**
```json
{
  "type": "order_updated",
  "data": {
    "orderId": "order_id",
    "status": "preparing",
    "timestamp": "2024-01-15T13:00:00Z"
  }
}
```

## SDK Examples

### JavaScript/TypeScript

```typescript
// Initialize API client
const api = new RestaurantAPI({
  baseURL: 'https://yourdomain.com/api',
  apiKey: 'your-api-key'
});

// Get menu items
const items = await api.menu.getItems({
  category: 'starters',
  page: 1,
  limit: 20
});

// Add item to cart
await api.cart.addItem({
  itemId: 'item_123',
  quantity: 2,
  modifiers: [{ name: 'Size', option: 'Large' }]
});

// Create order
const order = await api.orders.create({
  deliveryAddress: {
    street: '123 Main St',
    city: 'Bangalore',
    pincode: '560001'
  },
  paymentMethod: 'razorpay'
});
```

### cURL Examples

```bash
# Get menu items
curl -X GET "https://yourdomain.com/api/menu/items?category=starters" \
  -H "Content-Type: application/json"

# Add item to cart
curl -X POST "https://yourdomain.com/api/cart/add" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "itemId": "item_123",
    "quantity": 2
  }'

# Create order
curl -X POST "https://yourdomain.com/api/orders" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "deliveryAddress": {
      "street": "123 Main St",
      "city": "Bangalore",
      "pincode": "560001"
    },
    "paymentMethod": "razorpay"
  }'
```

## Testing

### Test Environment

Base URL: `http://localhost:3000/api`

### Test Credentials

**Customer:**
- Email: `test@example.com`
- Password: `password123`

**Admin:**
- Email: `admin@restaurant.com`
- Password: `admin123`

### Test Payment Methods

**Razorpay Test Cards:**
- Success: `4111111111111111`
- Failure: `4000000000000002`

**Test UPI ID:** `test@paytm`

### Postman Collection

Import the Postman collection from `/docs/postman-collection.json` for easy API testing.

## Support

For API support:
- Documentation: `/docs/api-documentation.md`
- Issues: Create GitHub issue
- Email: support@yourdomain.com