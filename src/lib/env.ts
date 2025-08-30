import { z } from "zod"

// Define schema
const envSchema = z.object({
  // Database
  MONGODB_URI: z.string().min(1, "MongoDB URI is required").default("mongodb://admin:password@localhost:27017/restaurant_db?authSource=admin"),
  REDIS_URL: z.string().min(1, "Redis URL is required").default("redis://:redispassword@localhost:6379"),

  // Authentication
  JWT_SECRET: z.string().min(1, "JWT secret is required").default("dev-jwt-secret-32-characters-long"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT refresh secret is required").default("dev-jwt-refresh-secret-32-chars"),

  // Payment Gateways
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),

  // File Storage
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Notifications
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),

  // Email
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  // App Configuration
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Security
  ENCRYPTION_KEY: z.string().min(32, "Encryption key must be at least 32 characters").default("12345678901234567890123456789012"),
})

export type Env = z.infer<typeof envSchema>

function validateEnv(): Env {
  try {
    // Safely get environment variables with fallbacks
    const appEnv = {
      // Database
      MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/restaurant_db",
      REDIS_URL: process.env.REDIS_URL || "redis://:redispassword@localhost:6379",
      
      // Authentication
      JWT_SECRET: process.env.JWT_SECRET || "dev-jwt-secret-32-characters-long",
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "dev-jwt-refresh-secret-32-chars",
      
      // Payment Gateways (optional)
      RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
      RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
      STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      
      // File Storage (optional)
      CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
      CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
      CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
      
      // Notifications (optional)
      TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
      TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
      
      // Email (optional)
      SMTP_HOST: process.env.SMTP_HOST,
      SMTP_PORT: process.env.SMTP_PORT,
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASS: process.env.SMTP_PASS,
      
      // App Configuration
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      NODE_ENV: process.env.NODE_ENV || "development",
      
      // Security
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || "12345678901234567890123456789012",
    }

    const env = envSchema.parse(appEnv)

    // Extra runtime checks for production only
    if (env.NODE_ENV === "production") {
      const requiredInProd: (keyof Env)[] = [
        "MONGODB_URI",
        "JWT_SECRET",
        "JWT_REFRESH_SECRET",
        "ENCRYPTION_KEY",
      ]

      const missing = requiredInProd.filter((key) => !process.env[key])
      if (missing.length > 0) {
        throw new Error(
          `Missing required environment variables in production:\n${missing.join("\n")}`
        )
      }
    }

    return env
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map(
          (err) =>
            `${err.path.length ? err.path.join(".") : "root"}: ${err.message}`
        )
        .join("\n")
      throw new Error(`❌ Environment validation failed:\n${issues}`)
    }
    throw error
  }
}

// Validate and export environment variables
export const env = validateEnv()
