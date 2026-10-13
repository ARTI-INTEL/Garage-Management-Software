import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env.js';

// Import Routes (To be created)
import authRoutes from './routes/authRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import vehicleRoutes from './routes/vehicleRoutes.js';
import jobRoutes from './routes/jobRoutes.js';
import userRoutes from './routes/userRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import partRoutes from './routes/partRoutes.js';
import quoteRoutes from './routes/quoteRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import garageRoutes from './routes/garageRoutes.js';
import { rateLimiter, apiLimiter, passwordResetLimiter } from './middleware/rateLimiter.js';
import { requestLogger } from './middleware/requestLogger.js';
import { logger } from './utils/logger.js';

const app = express();

// Middleware
app.use(helmet());
app.use(requestLogger);
app.use(cors({
  origin: config.clientUrl,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'success', message: 'API is running' });
});

// Routes — general API budget first (generous, so tests and normal use never
// hit it), then the strict login limiter on top of it.
app.use('/api', apiLimiter);
app.use('/api/auth/login', rateLimiter);
app.use('/api/auth/reset-password', passwordResetLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/users', userRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/parts', partRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/garages', garageRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found' });
});

// Global Error Handler — stack goes to logs/app.log + logs/error.log
// (and mirrors to stderr outside the test runner)
app.use((err, req, res, next) => {
  logger.error(`${req.method} ${req.originalUrl} - ${err.message}`, err);
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal Server Error'
  });
});

export default app;
