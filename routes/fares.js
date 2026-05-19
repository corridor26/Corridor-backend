import express from 'express';
import pool from '../config/database.js';

const router = express.Router();

function minutesAgoLabel(ts) {
  if (!ts) return null;
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

function daysCoveredFrom(firstTs) {
  if (!firstTs) return 0;
  return Math.max(1, Math.ceil((Date.now() - new Date(firstTs).getTime()) / 86400000));
}

// GET /api/fares/chart?origin=NYP&destination=WAS&departureDate=2026-06-01&trainNumber=2151&window=7d
router.get('/chart', async (req, res) => {
  try {
    const { origin, destination, departureDate, trainNumber, window: win = '7d' } = req.query;
    if (!origin || !destination || !departureDate || !trainNumber) {
      return res.status(400).json({ error: 'Required: origin, destination, departureDate, trainNumber' });
    }

    const windowHours = win === '24h' ? 24 : win === '7d' ? 168 : 720;
    const since = new Date(Date.now() - windowHours * 3600000);

    const [pointsResult, metaResult] = await Promise.all([
      pool.query(
        `SELECT observed_at, lowest_fare
         FROM fare_observations
         WHERE origin=$1 AND destination=$2 AND departure_date=$3
           AND train_number=$4 AND scrape_success=true AND lowest_fare IS NOT NULL
           AND observed_at >= $5
         ORDER BY observed_at ASC`,
        [origin, destination, departureDate, trainNumber, since]
      ),
      pool.query(
        `SELECT MIN(observed_at) AS first_obs, MAX(observed_at) AS last_obs, COUNT(*) AS total
         FROM fare_observations
         WHERE origin=$1 AND destination=$2 AND departure_date=$3
           AND train_number=$4 AND scrape_success=true AND lowest_fare IS NOT NULL`,
        [origin, destination, departureDate, trainNumber]
      ),
    ]);

    const points = pointsResult.rows.map(r => ({
      observedAt: r.observed_at,
      fare: parseFloat(r.lowest_fare),
    }));

    const fares = points.map(p => p.fare);
    const meta = metaResult.rows[0];

    res.json({
      points,
      currentFare: fares.length > 0 ? fares[fares.length - 1] : null,
      windowLow:   fares.length > 0 ? Math.min(...fares) : null,
      windowHigh:  fares.length > 0 ? Math.max(...fares) : null,
      observationCount: points.length,
      daysCovered: daysCoveredFrom(meta?.first_obs),
      lastObserved: minutesAgoLabel(meta?.last_obs),
      totalObservations: parseInt(meta?.total || 0),
    });
  } catch (err) {
    console.error('[FARES] chart error:', err);
    res.status(500).json({ error: 'Failed to fetch fare chart' });
  }
});

// GET /api/fares/latest?origin=NYP&destination=WAS&date=2026-06-01
router.get('/latest', async (req, res) => {
  try {
    const { origin, destination, date } = req.query;
    if (!origin || !destination || !date) {
      return res.status(400).json({ error: 'Required: origin, destination, date' });
    }

    const [latestResult, metaResult] = await Promise.all([
      pool.query(
        `SELECT DISTINCT ON (train_number)
           train_number, departure_time, arrival_time, lowest_fare, fare_class, sold_out, observed_at
         FROM fare_observations
         WHERE origin=$1 AND destination=$2 AND departure_date=$3 AND scrape_success=true
         ORDER BY train_number, observed_at DESC`,
        [origin, destination, date]
      ),
      pool.query(
        `SELECT MIN(observed_at) AS first_obs, MAX(observed_at) AS last_obs
         FROM fare_observations
         WHERE origin=$1 AND destination=$2 AND departure_date=$3 AND scrape_success=true`,
        [origin, destination, date]
      ),
    ]);

    const meta = metaResult.rows[0];
    const trains = latestResult.rows
      .filter(r => r.lowest_fare !== null || r.sold_out)
      .map(r => ({
        trainNumber:       r.train_number,
        departureTime:     r.departure_time?.substring(0, 5) || null,
        arrivalTime:       r.arrival_time?.substring(0, 5)   || null,
        currentFare:       r.lowest_fare ? parseFloat(r.lowest_fare) : null,
        fareClass:         r.fare_class,
        soldOut:           r.sold_out,
        observedAt:        r.observed_at,
        minutesAgo:        r.observed_at ? Math.floor((Date.now() - new Date(r.observed_at).getTime()) / 60000) : null,
      }));

    res.json({
      trains,
      coverage: {
        daysCovered:  daysCoveredFrom(meta?.first_obs),
        lastObserved: minutesAgoLabel(meta?.last_obs),
      },
    });
  } catch (err) {
    console.error('[FARES] latest error:', err);
    res.status(500).json({ error: 'Failed to fetch latest fares' });
  }
});

export default router;
