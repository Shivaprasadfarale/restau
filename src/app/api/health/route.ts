import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { env } from '@/lib/env'

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    // Check database connection
    const dbStart = Date.now()
    await connectToDatabase()
    const dbTime = Date.now() - dbStart
    
    // Check Redis connection (if available)
    let redisTime = 0
    let redisStatus = 'not_configured'
    
    try {
      if (env.REDIS_URL) {
        const { createClient } = await import('redis')
        const redisStart = Date.now()
        const client = createClient({ url: env.REDIS_URL })
        await client.connect()
        await client.ping()
        await client.disconnect()
        redisTime = Date.now() - redisStart
        redisStatus = 'healthy'
      }
    } catch (redisError) {
      redisStatus = 'unhealthy'
    }
    
    const totalTime = Date.now() - startTime
    
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: env.NODE_ENV,
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024)
      },
      services: {
        database: {
          status: 'healthy',
          responseTime: dbTime
        },
        redis: {
          status: redisStatus,
          responseTime: redisTime
        }
      },
      responseTime: totalTime
    }
    
    return NextResponse.json(healthData, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
    
  } catch (error) {
    console.error('Health check failed:', error)
    
    const errorData = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime: Date.now() - startTime
    }
    
    return NextResponse.json(errorData, { 
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  }
}

// HEAD request for simple health checks
export async function HEAD(request: NextRequest) {
  try {
    await connectToDatabase()
    return new NextResponse(null, { status: 200 })
  } catch (error) {
    return new NextResponse(null, { status: 503 })
  }
}