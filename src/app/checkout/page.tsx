'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, MapPin, Clock, CreditCard, Wallet, Smartphone, Plus, Edit2, Trash2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useMenu } from '@/lib/menu-context'
import { useAuth } from '@/lib/auth-context'
import { Address } from '@/types'
import Image from 'next/image'

const PAYMENT_METHODS = [
  { id: 'card', name: 'Credit/Debit Card', icon: CreditCard, description: 'Visa, Mastercard, RuPay' },
  { id: 'upi_intent', name: 'UPI', icon: Smartphone, description: 'PhonePe, GPay, Paytm' },
  { id: 'wallet', name: 'Wallet', icon: Wallet, description: 'Paytm, Amazon Pay' },
]

const DELIVERY_TIME_SLOTS = [
  { value: 'asap', label: 'ASAP (30-45 mins)', estimatedTime: 45 },
  { value: '1hour', label: 'In 1 hour', estimatedTime: 60 },
  { value: '2hours', label: 'In 2 hours', estimatedTime: 120 },
  { value: 'custom', label: 'Schedule for later', estimatedTime: null },
]

interface DeliveryInfo {
  name: string
  phone: string
  addressId?: string
  newAddress?: {
    type: 'home' | 'work' | 'other'
    street: string
    city: string
    state: string
    zipCode: string
    landmark?: string
  }
  specialInstructions: string
}

interface ValidationErrors {
  [key: string]: string
}

