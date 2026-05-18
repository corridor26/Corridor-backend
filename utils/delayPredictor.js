// utils/delayPredictor.js
import pool from '../config/database.js';

export async function predictDelay(trip) {
  try {
    // Determine if trip is in future or current
    const now = new Date();
    const tripDateTime = new Date(`${trip.departure_date}T${trip.departure_time}`);
    const hoursUntilDeparture = (tripDateTime - now) / (1000 * 60 * 60);

    // If train departs within 2 hours, use real-time delay
    if (hoursUntilDeparture <= 2 && hoursUntilDeparture > 0) {
      return await getRealTimeDelay(trip.train_number, trip.departure_date);
    }

    // Otherwise use historical patterns
    return await getHistoricalDelay(trip.origin, trip.destination, tripDateTime);
  } catch (error) {
    console.error('Error predicting delay:', error);
    return { predictedDelay: 0, confidence: 0, reasoning: 'Unable to predict' };
  }
}

async function getRealTimeDelay(trainNumber, departureDate) {
  try {
    const result = await pool.query(
      `SELECT current_delay_minutes, current_location, status, last_updated
       FROM delays
       WHERE train_number = $1 AND departure_date = $2
       ORDER BY last_updated DESC
       LIMIT 1`,
      [trainNumber, departureDate]
    );

    if (result.rows.length === 0) {
      return {
        predictedDelay: 0,
        confidence: 50,
        reasoning: 'No real-time data available yet',
        currentLocation: null,
        status: 'scheduled'
      };
    }

    const delay = result.rows[0];
    return {
      predictedDelay: delay.current_delay_minutes || 0,
      confidence: 85,
      reasoning: 'Based on real-time train status',
      currentLocation: delay.current_location,
      status: delay.status,
      lastUpdated: delay.last_updated
    };
  } catch (error) {
    console.error('Error getting real-time delay:', error);
    return { predictedDelay: 0, confidence: 0 };
  }
}

async function getHistoricalDelay(origin, destination, tripDateTime) {
  try {
    const dayOfWeek = tripDateTime.getDay();
    const hour = tripDateTime.getHours();
    const timeOfDay = getTimeOfDay(hour);

    const result = await pool.query(
      `SELECT avg_delay_minutes, sample_size,
              delay_under10min_percent, delay_10_30min_percent, delay_30plus_percent
       FROM historical_delays
       WHERE origin = $1 AND destination = $2 AND day_of_week = $3 AND time_of_day = $4`,
      [origin, destination, dayOfWeek, timeOfDay]
    );

    if (result.rows.length === 0) {
      // No specific data for this day/time, try any day
      return getGenericHistoricalDelay(origin, destination);
    }

    const data = result.rows[0];
    const confidence = calculateConfidence(data.sample_size);

    return {
      predictedDelay: data.avg_delay_minutes || 0,
      confidence,
      reasoning: `Based on ${data.sample_size} historical trips on ${getDayName(dayOfWeek)}s at ${timeOfDay}`,
      delayDistribution: {
        '<10min': data.delay_under10min_percent,
        '10-30min': data.delay_10_30min_percent,
        '30+min': data.delay_30plus_percent
      }
    };
  } catch (error) {
    console.error('Error getting historical delay:', error);
    return { predictedDelay: 0, confidence: 0 };
  }
}

async function getGenericHistoricalDelay(origin, destination) {
  try {
    const result = await pool.query(
      `SELECT avg(avg_delay_minutes) as avg_delay, count(*) as sample_count
       FROM historical_delays
       WHERE origin = $1 AND destination = $2`,
      [origin, destination]
    );

    if (result.rows.length === 0) {
      return { predictedDelay: 0, confidence: 20, reasoning: 'No historical data available' };
    }

    const data = result.rows[0];
    return {
      predictedDelay: Math.round(data.avg_delay) || 0,
      confidence: 40,
      reasoning: 'Generic historical average (limited sample)'
    };
  } catch (error) {
    console.error('Error getting generic delay:', error);
    return { predictedDelay: 0, confidence: 0 };
  }
}

function getTimeOfDay(hour) {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

function getDayName(dayOfWeek) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek];
}

function calculateConfidence(sampleSize) {
  if (!sampleSize) return 20;
  if (sampleSize < 10) return 40;
  if (sampleSize < 50) return 65;
  if (sampleSize < 100) return 80;
  return 90;
}
