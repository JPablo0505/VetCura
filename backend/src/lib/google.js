const crypto = require('node:crypto');
const { OAuth2Client } = require('google-auth-library');
const { apiError } = require('./errors');

let client = null;

function allowedAudiences() {
  const raw = process.env.GOOGLE_ALLOWED_AUDIENCES || process.env.GOOGLE_CLIENT_ID || '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

// Verifies a Google ID token cryptographically (signature, issuer,
// expiry) and checks the audience against the configured list.
// verifyFn lets tests inject stub verdicts without network; production
// always uses the official google-auth-library client.
async function verifyGoogleToken(idToken, verifyFn) {
  const audiences = allowedAudiences();
  if (audiences.length === 0) {
    throw apiError(
      'google_unconfigured',
      'Google Sign-In is not configured (set GOOGLE_CLIENT_ID or GOOGLE_ALLOWED_AUDIENCES)',
      501,
    );
  }
  try {
    let payload;
    if (verifyFn) {
      payload = await verifyFn(idToken, audiences);
    } else {
      client = client || new OAuth2Client();
      const ticket = await client.verifyIdToken({ idToken, audience: audiences });
      payload = ticket.getPayload();
    }
    if (!payload || !payload.sub) {
      throw apiError('invalid_google_token', 'Google token rejected', 401);
    }
    return {
      sub: String(payload.sub),
      email: payload.email ? String(payload.email).toLowerCase() : '',
      email_verified: payload.email_verified === true || payload.email_verified === 'true',
      name: payload.name ? String(payload.name) : '',
    };
  } catch (err) {
    if (err && (err.code === 'invalid_google_token' || err.code === 'google_unconfigured')) throw err;
    // Never leak provider internals (expired vs malformed look identical).
    throw apiError('invalid_google_token', 'Google token rejected', 401);
  }
}

function sha256hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

module.exports = { verifyGoogleToken, allowedAudiences, sha256hex };
