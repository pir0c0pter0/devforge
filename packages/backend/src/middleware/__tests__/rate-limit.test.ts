/**
 * Tests for rate limiting middleware
 *
 * Tests for:
 * - standardRateLimiter configuration
 * - strictRateLimiter configuration
 * - authRateLimiter configuration
 * - createRateLimiter factory function
 * - rateLimitConfig export
 */

import {
  standardRateLimiter,
  strictRateLimiter,
  authRateLimiter,
  createRateLimiter,
  rateLimitConfig,
} from '../rate-limit';

describe('rateLimitConfig export', () => {
  it('should export standard rate limit configuration', () => {
    expect(rateLimitConfig.standard).toBeDefined();
    expect(rateLimitConfig.standard.limit).toBe(100);
    expect(rateLimitConfig.standard.windowMs).toBe(15 * 60 * 1000);
    expect(rateLimitConfig.standard.windowMinutes).toBe(15);
  });

  it('should export strict rate limit configuration', () => {
    expect(rateLimitConfig.strict).toBeDefined();
    expect(rateLimitConfig.strict.limit).toBe(20);
    expect(rateLimitConfig.strict.windowMs).toBe(15 * 60 * 1000);
    expect(rateLimitConfig.strict.windowMinutes).toBe(15);
  });

  it('should export auth rate limit configuration', () => {
    expect(rateLimitConfig.auth).toBeDefined();
    expect(rateLimitConfig.auth.limit).toBe(5);
    expect(rateLimitConfig.auth.windowMs).toBe(60 * 1000);
    expect(rateLimitConfig.auth.windowMinutes).toBe(1);
  });

  it('should have consistent window calculations', () => {
    expect(rateLimitConfig.standard.windowMs / 60000).toBe(rateLimitConfig.standard.windowMinutes);
    expect(rateLimitConfig.strict.windowMs / 60000).toBe(rateLimitConfig.strict.windowMinutes);
    expect(rateLimitConfig.auth.windowMs / 60000).toBe(rateLimitConfig.auth.windowMinutes);
  });
});

describe('standardRateLimiter', () => {
  it('should be defined', () => {
    expect(standardRateLimiter).toBeDefined();
    expect(typeof standardRateLimiter).toBe('function');
  });

  it('should be a middleware function that accepts 3 arguments', () => {
    expect(standardRateLimiter.length).toBeLessThanOrEqual(3);
  });

  it('should have the same window as strict limiter', () => {
    expect(rateLimitConfig.standard.windowMs).toBe(rateLimitConfig.strict.windowMs);
  });
});

describe('strictRateLimiter', () => {
  it('should be defined', () => {
    expect(strictRateLimiter).toBeDefined();
    expect(typeof strictRateLimiter).toBe('function');
  });

  it('should be a middleware function', () => {
    expect(strictRateLimiter.length).toBeLessThanOrEqual(3);
  });

  it('should have lower limit than standard limiter', () => {
    expect(rateLimitConfig.strict.limit).toBeLessThan(rateLimitConfig.standard.limit);
  });
});

describe('authRateLimiter', () => {
  it('should be defined', () => {
    expect(authRateLimiter).toBeDefined();
    expect(typeof authRateLimiter).toBe('function');
  });

  it('should be a middleware function', () => {
    expect(authRateLimiter.length).toBeLessThanOrEqual(3);
  });

  it('should have the lowest limit', () => {
    expect(rateLimitConfig.auth.limit).toBeLessThan(rateLimitConfig.strict.limit);
  });

  it('should have the shortest window', () => {
    expect(rateLimitConfig.auth.windowMs).toBeLessThan(rateLimitConfig.standard.windowMs);
  });
});

describe('createRateLimiter factory', () => {
  it('should create a rate limiter with custom settings', () => {
    const customLimiter = createRateLimiter(50, 30000);

    expect(customLimiter).toBeDefined();
    expect(typeof customLimiter).toBe('function');
  });

  it('should create a rate limiter with custom message', () => {
    const customLimiter = createRateLimiter(10, 10000, 'Custom rate limit message');

    expect(customLimiter).toBeDefined();
    expect(typeof customLimiter).toBe('function');
  });

  it('should create a middleware function', () => {
    const customLimiter = createRateLimiter(1, 1000);
    expect(customLimiter.length).toBeLessThanOrEqual(3);
  });

  it('should allow creating limiters with different configurations', () => {
    const limiter1 = createRateLimiter(100, 60000);
    const limiter2 = createRateLimiter(10, 30000);
    const limiter3 = createRateLimiter(5, 10000);

    // All should be defined and different function instances
    expect(limiter1).toBeDefined();
    expect(limiter2).toBeDefined();
    expect(limiter3).toBeDefined();
    expect(limiter1).not.toBe(limiter2);
    expect(limiter2).not.toBe(limiter3);
  });
});

