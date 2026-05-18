// routes/search.js
import express from 'express';
import pool from '../config/database.js';
import { predictDelay } from '../utils/delayPredictor.js';

const router = express.Router();

// GET /api/search - Search for available trains
router.get('/', async (req, res) => {
  try {
    const { origin, destination, date } = req.query;

    if (!origin || !destination || !date) {
      return res.status(400).json({ error: 'Missing required query parameters: origin, destination, date' });
    }

    // Get sample prices for this route
    const priceResult = await pool.query(
      `SELECT DISTINCT train_number, current_price, high_24h, low_24h, trend
       FROM prices
       WHERE origin = $1 AND destination = $2 AND departure_date = $3
       ORDER BY current_price ASC`,
      [origin, destination, date]
    );

    // If no prices found, return mock data
    if (priceResult.rows.length === 0) {
      const mockTrains = [
        { time: '07:05', arriveTime: '09:42', price: 94, delay: 4, train: '2151' },
        { time: '09:30', arriveTime: '12:15', price: 78, delay: 0, train: '2153' },
        { time: '14:30', arriveTime: '17:05', price: 68, delay: 12, train: '2155' },
      ];
      return res.json(mockTrains);
    }

    // Transform price data into search results
    const results = priceResult.rows.map(row => ({
      train: row.train_number,
      time: '00:00', // Would need separate table for actual times
      arriveTime: '00:00',
      price: parseFloat(row.current_price),
      delay: 0, // Would predict based on historical data
      trend: row.trend
    }));

    res.json(results);
  } catch (error) {
    console.error('Error searching trains:', error);
    res.status(500).json({ error: 'Failed to search trains' });
  }
});

export default router;

// routes/status.js (separate file, but exporting here for simplicity)
export const statusRouter = express.Router();

statusRouter.get('/', async (req, res) => {
  try {
    // Get last scraper run times
    const scraperLogsResult = await pool.query(
      `SELECT scraper_name, status, created_at
       FROM scraper_logs
       ORDER BY created_at DESC
       LIMIT 5`
    );

    // Get data freshness
    const freshness = {
      delays: null,
      prices: null,
      historical: null
    };

    const delaysResult = await pool.query('SELECT MAX(last_updated) as last_updated FROM delays');
    const pricesResult = await pool.query('SELECT MAX(scraped_at) as last_updated FROM prices');
    const historicalResult = await pool.query('SELECT MAX(last_updated) as last_updated FROM historical_delays');

    if (delaysResult.rows[0]?.last_updated) {
      freshness.delays = delaysResult.rows[0].last_updated;
    }
    if (pricesResult.rows[0]?.last_updated) {
      freshness.prices = pricesResult.rows[0].last_updated;
    }
    if (historicalResult.rows[0]?.last_updated) {
      freshness.historical = historicalResult.rows[0].last_updated;
    }

    res.json({
      status: 'running',
      nextScrape: new Date(Date.now() + 3600000).toISOString(),
      lastScraperRuns: scraperLogsResult.rows,
      dataFreshness: freshness,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting status:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});
