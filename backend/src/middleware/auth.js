const jwt = require('jsonwebtoken');
const { apiError } = require('../lib/errors');

function getSecret() {
  return process.env.JWT_SECRET || 'change-me-in-production';
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    getSecret(),
    // Admin sessions last a full shift; renewal still goes through
    // refresh rotation when the access token eventually expires.
    { expiresIn: process.env.JWT_EXPIRES_IN || '4h' },
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(apiError('unauthorized', 'Missing bearer token', 401));
  }
  try {
    req.user = jwt.verify(token, getSecret());
    return next();
  } catch {
    return next(apiError('unauthorized', 'Invalid or expired token', 401));
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(apiError('forbidden', 'Insufficient role', 403));
    }
    return next();
  };
}

module.exports = { signToken, requireAuth, requireRole };
