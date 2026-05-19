import axios from 'axios';
import pool from '../config/database.js';

// Directional O/D pairs to track
const ROUTE_PAIRS = [
  { origin: 'NYP', destination: 'WAS' }, { origin: 'WAS', destination: 'NYP' },
  { origin: 'NYP', destination: 'BOS' }, { origin: 'BOS', destination: 'NYP' },
  { origin: 'NYP', destination: 'PHL' }, { origin: 'PHL', destination: 'NYP' },
  { origin: 'WAS', destination: 'BOS' }, { origin: 'BOS', destination: 'WAS' },
  { origin: 'WAS', destination: 'PHL' }, { origin: 'PHL', destination: 'WAS' },
];

// Hours between observations based on days until departure
function requiredIntervalHours(daysOut) {
  if (daysOut <= 0) return 1;
  if (daysOut <= 7) return 3;
  if (daysOut <= 14) return 6;
  return 12;
}

// Rolling 30-day date list starting today
function buildDateList() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d.toISOString().split('T')[0];
  });
}

// Flexible Amtrak API response parser — handles multiple known response shapes
function parseAmtrakTrains(data) {
  const list =
    data?.trains ||
    data?.departures ||
    data?.results ||
    (Array.isArray(data) ? data : null);
  if (!list || !Array.isArray(list)) return [];

  const parseTime = (raw) => {
    if (!raw) return null;
    const s = String(raw);
    const iso = s.match(/T(\d{2}):(\d{2})/);
    if (iso) return `${iso[1]}:${iso[2]}`;
    const hm = s.match(/^(\d{1,2}):(\d{2})/);
    if (hm) return `${String(hm[1]).padStart(2, '0')}:${hm[2]}`;
    return null;
  };

  return list.map(t => {
    const trainNumber = String(t.trainNumber || t.trainNum || t.number || t.train_number || '').trim();
    if (!trainNumber) return null;

    let lowestFare = null;
    let fareClass = null;
    let soldOut = !!(t.soldOut || t.isSoldOut);

    const fareList = t.fares || t.prices || t.fareOptions || [];
    if (Array.isArray(fareList) && fareList.length > 0) {
      const available = fareList.filter(f => {
        const p = parseFloat(f.price || f.amount || f.lowestFare || 0);
        return p > 0 && !(f.soldOut || f.isSoldOut);
      });
      if (available.length > 0) {
        available.sort((a, b) =>
          parseFloat(a.price || a.amount || a.lowestFare) -
          parseFloat(b.price || b.amount || b.lowestFare)
        );
        lowestFare = parseFloat(available[0].price || available[0].amount || available[0].lowestFare);
        fareClass = available[0].class || available[0].type || available[0].fareName || 'Coach';
      } else {
        soldOut = true;
      }
    } else if (t.lowestFare || t.fare || t.price || t.minFare) {
      lowestFare = parseFloat(t.lowestFare || t.fare || t.price || t.minFare);
      fareClass = (t.trainType || '').toUpperCase().includes('ACELA') ? 'Business' : 'Coach';
    }

    return {
      trainNumber,
      departureTime: parseTime(t.departureTime || t.depTime || t.departure),
      arrivalTime: parseTime(t.arrivalTime || t.arrTime || t.arrival),
      lowestFare,
      fareClass,
      soldOut,
    };
  }).filter(Boolean);
}

// Attempt 1: plain HTTP to Amtrak's findTrains endpoint
async function fetchFaresHttp(origin, destination, dateStr) {
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
      timeout: 12000,
    }
  );
  return parseAmtrakTrains(data);
}

// Attempt 2: Puppeteer — real browser intercepts the same API call
async function fetchFaresPuppeteer(browser, origin, destination, dateStr) {
  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(40000);

  // Block heavy resources to speed up page load
  await page.setRequestInterception(true);
  page.on('request', req => {
    const t = req.resourceType();
    if (['image', 'font', 'media'].includes(t)) req.abort();
    else req.continue();
  });

  let intercepted = null;
  page.on('response', async resp => {
    if (intercepted) return;
    const url = resp.url();
    const ct = resp.headers()['content-type'] || '';
    if (!url.includes('amtrak.com') || !ct.includes('json')) return;
    try {
      const text = await resp.text();
      if (!text || text.length < 100) return;
      const json = JSON.parse(text);
      const parsed = parseAmtrakTrains(json);
      if (parsed.length > 0) intercepted = parsed;
    } catch {}
  });

  try {
    const [year, month, day] = dateStr.split('-');
    await page.goto(
      `https://www.amtrak.com/buy/departure.html#fromStation=${origin}&toStation=${destination}&departDate=${month}%2F${day}%2F${year}&numberOfAdults=1`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    // Wait up to 12s for intercepted fare data
    const deadline = Date.now() + 12000;
    while (!intercepted && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 400));
    }
    return intercepted;
  } finally {
    await page.close();
  }
}

// Lazy-load puppeteer so the server doesn't crash if it's not installed
async function loadPuppeteer() {
  try {
    const mod = await import('puppeteer');
    return mod.default;
  } catch {
    return null;
  }
}

