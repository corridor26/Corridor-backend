// scrapers/priceScraper.js
import pool from '../config/database.js';

export async function scrapeAmtrakPrices() {
  const startTime = Date.now();

  try {
    console.log('[PRICE SCRAPER] Starting price scrape...');

    // Mock price data for MVP
    const mockPrices = [
      {
        origin: 'NYP',
        destination: 'WAS',
        trainNumber: '2151',
        currentPrice: 94,
        high24h: 120,
        low24h: 75,
        trend: 'up'
      },
      {
        origin: 'NYP',
        destination: 'WAS',
        trainNumber: '2153',
        currentPrice: 78,
        high24h: 95,
        low24h: 60,
        trend: 'stable'
      },
      {
        origin: 'NYP',
        destination: 'WAS',
        trainNumber: '2155',
        currentPrice: 68,
        high24h: 85,
        low24h: 55,
        trend: 'down'
      },
      {
        origin: 'BOS',
        destination: 'NYP',
        trainNumber: '2174',
        currentPrice: 49,
        high24h: 65,
        low24h: 35,
        trend: 'up'
      },
      {
        origin: 'PHL',
        destination: 'WAS',
        trainNumber: '2240',
        currentPrice: 32,
        high24h: 45,
        low24h: 28,
        trend: 'stable'
      },
    ];

    let inserted = 0;
    const today = new Date().toISOString().split('T')[0];

    for (const priceData of mockPrices) {
      await pool.query(
        `INSERT INTO prices (origin, destination, train_number, departure_date, current_price, high_24h, low_24h, trend, scraped_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (origin, destination, train_number, departure_date)
         DO UPDATE SET current_price = $5, high_24h = $6, low_24h = $7, trend = $8, scraped_at = NOW()`,
        [
          priceData.origin,
          priceData.destination,
          priceData.trainNumber,
          today,
          priceData.currentPrice,
          priceData.high24h,
          priceData.low24h,
          priceData.trend
        ]
      );
      inserted++;
    }

    // Log the scrape
    const executionTime = Date.now() - startTime;
    await pool.query(
      `INSERT INTO scraper_logs (scraper_name, status, message, rows_affected, execution_time_ms)
       VALUES ($1, $2, $3, $4, $5)`,
      ['amtrak_prices', 'success', `Scraped ${inserted} price points`, inserted, executionTime]
    );

    console.log(`[PRICE SCRAPER] ✓ Completed in ${executionTime}ms. Inserted ${inserted} records.`);
    return { success: true, rowsInserted: inserted, executionTime };

  } catch (error) {
    console.error('[PRICE SCRAPER] Error:', error);

    // Log the failure
    const executionTime = Date.now() - startTime;
    await pool.query(
      `INSERT INTO scraper_logs (scraper_name, status, message, execution_time_ms)
       VALUES ($1, $2, $3, $4)`,
      ['amtrak_prices', 'failed', error.message, executionTime]
    );

    return { success: false, error: error.message };
  }
}

// Helper: Insert or seed historical delay data
export async function seedHistoricalDelays() {
  try {
    console.log('[HISTORICAL SCRAPER] Seeding historical delay data...');

    const historicalData = [
      // NYP -> WAS route
      { origin: 'NYP', destination: 'WAS', dayOfWeek: 1, timeOfDay: 'morning', delay10: 50, delay1030: 25, delay30: 25, avgDelay: 6, sampleSize: 150 },
      { origin: 'NYP', destination: 'WAS', dayOfWeek: 1, timeOfDay: 'afternoon', delay10: 40, delay1030: 35, delay30: 25, avgDelay: 10, sampleSize: 140 },
      { origin: 'NYP', destination: 'WAS', dayOfWeek: 1, timeOfDay: 'evening', delay10: 60, delay1030: 20, delay30: 20, avgDelay: 4, sampleSize: 120 },
      
      // BOS -> NYP route
      { origin: 'BOS', destination: 'NYP', dayOfWeek: 2, timeOfDay: 'morning', delay10: 55, delay1030: 25, delay30: 20, avgDelay: 5, sampleSize: 100 },
      { origin: 'BOS', destination: 'NYP', dayOfWeek: 2, timeOfDay: 'afternoon', delay10: 45, delay1030: 30, delay30: 25, avgDelay: 8, sampleSize: 95 },
      
      // PHL -> WAS route
      { origin: 'PHL', destination: 'WAS', dayOfWeek: 3, timeOfDay: 'morning', delay10: 70, delay1030: 20, delay30: 10, avgDelay: 3, sampleSize: 80 },
      { origin: 'PHL', destination: 'WAS', dayOfWeek: 3, timeOfDay: 'afternoon', delay10: 60, delay1030: 25, delay30: 15, avgDelay: 4, sampleSize: 85 },
    ];

    let inserted = 0;

    for (const data of historicalData) {
      await pool.query(
        `INSERT INTO historical_delays (origin, destination, day_of_week, time_of_day, delay_under10min_percent, delay_10_30min_percent, delay_30plus_percent, avg_delay_minutes, sample_size)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (origin, destination, day_of_week, time_of_day)
         DO UPDATE SET delay_under10min_percent = $5, delay_10_30min_percent = $6, delay_30plus_percent = $7, avg_delay_minutes = $8, sample_size = $9`,
        [
          data.origin,
          data.destination,
          data.dayOfWeek,
          data.timeOfDay,
          data.delay10,
          data.delay1030,
          data.delay30,
          data.avgDelay,
          data.sampleSize
        ]
      );
      inserted++;
    }

    console.log(`[HISTORICAL SCRAPER] ✓ Seeded ${inserted} historical records.`);
    return { success: true, rowsInserted: inserted };

  } catch (error) {
    console.error('[HISTORICAL SCRAPER] Error:', error);
    return { success: false, error: error.message };
  }
}
