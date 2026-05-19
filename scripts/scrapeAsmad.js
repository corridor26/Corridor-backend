// scripts/scrapeAsmad.js
// Scrapes juckins.net ASMAD for per-train historical departure delay data
// and stores raw observations in asmad_observations, then rebuilds historical_delays.
//
// Usage:  node scripts/scrapeAsmad.js
// Time:   ~15–30 min for 2 years of data across all NEC stations

import pool from '../config/database.js';

// NEC stations to collect delay observations at.
// We capture departure delay at each station the train passes through.
const STATIONS = ['NYP', 'PHL', 'WAS', 'BOS', 'NWK', 'TRE', 'WIL', 'BAL', 'PVD', 'STM', 'NHV'];

// ASMAD train range specs (supports "a-b" syntax)
const TRAIN_RANGES = [
  { id: 'regional', spec: '65-200'    },
  { id: 'acela',    spec: '2100-2300' },
];

// 2 years of history in 180-day chunks to keep page sizes manageable
const CHUNK_DAYS   = 180;
const LOOKBACK_DAYS = 730;

// Polite delay between requests (ms)
const REQUEST_DELAY = 1500;

// ─── Date helpers ─────────────────────────────────────────────────

function fmtMDY(d) {
  return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
}

function buildChunks() {
  const end   = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - LOOKBACK_DAYS);

  const chunks = [];
  let chunkEnd = new Date(end);

  while (chunkEnd > start) {
    const chunkStart = new Date(chunkEnd);
    chunkStart.setDate(chunkStart.getDate() - CHUNK_DAYS + 1);
    if (chunkStart < start) chunkStart.setTime(start.getTime());
    chunks.unshift({ start: new Date(chunkStart), end: new Date(chunkEnd) });
    chunkEnd = new Date(chunkStart);
    chunkEnd.setDate(chunkEnd.getDate() - 1);
  }
  return chunks;
}

// ─── DB setup ─────────────────────────────────────────────────────

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS asmad_observations (
      id BIGSERIAL PRIMARY KEY,
      train_number VARCHAR(10) NOT NULL,
      station      VARCHAR(10) NOT NULL,
      departure_date DATE NOT NULL,
      day_of_week  SMALLINT,
      scheduled_departure TIME,
      actual_departure    TIME,
      delay_minutes INTEGER,
      scraped_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(train_number, station, departure_date)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_asmad_train_station
      ON asmad_observations(train_number, station, day_of_week)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_asmad_station_dow
      ON asmad_observations(station, day_of_week, scheduled_departure)
  `);
  console.log('[ASMAD] ✓ asmad_observations table ready');
}

// ─── Value parsers ────────────────────────────────────────────────

function parseTime(raw) {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || /^[-—nN]/.test(s)) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${String(parseInt(m[1])).padStart(2,'0')}:${m[2]}:00`;
  return null;
}

function parseDelay(raw) {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === 'on time' || s === '0') return 0;
  if (/^[-—nNcC]/.test(s) || s.startsWith('n/')) return null;
  const m = s.match(/([+-]?\d+)/);
  return m ? parseInt(m[1]) : null;
}