// Fetch fares: HTTP first, Puppeteer fallback
async function fetchFares(browser, origin, destination, dateStr) {
  try {
    const fares = await fetchFaresHttp(origin, destination, dateStr);
    if (fares && fares.length > 0) return { fares, method: 'http' };
  } catch (err) {
    console.log(`[FARE] HTTP ${origin}→${destination} ${dateStr}: ${err.message}`);
  }

  if (browser) {
    try {
      const fares = await fetchFaresPuppeteer(browser, origin, destination, dateStr);
      if (fares && fares.length > 0) return { fares, method: 'puppeteer' };
    } catch (err) {
      console.log(`[FARE] Puppeteer ${origin}→${destination} ${dateStr}: ${err.message}`);
    }
  }

  return { fares: null, method: 'failed' };
}

// Write observations to DB
async function storeObservations(origin, destination, departureDate, fares, success, errorMsg) {
  const observedAt = new Date();

  if (!success || !fares || fares.length === 0) {
    await pool.query(
      `INSERT INTO fare_observations
         (origin, destination, departure_date, train_number, observed_at, scrape_success, scrape_error)
       VALUES ($1, $2, $3, 'NONE', $4, false, $5)`,
      [origin, destination, departureDate, observedAt, errorMsg || 'No fares returned']
    );
    return 0;
  }

  let count = 0;
  for (const fare of fares) {
    if (!fare.trainNumber) continue;
    await pool.query(
      `INSERT INTO fare_observations
         (origin, destination, departure_date, train_number, departure_time, arrival_time,
          lowest_fare, fare_class, sold_out, observed_at, scrape_success)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)`,
      [
        origin, destination, departureDate,
        fare.trainNumber, fare.departureTime, fare.arrivalTime,
        fare.lowestFare, fare.fareClass, fare.soldOut,
        observedAt,
      ]
    );
    count++;
  }
  return count;
}

// Single optimised query: which (O/D, date) pairs need scraping?
async function getWorkItems() {
  const dates = buildDateList();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Batch-query latest successful observation per (O/D, date)
  const { rows } = await pool.query(
    `SELECT origin, destination, departure_date::text AS dep_date, MAX(observed_at) AS last_obs
     FROM fare_observations
     WHERE scrape_success = true AND departure_date = ANY($1::date[])
     GROUP BY origin, destination, departure_date`,
    [dates]
  ).catch(() => ({ rows: [] }));

  const lastObsMap = new Map(
    rows.map(r => [`${r.origin}|${r.destination}|${r.dep_date}`, r.last_obs])
  );

  const work = [];
  for (const pair of ROUTE_PAIRS) {
    for (const dateStr of dates) {
      const daysOut = Math.floor((new Date(dateStr) - today) / 86400000);
      const needed = requiredIntervalHours(daysOut);
      const lastObs = lastObsMap.get(`${pair.origin}|${pair.destination}|${dateStr}`);
      const hoursSince = lastObs ? (Date.now() - new Date(lastObs).getTime()) / 3600000 : Infinity;
      if (hoursSince >= needed) work.push({ ...pair, dateStr, daysOut });
    }
  }
  return work;
}

export async function scrapeFares() {
  const t0 = Date.now();
  console.log('[FARE SCRAPER] Starting fare collection run...');

  const work = await getWorkItems();
  if (work.length === 0) {
    console.log('[FARE SCRAPER] All observations current — nothing to scrape');
    return { success: true, observations: 0, attempts: 0 };
  }
  console.log(`[FARE SCRAPER] ${work.length} (O/D, date) pairs due for observation`);

  let browser = null;
  let totalObs = 0, success = 0;

  try {
    const pup = await loadPuppeteer();
    if (pup) {
      try {
        browser = await pup.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote'],
        });
        console.log('[FARE SCRAPER] Puppeteer browser ready (HTTP-first, browser fallback)');
      } catch (err) {
        console.warn('[FARE SCRAPER] Browser launch failed, HTTP-only:', err.message);
      }
    } else {
      console.warn('[FARE SCRAPER] puppeteer not installed, HTTP-only');
    }

    for (const item of work) {
      const { origin, destination, dateStr } = item;
      try {
        const { fares, method } = await fetchFares(browser, origin, destination, dateStr);
        if (fares && fares.length > 0) {
          const n = await storeObservations(origin, destination, dateStr, fares, true);
          totalObs += n;
          success++;
          console.log(`[FARE SCRAPER] ✓ ${origin}→${destination} ${dateStr}: ${n} trains (${method})`);
        } else {
          await storeObservations(origin, destination, dateStr, null, false, 'No fares returned');
        }
      } catch (err) {
        await storeObservations(origin, destination, dateStr, null, false, err.message);
        console.error(`[FARE SCRAPER] ✗ ${origin}→${destination} ${dateStr}: ${err.message}`);
      }
      await new Promise(r => setTimeout(r, 600));
    }
  } finally {
    if (browser) await browser.close();
  }

  const ms = Date.now() - t0;
  await pool.query(
    `INSERT INTO scraper_logs (scraper_name, status, message, rows_affected, execution_time_ms)
     VALUES ($1,$2,$3,$4,$5)`,
    ['fare_observations', success > 0 ? 'success' : 'failed',
     `${success}/${work.length} routes, ${totalObs} observations`, totalObs, ms]
  ).catch(() => {});

  console.log(`[FARE SCRAPER] Done: ${totalObs} observations in ${ms}ms`);
  return { success: true, observations: totalObs, attempts: work.length, successCount: success };
}
