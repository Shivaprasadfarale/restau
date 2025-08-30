import { connectRedis } from '@/lib/redis';

export class CacheService {
  private static instance: CacheService;
  private defaultTTL = 3600; // 1 hour

  static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const redis = await connectRedis();
      const cached = await redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    try {
      const redis = await connectRedis();
      const serialized = JSON.stringify(value);
      if (ttl) {
        await redis.setex(key, ttl, serialized);
      } else {
        await redis.setex(key, this.defaultTTL, serialized);
      }
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      const redis = await connectRedis();
      await redis.del(key);
      return true;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  async invalidatePattern(pattern: string): Promise<boolean> {
    try {
      const redis = await connectRedis();
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      return true;
    } catch (error) {
      console.error('Cache invalidate pattern error:', error);
      return false;
    }
  }

  // Menu-specific cache methods
  async getMenu(restaurantId: string) {
    return this.get(`menu:${restaurantId}`);
  }

  async setMenu(restaurantId: string, menu: any, ttl = 1800) {
    return this.set(`menu:${restaurantId}`, menu, ttl);
  }

  async invalidateMenu(restaurantId: string) {
    return this.invalidatePattern(`menu:${restaurantId}*`);
  }

  // Cart-specific cache methods
  async getCart(sessionId: string) {
    return this.get(`cart:${sessionId}`);
  }

  async setCart(sessionId: string, cart: any, ttl = 86400) {
    return this.set(`cart:${sessionId}`, cart, ttl);
  }

  async deleteCart(sessionId: string) {
    return this.del(`cart:${sessionId}`);
  }

  // Order-specific cache methods
  async getOrder(orderId: string) {
    return this.get(`order:${orderId}`);
  }

  async setOrder(orderId: string, order: any, ttl = 3600) {
    return this.set(`order:${orderId}`, order, ttl);
  }

  async invalidateUserOrders(userId: string) {
    return this.invalidatePattern(`orders:user:${userId}*`);
  }

  // Analytics cache methods
  async getAnalytics(key: string) {
    return this.get(`analytics:${key}`);
  }

  async setAnalytics(key: string, data: any, ttl = 1800) {
    return this.set(`analytics:${key}`, data, ttl);
  }

  async invalidateAnalytics() {
    return this.invalidatePattern('analytics:*');
  }

  // Session cache methods
  async getSession(sessionId: string) {
    return this.get(`session:${sessionId}`);
  }

  async setSession(sessionId: string, session: any, ttl = 86400) {
    return this.set(`session:${sessionId}`, session, ttl);
  }

  async deleteSession(sessionId: string) {
    return this.del(`session:${sessionId}`);
  }

  // Rate limiting cache methods
  async getRateLimit(key: string): Promise<number> {
    try {
      const redis = await connectRedis();
      const count = await redis.get(`ratelimit:${key}`);
      return count ? parseInt(count) : 0;
    } catch (error) {
      console.error('Rate limit get error:', error);
      return 0;
    }
  }

  async incrementRateLimit(key: string, ttl = 3600): Promise<number> {
    try {
      const redis = await connectRedis();
      const multi = redis.multi();
      multi.incr(`ratelimit:${key}`);
      multi.expire(`ratelimit:${key}`, ttl);
      const results = await multi.exec();
      return results?.[0]?.[1] as number || 1;
    } catch (error) {
      console.error('Rate limit increment error:', error);
      return 1;
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const redis = await connectRedis();
      await redis.ping();
      return true;
    } catch (error) {
      console.error('Cache health check failed:', error);
      return false;
    }
  }
}

export const cacheService = CacheService.getInstance();