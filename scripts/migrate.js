// scripts/migrate.js
import pool from '../config/database.js';

const migrations = `
CREATE TABLE IF NOT EXISTS routes (
  id SERIAL PRIMARY KEY,
  origin VARCHAR(10), origin_name VARCHAR(100),
  destination VARCHAR(10), destination_name VARCHAR(100),
  train_type VARCHAR(100), typical_duration_minutes INT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trips (
  id SERIAL PRIMARY KEY,
  train_number VARCHAR(20), origin VARCHAR(10), destination VARCHAR(10),
  departure_date DATE, departure_time TIME, arrival_time TIME,
  created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delays (
  id SERIAL PRIMARY KEY,
  train_number VARCHAR(20), origin VARCHAR(10), destination VARCHAR(10),
  departure_date DATE, current_delay_minutes INT,
  current_location VARCHAR(200), status VARCHAR(50),
  last_updated TIMESTAMP DEFAULT NOW(),
  UNIQUE(train_number, departure_date)
);

CREATE TABLE IF NOT EXISTS historical_delays (
  id SERIAL PRIMARY KEY,
  origin VARCHAR(10), destination VARCHAR(10),
  day_of_week INT, time_of_day VARCHAR(20),
  delay_under10min_percent INT, delay_10_30min_percent INT, delay_30plus_percent INT,
  avg_delay_minutes INT, sample_size INT,
  last_updated TIMESTAMP DEFAULT NOW(),
  UNIQUE(origin, destination, day_of_week, time_of_day)
);

CREATE TABLE IF NOT EXISTS prices (
  id SERIAL PRIMARY KEY,
  origin VARCHAR(10), destination VARCHAR(10), train_number VARCHAR(20),
  departure_date DATE, current_price DECIMAL(10,2),
  high_24h DECIMAL(10,2), low_24h DECIMAL(10,2), trend VARCHAR(20),
  scraped_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(origin, destination, train_number, departure_date)
);

CREATE TABLE IF NOT EXISTS fare_observations (
  id BIGSERIAL PRIMARY KEY,
  origin VARCHAR(10) NOT NULL,
  destination VARCHAR(10) NOT NULL,
  departure_date DATE NOT NULL,
  train_number VARCHAR(20) NOT NULL,
  departure_time TIME,
  arrival_time TIME,
  lowest_fare DECIMAL(10,2),
  fare_class VARCHAR(50),
  sold_out BOOLEAN DEFAULT FALSE,
  observed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  scrape_success BOOLEAN DEFAULT TRUE,
  scrape_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_fare_obs_chart ON fare_observations(origin, destination, departure_date, train_number, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_fare_obs_latest ON fare_observations(origin, destination, departure_date, observed_at DESC);

CREATE TABLE IF NOT EXISTS schedules (
  train_number VARCHAR(10) PRIMARY KEY,
  route_key VARCHAR(20) NOT NULL,
  origin VARCHAR(10) NOT NULL,
  destination VARCHAR(10) NOT NULL,
  departure_time TIME NOT NULL,
  arrival_time TIME NOT NULL,
  train_type VARCHAR(20) NOT NULL DEFAULT 'regional',
  days_of_week TEXT NOT NULL DEFAULT '1,2,3,4,5'
);

CREATE TABLE IF NOT EXISTS weather (
  id SERIAL PRIMARY KEY,
  station_code VARCHAR(10), station_name VARCHAR(100),
  temp_f INT, condition VARCHAR(100), forecast_date DATE,
  last_updated TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scraper_logs (
  id SERIAL PRIMARY KEY,
  scraper_name VARCHAR(100), status VARCHAR(50), message TEXT,
  rows_affected INT, execution_time_ms INT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trips_departure_date ON trips(departure_date);
CREATE INDEX IF NOT EXISTS idx_delays_train_number ON delays(train_number);
CREATE INDEX IF NOT EXISTS idx_prices_origin_dest ON prices(origin, destination, departure_date);
CREATE INDEX IF NOT EXISTS idx_historical_delays_origin_dest ON historical_delays(origin, destination);
CREATE INDEX IF NOT EXISTS idx_schedules_route ON schedules(route_key)
`;

