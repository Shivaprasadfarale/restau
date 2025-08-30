'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Bell, 
  BellOff, 
  Volume2, 
  VolumeX, 
  Settings,
  X,
  CheckCircle
} from 'lucide-react'

interface NotificationSettings {
  enabled: boolean
  sound: boolean
  desktop: boolean
  volume: number
}

interface OrderNotification {
  id: string
  type: 'new_order' | 'status_update' | 'urgent'
  title: string
  message: string
  orderId?: string
  timestamp: Date
  read: boolean
}

interface OrderNotificationsProps {
  notifications: OrderNotification[]
  settings: NotificationSettings
  onSettingsChange: (settings: NotificationSettings) => void
  onNotificationRead: (notificationId: string) => void
  onNotificationClear: (notificationId: string) => void
  onClearAll: () => void
}

export function OrderNotifications({
  notifications,
  settings,
  onSettingsChange,
  onNotificationRead,
  onNotificationClear,
  onClearAll
}: OrderNotificationsProps) {
  const [showSettings, setShowSettings] = useState(false)
  const [hasPermission, setHasPermission] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    // Initialize audio
    audioRef.current = new Audio('/sounds/notification.mp3')
    audioRef.current.volume = settings.volume

    // Check notification permission
    if ('Notification' in window) {
      setHasPermission(Notification.permission === 'granted')
    }
  }, [settings.volume])

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission()
      setHasPermission(permission === 'granted')
      
      if (permission === 'granted') {
        onSettingsChange({ ...settings, desktop: true })
      }
    }
  }

  const playTestSound = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(console.error)
    }
  }

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="relative">
      {/* Notification Bell */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowSettings(!showSettings)}
        className="relative"
      >
        {settings.enabled ? (
          <Bell className="h-4 w-4" />
        ) : (
          <BellOff className="h-4 w-4 text-gray-400" />
        )}
        {unreadCount > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </Button>

      {/* Notification Panel */}
      {showSettings && (
        <Card className="absolute right-0 top-full mt-2 w-80 z-50 shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Notifications</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Settings */}
            <div className="space-y-3 mb-4 pb-4 border-b">
              <div className="flex items-center justify-between">
                <span className="text-sm">Enable notifications</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSettingsChange({ ...settings, enabled: !settings.enabled })}
                  className={settings.enabled ? 'text-green-600' : 'text-gray-400'}
                >
                  {settings.enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm">Sound alerts</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={playTestSound}
                    disabled={!settings.sound}
                    className="text-xs px-2"
                  >
                    Test
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSettingsChange({ ...settings, sound: !settings.sound })}
                    className={settings.sound ? 'text-blue-600' : 'text-gray-400'}
                  >
                    {settings.sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm">Desktop notifications</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={hasPermission ? 
                    () => onSettingsChange({ ...settings, desktop: !settings.desktop }) :
                    requestNotificationPermission
                  }
                  className={settings.desktop && hasPermission ? 'text-purple-600' : 'text-gray-400'}
                >
                  {hasPermission ? (
                    settings.desktop ? <CheckCircle className="h-4 w-4" /> : <Settings className="h-4 w-4" />
                  ) : (
                    <Settings className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {settings.sound && (
                <div className="space-y-2">
                  <span className="text-sm">Volume</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={settings.volume}
                    onChange={(e) => {
                      const volume = parseFloat(e.target.value)
                      onSettingsChange({ ...settings, volume })
                      if (audioRef.current) {
                        audioRef.current.volume = volume
                      }
                    }}
                    className="w-full"
                  />
                </div>
              )}
            </div>

            {/* Notifications List */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No notifications
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Recent notifications</span>
                    {notifications.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClearAll}
                        className="text-xs"
                      >
                        Clear all
                      </Button>
                    )}
                  </div>
                  
                  {notifications.slice(0, 10).map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-2 rounded border text-sm ${
                        notification.read ? 'bg-gray-50' : 'bg-blue-50 border-blue-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{notification.title}</span>
                            <Badge 
                              variant={notification.type === 'urgent' ? 'destructive' : 'secondary'}
                              className="text-xs"
                            >
                              {notification.type.replace('_', ' ')}
                            </Badge>
                          </div>
                          <p className="text-gray-600 mt-1">{notification.message}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            {notification.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          {!notification.read && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onNotificationRead(notification.id)}
                              className="p-1 h-auto"
                            >
                              <CheckCircle className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onNotificationClear(notification.id)}
                            className="p-1 h-auto"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Hook for managing notifications
export function useOrderNotifications() {
  const [notifications, setNotifications] = useState<OrderNotification[]>([])
  const [settings, setSettings] = useState<NotificationSettings>({
    enabled: true,
    sound: true,
    desktop: false,
    volume: 0.7
  })

  const addNotification = (notification: Omit<OrderNotification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: OrderNotification = {
      ...notification,
      id: Date.now().toString(),
      timestamp: new Date(),
      read: false
    }

    setNotifications(prev => [newNotification, ...prev.slice(0, 49)]) // Keep last 50

    // Show desktop notification if enabled
    if (settings.desktop && settings.enabled && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(notification.title, {
        body: notification.message,
        icon: '/icon-192x192.png',
        tag: `order-${notification.orderId || 'general'}`
      })
    }
  }

  const markAsRead = (notificationId: string) => {
    setNotifications(prev => prev.map(n => 
      n.id === notificationId ? { ...n, read: true } : n
    ))
  }

  const clearNotification = (notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId))
  }

  const clearAll = () => {
    setNotifications([])
  }

  return {
    notifications,
    settings,
    addNotification,
    markAsRead,
    clearNotification,
    clearAll,
    setSettings
  }
}