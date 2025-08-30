import { env } from '../env'

export interface NotificationTemplate {
  id: string
  name: string
  subject?: string
  body: string
  type: 'sms' | 'whatsapp' | 'email' | 'push'
  language: 'en' | 'hi'
}

export interface NotificationContext {
  customerName: string
  orderId: string
  restaurantName: string
  orderTotal?: string
  estimatedTime?: string
  trackingUrl?: string
  items?: string[]
}

export interface NotificationPreferences {
  sms: boolean
  whatsapp: boolean
  email: boolean
  push: boolean
}

// Notification templates with localization
const templates: Record<string, NotificationTemplate[]> = {
  orderConfirmed: [
    {
      id: 'order_confirmed_sms_en',
      name: 'Order Confirmed SMS',
      body: 'Hi {{customerName}}! Your order #{{orderId}} from {{restaurantName}} has been confirmed. Total: {{orderTotal}}. Track: {{trackingUrl}}',
      type: 'sms',
      language: 'en'
    },
    {
      id: 'order_confirmed_sms_hi',
      name: 'Order Confirmed SMS Hindi',
      body: 'नमस्ते {{customerName}}! {{restaurantName}} से आपका ऑर्डर #{{orderId}} कन्फर्म हो गया है। कुल: {{orderTotal}}। ट्रैक करें: {{trackingUrl}}',
      type: 'sms',
      language: 'hi'
    },
    {
      id: 'order_confirmed_email_en',
      name: 'Order Confirmed Email',
      subject: 'Order Confirmed - {{restaurantName}}',
      body: `
        <h2>Order Confirmed!</h2>
        <p>Hi {{customerName}},</p>
        <p>Your order #{{orderId}} from {{restaurantName}} has been confirmed.</p>
        <p><strong>Order Total:</strong> {{orderTotal}}</p>
        <p><strong>Estimated Delivery:</strong> {{estimatedTime}}</p>
        <p><a href="{{trackingUrl}}">Track Your Order</a></p>
        <p>Thank you for choosing {{restaurantName}}!</p>
      `,
      type: 'email',
      language: 'en'
    }
  ],
  orderPreparing: [
    {
      id: 'order_preparing_sms_en',
      name: 'Order Preparing SMS',
      body: 'Your order #{{orderId}} is being prepared! Estimated time: {{estimatedTime}}. Track: {{trackingUrl}}',
      type: 'sms',
      language: 'en'
    },
    {
      id: 'order_preparing_whatsapp_en',
      name: 'Order Preparing WhatsApp',
      body: '🍳 Your order #{{orderId}} is being prepared!\n⏰ Estimated time: {{estimatedTime}}\n📱 Track: {{trackingUrl}}',
      type: 'whatsapp',
      language: 'en'
    }
  ],
  orderOutForDelivery: [
    {
      id: 'order_delivery_sms_en',
      name: 'Out for Delivery SMS',
      body: 'Great news! Your order #{{orderId}} is out for delivery. It should arrive in {{estimatedTime}}. Track: {{trackingUrl}}',
      type: 'sms',
      language: 'en'
    }
  ],
  orderDelivered: [
    {
      id: 'order_delivered_sms_en',
      name: 'Order Delivered SMS',
      body: 'Your order #{{orderId}} has been delivered! Thank you for choosing {{restaurantName}}. Rate your experience: {{trackingUrl}}',
      type: 'sms',
      language: 'en'
    }
  ]
}

class NotificationService {
  private twilioClient: any
  private emailTransporter: any

  constructor() {
    this.initializeTwilio()
    this.initializeEmail()
  }

