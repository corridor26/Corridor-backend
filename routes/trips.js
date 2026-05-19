// routes/trips.js
import express from 'express';
import axios from 'axios';
import pool from '../config/database.js';
import { predictDelay } from '../utils/delayPredictor.js';

// Static NEC stop schedules (offset in minutes from departure)
const NEC_STOPS = {
  'NYP-WAS': [
    { code: 'NYP', name: 'New York Penn Station',     offsetMins: 0   },
    { code: 'NWK', name: 'Newark Penn Station',       offsetMins: 19  },
    { code: 'TRE', name: 'Trenton',                   offsetMins: 55  },
    { code: 'PHL', name: 'Philadelphia 30th Street',  offsetMins: 85  },
    { code: 'WIL', name: 'Wilmington',                offsetMins: 108 },
    { code: 'BAL', name: 'Baltimore Penn Station',    offsetMins: 151 },
    { code: 'WAS', name: 'Washington Union Station',  offsetMins: 185 },
  ],
  'WAS-NYP': [
    { code: 'WAS', name: 'Washington Union Station',  offsetMins: 0   },
    { code: 'BAL', name: 'Baltimore Penn Station',    offsetMins: 34  },
    { code: 'WIL', name: 'Wilmington',                offsetMins: 77  },
    { code: 'PHL', name: 'Philadelphia 30th Street',  offsetMins: 100 },
    { code: 'TRE', name: 'Trenton',                   offsetMins: 130 },
    { code: 'NWK', name: 'Newark Penn Station',       offsetMins: 166 },
    { code: 'NYP', name: 'New York Penn Station',     offsetMins: 185 },
  ],
  'NYP-BOS': [
    { code: 'NYP', name: 'New York Penn Station',   offsetMins: 0   },
    { code: 'STM', name: 'Stamford',                offsetMins: 47  },
    { code: 'NHV', name: 'New Haven',               offsetMins: 90  },
    { code: 'PVD', name: 'Providence',              offsetMins: 160 },
    { code: 'BOS', name: 'Boston South Station',    offsetMins: 207 },
  ],
  'BOS-NYP': [
    { code: 'BOS', name: 'Boston South Station',    offsetMins: 0   },
    { code: 'PVD', name: 'Providence',              offsetMins: 47  },
    { code: 'NHV', name: 'New Haven',               offsetMins: 117 },
    { code: 'STM', name: 'Stamford',                offsetMins: 160 },
    { code: 'NYP', name: 'New York Penn Station',   offsetMins: 207 },
  ],
};

function addMins(timeStr, mins) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

async function getStops(origin, destination, trainNumber, departureTime, delayMinutes = 0) {
  // Try Amtraker API first for real-time stops
  try {
    const { data } = await axios.get(
      `https://api.amtraker.com/v3/trains/${trainNumber}`,
      { timeout: 8000, headers: { 'User-Agent': 'Corridor-App/1.0' } }
    );
    const instances = data[trainNumber];
    if (instances && instances.length > 0 && instances[0].stations?.length > 0) {
      return instances[0].stations.map(s => {
        const schTime = s.schDep || s.schArr;
        const actTime = s.postDep || s.postArr || s.estDep || s.estArr;
        return {
          code: s.code,
          name: s.code,
          schTime: schTime ? new Date(schTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' }) : null,
          actTime: actTime ? new Date(actTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' }) : null,
          passed: !!(s.postDep || s.postArr),
        };
      });
    }
  } catch { /* fall through to static */ }

  // Fall back to static NEC schedule
  const key = `${origin}-${destination}`;
  const staticStops = NEC_STOPS[key];
  if (!staticStops) return [];

  return staticStops.map(stop => ({
    code: stop.code,
    name: stop.name,
    schTime: addMins(departureTime, stop.offsetMins),
    actTime: delayMinutes > 0 ? addMins(departureTime, stop.offsetMins + delayMinutes) : null,
    passed: false,
  }));
}

const NEC_ORDER = ['BOS','RTE','PVD','WLY','NLC','OSB','MYS','NHV','BRP','STM','NRO','NYP','NWK','MET','CWH','TRE','PHL','WIL','ABE','BAL','BWI','NCR','WAS'];
const getDirection = (o, d) => {
  const oi = NEC_ORDER.indexOf(o), di = NEC_ORDER.indexOf(d);
  if (oi < 0 || di < 0) return null;
  return oi < di ? 'Southbound' : 'Northbound';
};

const router = express.Router();

// GET /api/trips - Get all trips for a specific date (or upcoming)
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    let whereClause = 'WHERE departure_date >= CURRENT_DATE';
    let params = [];

    if (date) {
      whereClause = 'WHERE departure_date = $1';
      params = [date];
    } else if (req.query.past === 'true') {
      whereClause = "WHERE departure_date >= CURRENT_DATE - INTERVAL '60 days' AND departure_date < CURRENT_DATE";
    }

    const result = await pool.query(
      `SELECT t.*, r.origin_name, r.destination_name, r.typical_duration_minutes
       FROM trips t
       LEFT JOIN routes r ON (t.origin = r.origin AND t.destination = r.destination)
       ${whereClause}
       ORDER BY departure_date ASC, departure_time ASC`,
      params
    );

    // Enhance each trip with delay prediction
    const tripsWithPredictions = await Promise.all(
      result.rows.map(async (trip) => {
        const delayPrediction = await predictDelay(trip);
        return {
          id: trip.id,
          trainNumber: trip.train_number,
          fromCode: trip.origin,
          fromName: trip.origin_name,
          toCode: trip.destination,
          toName: trip.destination_name,
          departure: trip.departure_time.substring(0, 5),
          arrival: trip.arrival_time.substring(0, 5),
          date: trip.departure_date,
          aiDelay: delayPrediction.predictedDelay,
          aiConfidence: delayPrediction.confidence,
          statusType: delayPrediction.predictedDelay === 0 ? 'ontime' : 'delayed',
          statusLabel: delayPrediction.predictedDelay === 0 ? 'ON TIME' : 'DELAYED',
          progress: 0,
          currentLocation: delayPrediction.currentLocation || null,
          track: 'TBD',
          trackStatus: 'unannounced',
          direction: getDirection(trip.origin, trip.destination),
          recentAvgDelay: delayPrediction.predictedDelay,
          reasoning: delayPrediction.reasoning
        };
      })
    );

    res.json(tripsWithPredictions);
  } catch (error) {
    console.error('Error fetching trips:', error);
    res.status(500).json({ error: 'Failed to fetch trips' });
  }
});

