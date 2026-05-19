// routes/search.js
import express from 'express';
import pool from '../config/database.js';
import { predictDelay } from '../utils/delayPredictor.js';

const router = express.Router();

// Stop offsets (minutes from route terminal departure time).
// Array order defines valid travel direction — origin must appear before destination.
const ROUTE_STOPS = {
  'NYP-WAS': {
    regional: [
      { code: 'NYP', offset: 0   },
      { code: 'NWK', offset: 19  },
      { code: 'MET', offset: 34  },
      { code: 'CWH', offset: 46  },
      { code: 'TRE', offset: 55  },
      { code: 'PHL', offset: 85  },
      { code: 'WIL', offset: 108 },
      { code: 'ABE', offset: 128 },
      { code: 'BAL', offset: 151 },
      { code: 'BWI', offset: 165 },
      { code: 'NCR', offset: 175 },
      { code: 'WAS', offset: 185 },
    ],
    acela: [
      { code: 'NYP', offset: 0   },
      { code: 'PHL', offset: 68  },
      { code: 'WIL', offset: 91  },
      { code: 'BAL', offset: 120 },
      { code: 'WAS', offset: 155 },
    ],
  },
  'WAS-NYP': {
    regional: [
      { code: 'WAS', offset: 0   },
      { code: 'NCR', offset: 10  },
      { code: 'BWI', offset: 20  },
      { code: 'BAL', offset: 34  },
      { code: 'ABE', offset: 57  },
      { code: 'WIL', offset: 77  },
      { code: 'PHL', offset: 100 },
      { code: 'TRE', offset: 130 },
      { code: 'CWH', offset: 139 },
      { code: 'MET', offset: 151 },
      { code: 'NWK', offset: 166 },
      { code: 'NYP', offset: 185 },
    ],
    acela: [
      { code: 'WAS', offset: 0   },
      { code: 'BAL', offset: 35  },
      { code: 'WIL', offset: 64  },
      { code: 'PHL', offset: 87  },
      { code: 'NYP', offset: 155 },
    ],
  },
  'NYP-BOS': {
    regional: [
      { code: 'NYP', offset: 0   },
      { code: 'NRO', offset: 30  },
      { code: 'STM', offset: 47  },
      { code: 'BRP', offset: 75  },
      { code: 'NHV', offset: 90  },
      { code: 'MYS', offset: 120 },
      { code: 'NLC', offset: 135 },
      { code: 'OSB', offset: 148 },
      { code: 'WLY', offset: 155 },
      { code: 'PVD', offset: 160 },
      { code: 'RTE', offset: 192 },
      { code: 'BOS', offset: 207 },
    ],
    acela: [
      { code: 'NYP', offset: 0   },
      { code: 'STM', offset: 38  },
      { code: 'NHV', offset: 75  },
      { code: 'PVD', offset: 140 },
      { code: 'BOS', offset: 185 },
    ],
  },
  'BOS-NYP': {
    regional: [
      { code: 'BOS', offset: 0   },
      { code: 'RTE', offset: 15  },
      { code: 'PVD', offset: 47  },
      { code: 'WLY', offset: 52  },
      { code: 'OSB', offset: 59  },
      { code: 'NLC', offset: 72  },
      { code: 'MYS', offset: 87  },
      { code: 'NHV', offset: 117 },
      { code: 'BRP', offset: 132 },
      { code: 'STM', offset: 160 },
      { code: 'NRO', offset: 177 },
      { code: 'NYP', offset: 207 },
    ],
    acela: [
      { code: 'BOS', offset: 0   },
      { code: 'PVD', offset: 45  },
      { code: 'NHV', offset: 110 },
      { code: 'STM', offset: 147 },
      { code: 'NYP', offset: 185 },
    ],
  },
  'BOS-WAS': {
    regional: [
      { code: 'BOS', offset: 0   },
      { code: 'RTE', offset: 15  },
      { code: 'PVD', offset: 47  },
      { code: 'WLY', offset: 52  },
      { code: 'OSB', offset: 59  },
      { code: 'NLC', offset: 72  },
      { code: 'MYS', offset: 87  },
      { code: 'NHV', offset: 117 },
      { code: 'BRP', offset: 132 },
      { code: 'STM', offset: 160 },
      { code: 'NRO', offset: 177 },
      { code: 'NYP', offset: 207 },
      { code: 'NWK', offset: 226 },
      { code: 'MET', offset: 241 },
      { code: 'TRE', offset: 262 },
      { code: 'PHL', offset: 292 },
      { code: 'WIL', offset: 315 },
      { code: 'ABE', offset: 335 },
      { code: 'BAL', offset: 358 },
      { code: 'BWI', offset: 372 },
      { code: 'NCR', offset: 382 },
      { code: 'WAS', offset: 392 },
    ],
  },
  'WAS-BOS': {
    regional: [
      { code: 'WAS', offset: 0   },
      { code: 'NCR', offset: 10  },
      { code: 'BWI', offset: 20  },
      { code: 'BAL', offset: 34  },
      { code: 'ABE', offset: 57  },
      { code: 'WIL', offset: 77  },
      { code: 'PHL', offset: 100 },
      { code: 'TRE', offset: 130 },
      { code: 'MET', offset: 151 },
      { code: 'NWK', offset: 166 },
      { code: 'NYP', offset: 185 },
      { code: 'NRO', offset: 215 },
      { code: 'STM', offset: 232 },
      { code: 'BRP', offset: 260 },
      { code: 'NHV', offset: 275 },
      { code: 'MYS', offset: 305 },
      { code: 'NLC', offset: 320 },
      { code: 'OSB', offset: 333 },
      { code: 'WLY', offset: 340 },
      { code: 'PVD', offset: 345 },
      { code: 'RTE', offset: 377 },
      { code: 'BOS', offset: 392 },
    ],
  },
};

