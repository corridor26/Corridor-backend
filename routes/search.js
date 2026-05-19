// routes/search.js
import express from 'express';
import axios from 'axios';
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

function computeDuration(dep, arr) {
  if (!dep || !arr) return null;
  const [dh, dm] = dep.split(':').map(Number);
  const [ah, am] = arr.split(':').map(Number);
  let mins = (ah * 60 + am) - (dh * 60 + dm);
  if (mins < 0) mins += 1440;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Parse a time value from Amtrak API responses into HH:MM
function parseApiTime(raw) {
  if (!raw) return null;
  const s = String(raw);
  const iso = s.match(/T(\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}:${iso[2]}`;
  const hm = s.match(/^(\d{1,2}):(\d{2})/);
  if (hm) return `${String(hm[1]).padStart(2, '0')}:${hm[2]}`;
  return null;
}

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

async function searchAmtrakLive(origin, destination, dateStr) {
  const [year, month, day] = dateStr.split('-');
  const { data } = await axios.get(
    'https://www.amtrak.com/services/journeys/findTrains.json',
    {
      params: {
        fromStation: origin,
        toStation: destination,
        departDate: `${month}/${day}/${year}`,
        numberOfAdults: '1',
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.amtrak.com/buy/departure.html',
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 8000,
    }
  );

  const list = data?.trains || data?.departures || (Array.isArray(data) ? data : null);
  if (!list || !Array.isArray(list) || list.length === 0) return null;

  const results = list.map(t => {
    const num = String(t.trainNumber || t.number || '').trim();
    if (!num) return null;
    const depTime = parseApiTime(t.departureTime || t.depTime);
    const arrTime = parseApiTime(t.arrivalTime || t.arrTime);
    if (!depTime) return null;

    let price = null;
    const fareList = t.fares || t.prices || [];
    if (Array.isArray(fareList) && fareList.length > 0) {
      const avail = fareList.filter(f => {
        const p = parseFloat(f.price || f.amount || 0);
        return p > 0 && !(f.soldOut || f.isSoldOut);
      });
      if (avail.length > 0) {
        avail.sort((a, b) => parseFloat(a.price || a.amount) - parseFloat(b.price || b.amount));
        price = parseFloat(avail[0].price || avail[0].amount);
      }
    } else if (t.lowestFare || t.fare) {
      price = parseFloat(t.lowestFare || t.fare);
    }

    const isAcela = parseInt(num) >= 2100;
    return {
      train: num,
      trainType: isAcela ? 'acela' : 'regional',
      trainName: isAcela ? 'Acela' : 'NEC Regional',
      time: depTime,
      arriveTime: arrTime,
      duration: computeDuration(depTime, arrTime),
      price,
      fareSource: price ? 'live' : null,
      trend: null,
      delay: 0,
    };
  }).filter(Boolean);

  return results.length > 0 ? results : null;
}

// GET /api/search
router.get('/', async (req, res) => {
  try {
    const { origin, destination, date } = req.query;
    if (!origin || !destination || !date) {
      return res.status(400).json({ error: 'Missing required query parameters: origin, destination, date' });
    }

    // Try live Amtrak data first — accurate real schedule
    let trains = null;
    try {
      trains = await searchAmtrakLive(origin, destination, date);
      if (trains) console.log(`[SEARCH] Live Amtrak: ${trains.length} trains for ${origin}→${destination} ${date}`);
    } catch (err) {
      console.log(`[SEARCH] Live Amtrak failed (${err.message}), using static schedules`);
    }

    // Fall back to static schedules
    if (!trains) {
      const routeKeys = getApplicableRouteKeys(origin, destination);
      if (routeKeys.length === 0) return res.json([]);

      const dow = new Date(date + 'T00:00:00').getDay();
      const placeholders = routeKeys.map((_, i) => `$${i + 1}`).join(', ');
      const schedResult = await pool.query(
        `SELECT * FROM schedules WHERE route_key IN (${placeholders})`,
        routeKeys
      ).catch(() => ({ rows: [] }));

      const daySchedules = schedResult.rows.filter(s => {
        const days = s.days_of_week.split(',').map(d => parseInt(d.trim()));
        return days.includes(dow);
      });

      trains = daySchedules.map(sched => {
        const trainType = sched.train_type;
        const routeKey  = sched.route_key;
        const oOffset   = getOffset(routeKey, trainType, origin);
        const dOffset   = getOffset(routeKey, trainType, destination);
        if (oOffset === null || dOffset === null) return null;
        const terminalDep = sched.departure_time.substring(0, 5);
        const boardTime   = addMins(terminalDep, oOffset);
        const alightTime  = addMins(terminalDep, dOffset);
        const isAcela     = trainType === 'acela';
        return {
          train: sched.train_number,
          trainType,
          trainName: isAcela ? 'Acela' : 'NEC Regional',
          time: boardTime,
          arriveTime: alightTime,
          duration: computeDuration(boardTime, alightTime),
          price: null,
          fareSource: null,
          trend: null,
          delay: 0,
        };
      }).filter(Boolean);
    }

    if (!trains || trains.length === 0) return res.json([]);

    // Enrich each train with fare and delay data
    const enriched = await Promise.all(
      trains.map(async (t) => {
        // Fare: check fare_observations first, then prices table, then estimate
        let price = t.price;
        let fareSource = t.fareSource;

        if (!price) {
          try {
            const obsRow = await pool.query(
              `SELECT lowest_fare FROM fare_observations
               WHERE origin=$1 AND destination=$2 AND departure_date=$3 AND train_number=$4
                 AND scrape_success=true AND lowest_fare IS NOT NULL
               ORDER BY observed_at DESC LIMIT 1`,
              [origin, destination, date, t.train]
            );
            if (obsRow.rows.length > 0) {
              price     = parseFloat(obsRow.rows[0].lowest_fare);
              fareSource = 'live';
            }
          } catch {}
        }

        if (!price) {
          try {
            const prRow = await pool.query(
              `SELECT current_price, trend FROM prices
               WHERE origin=$1 AND destination=$2 AND train_number=$3 AND departure_date=$4
               ORDER BY scraped_at DESC LIMIT 1`,
              [origin, destination, t.train, date]
            );
            if (prRow.rows.length > 0) {
              price     = parseFloat(prRow.rows[0].current_price);
              fareSource = 'scraped';
              t.trend   = prRow.rows[0].trend || null;
            }
          } catch {}
        }

        if (!price) {
          const routeKey = getApplicableRouteKeys(origin, destination)[0] || `${origin}-${destination}`;
          price     = estimatePrice(routeKey, t.trainType, t.time, date);
          fareSource = 'estimate';
        }

        // Delay prediction
        let aiDelay = 0;
        try {
          const pred = await predictDelay({
            origin, destination,
            train_number: t.train,
            departure_date: date,
            departure_time: t.time,
          });
          aiDelay = pred.predictedDelay || 0;
        } catch {}

        return {
          train:     t.train,
          trainName: t.trainName,
          trainType: t.trainType,
          time:      t.time,
          arriveTime: t.arriveTime,
          duration:  t.duration,
          price,
          fareSource,
          trend:     t.trend || null,
          delay:     aiDelay,
        };
      })
    );

    const sorted = enriched
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
