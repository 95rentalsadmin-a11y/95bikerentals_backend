import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { initializeDatabase, prisma } from './database/database';
import bikeRoutes from './routes/bikeRoutes';
import bookingRoutes from './routes/bookingRoutes';
import adminRoutes from './routes/adminRoutes';
import customerAuthRoutes from './routes/customerAuthRoutes';
import customerUploadRoutes from './routes/customerUploadRoutes';
import paymentRoutes from './routes/paymentRoutes';
import catalogRoutes from './routes/catalogRoutes';

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 5000;

// Allowed origins for CORS. Comma-separated in .env, e.g.
// ALLOWED_ORIGINS=http://localhost:3000,https://95bikerentals.in
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow same-origin / no-origin (curl, server-to-server) requests.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

// Razorpay webhook needs the raw body to verify the signature. We mount a
// dedicated raw-body parser ONLY for the webhook route, before express.json().
app.post(
  '/api/payments/razorpay/webhook',
  express.raw({ type: 'application/json' }),
  (req, _res, next) => {
    // Re-parse as JSON into req.body for the controller, but keep rawBody.
    (req as any).rawBody = (req as any).rawBody || req.body;
    try {
      req.body = JSON.parse(req.body.toString('utf8'));
    } catch {
      req.body = {};
    }
    next();
  }
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Rate limiting: general API limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Stricter limiter for auth / OTP-style endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

app.use('/api/', apiLimiter);

// Initialize database
const startServer = async () => {
  try {
    if (process.env.NODE_ENV === 'production') {
      const missing = ['DATABASE_URL', 'JWT_SECRET', 'ADMIN_USERNAME', 'ADMIN_PASSWORD']
        .filter((name) => !process.env[name]);
      if (!process.env.FIREBASE_SERVICE_ACCOUNT_PATH && !process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
        missing.push('FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_BASE64');
      }
      if (missing.length > 0) {
        throw new Error(`Missing production configuration: ${missing.join(', ')}`);
      }
    }
    await initializeDatabase();

    // Routes
    app.get('/', (req: Request, res: Response) => {
      res.json({
        message: '95 Bike Rentals API',
        version: '1.0.0',
        endpoints: {
          bikes: '/api/bikes',
          bookings: '/api/bookings',
          payments: '/api/payments',
        },
      });
    });

    app.use('/api/bikes', bikeRoutes);
    app.use('/api/bookings', bookingRoutes);
    app.use('/api/admin', authLimiter, adminRoutes);
    app.use('/api/auth', authLimiter, customerAuthRoutes);
    app.use('/api/uploads', customerUploadRoutes);
    app.use('/api/payments', paymentRoutes);
    app.use('/api/catalog', catalogRoutes);

    // Error handling middleware
    app.use((err: Error, req: Request, res: Response, next: any) => {
      console.error(err.stack);
      res.status(500).json({ error: 'Something went wrong!' });
    });

    // Start server
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`API available at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down server...');
  await prisma.$disconnect();
  process.exit(0);
});

startServer();

export default app;
