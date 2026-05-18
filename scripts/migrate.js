// scripts/migrate.js
import pool from '../config/database.js';

const migrations = `
-- Routes table
CREATE TABLE IF NOT EXISTS routes (
  id SERIAL PRIMARY KEY,
  origin VARCHAR(10),
  origin_name VARCHAR(100),
  destination VARCHAR(10),
  destination_name VARCHAR(100),
  train_type VARCHAR(100),
  typical_duration_minutes INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Trips table (user's upcoming trips)
CREATE TABLE IF NOT EXISTS trips (
  id SERIAL PRIMARY KEY,
  train_number VARCHAR(20),
  origin VARCHAR(10),
  destination VARCHAR(10),
  departure_date DATE,
  departure_time TIME,
  arrival_time TIME,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Real-time delays (updated hourly from Amtrak)
CREATE TABLE IF NOT EXISTS delays (
  id SERIAL PRIMARY KEY,
  train_number VARCHAR(20),
  origin VARCHAR(10),
  destination VARCHAR(10),
  departure_date DATE,
  current_delay_minutes INT,
  current_location VARCHAR(200),
  status VARCHAR(50),
  last_updated TIMESTAMP DEFAULT NOW(),
  UNIQUE(train_number, departure_date)
);

-- Historical delays
CREATE TABLE IF NOT EXISTS historical_delays (
  id SERIAL PRIMARY KEY,
  origin VARCHAR(10),
  destination VARCHAR(10),
  day_of_week INT,
  time_of_day VARCHAR(20),
  delay_under10min_percent INT,
  delay_10_30min_percent INT,
  delay_30plus_percent INT,
  avg_delay_minutes INT,
  sample_size INT,
  last_updated TIMESTAMP DEFAULT NOW(),
  UNIQUE(origin, destination, day_of_week, time_of_day)
);

-- Pricing data (updated hourly from Amtrak)
CREATE TABLE IF NOT EXISTS prices (
  id SERIAL PRIMARY KEY,
  origin VARCHAR(10),
  destination VARCHAR(10),
  train_number VARCHAR(20),
  departure_date DATE,
  current_price DECIMAL(10, 2),
  high_24h DECIMAL(10, 2),
  low_24h DECIMAL(10, 2),
  trend VARCHAR(20),
  scraped_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(origin, destination, train_number, departure_date)
);

-- Weather cache (updated hourly)
CREATE TABLE IF NOT EXISTS weather (
  id SERIAL PRIMARY KEY,
  station_code VARCHAR(10),
  station_name VARCHAR(100),
  temp_f INT,
  condition VARCHAR(100),
  forecast_date DATE,
  last_updated TIMESTAMP DEFAULT NOW()
);

-- Scraper logs (for monitoring)
CREATE TABLE IF NOT EXISTS scraper_logs (
  id SERIAL PRIMARY KEY,
  scraper_name VARCHAR(100),
  status VARCHAR(50),
  message TEXT,
  rows_affected INT,
  execution_time_ms INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trips_departure_date ON trips(departure_date);
CREATE INDEX IF NOT EXISTS idx_delays_train_number ON delays(train_number);
CREATE INDEX IF NOT EXISTS idx_prices_origin_dest ON prices(origin, destination, departure_date);
CREATE INDEX IF NOT EXISTS idx_historical_delays_origin_dest ON historical_delays(origin, destination)
`;

export async function runMigrations() {
  const statements = migrations.split(';').filter(stmt => stmt.trim());
  for (const statement of statements) {
    if (statement.trim()) {
      await pool.query(statement);
    }
  }
  await insertSampleRoutes();
}

// Called directly via `npm run migrate`
async function runMigrationsCLI() {
  try {
    console.log('Starting database migrations...');
    await runMigrations();
    console.log('✓ All migrations completed successfully');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

async function insertSampleRoutes() {
  const routes = [
    { origin: 'NYP', origin_name: 'New York Penn', destination: 'WAS', destination_name: 'Washington Union', train_type: 'Acela', duration: 162 },
    { origin: 'NYP', origin_name: 'New York Penn', destination: 'WAS', destination_name: 'Washington Union', train_type: 'Northeast Regional', duration: 225 },
    { origin: 'BOS', origin_name: 'Boston Back Bay', destination: 'NYP', destination_name: 'New York Penn', train_type: 'Northeast Regional', duration: 207 },
    { origin: 'PHL', origin_name: 'Philadelphia 30th St', destination: 'NYP', destination_name: 'New York Penn', train_type: 'Northeast Regional', duration: 85 },
    { origin: 'WAS', origin_name: 'Washington Union', destination: 'PHL', destination_name: 'Philadelphia 30th St', train_type: 'Northeast Regional', duration: 100 },
  ];

  for (const route of routes) {
    await pool.query(
      `INSERT INTO routes (origin, origin_name, destination, destination_name, train_type, typical_duration_minutes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [route.origin, route.origin_name, route.destination, route.destination_name, route.train_type, route.duration]
    );
  }

  console.log('✓ Sample routes inserted');
}

runMigrationsCLI();
