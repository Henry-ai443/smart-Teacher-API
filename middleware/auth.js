const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Generate a signed JWT for a given user ID.
 * @param {string} userId - The MongoDB _id of the user.
 * @returns {string} Signed JWT token.
 */
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

/**
 * Attach a JWT as an HTTP-only cookie on the response.
 * @param {object} res - Express response object.
 * @param {string} token - Signed JWT.
 */
const attachCookieToResponse = (res, token) => {
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie('token', token, {
    httpOnly: true, // Prevents client-side JS from reading the cookie
    secure: isProduction, // Only send over HTTPS in production
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  });
};

/**
 * Express middleware: protect routes by verifying the JWT from cookies.
 * On success, attaches `req.user` with the full user document (minus password).
 */
const protect = async (req, res, next) => {
  try {
    // 1. Extract token from cookie
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated. Please log in.',
      });
    }

    // 2. Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      // Handle specific JWT errors for better client feedback
      const message =
        err.name === 'TokenExpiredError'
          ? 'Session expired. Please log in again.'
          : 'Invalid authentication token.';

      return res.status(401).json({ success: false, message });
    }

    // 3. Confirm user still exists in the database
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User belonging to this token no longer exists.',
      });
    }

    // 4. Attach user to request and proceed
    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication.',
    });
  }
};

/**
 * Express middleware: restrict access to specific roles.
 * Must be used AFTER the `protect` middleware.
 * @param  {...string} roles - Allowed roles (e.g., 'admin', 'teacher').
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action.',
      });
    }
    next();
  };
};

module.exports = {
  generateToken,
  attachCookieToResponse,
  protect,
  authorize,
};
