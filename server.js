const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');

// ─── Load environment variables ─────────────────────────────────────────────
dotenv.config();

const authRoutes = require('./routes/authRoutes');
const aiRoutes = require('./routes/aiRoutes');
const adminRoutes = require('./routes/adminRoutes');
const lessonPlanRoutes = require('./routes/lessonPlanRoutes');

// ─── Create Express app ─────────────────────────────────────────────────────
const app = express();

// ─── Security & Middleware ──────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── CORS Configuration ─────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'https://smartteacher01.vercel.app'
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true, // Crucial for passing cookies/tokens cross-site
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

// ─── API Routes ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api', aiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', lessonPlanRoutes);

// ─── Health check ───────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Axiom Education API is running.',
    timestamp: new Date().toISOString(),
  });
});

// ─── 404 handler ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ─── Global error handler ───────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error.' : err.message,
  });
});

// ─── Database connection & server start ─────────────────────────────────────
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

const startServer = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected successfully.');

    app.listen(PORT, () => {
      console.log(`🚀 Axiom Education API server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }
};

startServer();