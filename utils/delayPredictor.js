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

    // Try exact match: specific day + time of day
    let result = await pool.query(
      `SELECT avg_delay_minutes, sample_size,
              delay_under10min_percent, delay_10_30min_percent, delay_30plus_percent
       FROM historical_delays
       WHERE origin = $1 AND destination = $2 AND day_of_week = $3 AND time_of_day = $4`,
      [origin, destination, dayOfWeek, timeOfDay]
    );

    // Fallback: any day, same time of day
    if (result.rows.length === 0) {
      const r2 = await pool.query(
        `SELECT AVG(avg_delay_minutes) AS avg_delay_minutes,
                SUM(sample_size) AS sample_size,
                AVG(delay_under10min_percent) AS delay_under10min_percent,
                AVG(delay_10_30min_percent) AS delay_10_30min_percent,
                AVG(delay_30plus_percent) AS delay_30plus_percent
         FROM historical_delays
         WHERE origin = $1 AND destination = $2 AND time_of_day = $3`,
        [origin, destination, timeOfDay]
      );
      if (r2.rows.length > 0 && r2.rows[0].avg_delay_minutes != null) result = r2;
    }

    if (result.rows.length === 0 || result.rows[0].avg_delay_minutes == null) {
      return getGenericHistoricalDelay(origin, destination, dayOfWeek, hour);
    }

    const data = result.rows[0];
    const baseDelay = parseFloat(data.avg_delay_minutes) || 0;

    // Peak-day and peak-hour multipliers for realistic variability
    const isPeakDay  = dayOfWeek === 1 || dayOfWeek === 5;
    const isWeekend  = dayOfWeek === 0 || dayOfWeek === 6;
    const isPeakHour = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19);
    const dayMult    = isPeakDay ? 1.25 : isWeekend ? 1.10 : 1.0;
    const hourMult   = isPeakHour ? 1.15 : 1.0;
    const adjustedDelay = Math.round(baseDelay * dayMult * hourMult);
    const confidence = calculateConfidence(data.sample_size);

    return {
      predictedDelay: adjustedDelay,
      confidence,
      reasoning: `Based on ${Math.round(data.sample_size) || 'historical'} trips on ${getDayName(dayOfWeek)}s at ${timeOfDay}`,
      delayDistribution: {
        '<10min': Math.round(data.delay_under10min_percent) || 60,
        '10-30min': Math.round(data.delay_10_30min_percent) || 25,
        '30+min': Math.round(data.delay_30plus_percent) || 15,
      }
    };
  } catch (error) {
    console.error('Error getting historical delay:', error);
    return { predictedDelay: 0, confidence: 0 };
  }
}

async function getGenericHistoricalDelay(origin, destination, dayOfWeek = -1, hour = -1) {
  try {
    const result = await pool.query(
      `SELECT avg(avg_delay_minutes) as avg_delay, count(*) as sample_count
       FROM historical_delays
       WHERE origin = $1 AND destination = $2`,
      [origin, destination]
    );

    const baseDelay = Math.round(parseFloat(result.rows[0]?.avg_delay)) || 5;

    // Apply day/hour multipliers even in generic fallback so values vary
    let adjusted = baseDelay;
    if (dayOfWeek >= 0 && hour >= 0) {
      const isPeakDay  = dayOfWeek === 1 || dayOfWeek === 5;
      const isWeekend  = dayOfWeek === 0 || dayOfWeek === 6;
      const isPeakHour = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19);
      const dayMult    = isPeakDay ? 1.30 : isWeekend ? 1.15 : 1.0;
      const hourMult   = isPeakHour ? 1.20 : 1.0;
      adjusted = Math.round(baseDelay * dayMult * hourMult);
    }

    return {
      predictedDelay: adjusted,
      confidence: 30,
      reasoning: `Route average for ${getDayName(dayOfWeek)} ${getTimeOfDay(hour)} travel`,
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
