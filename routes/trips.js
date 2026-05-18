// routes/trips.js
import express from 'express';
import pool from '../config/database.js';
import { predictDelay } from '../utils/delayPredictor.js';

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
          direction: 'Southbound',
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
    const delayPrediction = await predictDelay(trip);

    // Get delay distribution
    const delayDistResult = await pool.query(
      `SELECT delay_<10min_percent, delay_10_30min_percent, delay_30plus_percent
       FROM historical_delays
       WHERE origin = $1 AND destination = $2
       LIMIT 1`,
      [trip.origin, trip.destination]
    );

    const delayDistribution = delayDistResult.rows.length > 0 ? {
      '<10min': delayDistResult.rows[0]['delay_<10min_percent'] || 50,
      '10-30min': delayDistResult.rows[0]['delay_10_30min_percent'] || 25,
      '30+min': delayDistResult.rows[0]['delay_30plus_percent'] || 25
    } : { '<10min': 50, '10-30min': 25, '30+min': 25 };

    // Get recent avg delay
    const recentDelayResult = await pool.query(
      `SELECT AVG(current_delay_minutes) as avg_delay
       FROM delays
       WHERE origin = $1 AND destination = $2 
       AND last_updated > NOW() - INTERVAL '3 hours'`,
      [trip.origin, trip.destination]
    );

    const recentAvgDelay = recentDelayResult.rows[0]?.avg_delay || 0;

    res.json({
      id: trip.id,
      trainName: 'Acela',
      number: trip.train_number,
      fromCode: trip.origin,
      toCode: trip.destination,
      departure: trip.departure_time.substring(0, 5),
      arrival: trip.arrival_time.substring(0, 5),
      date: trip.departure_date,
      statusType: delayPrediction.predictedDelay === 0 ? 'ontime' : 'delayed',
      statusLabel: delayPrediction.predictedDelay === 0 ? 'ON TIME' : 'DELAYED',
      aiDelay: delayPrediction.predictedDelay,
      aiConfidence: delayPrediction.confidence,
      currentLocation: delayPrediction.currentLocation,
      recentAvgDelay: Math.round(recentAvgDelay),
      delayDistribution,
      reasoning: delayPrediction.reasoning
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