function addMins(timeStr, mins) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Returns route keys where both stops exist and origin precedes destination
function getApplicableRouteKeys(origin, destination) {
  const keys = [];
  for (const [routeKey, variants] of Object.entries(ROUTE_STOPS)) {
    const stops = (variants.regional || variants.acela).map(s => s.code);
    const oIdx = stops.indexOf(origin);
    const dIdx = stops.indexOf(destination);
    if (oIdx !== -1 && dIdx !== -1 && oIdx < dIdx) keys.push(routeKey);
  }
  return keys;
}

function getOffset(routeKey, trainType, stopCode) {
  const variants = ROUTE_STOPS[routeKey];
  if (!variants) return null;
  const stops = (trainType === 'acela' && variants.acela) ? variants.acela : variants.regional;
  return stops.find(s => s.code === stopCode)?.offset ?? null;
}

const BASE_PRICES = {
  'NYP-WAS': { regional: 89,  acela: 175 },
  'WAS-NYP': { regional: 89,  acela: 175 },
  'NYP-BOS': { regional: 99,  acela: 195 },
  'BOS-NYP': { regional: 99,  acela: 195 },
  'BOS-WAS': { regional: 149 },
  'WAS-BOS': { regional: 149 },
};

function estimatePrice(routeKey, trainType, boardTime, dateStr) {
  const base = BASE_PRICES[routeKey]?.[trainType] ?? 79;
  const [h] = boardTime.split(':').map(Number);
  const isPeak = (h >= 7 && h <= 9) || (h >= 17 && h <= 19);
  const dow = new Date(dateStr + 'T00:00:00').getDay();
  const isWeekend = dow === 0 || dow === 6;
  const daysOut = Math.floor((new Date(dateStr) - Date.now()) / 86400000);
  let price = base;
  if (isPeak)     price *= 1.20;
  if (isWeekend)  price *= 1.10;
  if (daysOut < 7) price *= 1.15;
  return Math.round(price);
}

