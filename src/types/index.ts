// Core Types
export interface BaseEntity {
  id: string
  createdAt: Date
  updatedAt: Date
  createdBy?: string
  updatedBy?: string
}

export interface TenantEntity extends BaseEntity {
  tenantId: string
}

// User Types
export type UserRole = 'customer' | 'owner' | 'manager' | 'staff' | 'courier'

export interface User extends TenantEntity {
  email: string
  phone?: string
  name: string
  role: UserRole
  addresses: Address[]
  preferences: UserPreferences
  sessions: UserSession[]
  isVerified: boolean
  lastLogin: Date
}

export interface UserSession {
  id: string
  deviceInfo: string
  ipAddress: string
  lastActivity: Date
  isRevoked: boolean
}

export interface Address {
  id: string
  type: 'home' | 'work' | 'other'
  street: string
  city: string
  state: string
  zipCode: string
  landmark?: string
  coordinates?: {
    lat: number
    lng: number
  }
}

export interface UserPreferences {
  dietaryRestrictions: string[]
  spiceLevel: 'mild' | 'medium' | 'hot'
  favoriteItems: string[]
  defaultAddress?: string
}

// Menu Types
export interface MenuItem extends TenantEntity {
  restaurantId: string
  name: string
  description: string
  price: number
  image: string
  category: string
  modifiers: Modifier[]
  availability: boolean
  preparationTime: number
  nutritionalInfo?: NutritionalInfo
  tags: string[]
  dietaryInfo: DietaryInfo
  badges: string[]
  lastModifiedAt: Date
  isDeleted: boolean
}

export interface Modifier {
  id: string
  name: string
  type: 'radio' | 'checkbox' | 'select'
  options: ModifierOption[]
  required: boolean
  maxSelections?: number
}

export interface ModifierOption {
  id: string
  name: string
  price: number
}

export interface DietaryInfo {
  isVeg: boolean
  isVegan: boolean
  isGlutenFree: boolean
  allergens: string[]
}

export interface NutritionalInfo {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
}

export interface Category extends TenantEntity {
  name: string
  description?: string
  image?: string
  sortOrder: number
  isActive: boolean
}

// Order Types
export type OrderStatus = 
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'

export interface Order extends TenantEntity {
  userId: string
  restaurantId: string
  items: OrderItem[]
  status: OrderStatus
  total: CartTotal
  deliveryAddress: Address
  paymentMethod: PaymentMethod
  paymentId: string
  estimatedDeliveryTime: Date
  actualDeliveryTime?: Date
  scheduledFor?: Date
  timeline: OrderTimelineEvent[]
}

export interface OrderItem {
  menuItemId: string
  name: string
  price: number
  quantity: number
  selectedModifiers: SelectedModifier[]
  specialInstructions?: string
  totalPrice: number
}

export interface SelectedModifier {
  modifierId: string
  optionId: string
  name: string
  price: number
}

export interface OrderTimelineEvent {
  status: OrderStatus
  timestamp: Date
  updatedBy: string
  notes?: string
}

// Cart Types
export interface CartItem {
  menuItemId: string
  quantity: number
  selectedModifiers: SelectedModifier[]
  specialInstructions?: string
  unitPrice: number
  totalPrice: number
}

export interface CartTotal {
  subtotal: number
  tax: number
  deliveryFee: number
  discount: number
  total: number
  gstBreakdown: {
    cgst: number
    sgst: number
    igst: number
  }
  roundingAdjustment: number
}

// Payment Types
export type PaymentMethod = 'card' | 'upi_intent' | 'upi_collect' | 'wallet' | 'netbanking'

export interface PaymentResult {
  success: boolean
  paymentId?: string
  orderId: string
  amount: number
  method: PaymentMethod
  error?: string
}

// Restaurant Types
export interface Restaurant extends TenantEntity {
  name: string
  description: string
  logo: string
  coverImage: string
  address: Address
  contact: ContactInfo
  operatingHours: OperatingHours
  deliveryRadius: number
  minimumOrderValue: number
  taxRate: number
  deliveryFee: number
  paymentMethods: PaymentMethod[]
  settings: RestaurantSettings
  maxOrdersPerSlot: number
  slotDuration: number
}

export interface ContactInfo {
  phone: string
  email: string
  website?: string
}

export interface OperatingHours {
  [key: string]: {
    open: string
    close: string
    isOpen: boolean
  }
}

export interface RestaurantSettings {
  allowOnlineOrdering: boolean
  allowScheduledOrders: boolean
  maxOrdersPerSlot: number
  preparationBuffer: number
  autoAcceptOrders: boolean
  notificationSettings: NotificationSettings
}

export interface NotificationSettings {
  sms: boolean
  email: boolean
  whatsapp: boolean
  push: boolean
}

// API Types
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: any
  }
  meta?: {
    page?: number
    limit?: number
    total?: number
  }
}

export interface ApiError {
  code: string
  message: string
  details?: any
  timestamp: Date
  retryAfter?: number
  requestId: string
}

// Analytics Types
export interface SalesData {
  period: string
  totalSales: number
  orderCount: number
  averageOrderValue: number
  topSellingItems: ItemSales[]
}

export interface ItemSales {
  itemId: string
  name: string
  quantity: number
  revenue: number
}

// Coupon Types
export interface Coupon extends TenantEntity {
  code: string
  active: boolean
  discountType: 'percentage' | 'fixed'
  discountValue: number
  minOrderValue: number
  maxUsage: number
  currentUsage: number
  validFrom: Date
  validTo: Date
}