// GET /api/trips/:id - Get a single trip with all details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT t.*, r.origin_name, r.destination_name, r.typical_duration_minutes
       FROM trips t
       LEFT JOIN routes r ON (t.origin = r.origin AND t.destination = r.destination)
       WHERE t.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const trip = result.rows[0];
    const depTime = trip.departure_time.substring(0, 5);
    const [delayPrediction, delayDistResult, recentDelayResult, stops, priceResult] = await Promise.all([
      predictDelay(trip),
      pool.query(
        `SELECT delay_under10min_percent, delay_10_30min_percent, delay_30plus_percent
         FROM historical_delays WHERE origin = $1 AND destination = $2 LIMIT 1`,
        [trip.origin, trip.destination]
      ),
      pool.query(
        `SELECT AVG(current_delay_minutes) as avg_delay FROM delays
         WHERE origin = $1 AND destination = $2 AND last_updated > NOW() - INTERVAL '3 hours'`,
        [trip.origin, trip.destination]
      ),
      getStops(trip.origin, trip.destination, trip.train_number, depTime),
      pool.query(
        `SELECT current_price, high_24h, low_24h, trend FROM prices
         WHERE origin = $1 AND destination = $2 AND train_number = $3
         ORDER BY scraped_at DESC LIMIT 1`,
        [trip.origin, trip.destination, trip.train_number]
      ).catch(() => ({ rows: [] })),
    ]);

    const dist = delayDistResult.rows[0];
    const delayDistribution = dist
      ? { '<10min': dist.delay_under10min_percent || 50, '10-30min': dist.delay_10_30min_percent || 25, '30+min': dist.delay_30plus_percent || 25 }
      : { '<10min': 50, '10-30min': 25, '30+min': 25 };

    const price = priceResult.rows[0];

    res.json({
      id: trip.id,
      trainName: parseInt(trip.train_number) >= 2100 ? 'Acela' : 'NEC Regional',
      number: trip.train_number,
      fromCode: trip.origin,
      fromName: trip.origin_name || trip.origin,
      toCode: trip.destination,
      toName: trip.destination_name || trip.destination,
      departure: depTime,
      arrival: trip.arrival_time.substring(0, 5),
      date: trip.departure_date,
      statusType: delayPrediction.predictedDelay === 0 ? 'ontime' : 'delayed',
      statusLabel: delayPrediction.predictedDelay === 0 ? 'ON TIME' : 'DELAYED',
      aiDelay: delayPrediction.predictedDelay,
      aiConfidence: delayPrediction.confidence,
      currentLocation: delayPrediction.currentLocation,
      recentAvgDelay: Math.round(recentDelayResult.rows[0]?.avg_delay || 0),
      delayDistribution,
      reasoning: delayPrediction.reasoning,
      stops,
      currentPrice: price?.current_price || null,
      high24h: price?.high_24h || null,
      low24h: price?.low_24h || null,
      priceTrend: price?.trend || null,
    });
  } catch (error) {
    console.error('Error fetching trip details:', error);
    res.status(500).json({ error: 'Failed to fetch trip details' });
  }
});

// POST /api/trips - Create a new trip
router.post('/', async (req, res) => {
  try {
    const { trainNumber, origin, destination, departureDate, departureTime, arrivalTime } = req.body;

    // Validate input
    if (!trainNumber || !origin || !destination || !departureDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pool.query(
      `INSERT INTO trips (train_number, origin, destination, departure_date, departure_time, arrival_time)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [trainNumber, origin, destination, departureDate, departureTime || '00:00', arrivalTime || '00:00']
    );

    const newTrip = result.rows[0];
    const delayPrediction = await predictDelay(newTrip);

    res.status(201).json({
      id: newTrip.id,
      trainNumber: newTrip.train_number,
      origin: newTrip.origin,
      destination: newTrip.destination,
      departureDate: newTrip.departure_date,
      aiDelay: delayPrediction.predictedDelay,
      aiConfidence: delayPrediction.confidence,
      reasoning: delayPrediction.reasoning
    });
  } catch (error) {
    console.error('Error creating trip:', error);
    res.status(500).json({ error: 'Failed to create trip' });
  }
});

// DELETE /api/trips/:id - Delete a trip
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM trips WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    res.json({ message: 'Trip deleted', id });
  } catch (error) {
    console.error('Error deleting trip:', error);
    res.status(500).json({ error: 'Failed to delete trip' });
  }
});

export default router;
