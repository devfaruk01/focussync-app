const buckets = new Map();

function rateLimit({ windowMs = 60_000, max = 120 } = {}) {
  return function rateLimitMiddleware(req, res, next) {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > max) {
      return res.status(429).json({ error: 'Too many requests. Please retry later.' });
    }

    return next();
  };
}

module.exports = rateLimit;
