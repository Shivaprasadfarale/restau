'use client'

import { useCallback, useEffect, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'

interface AnalyticsEventData {
  eventType: 'page_view' | 'menu_item_view' | 'add_to_cart' | 'remove_from_cart' | 'checkout_start' | 'payment_success' | 'payment_failed' | 'order_placed'
  userId?: string
  restaurantId: string
  metadata?: {
    menuItemId?: string
    categoryId?: string
    orderValue?: number
    paymentMethod?: string
    referrer?: string
    timeOnPage?: number
  }
}

interface UseAnalyticsOptions {
  restaurantId: string
  userId?: string
  enableAutoTracking?: boolean
}

export function useAnalytics({ restaurantId, userId, enableAutoTracking = true }: UseAnalyticsOptions) {
  const sessionId = useRef<string>()
  const pageStartTime = useRef<number>()
  const trackingQueue = useRef<AnalyticsEventData[]>([])
  const isProcessing = useRef(false)

  // Initialize session ID
  useEffect(() => {
    if (!sessionId.current) {
      // Try to get existing session ID from sessionStorage
      const existingSessionId = sessionStorage.getItem('analytics_session_id')
      if (existingSessionId) {
        sessionId.current = existingSessionId
      } else {
        sessionId.current = uuidv4()
        sessionStorage.setItem('analytics_session_id', sessionId.current)
      }
    }
  }, [])

  // Process tracking queue
  const processQueue = useCallback(async () => {
    if (isProcessing.current || trackingQueue.current.length === 0) {
      return
    }

    isProcessing.current = true
    const eventsToProcess = [...trackingQueue.current]
    trackingQueue.current = []

    try {
      // Send events in batches
      for (const event of eventsToProcess) {
        await fetch('/api/analytics/track', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...event,
            sessionId: sessionId.current,
            userId
          })
        })
      }
    } catch (error) {
      console.warn('Analytics tracking failed:', error)
      // Re-queue failed events (with limit to prevent infinite growth)
      if (trackingQueue.current.length < 50) {
        trackingQueue.current.unshift(...eventsToProcess)
      }
    } finally {
      isProcessing.current = false
    }
  }, [userId])

  // Track event function
  const trackEvent = useCallback((eventData: AnalyticsEventData) => {
    if (!sessionId.current || !restaurantId) {
      console.warn('Analytics not initialized properly')
      return
    }

    // Add to queue
    trackingQueue.current.push({
      ...eventData,
      restaurantId,
      metadata: {
        ...eventData.metadata,
        referrer: document.referrer || undefined
      }
    })

    // Process queue (debounced)
    setTimeout(processQueue, 100)
  }, [restaurantId, processQueue])

  // Auto-track page views
  useEffect(() => {
    if (!enableAutoTracking || !sessionId.current) return

    pageStartTime.current = Date.now()

    // Track page view
    trackEvent({
      eventType: 'page_view',
      restaurantId,
      metadata: {
        referrer: document.referrer || undefined
      }
    })

    // Track page unload with time on page
    const handleBeforeUnload = () => {
      if (pageStartTime.current) {
        const timeOnPage = Date.now() - pageStartTime.current
        
        // Use sendBeacon for reliable tracking on page unload
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/analytics/track', JSON.stringify({
            eventType: 'page_view',
            sessionId: sessionId.current,
            userId,
            restaurantId,
            metadata: {
              timeOnPage,
              referrer: document.referrer || undefined
            }
          }))
        }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      handleBeforeUnload() // Track when component unmounts
    }
  }, [enableAutoTracking, restaurantId, trackEvent, userId])

  // Convenience methods for common events
  const trackMenuItemView = useCallback((menuItemId: string, categoryId?: string) => {
    trackEvent({
      eventType: 'menu_item_view',
      restaurantId,
      metadata: {
        menuItemId,
        categoryId
      }
    })
  }, [trackEvent, restaurantId])

  const trackAddToCart = useCallback((menuItemId: string, orderValue?: number) => {
    trackEvent({
      eventType: 'add_to_cart',
      restaurantId,
      metadata: {
        menuItemId,
        orderValue
      }
    })
  }, [trackEvent, restaurantId])

  const trackRemoveFromCart = useCallback((menuItemId: string) => {
    trackEvent({
      eventType: 'remove_from_cart',
      restaurantId,
      metadata: {
        menuItemId
      }
    })
  }, [trackEvent, restaurantId])

  const trackCheckoutStart = useCallback((orderValue: number) => {
    trackEvent({
      eventType: 'checkout_start',
      restaurantId,
      metadata: {
        orderValue
      }
    })
  }, [trackEvent, restaurantId])

  const trackPaymentSuccess = useCallback ((orderValue: number, paymentMethod: string) => {
    trackEvent({
      eventType: 'payment_success',
      restaurantId,
      metadata: {
        orderValue,
        paymentMethod
      }
    })
  }, [trackEvent, restaurantId])

  const trackPaymentFailed = useCallback((orderValue: number, paymentMethod: string) => {
    trackEvent({
      eventType: 'payment_failed',
      restaurantId,
      metadata: {
        orderValue,
        paymentMethod
      }
    })
  }, [trackEvent, restaurantId])

  const trackOrderPlaced = useCallback((orderValue: number, paymentMethod: string) => {
    trackEvent({
      eventType: 'order_placed',
      restaurantId,
      metadata: {
        orderValue,
        paymentMethod
      }
    })
  }, [trackEvent, restaurantId])

  return {
    trackEvent,
    trackMenuItemView,
    trackAddToCart,
    trackRemoveFromCart,
    trackCheckoutStart,
    trackPaymentSuccess,
    trackPaymentFailed,
    trackOrderPlaced,
    sessionId: sessionId.current
  }
}