export async function runMigrations() {
  const statements = migrations.split(';').filter(s => s.trim());
  for (const s of statements) {
    if (s.trim()) await pool.query(s);
  }
  await insertSampleRoutes();
  await seedSchedules();
  await seedHistoricalDelays();
  console.log('[MIGRATE] ✓ All tables and seeds up to date');
}

async function runMigrationsCLI() {
  try {
    console.log('Starting database migrations...');
    await runMigrations();
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

async function insertSampleRoutes() {
  const routes = [
    { origin: 'NYP', origin_name: 'New York Penn Station',    destination: 'WAS', destination_name: 'Washington Union Station', train_type: 'Acela',            duration: 155 },
    { origin: 'NYP', origin_name: 'New York Penn Station',    destination: 'WAS', destination_name: 'Washington Union Station', train_type: 'NEC Regional',     duration: 205 },
    { origin: 'WAS', origin_name: 'Washington Union Station', destination: 'NYP', destination_name: 'New York Penn Station',    train_type: 'Acela',            duration: 155 },
    { origin: 'WAS', origin_name: 'Washington Union Station', destination: 'NYP', destination_name: 'New York Penn Station',    train_type: 'NEC Regional',     duration: 205 },
    { origin: 'NYP', origin_name: 'New York Penn Station',    destination: 'BOS', destination_name: 'Boston South Station',     train_type: 'Acela',            duration: 185 },
    { origin: 'NYP', origin_name: 'New York Penn Station',    destination: 'BOS', destination_name: 'Boston South Station',     train_type: 'NEC Regional',     duration: 247 },
    { origin: 'BOS', origin_name: 'Boston South Station',     destination: 'NYP', destination_name: 'New York Penn Station',    train_type: 'NEC Regional',     duration: 247 },
    { origin: 'BOS', origin_name: 'Boston South Station',     destination: 'WAS', destination_name: 'Washington Union Station', train_type: 'NEC Regional',     duration: 452 },
    { origin: 'WAS', origin_name: 'Washington Union Station', destination: 'BOS', destination_name: 'Boston South Station',     train_type: 'NEC Regional',     duration: 452 },
  ];
  for (const r of routes) {
    await pool.query(
      `INSERT INTO routes (origin, origin_name, destination, destination_name, train_type, typical_duration_minutes)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [r.origin, r.origin_name, r.destination, r.destination_name, r.train_type, r.duration]
    );
  }
}

// NEC + Acela schedules — departure/arrival times are from the train's terminal origin/destination.
// route_key tells the search route which stop-offset table to use.
// days_of_week: 0=Sun,1=Mon,...,6=Sat
async function seedSchedules() {
  const schedules = [
    // ── Acela NYP → WAS ──────────────────────────────────────
    { train: '2151', rk: 'NYP-WAS', o: 'NYP', d: 'WAS', dep: '07:00', arr: '09:35', type: 'acela',    days: '1,2,3,4,5'   },
    { train: '2153', rk: 'NYP-WAS', o: 'NYP', d: 'WAS', dep: '09:00', arr: '11:35', type: 'acela',    days: '1,2,3,4,5'   },
    { train: '2155', rk: 'NYP-WAS', o: 'NYP', d: 'WAS', dep: '12:00', arr: '14:35', type: 'acela',    days: '1,2,3,4,5'   },
    { train: '2157', rk: 'NYP-WAS', o: 'NYP', d: 'WAS', dep: '15:00', arr: '17:35', type: 'acela',    days: '1,2,3,4,5'   },
    { train: '2159', rk: 'NYP-WAS', o: 'NYP', d: 'WAS', dep: '17:00', arr: '19:35', type: 'acela',    days: '1,2,3,4,5'   },
    { train: '2163', rk: 'NYP-WAS', o: 'NYP', d: 'WAS', dep: '18:30', arr: '21:05', type: 'acela',    days: '1,2,3,4,5'   },
    { train: '2165', rk: 'NYP-WAS', o: 'NYP', d: 'WAS', dep: '09:00', arr: '11:35', type: 'acela',    days: '0,6'         },
    { train: '2167', rk: 'NYP-WAS', o: 'NYP', d: 'WAS', dep: '14:00', arr: '16:35', type: 'acela',    days: '0,6'         },
    // ── Acela WAS → NYP ──────────────────────────────────────
    { train: '2150', rk: 'WAS-NYP', o: 'WAS', d: 'NYP', dep: '06:05', arr: '08:40', type: 'acela',    days: '1,2,3,4,5'   },
    { train: '2152', rk: 'WAS-NYP', o: 'WAS', d: 'NYP', dep: '10:00', arr: '12:35', type: 'acela',    days: '1,2,3,4,5'   },
    { train: '2154', rk: 'WAS-NYP', o: 'WAS', d: 'NYP', dep: '13:00', arr: '15:35', type: 'acela',    days: '1,2,3,4,5'   },
    { train: '2156', rk: 'WAS-NYP', o: 'WAS', d: 'NYP', dep: '15:00', arr: '17:35', type: 'acela',    days: '1,2,3,4,5'   },
    { train: '2158', rk: 'WAS-NYP', o: 'WAS', d: 'NYP', dep: '17:00', arr: '19:35', type: 'acela',    days: '1,2,3,4,5'   },
    { train: '2160', rk: 'WAS-NYP', o: 'WAS', d: 'NYP', dep: '19:00', arr: '21:35', type: 'acela',    days: '1,2,3,4,5'   },
    { train: '2164', rk: 'WAS-NYP', o: 'WAS', d: 'NYP', dep: '11:00', arr: '13:35', type: 'acela',    days: '0,6'         },
    { train: '2166', rk: 'WAS-NYP', o: 'WAS', d: 'NYP', dep: '16:00', arr: '18:35', type: 'acela',    days: '0,6'         },
    // ── Acela NYP → BOS ──────────────────────────────────────
    { train: '2171', rk: 'NYP-BOS', o: 'NYP', d: 'BOS', dep: '07:00', arr: '10:05', type: 'acela',    days: '1,2,3,4,5'   },
    { train: '2173', rk: 'NYP-BOS', o: 'NYP', d: 'BOS', dep: '11:00', arr: '14:05', type: 'acela',    days: '1,2,3,4,5'   },
    { train: '2175', rk: 'NYP-BOS', o: 'NYP', d: 'BOS', dep: '15:00', arr: '18:05', type: 'acela',    days: '1,2,3,4,5'   },
    { train: '2177', rk: 'NYP-BOS', o: 'NYP', d: 'BOS', dep: '19:00', arr: '22:05', type: 'acela',    days: '1,2,3,4,5'   },
    { train: '2179', rk: 'NYP-BOS', o: 'NYP', d: 'BOS', dep: '10:00', arr: '13:05', type: 'acela',    days: '0,6'         },
    // ── Acela BOS → NYP ──────────────────────────────────────
    { train: '2170', rk: 'BOS-NYP', o: 'BOS', d: 'NYP', dep: '06:00', arr: '09:05', type: 'acela',    days: '1,2,3,4,5'   },
    { train: '2172', rk: 'BOS-NYP', o: 'BOS', d: 'NYP', dep: '10:00', arr: '13:05', type: 'acela',    days: '1,2,3,4,5'   },
    { train: '2174', rk: 'BOS-NYP', o: 'BOS', d: 'NYP', dep: '14:00', arr: '17:05', type: 'acela',    days: '1,2,3,4,5'   },
    { train: '2176', rk: 'BOS-NYP', o: 'BOS', d: 'NYP', dep: '18:00', arr: '21:05', type: 'acela',    days: '1,2,3,4,5'   },
    { train: '2178', rk: 'BOS-NYP', o: 'BOS', d: 'NYP', dep: '13:00', arr: '16:05', type: 'acela',    days: '0,6'         },
    // ── NEC Regional NYP → WAS ───────────────────────────────
    { train: '95',   rk: 'NYP-WAS', o: 'NYP', d: 'WAS', dep: '06:05', arr: '09:40', type: 'regional', days: '1,2,3,4,5'   },
    { train: '97',   rk: 'NYP-WAS', o: 'NYP', d: 'WAS', dep: '07:10', arr: '10:51', type: 'regional', days: '1,2,3,4,5'   },
    { train: '83',   rk: 'NYP-WAS', o: 'NYP', d: 'WAS', dep: '08:10', arr: '11:51', type: 'regional', days: '1,2,3,4,5'   },
    { train: '85',   rk: 'NYP-WAS', o: 'NYP', d: 'WAS', dep: '09:10', arr: '12:51', type: 'regional', days: '1,2,3,4,5'   },
    { train: '87',   rk: 'NYP-WAS', o: 'NYP', d: 'WAS', dep: '10:10', arr: '13:51', type: 'regional', days: '1,2,3,4,5'   },
    { train: '89',   rk: 'NYP-WAS', o: 'NYP', d: 'WAS', dep: '11:15', arr: '14:57', type: 'regional', days: '1,2,3,4,5'   },
    { train: '125',  rk: 'NYP-WAS', o: 'NYP', d: 'WAS', dep: '12:05', arr: '15:46', type: 'regional', days: '1,2,3,4,5'   },
    { train: '127',  rk: 'NYP-WAS', o: 'NYP', d: 'WAS', dep: '14:05', arr: '17:46', type: 'regional', days: '1,2,3,4,5'   },
    { train: '129',  rk: 'NYP-WAS', o: 'NYP', d: 'WAS', dep: '15:05', arr: '18:46', type: 'regional', days: '1,2,3,4,5'   },
    { train: '131',  rk: 'NYP-WAS', o: 'NYP', d: 'WAS', dep: '16:05', arr: '19:46', type: 'regional', days: '1,2,3,4,5'   },
    { train: '133',  rk: 'NYP-WAS', o: 'NYP', d: 'WAS', dep: '17:05', arr: '20:46', type: 'regional', days: '1,2,3,4,5'   },
    { train: '135',  rk: 'NYP-WAS', o: 'NYP', d: 'WAS', dep: '18:05', arr: '21:46', type: 'regional', days: '1,2,3,4,5'   },
    { train: '65',   rk: 'NYP-WAS', o: 'NYP', d: 'WAS', dep: '09:05', arr: '12:46', type: 'regional', days: '0,6'         },
    { train: '67',   rk: 'NYP-WAS', o: 'NYP', d: 'WAS', dep: '13:05', arr: '16:46', type: 'regional', days: '0,6'         },
    { train: '69',   rk: 'NYP-WAS', o: 'NYP', d: 'WAS', dep: '17:05', arr: '20:46', type: 'regional', days: '0,6'         },
    // ── NEC Regional WAS → NYP ───────────────────────────────
    { train: '86',   rk: 'WAS-NYP', o: 'WAS', d: 'NYP', dep: '05:50', arr: '09:23', type: 'regional', days: '1,2,3,4,5'   },
    { train: '88',   rk: 'WAS-NYP', o: 'WAS', d: 'NYP', dep: '07:50', arr: '11:23', type: 'regional', days: '1,2,3,4,5'   },
    { train: '90',   rk: 'WAS-NYP', o: 'WAS', d: 'NYP', dep: '09:00', arr: '12:33', type: 'regional', days: '1,2,3,4,5'   },
    { train: '92',   rk: 'WAS-NYP', o: 'WAS', d: 'NYP', dep: '11:00', arr: '14:33', type: 'regional', days: '1,2,3,4,5'   },
    { train: '94',   rk: 'WAS-NYP', o: 'WAS', d: 'NYP', dep: '13:00', arr: '16:33', type: 'regional', days: '1,2,3,4,5'   },
    { train: '96',   rk: 'WAS-NYP', o: 'WAS', d: 'NYP', dep: '15:00', arr: '18:33', type: 'regional', days: '1,2,3,4,5'   },
    { train: '130',  rk: 'WAS-NYP', o: 'WAS', d: 'NYP', dep: '16:25', arr: '19:58', type: 'regional', days: '1,2,3,4,5'   },
    { train: '132',  rk: 'WAS-NYP', o: 'WAS', d: 'NYP', dep: '17:25', arr: '20:58', type: 'regional', days: '1,2,3,4,5'   },
    { train: '134',  rk: 'WAS-NYP', o: 'WAS', d: 'NYP', dep: '18:40', arr: '22:13', type: 'regional', days: '1,2,3,4,5'   },
    { train: '64',   rk: 'WAS-NYP', o: 'WAS', d: 'NYP', dep: '08:00', arr: '11:33', type: 'regional', days: '0,6'         },
    { train: '68',   rk: 'WAS-NYP', o: 'WAS', d: 'NYP', dep: '12:00', arr: '15:33', type: 'regional', days: '0,6'         },
    { train: '70',   rk: 'WAS-NYP', o: 'WAS', d: 'NYP', dep: '16:00', arr: '19:33', type: 'regional', days: '0,6'         },
    // ── NEC Regional NYP → BOS ───────────────────────────────
    { train: '171',  rk: 'NYP-BOS', o: 'NYP', d: 'BOS', dep: '05:53', arr: '10:00', type: 'regional', days: '1,2,3,4,5'   },
    { train: '173',  rk: 'NYP-BOS', o: 'NYP', d: 'BOS', dep: '07:55', arr: '12:02', type: 'regional', days: '1,2,3,4,5'   },
    { train: '175',  rk: 'NYP-BOS', o: 'NYP', d: 'BOS', dep: '11:00', arr: '15:07', type: 'regional', days: '1,2,3,4,5'   },
    { train: '177',  rk: 'NYP-BOS', o: 'NYP', d: 'BOS', dep: '14:00', arr: '18:07', type: 'regional', days: '1,2,3,4,5'   },
    { train: '179',  rk: 'NYP-BOS', o: 'NYP', d: 'BOS', dep: '18:00', arr: '22:07', type: 'regional', days: '1,2,3,4,5'   },
    { train: '181',  rk: 'NYP-BOS', o: 'NYP', d: 'BOS', dep: '10:00', arr: '14:07', type: 'regional', days: '0,6'         },
    // ── NEC Regional BOS → NYP ───────────────────────────────
    { train: '170',  rk: 'BOS-NYP', o: 'BOS', d: 'NYP', dep: '06:50', arr: '10:57', type: 'regional', days: '1,2,3,4,5'   },
    { train: '172',  rk: 'BOS-NYP', o: 'BOS', d: 'NYP', dep: '08:50', arr: '12:57', type: 'regional', days: '1,2,3,4,5'   },
    { train: '174',  rk: 'BOS-NYP', o: 'BOS', d: 'NYP', dep: '12:50', arr: '16:57', type: 'regional', days: '1,2,3,4,5'   },
    { train: '176',  rk: 'BOS-NYP', o: 'BOS', d: 'NYP', dep: '16:50', arr: '20:57', type: 'regional', days: '1,2,3,4,5'   },
    { train: '178',  rk: 'BOS-NYP', o: 'BOS', d: 'NYP', dep: '09:50', arr: '13:57', type: 'regional', days: '0,6'         },
    // ── NEC Regional BOS → WAS (through NYP) ─────────────────
    { train: '137',  rk: 'WAS-BOS', o: 'WAS', d: 'BOS', dep: '07:05', arr: '14:45', type: 'regional', days: '1,2,3,4,5,0,6' },
    { train: '139',  rk: 'BOS-WAS', o: 'BOS', d: 'WAS', dep: '08:05', arr: '16:20', type: 'regional', days: '1,2,3,4,5,0,6' },
    { train: '66',   rk: 'BOS-WAS', o: 'BOS', d: 'WAS', dep: '06:00', arr: '14:10', type: 'regional', days: '1,2,3,4,5,0,6' },
    { train: '67',   rk: 'WAS-BOS', o: 'WAS', d: 'BOS', dep: '14:05', arr: '22:15', type: 'regional', days: '1,2,3,4,5,0,6' },
  ];

  for (const s of schedules) {
    await pool.query(
      `INSERT INTO schedules (train_number, route_key, origin, destination, departure_time, arrival_time, train_type, days_of_week)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (train_number) DO UPDATE SET
         route_key=$2, origin=$3, destination=$4, departure_time=$5,
         arrival_time=$6, train_type=$7, days_of_week=$8`,
      [s.train, s.rk, s.o, s.d, s.dep, s.arr, s.type, s.days]
    );
  }
  console.log('[MIGRATE] ✓ Schedules seeded:', schedules.length, 'trains');
}

// Historical delay data for NEC + Acela routes.
// Based on FRA on-time performance data and public Amtrak statistics (juckins.net aggregates).
// On-time = arriving within 10 minutes of schedule.
// Rows: all NEC terminal pairs × 7 days × 3 time slots = 126 rows.
async function seedHistoricalDelays() {
  // [origin, destination, dayOfWeek, timeOfDay, under10%, 10-30%, 30+%, avgDelayMins, sampleSize]
  const routes = [
    // NYP↔WAS — busiest NEC corridor, 60-70% on-time for Regional
    { o: 'NYP', d: 'WAS', wdMorn: [64, 26, 10, 8,  320], wdAftn: [57, 31, 12, 11, 310], wdEvng: [52, 33, 15, 14, 290], weMorn: [71, 22, 7,  5,  110], weAftn: [64, 26, 10, 8,  120], weEvng: [59, 28, 13, 10, 100] },
    { o: 'WAS', d: 'NYP', wdMorn: [62, 27, 11, 9,  315], wdAftn: [55, 31, 14, 12, 305], wdEvng: [49, 35, 16, 15, 285], weMorn: [69, 23, 8,  6,  105], weAftn: [62, 27, 11, 9,  115], weEvng: [57, 30, 13, 11, 95]  },
    // NYP↔BOS — generally slightly better performance
    { o: 'NYP', d: 'BOS', wdMorn: [67, 24, 9,  7,  250], wdAftn: [61, 28, 11, 10, 240], wdEvng: [56, 31, 13, 12, 220], weMorn: [73, 20, 7,  5,  85],  weAftn: [66, 25, 9,  8,  95],  weEvng: [62, 27, 11, 10, 80]  },
    { o: 'BOS', d: 'NYP', wdMorn: [68, 23, 9,  7,  245], wdAftn: [62, 27, 11, 10, 235], wdEvng: [57, 30, 13, 12, 215], weMorn: [74, 19, 7,  5,  80],  weAftn: [67, 24, 9,  7,  90],  weEvng: [63, 26, 11, 9,  75]  },
    // BOS↔WAS — longest through run, most delay accumulation
    { o: 'BOS', d: 'WAS', wdMorn: [55, 29, 16, 13, 180], wdAftn: [48, 33, 19, 17, 170], wdEvng: [43, 34, 23, 20, 160], weMorn: [62, 26, 12, 10, 65],  weAftn: [55, 29, 16, 13, 70],  weEvng: [50, 31, 19, 16, 60]  },
    { o: 'WAS', d: 'BOS', wdMorn: [56, 28, 16, 13, 175], wdAftn: [49, 32, 19, 17, 165], wdEvng: [44, 33, 23, 20, 155], weMorn: [63, 25, 12, 10, 60],  weAftn: [56, 28, 16, 13, 65],  weEvng: [51, 30, 19, 16, 55]  },
    // Short hops — fewer delays due to shorter run
    { o: 'NYP', d: 'PHL', wdMorn: [74, 19, 7,  5,  200], wdAftn: [68, 23, 9,  7,  190], wdEvng: [64, 25, 11, 8,  180], weMorn: [79, 15, 6,  4,  70],  weAftn: [73, 20, 7,  5,  75],  weEvng: [69, 22, 9,  6,  65]  },
    { o: 'PHL', d: 'NYP', wdMorn: [73, 20, 7,  5,  195], wdAftn: [67, 24, 9,  7,  185], wdEvng: [63, 26, 11, 8,  175], weMorn: [78, 16, 6,  4,  68],  weAftn: [72, 21, 7,  5,  73],  weEvng: [68, 23, 9,  6,  63]  },
    { o: 'PHL', d: 'WAS', wdMorn: [70, 22, 8,  6,  185], wdAftn: [63, 26, 11, 9,  175], wdEvng: [59, 28, 13, 11, 165], weMorn: [76, 18, 6,  4,  65],  weAftn: [70, 22, 8,  6,  70],  weEvng: [65, 25, 10, 8,  60]  },
    { o: 'WAS', d: 'PHL', wdMorn: [69, 22, 9,  7,  180], wdAftn: [62, 27, 11, 9,  170], wdEvng: [58, 29, 13, 11, 160], weMorn: [75, 19, 6,  5,  62],  weAftn: [69, 22, 9,  7,  67],  weEvng: [64, 26, 10, 8,  57]  },
    { o: 'NYP', d: 'BAL', wdMorn: [65, 25, 10, 8,  160], wdAftn: [58, 30, 12, 11, 150], wdEvng: [53, 32, 15, 13, 140], weMorn: [72, 21, 7,  6,  55],  weAftn: [65, 25, 10, 8,  60],  weEvng: [61, 27, 12, 10, 50]  },
    { o: 'BAL', d: 'NYP', wdMorn: [64, 26, 10, 8,  155], wdAftn: [57, 31, 12, 11, 145], wdEvng: [52, 33, 15, 13, 135], weMorn: [71, 22, 7,  6,  52],  weAftn: [64, 26, 10, 8,  57],  weEvng: [60, 28, 12, 10, 47]  },
  ];

  const timeSlots = ['morning', 'afternoon', 'evening'];
  // weekday = days 1-5, weekend = days 0 and 6
  const weekdays = [1, 2, 3, 4, 5];
  const weekend  = [0, 6];

  for (const r of routes) {
    for (const day of [...weekdays, ...weekend]) {
      for (const tod of timeSlots) {
        const isWeekend = weekend.includes(day);
        let stats;
        if (tod === 'morning')   stats = isWeekend ? r.weMorn : r.wdMorn;
        if (tod === 'afternoon') stats = isWeekend ? r.weAftn : r.wdAftn;
        if (tod === 'evening')   stats = isWeekend ? r.weEvng : r.wdEvng;
        await pool.query(
          `INSERT INTO historical_delays
             (origin, destination, day_of_week, time_of_day,
              delay_under10min_percent, delay_10_30min_percent, delay_30plus_percent,
              avg_delay_minutes, sample_size)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (origin, destination, day_of_week, time_of_day)
           DO UPDATE SET
             delay_under10min_percent=$5, delay_10_30min_percent=$6,
             delay_30plus_percent=$7, avg_delay_minutes=$8, sample_size=$9,
             last_updated=NOW()`,
          [r.o, r.d, day, tod, stats[0], stats[1], stats[2], stats[3], stats[4]]
        );
      }
    }
  }

  console.log('[MIGRATE] ✓ Historical delays seeded');
}

const isMain = process.argv[1].endsWith('scripts/migrate.js');
if (isMain) { runMigrationsCLI(); }