  private initializeTwilio() {
    if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
      try {
        const twilio = require('twilio')
        this.twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN)
      } catch (error) {
        console.warn('Twilio not configured:', error)
      }
    }
  }

  private initializeEmail() {
    if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
      try {
        const nodemailer = require('nodemailer')
        this.emailTransporter = nodemailer.createTransporter({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT || 587,
          secure: false,
          auth: {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS
          }
        })
      } catch (error) {
        console.warn('Email not configured:', error)
      }
    }
  }

  /**
   * Send notification with fallback chain
   */
  async sendNotification(
    templateKey: string,
    context: NotificationContext,
    recipient: {
      phone?: string
      email?: string
      preferences: NotificationPreferences
      language?: 'en' | 'hi'
    }
  ): Promise<{
    success: boolean
    deliveredVia: string[]
    errors: string[]
  }> {
    const deliveredVia: string[] = []
    const errors: string[] = []
    const language = recipient.language || 'en'

    const templateGroup = templates[templateKey]
    if (!templateGroup) {
      return {
        success: false,
        deliveredVia: [],
        errors: ['Template not found']
      }
    }

    // Try SMS first if enabled and phone available
    if (recipient.preferences.sms && recipient.phone) {
      const smsTemplate = templateGroup.find(t => t.type === 'sms' && t.language === language)
      if (smsTemplate) {
        try {
          await this.sendSMS(recipient.phone, smsTemplate, context)
          deliveredVia.push('sms')
        } catch (error) {
          errors.push(`SMS failed: ${error}`)
          
          // Fallback to WhatsApp
          if (recipient.preferences.whatsapp) {
            const whatsappTemplate = templateGroup.find(t => t.type === 'whatsapp' && t.language === language)
            if (whatsappTemplate) {
              try {
                await this.sendWhatsApp(recipient.phone, whatsappTemplate, context)
                deliveredVia.push('whatsapp')
              } catch (whatsappError) {
                errors.push(`WhatsApp failed: ${whatsappError}`)
              }
            }
          }
        }
      }
    }

    // Try Email if enabled and email available
    if (recipient.preferences.email && recipient.email) {
      const emailTemplate = templateGroup.find(t => t.type === 'email' && t.language === language)
      if (emailTemplate) {
        try {
          await this.sendEmail(recipient.email, emailTemplate, context)
          deliveredVia.push('email')
        } catch (error) {
          errors.push(`Email failed: ${error}`)
        }
      }
    }

    // Try Push notification if enabled
    if (recipient.preferences.push) {
      try {
        await this.sendPushNotification(templateKey, context)
        deliveredVia.push('push')
      } catch (error) {
        errors.push(`Push failed: ${error}`)
      }
    }

    return {
      success: deliveredVia.length > 0,
      deliveredVia,
      errors
    }
  }

  private async sendSMS(phone: string, template: NotificationTemplate, context: NotificationContext): Promise<void> {
    if (!this.twilioClient) {
      throw new Error('Twilio not configured')
    }

    const message = this.renderTemplate(template.body, context)
    
    await this.twilioClient.messages.create({
      body: message,
      from: env.TWILIO_PHONE_NUMBER,
      to: phone
    })
  }

  private async sendWhatsApp(phone: string, template: NotificationTemplate, context: NotificationContext): Promise<void> {
    if (!this.twilioClient) {
      throw new Error('Twilio not configured')
    }

    const message = this.renderTemplate(template.body, context)
    
    await this.twilioClient.messages.create({
      body: message,
      from: `whatsapp:${env.TWILIO_PHONE_NUMBER}`,
      to: `whatsapp:${phone}`
    })
  }

  private async sendEmail(email: string, template: NotificationTemplate, context: NotificationContext): Promise<void> {
    if (!this.emailTransporter) {
      throw new Error('Email not configured')
    }

    const subject = this.renderTemplate(template.subject || 'Notification', context)
    const body = this.renderTemplate(template.body, context)

    await this.emailTransporter.sendMail({
      from: env.SMTP_USER,
      to: email,
      subject,
      html: body
    })
  }

  private async sendPushNotification(templateKey: string, context: NotificationContext): Promise<void> {
    // Browser push notification implementation
    // This would integrate with service workers
    console.log('Push notification sent:', templateKey, context)
  }

  private renderTemplate(template: string, context: NotificationContext): string {
    let rendered = template
    
    Object.entries(context).forEach(([key, value]) => {
      const placeholder = new RegExp(`{{${key}}}`, 'g')
      rendered = rendered.replace(placeholder, String(value || ''))
    })
    
    return rendered
  }

  /**
   * Get available templates
   */
  getTemplates(): Record<string, NotificationTemplate[]> {
    return templates
  }

  /**
   * Test notification delivery
   */
  async testNotification(type: 'sms' | 'whatsapp' | 'email', recipient: string): Promise<boolean> {
    try {
      const testContext: NotificationContext = {
        customerName: 'Test User',
        orderId: 'TEST123',
        restaurantName: 'Test Restaurant',
        orderTotal: '₹500',
        estimatedTime: '30 minutes',
        trackingUrl: 'https://example.com/track/TEST123'
      }

      switch (type) {
        case 'sms':
          await this.sendSMS(recipient, templates.orderConfirmed[0], testContext)
          break
        case 'whatsapp':
          await this.sendWhatsApp(recipient, templates.orderPreparing[1], testContext)
          break
        case 'email':
          await this.sendEmail(recipient, templates.orderConfirmed[2], testContext)
          break
      }
      
      return true
    } catch (error) {
      console.error('Test notification failed:', error)
      return false
    }
  }
}

export const notificationService = new NotificationService()