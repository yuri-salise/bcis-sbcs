interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 2 * 60 * 1000).unref();

export function checkRateLimit(
  key: string,
  limit = 5,
  windowMs = 60 * 1000
): { allowed: boolean; retryAfter: number; remaining: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { allowed: false, retryAfter, remaining: 0 };
  }

  entry.count += 1;
  return { allowed: true, retryAfter: 0, remaining: limit - entry.count };
}

export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

export function clearAllRateLimits(): void {
  rateLimitStore.clear();
}
