import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

export const generateToken = (userId, role, garageId) => {
  return jwt.sign({ id: userId, role, garage_id: garageId }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
};
