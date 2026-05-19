import axios from 'axios';
import pool from '../config/database.js';

const TARGET_TRAINS = [
  // Acela NYP↔WAS
  { number: '2151', origin: 'NYP', destination: 'WAS' },
  { number: '2153', origin: 'NYP', destination: 'WAS' },
  { number: '2155', origin: 'NYP', destination: 'WAS' },
  { number: '2157', origin: 'NYP', destination: 'WAS' },
  { number: '2159', origin: 'NYP', destination: 'WAS' },
  { number: '2163', origin: 'NYP', destination: 'WAS' },
  { number: '2165', origin: 'NYP', destination: 'WAS' },
  { number: '2167', origin: 'NYP', destination: 'WAS' },
  { number: '2150', origin: 'WAS', destination: 'NYP' },
  { number: '2152', origin: 'WAS', destination: 'NYP' },
  { number: '2154', origin: 'WAS', destination: 'NYP' },
  { number: '2156', origin: 'WAS', destination: 'NYP' },
  { number: '2158', origin: 'WAS', destination: 'NYP' },
  { number: '2160', origin: 'WAS', destination: 'NYP' },
  { number: '2164', origin: 'WAS', destination: 'NYP' },
  { number: '2166', origin: 'WAS', destination: 'NYP' },
  // Acela NYP↔BOS
  { number: '2171', origin: 'NYP', destination: 'BOS' },
  { number: '2173', origin: 'NYP', destination: 'BOS' },
  { number: '2175', origin: 'NYP', destination: 'BOS' },
  { number: '2177', origin: 'NYP', destination: 'BOS' },
  { number: '2179', origin: 'NYP', destination: 'BOS' },
  { number: '2170', origin: 'BOS', destination: 'NYP' },
  { number: '2172', origin: 'BOS', destination: 'NYP' },
  { number: '2174', origin: 'BOS', destination: 'NYP' },
  { number: '2176', origin: 'BOS', destination: 'NYP' },
  { number: '2178', origin: 'BOS', destination: 'NYP' },
  // NEC Regional NYP↔WAS
  { number: '83',  origin: 'NYP', destination: 'WAS' },
  { number: '85',  origin: 'NYP', destination: 'WAS' },
  { number: '87',  origin: 'NYP', destination: 'WAS' },
  { number: '89',  origin: 'NYP', destination: 'WAS' },
  { number: '95',  origin: 'NYP', destination: 'WAS' },
  { number: '97',  origin: 'NYP', destination: 'WAS' },
  { number: '125', origin: 'NYP', destination: 'WAS' },
  { number: '127', origin: 'NYP', destination: 'WAS' },
  { number: '129', origin: 'NYP', destination: 'WAS' },
  { number: '131', origin: 'NYP', destination: 'WAS' },
  { number: '133', origin: 'NYP', destination: 'WAS' },
  { number: '135', origin: 'NYP', destination: 'WAS' },
  { number: '86',  origin: 'WAS', destination: 'NYP' },
  { number: '88',  origin: 'WAS', destination: 'NYP' },
  { number: '90',  origin: 'WAS', destination: 'NYP' },
  { number: '92',  origin: 'WAS', destination: 'NYP' },
  { number: '94',  origin: 'WAS', destination: 'NYP' },
  { number: '96',  origin: 'WAS', destination: 'NYP' },
  { number: '130', origin: 'WAS', destination: 'NYP' },
  { number: '132', origin: 'WAS', destination: 'NYP' },
  { number: '134', origin: 'WAS', destination: 'NYP' },
  // NEC Regional NYP↔BOS
  { number: '171', origin: 'NYP', destination: 'BOS' },
  { number: '173', origin: 'NYP', destination: 'BOS' },
  { number: '175', origin: 'NYP', destination: 'BOS' },
  { number: '177', origin: 'NYP', destination: 'BOS' },
  { number: '179', origin: 'NYP', destination: 'BOS' },
  { number: '170', origin: 'BOS', destination: 'NYP' },
  { number: '172', origin: 'BOS', destination: 'NYP' },
  { number: '174', origin: 'BOS', destination: 'NYP' },
  { number: '176', origin: 'BOS', destination: 'NYP' },
  // NEC Regional BOS↔WAS through trains
  { number: '137', origin: 'WAS', destination: 'BOS' },
  { number: '139', origin: 'BOS', destination: 'WAS' },
  { number: '66',  origin: 'BOS', destination: 'WAS' },
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
