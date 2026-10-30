const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Authentication Middleware
 *
 * Verifies the JWT Bearer token supplied in the Authorization header.
 * - Format expected: "Authorization: Bearer <token>"
 * - Returns 401 if missing, malformed, invalid, or expired.
 * - Attaches the authenticated counselor document to `req.user`.
 */
module.exports = async function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token missing or malformed',
      });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET || 'crm_jwt_default_secret_dev_key');
    const user = await User.findById(payload.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
};
