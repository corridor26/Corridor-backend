// server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import tripsRouter from './routes/trips.js';
import searchRouter, { statusRouter } from './routes/search.js';
import weatherRouter from './routes/weather.js';
import { initializeScheduler, runScrapersOnStartup } from './scraper/scheduler.js';
import pool from './config/database.js';
import { runMigrations } from './scripts/migrate.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: [
    'https://www.corridor-app.com',
    'https://corridor-app.com',
    'https://front-end-production-5cbd.up.railway.app',
  ],
  credentials: true,
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'running', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/trips', tripsRouter);
app.use('/api/search', searchRouter);
app.use('/api/status', statusRouter);
app.use('/api/weather', weatherRouter);

// Database health check
app.get('/api/db-health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      status: 'connected', 
      timestamp: result.rows[0].now,
      database: process.env.DATABASE_URL ? 'configured' : 'not configured'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: error.message 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// Start server
async function startServer() {
  // Listen immediately so Railway sees the port open
  app.listen(PORT, () => {
    console.log(`[SERVER] ✓ Corridor backend running on port ${PORT}`);
    console.log(`[SERVER] API endpoints: /api/trips /api/search /api/status /health /api/db-health`);
  });

  // Test DB and kick off scrapers in the background
  try {
    console.log('[SERVER] Testing database connection...');
    const result = await pool.query('SELECT NOW()');
    console.log('[SERVER] ✓ Database connected:', result.rows[0].now);

    console.log('[SERVER] Running migrations...');
    await runMigrations();
    console.log('[SERVER] ✓ Migrations complete');

    console.log('[SERVER] Initializing scraper scheduler...');
    initializeScheduler();

    console.log('[SERVER] Running initial scraper jobs...');
    runScrapersOnStartup().catch(err =>
      console.error('[SERVER] Startup scrapers failed (non-fatal):', err.message)
    );
  } catch (error) {
    console.error('[SERVER] Database connection failed:', error.message);
  }
}

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[SERVER] Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});
