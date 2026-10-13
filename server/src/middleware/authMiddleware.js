import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import pool from '../config/db.js';
import { logger } from '../utils/logger.js';

export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      
      const decoded = jwt.verify(token, config.jwt.secret);
      // Share links (invoice PDF tokens) are signed with the same secret but
      // carry no user id — they must never authenticate API requests.
      if (!decoded.id) {
        return res.status(401).json({ status: 'error', message: 'Not authorized, token failed' });
      }
      req.user = decoded; // { id, role, garage_id, iat, exp }

      // Tenancy is resolved from the database, never trusted from the token
      // snapshot: a JWT lives for hours while garages can be renumbered or a
      // user moved, and a stale garage_id would scope queries to the wrong
      // tenant. The same join yields the garage's active flag, and because
      // garage_id may legitimately be 0 it is never treated as a boolean here.
      const [tenancy] = await pool.query(
        `SELECT u.garage_id, g.is_active
         FROM users u
         JOIN garages g ON g.id = u.garage_id
         WHERE u.id = ?`,
        [decoded.id]
      );
      if (tenancy.length === 0) {
        return res.status(401).json({ status: 'error', message: 'Not authorized, token failed' });
      }
      req.user.garage_id = tenancy[0].garage_id;

      // Super admins are platform operators: they only manage garages and
      // read their own profile — never garage data.
      if (decoded.role === 'super_admin') {
        const url = req.originalUrl.split('?')[0];
        const allowed = url === '/api/auth/me' || url.startsWith('/api/garages');
        if (!allowed) {
          return res.status(403).json({
            status: 'error',
            message: 'Super admin accounts can only access the garage management panel'
          });
        }
      } else if (Number(tenancy[0].is_active) === 0) {
        // Temporarily disabled garage: block every request from its users so
        // all access stops immediately, while the data stays in the database.
        // 401 (not 403) so the client clears the session and lands on /login.
        return res.status(401).json({
          status: 'error',
          message: 'This garage has been temporarily disabled. Contact the super admin.'
        });
      }

      next();
    } catch (error) {
      logger.error('Rejected token', error);
      res.status(401).json({ status: 'error', message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    res.status(401).json({ status: 'error', message: 'Not authorized, no token' });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ 
        status: 'error', 
        message: `User role ${req.user ? req.user.role : 'unknown'} is not authorized to access this route` 
      });
    }
    next();
  };
};

