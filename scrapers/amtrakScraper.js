import axios from 'axios';
import pool from '../config/database.js';

const TARGET_TRAINS = [
  { number: '2151', origin: 'NYP', destination: 'WAS' },
  { number: '2153', origin: 'NYP', destination: 'WAS' },
  { number: '2155', origin: 'NYP', destination: 'WAS' },
  { number: '2150', origin: 'WAS', destination: 'NYP' },
  { number: '2152', origin: 'WAS', destination: 'NYP' },
  { number: '137',  origin: 'WAS', destination: 'BOS' },
  { number: '139',  origin: 'BOS', destination: 'WAS' },
];

const STATION_NAMES = {
  NYP: 'New York Penn Station', NWK: 'Newark, NJ', MET: 'Metropark, NJ',
  TRE: 'Trenton, NJ', PHL: 'Philadelphia, PA', WIL: 'Wilmington, DE',
  ABE: 'Aberdeen, MD', BAL: 'Baltimore, MD', BWI: 'BWI Airport, MD',
  NCR: 'New Carrollton, MD', WAS: 'Washington Union Station',
  NHV: 'New Haven, CT', PVD: 'Providence, RI', BOS: 'Boston South Station',
};

export async function scrapeAmtrakDelays() {
  const startTime = Date.now();

  try {
    console.log('[SCRAPER] Fetching real-time delays from Amtraker API...');
    const today = new Date().toISOString().split('T')[0];
    let updated = 0;

    for (const train of TARGET_TRAINS) {
      try {
        const { data } = await axios.get(
          `https://api.amtraker.com/v3/trains/${train.number}`,
          { timeout: 10000, headers: { 'User-Agent': 'Corridor-App/1.0' } }
        );

        const instances = data[train.number];
        if (!instances || instances.length === 0) continue; // train not running today

        const t = instances[0];

        // Delay = difference between scheduled and estimated time at next event point
        let delayMinutes = 0;
        if (t.eventSchTime && t.eventEstTime) {
          const diff = new Date(t.eventEstTime) - new Date(t.eventSchTime);
          delayMinutes = Math.max(0, Math.round(diff / 60000));
        }

        const locationCode = t.eventCode || null;
        const currentLocation = locationCode ? (STATION_NAMES[locationCode] || locationCode) : null;
        const status = delayMinutes > 5 ? 'delayed' : 'on_time';

        await pool.query(
          `INSERT INTO delays (train_number, origin, destination, departure_date, current_delay_minutes, current_location, status, last_updated)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT (train_number, departure_date)
           DO UPDATE SET current_delay_minutes = $5, current_location = $6, status = $7, last_updated = NOW()`,
          [train.number, train.origin, train.destination, today, delayMinutes, currentLocation, status]
        );
        updated++;
      } catch {
        // train not running or API unavailable — skip silently
      }
    }

    const executionTime = Date.now() - startTime;
    await pool.query(
      `INSERT INTO scraper_logs (scraper_name, status, message, rows_affected, execution_time_ms)
       VALUES ($1, $2, $3, $4, $5)`,
      ['amtrak_delays', 'success', `Updated ${updated} trains via Amtraker API`, updated, executionTime]
    );

    console.log(`[SCRAPER] ✓ Completed in ${executionTime}ms. Updated ${updated} trains.`);
    return { success: true, rowsInserted: updated, executionTime };

  } catch (error) {
    console.error('[SCRAPER] Error:', error);
    const executionTime = Date.now() - startTime;
    await pool.query(
      `INSERT INTO scraper_logs (scraper_name, status, message, execution_time_ms)
       VALUES ($1, $2, $3, $4)`,
      ['amtrak_delays', 'failed', error.message, executionTime]
    );
    return { success: false, error: error.message };
  }
}
