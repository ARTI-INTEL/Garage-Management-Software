import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 5000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  // Public base URL of this API — used to build share links customers open from
  // WhatsApp (must be reachable from outside, e.g. https://api.example.com)
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, ''),
  db: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gms_db'
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback_secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  }
};

