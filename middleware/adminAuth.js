/**
 * Express middleware to restrict access to admin users.
 * MUST be used after the `protect` authentication middleware.
 */
const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Not authenticated. Please log in.',
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Administrator privileges required.',
    });
  }

  next();
};

module.exports = isAdmin;
