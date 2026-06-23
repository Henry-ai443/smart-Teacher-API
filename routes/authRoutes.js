const express = require('express');
const User = require('../models/User');
const {
  generateToken,
  attachCookieToResponse,
  protect,
} = require('../middleware/auth');

const router = express.Router();


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password.',
      });
    }

    // 2. Find user and explicitly select the password field
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // 3. Compare passwords
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // 4. Generate token and attach as cookie
    const token = generateToken(user._id);
    attachCookieToResponse(res, token);

    // 5. Respond
    res.status(200).json({
      success: true,
      message: 'Login successful.',
      user: user.toSafeObject(),
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error during login.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.cookie('token', '', {
    httpOnly: true,
    expires: new Date(0), // Expire the cookie immediately
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully.',
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me  (protected)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  try {
    // req.user is already populated by the protect middleware
    res.status(200).json({
      success: true,
      user: req.user.toSafeObject(),
    });
  } catch (err) {
    console.error('Get current user error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error fetching user profile.',
    });
  }
});

module.exports = router;