function parseDate(raw) {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (!m) return null;
  const mo = String(m[1]).padStart(2,'0');
  const dy = String(m[2]).padStart(2,'0');
  const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${yr}-${mo}-${dy}`;
}

// ─── Page scraping ────────────────────────────────────────────────

async function scrapePage(browser, url, station) {
  const page = await browser.newPage();
  try {
    await page.setDefaultNavigationTimeout(35000);

    // Block heavy resources for speed
    await page.setRequestInterception(true);
    page.on('request', req => {
      ['image','font','media','stylesheet'].includes(req.resourceType())
        ? req.abort() : req.continue();
    });

    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Parse entirely inside the browser's DOM — most reliable
    return await page.evaluate((stationCode) => {
      const out = [];
      for (const table of document.querySelectorAll('table')) {
        const rows = Array.from(table.querySelectorAll('tr'));
        if (rows.length < 2) continue;

        // Build header map
        const hdrs = Array.from(rows[0].querySelectorAll('th,td'))
          .map(c => c.textContent.trim().toLowerCase());

        // Need at least a date column and a train column
        if (!hdrs.some(h => /date/i.test(h))) continue;
        if (!hdrs.some(h => /train|no\.|num|#/i.test(h))) continue;

        const ci = {};
        hdrs.forEach((h, i) => {
          if (/^date/i.test(h)                          && ci.date  === undefined) ci.date  = i;
          if (/train|no\.|num|^#/i.test(h)              && ci.train === undefined) ci.train = i;
          // Scheduled departure: look for "sch" + ("dp"|"dep"|"d") columns
          if (/sch.*d[pe]/i.test(h)                     && ci.schDp === undefined) ci.schDp = i;
          // Actual departure
          if (/(act|actual).*d[pe]/i.test(h)            && ci.actDp === undefined) ci.actDp = i;
          // Delay column
          if (/delay|late|diff|^min/i.test(h)           && ci.delay === undefined) ci.delay = i;
        });

        if (ci.date === undefined || ci.train === undefined) continue;

        for (let i = 1; i < rows.length; i++) {
          const cells = Array.from(rows[i].querySelectorAll('td'))
            .map(c => c.textContent.trim());
          if (cells.length < 3) continue;

          out.push({
            station:  stationCode,
            dateRaw:  cells[ci.date]  ?? '',
            trainRaw: cells[ci.train] ?? '',
            schDpRaw: ci.schDp !== undefined ? (cells[ci.schDp] ?? '') : '',
            actDpRaw: ci.actDp !== undefined ? (cells[ci.actDp] ?? '') : '',
            delayRaw: ci.delay !== undefined ? (cells[ci.delay] ?? '') : '',
          });
        }
      }
      return out;
    }, station);
  } finally {
    await page.close();
  }
}

// ─── Store a batch of parsed rows ─────────────────────────────────

async function storeBatch(rows) {
  let count = 0;
  for (const r of rows) {
    const date   = parseDate(r.dateRaw);
    const train  = r.trainRaw.replace(/\D/g, '');
    if (!date || !train) continue;

    const schDp = parseTime(r.schDpRaw);
    const actDp = parseTime(r.actDpRaw);
    let   delay = parseDelay(r.delayRaw);

    // Derive delay from times when not explicit
    if (delay === null && schDp && actDp) {
      const [sh, sm] = schDp.split(':').map(Number);
      const [ah, am] = actDp.split(':').map(Number);
      let diff = (ah * 60 + am) - (sh * 60 + sm);
      if (diff < -180) diff += 1440; // overnight rollover
      if (Math.abs(diff) < 600) delay = diff;
    }

    const dow = new Date(`${date}T12:00:00`).getDay();

    try {
      await pool.query(
        `INSERT INTO asmad_observations
           (train_number, station, departure_date, day_of_week,
            scheduled_departure, actual_departure, delay_minutes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (train_number, station, departure_date) DO UPDATE SET
           scheduled_departure = EXCLUDED.scheduled_departure,
           actual_departure    = EXCLUDED.actual_departure,
           delay_minutes       = EXCLUDED.delay_minutes,
           scraped_at          = NOW()`,
        [train, r.station, date, dow, schDp || null, actDp || null, delay]
      );
      count++;
    } catch { /* duplicate or invalid — skip */ }
  }
  return count;
}

// ─── Rebuild historical_delays from ASMAD data ────────────────────

async function rebuildHistoricalDelays() {
  console.log('[ASMAD] Rebuilding historical_delays from asmad_observations…');

  // Use departure delay at the origin station as the O/D delay predictor.
  // Join with schedules to map train_number → origin/destination.
  const result = await pool.query(`
    INSERT INTO historical_delays
      (origin, destination, day_of_week, time_of_day,
       avg_delay_minutes, sample_size,
       delay_under10min_percent, delay_10_30min_percent, delay_30plus_percent,
       last_updated)
    SELECT
      s.origin,
      s.destination,
      o.day_of_week,
      CASE
        WHEN EXTRACT(HOUR FROM o.scheduled_departure) BETWEEN 6  AND 11 THEN 'morning'
        WHEN EXTRACT(HOUR FROM o.scheduled_departure) BETWEEN 12 AND 16 THEN 'afternoon'
        ELSE 'evening'
      END                                                        AS time_of_day,
      ROUND(AVG(o.delay_minutes))                                AS avg_delay_minutes,
      COUNT(*)                                                   AS sample_size,
      ROUND(100.0 * COUNT(*) FILTER (WHERE o.delay_minutes < 10)         / NULLIF(COUNT(*),0)) AS under10,
      ROUND(100.0 * COUNT(*) FILTER (WHERE o.delay_minutes BETWEEN 10 AND 29) / NULLIF(COUNT(*),0)) AS b10_30,
      ROUND(100.0 * COUNT(*) FILTER (WHERE o.delay_minutes >= 30)        / NULLIF(COUNT(*),0)) AS over30,
      NOW()
    FROM asmad_observations o
    JOIN schedules s ON s.train_number = o.train_number
    WHERE o.delay_minutes IS NOT NULL
      AND o.station = s.origin
    GROUP BY s.origin, s.destination, o.day_of_week, time_of_day
    ON CONFLICT (origin, destination, day_of_week, time_of_day) DO UPDATE SET
      avg_delay_minutes        = EXCLUDED.avg_delay_minutes,
      sample_size              = EXCLUDED.sample_size,
      delay_under10min_percent = EXCLUDED.delay_under10min_percent,
      delay_10_30min_percent   = EXCLUDED.delay_10_30min_percent,
      delay_30plus_percent     = EXCLUDED.delay_30plus_percent,
      last_updated             = NOW()
    RETURNING 1
  `);

  console.log(`[ASMAD] ✓ historical_delays rebuilt — ${result.rowCount} route/day/time combinations updated`);
}

// ─── Main entry ───────────────────────────────────────────────────

export async function scrapeAsmad() {
  await ensureTable();

  const pup = await import('puppeteer').then(m => m.default).catch(() => null);
  if (!pup) throw new Error('puppeteer not installed — run: npm install puppeteer');

  const browser = await pup.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote'],
  });

  const chunks = buildChunks();
  const total  = STATIONS.length * TRAIN_RANGES.length * chunks.length;
  let done = 0, totalRows = 0, errors = 0;
  const t0 = Date.now();

  console.log(`[ASMAD] ${STATIONS.length} stations × ${TRAIN_RANGES.length} ranges × ${chunks.length} chunks = ${total} requests`);
  console.log(`[ASMAD] Date range: ${fmtMDY(chunks[0].start)} → ${fmtMDY(chunks[chunks.length-1].end)}`);

  try {
    for (const station of STATIONS) {
      for (const range of TRAIN_RANGES) {
        for (const chunk of chunks) {
          const url =
            `https://juckins.net/amtrak_status/archive/html/history.php` +
            `?train_num=${encodeURIComponent(range.spec)}` +
            `&station=${encodeURIComponent(station)}` +
            `&date_start=${encodeURIComponent(fmtMDY(chunk.start))}` +
            `&date_end=${encodeURIComponent(fmtMDY(chunk.end))}` +
            `&df=1&sort=schDp&dir=ASC`;

          done++;
          try {
            const rows  = await scrapePage(browser, url, station);
            const count = await storeBatch(rows);
            totalRows  += count;
            console.log(`[ASMAD] [${done}/${total}] ${station} ${range.id} ${fmtMDY(chunk.start)}–${fmtMDY(chunk.end)}: ${rows.length} raw → ${count} stored`);
          } catch (err) {
            errors++;
            console.error(`[ASMAD] [${done}/${total}] ✗ ${station} ${range.id}: ${err.message}`);
          }

          await new Promise(r => setTimeout(r, REQUEST_DELAY));
        }
      }
    }
  } finally {
    await browser.close();
  }

  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.log(`[ASMAD] Scrape complete: ${totalRows} observations stored, ${errors} errors, ${elapsed}s`);

  await rebuildHistoricalDelays();

  await pool.query(
    `INSERT INTO scraper_logs (scraper_name, status, message, rows_affected, execution_time_ms)
     VALUES ($1,$2,$3,$4,$5)`,
    ['asmad', errors === 0 ? 'success' : 'partial',
     `${totalRows} observations from ASMAD`, totalRows, (Date.now() - t0)]
  ).catch(() => {});

  return { totalRows, requests: done, errors };
}

// CLI
const isMain = process.argv[1]?.endsWith('scrapeAsmad.js');
if (isMain) {
  scrapeAsmad()
    .then(r => { console.log('[ASMAD] Done:', r); process.exit(0); })
    .catch(e => { console.error('[ASMAD] Failed:', e.message); process.exit(1); });
}
