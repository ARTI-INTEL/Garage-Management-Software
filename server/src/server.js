import app from './app.js';
import { config } from './config/env.js';
import pool from './config/db.js';
import { logger } from './utils/logger.js';

const startServer = async () => {
  try {
    // Test DB connection
    const [rows] = await pool.query('SELECT 1 + 1 AS solution');
    logger.info('Database connected successfully.');

    app.listen(config.port, () => {
      logger.info(`Server is running on port ${config.port}`);
    });
  } catch (error) {
    logger.error('Failed to start the server', error);
    process.exit(1);
  }
};

startServer();

