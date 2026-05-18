// server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import tripsRouter from './routes/trips.js';
import searchRouter, { statusRouter } from './routes/search.js';
import { initializeScheduler, runScrapersOnStartup } from './scraper/scheduler.js';
import pool from './config/database.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'running', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/trips', tripsRouter);
app.use('/api/search', searchRouter);
app.use('/api/status', statusRouter);

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
  try {
    // Test database connection
    console.log('[SERVER] Testing database connection...');
    const result = await pool.query('SELECT NOW()');
    console.log('[SERVER] ✓ Database connected:', result.rows[0].now);

    // Initialize scheduler
    console.log('[SERVER] Initializing scraper scheduler...');
    initializeScheduler();

    // Run scrapers on startup
    console.log('[SERVER] Running initial scraper jobs...');
    await runScrapersOnStartup();

    // Start listening
    app.listen(PORT, () => {
      console.log(`[SERVER] ✓ Corridor backend running on port ${PORT}`);
      console.log(`[SERVER] Frontend base URL: http://localhost:${PORT}`);
      console.log(`[SERVER] API endpoints:`);
      console.log(`  - GET  /api/trips`);
      console.log(`  - POST /api/trips`);
      console.log(`  - GET  /api/trips/:id`);
      console.log(`  - GET  /api/search?origin=NYP&destination=WAS&date=2026-03-15`);
      console.log(`  - GET  /api/status`);
      console.log(`  - GET  /health`);
      console.log(`  - GET  /api/db-health`);
    });
  } catch (error) {
    console.error('[SERVER] Failed to start:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[SERVER] Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});