describe('Rate limit configuration values', () => {
  it('should have reasonable standard limits', () => {
    expect(rateLimitConfig.standard.limit).toBeGreaterThan(0);
    expect(rateLimitConfig.standard.limit).toBeLessThanOrEqual(1000);
  });

  it('should have stricter limits for strict limiter', () => {
    expect(rateLimitConfig.strict.limit).toBeLessThan(rateLimitConfig.standard.limit);
  });

  it('should have strictest limits for auth limiter', () => {
    expect(rateLimitConfig.auth.limit).toBeLessThan(rateLimitConfig.strict.limit);
    expect(rateLimitConfig.auth.limit).toBeLessThan(rateLimitConfig.standard.limit);
  });

  it('should have shorter window for auth limiter', () => {
    expect(rateLimitConfig.auth.windowMs).toBeLessThan(rateLimitConfig.standard.windowMs);
    expect(rateLimitConfig.auth.windowMs).toBeLessThan(rateLimitConfig.strict.windowMs);
  });

  it('should have same window for standard and strict limiters', () => {
    expect(rateLimitConfig.standard.windowMs).toBe(rateLimitConfig.strict.windowMs);
  });
});

describe('Rate limit configuration defaults', () => {
  it('should have standard limit of 100 requests', () => {
    expect(rateLimitConfig.standard.limit).toBe(100);
  });

  it('should have strict limit of 20 requests', () => {
    expect(rateLimitConfig.strict.limit).toBe(20);
  });

  it('should have auth limit of 5 requests', () => {
    expect(rateLimitConfig.auth.limit).toBe(5);
  });

  it('should have standard window of 15 minutes', () => {
    expect(rateLimitConfig.standard.windowMinutes).toBe(15);
  });

  it('should have strict window of 15 minutes', () => {
    expect(rateLimitConfig.strict.windowMinutes).toBe(15);
  });

  it('should have auth window of 1 minute', () => {
    expect(rateLimitConfig.auth.windowMinutes).toBe(1);
  });
});

describe('Rate limiter type checking', () => {
  it('standardRateLimiter should be a RateLimitRequestHandler', () => {
    // Check that it's a function (middleware)
    expect(typeof standardRateLimiter).toBe('function');
  });

  it('strictRateLimiter should be a RateLimitRequestHandler', () => {
    expect(typeof strictRateLimiter).toBe('function');
  });

  it('authRateLimiter should be a RateLimitRequestHandler', () => {
    expect(typeof authRateLimiter).toBe('function');
  });

  it('createRateLimiter should return a RateLimitRequestHandler', () => {
    const limiter = createRateLimiter(10, 1000);
    expect(typeof limiter).toBe('function');
  });
});

describe('Configuration structure', () => {
  it('should have all required fields in rateLimitConfig.standard', () => {
    expect(rateLimitConfig.standard).toHaveProperty('limit');
    expect(rateLimitConfig.standard).toHaveProperty('windowMs');
    expect(rateLimitConfig.standard).toHaveProperty('windowMinutes');
  });

  it('should have all required fields in rateLimitConfig.strict', () => {
    expect(rateLimitConfig.strict).toHaveProperty('limit');
    expect(rateLimitConfig.strict).toHaveProperty('windowMs');
    expect(rateLimitConfig.strict).toHaveProperty('windowMinutes');
  });

  it('should have all required fields in rateLimitConfig.auth', () => {
    expect(rateLimitConfig.auth).toHaveProperty('limit');
    expect(rateLimitConfig.auth).toHaveProperty('windowMs');
    expect(rateLimitConfig.auth).toHaveProperty('windowMinutes');
  });

  it('should have numeric values for all limits', () => {
    expect(typeof rateLimitConfig.standard.limit).toBe('number');
    expect(typeof rateLimitConfig.strict.limit).toBe('number');
    expect(typeof rateLimitConfig.auth.limit).toBe('number');
  });

  it('should have numeric values for all windows', () => {
    expect(typeof rateLimitConfig.standard.windowMs).toBe('number');
    expect(typeof rateLimitConfig.strict.windowMs).toBe('number');
    expect(typeof rateLimitConfig.auth.windowMs).toBe('number');
  });
});