// GET /api/search
router.get('/', async (req, res) => {
  try {
    const { origin, destination, date } = req.query;
    if (!origin || !destination || !date) {
      return res.status(400).json({ error: 'Missing required query parameters: origin, destination, date' });
    }

    const routeKeys = getApplicableRouteKeys(origin, destination);
    if (routeKeys.length === 0) return res.json([]);

    const dow = new Date(date + 'T00:00:00').getDay();

    const placeholders = routeKeys.map((_, i) => `$${i + 1}`).join(', ');
    const schedResult = await pool.query(
      `SELECT * FROM schedules WHERE route_key IN (${placeholders})`,
      routeKeys
    ).catch(() => ({ rows: [] }));

    const todaySchedules = schedResult.rows.filter(s => {
      const days = s.days_of_week.split(',').map(d => parseInt(d.trim()));
      return days.includes(dow);
    });

    if (todaySchedules.length === 0) return res.json([]);

    const results = await Promise.all(
      todaySchedules.map(async (sched) => {
        const trainType = sched.train_type;
        const routeKey  = sched.route_key;

        const oOffset = getOffset(routeKey, trainType, origin);
        const dOffset = getOffset(routeKey, trainType, destination);
        if (oOffset === null || dOffset === null) return null;

        const terminalDep = sched.departure_time.substring(0, 5);
        const boardTime   = addMins(terminalDep, oOffset);
        const alightTime  = addMins(terminalDep, dOffset);

        let price = null, trend = null;
        try {
          const pr = await pool.query(
            `SELECT current_price, trend FROM prices
             WHERE origin = $1 AND destination = $2 AND train_number = $3 AND departure_date = $4
             ORDER BY scraped_at DESC LIMIT 1`,
            [origin, destination, sched.train_number, date]
          );
          if (pr.rows.length > 0) {
            price = parseFloat(pr.rows[0].current_price);
            trend = pr.rows[0].trend;
          }
        } catch { /* use estimate */ }

        if (price === null) price = estimatePrice(routeKey, trainType, boardTime, date);

        let aiDelay = 0;
        try {
          const pred = await predictDelay({
            origin, destination,
            train_number: sched.train_number,
            departure_date: date,
            departure_time: boardTime,
          });
          aiDelay = pred.predictedDelay || 0;
        } catch { /* no delay info */ }

        return {
          train: sched.train_number,
          trainType,
          time: boardTime,
          arriveTime: alightTime,
          price,
          trend: trend || null,
          delay: aiDelay,
        };
      })
    );

    const sorted = results
      .filter(Boolean)
      .sort((a, b) => a.time.localeCompare(b.time));

    res.json(sorted);
  } catch (error) {
    console.error('Error searching trains:', error);
    res.status(500).json({ error: 'Failed to search trains' });
  }
});

export default router;

// Status router — kept in same file, exported for server.js
export const statusRouter = express.Router();

statusRouter.get('/', async (req, res) => {
  try {
    const [logsR, delaysR, pricesR, historicalR] = await Promise.all([
      pool.query('SELECT scraper_name, status, created_at FROM scraper_logs ORDER BY created_at DESC LIMIT 5'),
      pool.query('SELECT MAX(last_updated) as last_updated FROM delays'),
      pool.query('SELECT MAX(scraped_at) as last_updated FROM prices'),
      pool.query('SELECT MAX(last_updated) as last_updated FROM historical_delays'),
    ]);
    res.json({
      status: 'running',
      nextScrape: new Date(Date.now() + 3600000).toISOString(),
      lastScraperRuns: logsR.rows,
      dataFreshness: {
        delays:     delaysR.rows[0]?.last_updated || null,
        prices:     pricesR.rows[0]?.last_updated || null,
        historical: historicalR.rows[0]?.last_updated || null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting status:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});
