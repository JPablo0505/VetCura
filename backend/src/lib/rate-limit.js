const { apiError } = require('./errors');

// Minimal in-memory sliding-window rate limiter (per process).
// For multi-instance deployments put this behind a shared store;
// the 429 contract (status + Retry-After) stays the same.
const buckets = new Map();

function rateLimit({ windowMs = 60000, max = 30 } = {}) {
  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
    if (hits.length >= max) {
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
      return next(apiError('rate_limited', 'Too many requests, slow down', 429));
    }
    hits.push(now);
    buckets.set(key, hits);
    if (buckets.size > 10000) buckets.clear();
    return next();
  };
}

function resetRateLimits() {
  buckets.clear();
}

module.exports = { rateLimit, resetRateLimits };
