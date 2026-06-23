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

// ─── Global middleware ──────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true, // Allow cookies to be sent cross-origin
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

// ─── 404 handler for unmatched routes ───────────────────────────────────────
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
    message:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error.'
        : err.message,
  });
});

// ─── Database connection & server start ─────────────────────────────────────
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

const startServer = async () => {
  try {
    console.log('Connecting to MongoDB...');
    console.log("MONGO_URI:", process.env.MONGODB_URI);
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected successfully.');
    console.log('Connected to Database:', mongoose.connection.db.databaseName);

    app.listen(PORT, () => {
      console.log(`🚀 Axiom Education API server running on port ${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }
};

// Handle unhandled promise rejections globally
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
  process.exit(1);
});

startServer();