export default function CheckoutPage() {
  const router = useRouter()
  const { state, clearCart } = useMenu()
  const { user } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState('upi_intent')
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('asap')
  const [customDeliveryTime, setCustomDeliveryTime] = useState('')
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})
  const [orderValidation, setOrderValidation] = useState<{ valid: boolean; errors: string[] }>({ valid: true, errors: [] })

  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryInfo>({
    name: user?.name || '',
    phone: user?.phone || '',
    addressId: user?.addresses?.[0]?.id || '',
    specialInstructions: ''
  })

  const { cartItems, cartTotal, restaurant } = state

  useEffect(() => {
    if (cartItems.length === 0) {
      router.push('/')
    }
  }, [cartItems.length, router])

  // Validate order before payment
  useEffect(() => {
    const validateOrder = async () => {
      if (cartItems.length === 0) return

      try {
        const response = await fetch('/api/orders/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: cartItems.map(item => ({
              menuItemId: item.menuItem.id,
              quantity: item.quantity,
              selectedModifiers: item.selectedModifiers,
              totalPrice: item.totalPrice
            })),
            restaurantId: restaurant?.id,
            tenantId: 'default'
          })
        })

        const result = await response.json()
        setOrderValidation(result.data || { valid: true, errors: [] })
      } catch (error) {
        console.error('Order validation error:', error)
        setOrderValidation({ valid: false, errors: ['Unable to validate order. Please try again.'] })
      }
    }

    validateOrder()
  }, [cartItems, restaurant?.id])

  const validateForm = (): ValidationErrors => {
    const errors: ValidationErrors = {}

    if (!deliveryInfo.name.trim()) {
      errors.name = 'Name is required'
    }

    if (!deliveryInfo.phone.trim()) {
      errors.phone = 'Phone number is required'
    } else if (!/^\+?[\d\s-()]{10,15}$/.test(deliveryInfo.phone.trim())) {
      errors.phone = 'Please enter a valid phone number'
    }

    if (!deliveryInfo.addressId && !deliveryInfo.newAddress) {
      errors.address = 'Please select or add a delivery address'
    }

    if (deliveryInfo.newAddress) {
      if (!deliveryInfo.newAddress.street.trim()) {
        errors.street = 'Street address is required'
      }
      if (!deliveryInfo.newAddress.city.trim()) {
        errors.city = 'City is required'
      }
      if (!deliveryInfo.newAddress.state.trim()) {
        errors.state = 'State is required'
      }
      if (!deliveryInfo.newAddress.zipCode.trim()) {
        errors.zipCode = 'ZIP code is required'
      } else if (!/^\d{6}$/.test(deliveryInfo.newAddress.zipCode.trim())) {
        errors.zipCode = 'Please enter a valid 6-digit ZIP code'
      }
    }

    if (selectedTimeSlot === 'custom' && !customDeliveryTime) {
      errors.deliveryTime = 'Please select a delivery time'
    }

    return errors
  }

  const handleInputChange = (field: string, value: string) => {
    setDeliveryInfo(prev => ({ ...prev, [field]: value }))
    // Clear validation error when user starts typing
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const handleAddressChange = (field: string, value: string) => {
    setDeliveryInfo(prev => ({
      ...prev,
      newAddress: {
        ...prev.newAddress,
        type: prev.newAddress?.type || 'home',
        street: prev.newAddress?.street || '',
        city: prev.newAddress?.city || '',
        state: prev.newAddress?.state || '',
        zipCode: prev.newAddress?.zipCode || '',
        landmark: prev.newAddress?.landmark || '',
        [field]: value
      }
    }))
    // Clear validation error
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const selectExistingAddress = (addressId: string) => {
    setDeliveryInfo(prev => ({
      ...prev,
      addressId,
      newAddress: undefined
    }))
    setShowAddressForm(false)
    setValidationErrors(prev => ({ ...prev, address: '' }))
  }

  const addNewAddress = () => {
    setDeliveryInfo(prev => ({
      ...prev,
      addressId: undefined,
      newAddress: {
        type: 'home',
        street: '',
        city: '',
        state: '',
        zipCode: '',
        landmark: ''
      }
    }))
    setShowAddressForm(true)
  }

  const handlePlaceOrder = async () => {
    if (!user) {
      router.push('/auth?redirect=/checkout')
      return
    }

    // Validate form
    const errors = validateForm()
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }

    // Check order validation
    if (!orderValidation.valid) {
      alert('Please resolve the order issues before proceeding.')
      return
    }

    setIsLoading(true)
    try {
      // Calculate delivery time
      let estimatedDeliveryTime = new Date()
      if (selectedTimeSlot === 'custom' && customDeliveryTime) {
        estimatedDeliveryTime = new Date(customDeliveryTime)
      } else {
        const slot = DELIVERY_TIME_SLOTS.find(s => s.value === selectedTimeSlot)
        if (slot?.estimatedTime) {
          estimatedDeliveryTime.setMinutes(estimatedDeliveryTime.getMinutes() + slot.estimatedTime)
        }
      }

      // Prepare delivery address
      let deliveryAddress: Address
      if (deliveryInfo.addressId) {
        const existingAddress = user?.addresses?.find((addr: any) => addr.id === deliveryInfo.addressId)
        if (!existingAddress) {
          throw new Error('Selected address not found')
        }
        deliveryAddress = existingAddress
      } else if (deliveryInfo.newAddress) {
        deliveryAddress = {
          id: '', // Will be generated by server
          ...deliveryInfo.newAddress
        }
      } else {
        throw new Error('No delivery address provided')
      }

      // Step 1: Create order
      const orderData = {
        items: cartItems.map(item => ({
          menuItemId: item.menuItem.id,
          name: item.menuItem.name,
          price: item.menuItem.price,
          quantity: item.quantity,
          selectedModifiers: item.selectedModifiers,
          specialInstructions: item.specialInstructions || deliveryInfo.specialInstructions,
          totalPrice: item.totalPrice
        })),
        deliveryAddress,
        deliveryInfo: {
          name: deliveryInfo.name,
          phone: deliveryInfo.phone,
          specialInstructions: deliveryInfo.specialInstructions
        },
        paymentMethod: selectedPayment,
        totals: cartTotal,
        estimatedDeliveryTime,
        scheduledFor: selectedTimeSlot === 'custom' ? estimatedDeliveryTime : undefined,
        restaurantId: restaurant?.id,
        tenantId: 'default', // This should come from context
        idempotencyKey: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }

      const orderResponse = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData),
      })

      const orderResult = await orderResponse.json()

      if (!orderResult.success) {
        alert(orderResult.message || 'Failed to place order')
        return
      }

      const orderId = orderResult.data.id

      // Step 2: Create payment
      const paymentResponse = await fetch('/api/payments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId,
          paymentMethod: 'razorpay',
          upiIntent: selectedPayment === 'upi_intent'
        }),
      })

      const paymentResult = await paymentResponse.json()

      if (!paymentResult.success) {
        alert(paymentResult.error?.message || 'Failed to initiate payment')
        return
      }

      // Step 3: Initialize Razorpay payment
      if (selectedPayment === 'upi_intent') {
        // Handle UPI intent flow
        await handleUPIPayment(paymentResult.data, orderId)
      } else {
        // Handle regular Razorpay flow
        await handleRazorpayPayment(paymentResult.data, orderId)
      }

    } catch (error) {
      console.error('Order placement error:', error)
      alert('Failed to place order. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRazorpayPayment = async (paymentData: any, orderId: string) => {
    try {
      // Load Razorpay script
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      document.body.appendChild(script)

      script.onload = () => {
        const options = {
          key: paymentData.razorpayKeyId,
          amount: paymentData.amount,
          currency: paymentData.currency,
          name: restaurant?.name || 'Restaurant',
          description: 'Order Payment',
          order_id: paymentData.paymentOrderId,
          handler: async (response: any) => {
            await verifyPayment(response, orderId)
          },
          prefill: {
            name: deliveryInfo.name,
            email: user?.email || '',
            contact: deliveryInfo.phone
          },
          theme: {
            color: '#3B82F6'
          },
          modal: {
            ondismiss: () => {
              alert('Payment cancelled. You can retry payment from your orders page.')
              router.push(`/orders/${orderId}`)
            }
          }
        }

        const razorpay = new (window as any).Razorpay(options)
        razorpay.open()
      }

      script.onerror = () => {
        alert('Failed to load payment gateway. Please try again.')
      }
    } catch (error) {
      console.error('Razorpay payment error:', error)
      alert('Payment initialization failed. Please try again.')
    }
  }

  const handleUPIPayment = async (paymentData: any, orderId: string) => {
    try {
      // For UPI intent, we can show a QR code or redirect to UPI apps
      // This is a simplified implementation
      const upiUrl = `upi://pay?pa=merchant@upi&pn=${restaurant?.name}&am=${paymentData.amount / 100}&cu=INR&tn=Order Payment`

      // Try to open UPI app
      window.location.href = upiUrl

      // Fallback to regular Razorpay if UPI app not available
      setTimeout(() => {
        handleRazorpayPayment(paymentData, orderId)
      }, 3000)
    } catch (error) {
      console.error('UPI payment error:', error)
      // Fallback to regular payment
      handleRazorpayPayment(paymentData, orderId)
    }
  }

  const verifyPayment = async (paymentResponse: any, orderId: string) => {
    try {
      const verificationResponse = await fetch('/api/payments/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId,
          razorpay_order_id: paymentResponse.razorpay_order_id,
          razorpay_payment_id: paymentResponse.razorpay_payment_id,
          razorpay_signature: paymentResponse.razorpay_signature
        }),
      })

      const verificationResult = await verificationResponse.json()

      if (verificationResult.success) {
        clearCart()
        router.push(`/orders/${orderId}?payment=success`)
      } else {
        alert('Payment verification failed. Please contact support.')
        router.push(`/orders/${orderId}?payment=failed`)
      }
    } catch (error) {
      console.error('Payment verification error:', error)
      alert('Payment verification failed. Please contact support.')
      router.push(`/orders/${orderId}?payment=failed`)
    }
  }

  const isFormValid = () => {
    const errors = validateForm()
    return Object.keys(errors).length === 0 && orderValidation.valid
  }

  if (cartItems.length === 0) {
    return null // Will redirect
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-semibold">Checkout</h1>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Restaurant Info */}
            {restaurant && (
              <div className="bg-card border rounded-lg p-4">
                <h2 className="font-semibold mb-2">Ordering from</h2>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                    <span className="text-lg font-bold">{restaurant.name[0]}</span>
                  </div>
                  <div>
                    <h3 className="font-medium">{restaurant.name}</h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>30-45 min delivery</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Order Validation Errors */}
            {!orderValidation.valid && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-medium mb-2">Please resolve the following issues:</div>
                  <ul className="list-disc list-inside space-y-1">
                    {orderValidation.errors.map((error, index) => (
                      <li key={index} className="text-sm">{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Delivery Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Delivery Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Full Name *</Label>
                    <Input
                      id="name"
                      value={deliveryInfo.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      placeholder="Enter your name"
                      className={validationErrors.name ? 'border-red-500' : ''}
                    />
                    {validationErrors.name && (
                      <p className="text-sm text-red-500 mt-1">{validationErrors.name}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone Number *</Label>
                    <Input
                      id="phone"
                      value={deliveryInfo.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      placeholder="Enter phone number"
                      className={validationErrors.phone ? 'border-red-500' : ''}
                    />
                    {validationErrors.phone && (
                      <p className="text-sm text-red-500 mt-1">{validationErrors.phone}</p>
                    )}
                  </div>
                </div>

                {/* Address Selection */}
                <div>
                  <Label>Delivery Address *</Label>
                  {validationErrors.address && (
                    <p className="text-sm text-red-500 mt-1">{validationErrors.address}</p>
                  )}

                  {/* Existing Addresses */}
                  {user?.addresses && user.addresses.length > 0 && (
                    <div className="space-y-2 mt-2">
                      <p className="text-sm text-muted-foreground">Saved addresses:</p>
                      {user.addresses.map((address: any) => (
                        <label
                          key={address.id}
                          className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${deliveryInfo.addressId === address.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                            }`}
                        >
                          <input
                            type="radio"
                            name="address"
                            value={address.id}
                            checked={deliveryInfo.addressId === address.id}
                            onChange={() => selectExistingAddress(address.id)}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {address.type}
                              </Badge>
                            </div>
                            <p className="text-sm mt-1">
                              {address.street}, {address.city}, {address.state} {address.zipCode}
                            </p>
                            {address.landmark && (
                              <p className="text-xs text-muted-foreground">Near {address.landmark}</p>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Add New Address Button */}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addNewAddress}
                    className="w-full mt-3"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add New Address
                  </Button>

                  {/* New Address Form */}
                  {showAddressForm && deliveryInfo.newAddress && (
                    <div className="space-y-4 mt-4 p-4 border rounded-lg bg-muted/50">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">New Address</h4>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowAddressForm(false)}
                        >
                          Cancel
                        </Button>
                      </div>

                      <div>
                        <Label htmlFor="addressType">Address Type</Label>
                        <Select
                          value={deliveryInfo.newAddress.type}
                          onValueChange={(value: 'home' | 'work' | 'other') =>
                            handleAddressChange('type', value)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="home">Home</SelectItem>
                            <SelectItem value="work">Work</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="street">Street Address *</Label>
                        <Input
                          id="street"
                          value={deliveryInfo.newAddress.street}
                          onChange={(e) => handleAddressChange('street', e.target.value)}
                          placeholder="House/Flat no, Building, Street"
                          className={validationErrors.street ? 'border-red-500' : ''}
                        />
                        {validationErrors.street && (
                          <p className="text-sm text-red-500 mt-1">{validationErrors.street}</p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="city">City *</Label>
                          <Input
                            id="city"
                            value={deliveryInfo.newAddress.city}
                            onChange={(e) => handleAddressChange('city', e.target.value)}
                            placeholder="City"
                            className={validationErrors.city ? 'border-red-500' : ''}
                          />
                          {validationErrors.city && (
                            <p className="text-sm text-red-500 mt-1">{validationErrors.city}</p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor="state">State *</Label>
                          <Input
                            id="state"
                            value={deliveryInfo.newAddress.state}
                            onChange={(e) => handleAddressChange('state', e.target.value)}
                            placeholder="State"
                            className={validationErrors.state ? 'border-red-500' : ''}
                          />
                          {validationErrors.state && (
                            <p className="text-sm text-red-500 mt-1">{validationErrors.state}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="zipCode">ZIP Code *</Label>
                          <Input
                            id="zipCode"
                            value={deliveryInfo.newAddress.zipCode}
                            onChange={(e) => handleAddressChange('zipCode', e.target.value)}
                            placeholder="123456"
                            className={validationErrors.zipCode ? 'border-red-500' : ''}
                          />
                          {validationErrors.zipCode && (
                            <p className="text-sm text-red-500 mt-1">{validationErrors.zipCode}</p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor="landmark">Landmark</Label>
                          <Input
                            id="landmark"
                            value={deliveryInfo.newAddress.landmark || ''}
                            onChange={(e) => handleAddressChange('landmark', e.target.value)}
                            placeholder="Nearby landmark"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Special Instructions */}
                <div>
                  <Label htmlFor="specialInstructions">Special Instructions</Label>
                  <Textarea
                    id="specialInstructions"
                    value={deliveryInfo.specialInstructions}
                    onChange={(e) => handleInputChange('specialInstructions', e.target.value)}
                    placeholder="Any special instructions for delivery (e.g., ring doorbell, leave at door, etc.)"
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Delivery Time Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Delivery Time
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {DELIVERY_TIME_SLOTS.map((slot) => (
                    <label
                      key={slot.value}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${selectedTimeSlot === slot.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                        }`}
                    >
                      <input
                        type="radio"
                        name="timeSlot"
                        value={slot.value}
                        checked={selectedTimeSlot === slot.value}
                        onChange={(e) => setSelectedTimeSlot(e.target.value)}
                        className="w-4 h-4"
                      />
                      <div>
                        <div className="font-medium">{slot.label}</div>
                        {slot.estimatedTime && (
                          <div className="text-sm text-muted-foreground">
                            Estimated delivery: {new Date(Date.now() + slot.estimatedTime * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>

                {selectedTimeSlot === 'custom' && (
                  <div>
                    <Label htmlFor="customTime">Select Delivery Time *</Label>
                    <Input
                      id="customTime"
                      type="datetime-local"
                      value={customDeliveryTime}
                      onChange={(e) => setCustomDeliveryTime(e.target.value)}
                      min={new Date(Date.now() + 60 * 60000).toISOString().slice(0, 16)} // Minimum 1 hour from now
                      className={validationErrors.deliveryTime ? 'border-red-500' : ''}
                    />
                    {validationErrors.deliveryTime && (
                      <p className="text-sm text-red-500 mt-1">{validationErrors.deliveryTime}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payment Method */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Payment Method
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {PAYMENT_METHODS.map((method) => {
                    const Icon = method.icon
                    return (
                      <label
                        key={method.id}
                        className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${selectedPayment === method.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                          }`}
                      >
                        <input
                          type="radio"
                          name="payment"
                          value={method.id}
                          checked={selectedPayment === method.id}
                          onChange={(e) => setSelectedPayment(e.target.value)}
                          className="w-4 h-4"
                        />
                        <Icon className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{method.name}</div>
                          <div className="text-sm text-muted-foreground">{method.description}</div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {cartTotal.itemCount} item{cartTotal.itemCount !== 1 ? 's' : ''}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Items */}
                <div className="space-y-3">
                  {cartItems.map((item) => (
                    <div key={item.id} className="flex gap-3">
                      <div className="w-12 h-12 relative rounded-lg overflow-hidden flex-shrink-0">
                        <Image
                          src={item.menuItem.image}
                          alt={item.menuItem.name}
                          fill
                          className="object-cover"
                          sizes="48px"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm truncate">{item.menuItem.name}</h4>
                        {item.selectedModifiers.length > 0 && (
                          <p className="text-xs text-muted-foreground truncate">
                            {item.selectedModifiers.map(mod => mod.name).join(', ')}
                          </p>
                        )}
                        {item.specialInstructions && (
                          <p className="text-xs text-blue-600 truncate">
                            Note: {item.specialInstructions}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-sm text-muted-foreground">
                            ₹{(item.totalPrice / item.quantity).toFixed(2)} × {item.quantity}
                          </span>
                          <span className="font-medium text-sm">₹{item.totalPrice.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <Separator />

                {/* Pricing Breakdown */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal ({cartTotal.itemCount} items)</span>
                    <span>₹{cartTotal.subtotal.toFixed(2)}</span>
                  </div>

                  {cartTotal.tax > 0 && (
                    <>
                      {cartTotal.gstBreakdown?.cgst > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                          <span className="ml-2">CGST</span>
                          <span>₹{cartTotal.gstBreakdown.cgst.toFixed(2)}</span>
                        </div>
                      )}
                      {cartTotal.gstBreakdown?.sgst > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                          <span className="ml-2">SGST</span>
                          <span>₹{cartTotal.gstBreakdown.sgst.toFixed(2)}</span>
                        </div>
                      )}
                      {cartTotal.gstBreakdown?.igst > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                          <span className="ml-2">IGST</span>
                          <span>₹{cartTotal.gstBreakdown.igst.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Total Tax</span>
                        <span>₹{cartTotal.tax.toFixed(2)}</span>
                      </div>
                    </>
                  )}

                  {cartTotal.deliveryFee > 0 && (
                    <div className="flex justify-between">
                      <span>Delivery Fee</span>
                      <span>₹{cartTotal.deliveryFee.toFixed(2)}</span>
                    </div>
                  )}

                  {cartTotal.discount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount</span>
                      <span>-₹{cartTotal.discount.toFixed(2)}</span>
                    </div>
                  )}

                  {cartTotal.roundingAdjustment !== undefined && cartTotal.roundingAdjustment !== 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Rounding</span>
                      <span>{cartTotal.roundingAdjustment > 0 ? '+' : ''}₹{cartTotal.roundingAdjustment.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="flex justify-between font-semibold text-lg">
                  <span>Total Amount</span>
                  <span>₹{cartTotal.total.toFixed(2)}</span>
                </div>

                {/* Estimated Delivery Time */}
                {selectedTimeSlot && (
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4" />
                      <span className="font-medium">Estimated Delivery:</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {selectedTimeSlot === 'custom' && customDeliveryTime
                        ? new Date(customDeliveryTime).toLocaleString()
                        : selectedTimeSlot === 'asap'
                          ? `${new Date(Date.now() + 30 * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(Date.now() + 45 * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : DELIVERY_TIME_SLOTS.find(s => s.value === selectedTimeSlot)?.label
                      }
                    </p>
                  </div>
                )}

                <Button
                  onClick={handlePlaceOrder}
                  disabled={!isFormValid() || isLoading}
                  className="w-full"
                  size="lg"
                >
                  {isLoading ? 'Placing Order...' : `Place Order • ₹${cartTotal.total.toFixed(2)}`}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  By placing this order, you agree to our{' '}
                  <a href="/terms" className="underline hover:no-underline">
                    terms and conditions
                  </a>
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}