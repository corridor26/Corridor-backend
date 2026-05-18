// scrapers/amtrakScraper.js
import pool from '../config/database.js';

export async function scrapeAmtrakDelays() {
  let browser;
  const startTime = Date.now();
  
  try {
    console.log('[SCRAPER] Starting Amtrak delays scrape...');
    
    // Target trains (Northeast Corridor, Acela, etc)
    const targetTrains = [
      { number: '2151', origin: 'NYP', destination: 'WAS', type: 'Acela' },
      { number: '2153', origin: 'NYP', destination: 'WAS', type: 'Acela' },
      { number: '2155', origin: 'NYP', destination: 'WAS', type: 'Acela' },
      { number: '137', origin: 'WAS', destination: 'BOS', type: 'Northeast Regional' },
      { number: '139', origin: 'BOS', destination: 'WAS', type: 'Northeast Regional' },
    ];

    // Mock data for MVP (in production, would actually scrape Amtrak)
    const mockDelays = [
      { trainNumber: '2151', origin: 'NYP', destination: 'WAS', delay: 4, location: 'Near Wilmington, DE', status: 'delayed' },
      { trainNumber: '2153', origin: 'NYP', destination: 'WAS', delay: 0, location: 'Philadelphia, PA', status: 'on_time' },
      { trainNumber: '2155', origin: 'NYP', destination: 'WAS', delay: 8, location: 'Baltimore, MD', status: 'delayed' },
      { trainNumber: '137', origin: 'WAS', destination: 'BOS', delay: 0, location: 'New York, NY', status: 'on_time' },
      { trainNumber: '139', origin: 'BOS', destination: 'WAS', delay: 12, location: 'Newark, NJ', status: 'delayed' },
    ];

    let inserted = 0;

    for (const trainData of mockDelays) {
      await pool.query(
        `INSERT INTO delays (train_number, origin, destination, departure_date, current_delay_minutes, current_location, status, last_updated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (train_number, departure_date)
         DO UPDATE SET current_delay_minutes = $5, current_location = $6, status = $7, last_updated = NOW()`,
        [
          trainData.trainNumber,
          trainData.origin,
          trainData.destination,
          new Date().toISOString().split('T')[0],
          trainData.delay,
          trainData.location,
          trainData.status
        ]
      );
      inserted++;
    }

    // Log the scrape
    const executionTime = Date.now() - startTime;
    await pool.query(
      `INSERT INTO scraper_logs (scraper_name, status, message, rows_affected, execution_time_ms)
       VALUES ($1, $2, $3, $4, $5)`,
      ['amtrak_delays', 'success', `Scraped ${inserted} train delays`, inserted, executionTime]
    );

    console.log(`[SCRAPER] ✓ Completed in ${executionTime}ms. Inserted ${inserted} records.`);
    return { success: true, rowsInserted: inserted, executionTime };

  } catch (error) {
    console.error('[SCRAPER] Error:', error);
    
    // Log the failure
    const executionTime = Date.now() - startTime;
    await pool.query(
      `INSERT INTO scraper_logs (scraper_name, status, message, execution_time_ms)
       VALUES ($1, $2, $3, $4)`,
      ['amtrak_delays', 'failed', error.message, executionTime]
    );

    return { success: false, error: error.message };

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Helper function to extract delays from Amtrak Track Your Train page
// This would be called from the browser context
async function extractDelaysFromPage() {
  // This would run inside Puppeteer's browser context
  return {
    trainNumber: document.querySelector('[data-train-number]')?.textContent,
    delay: parseInt(document.querySelector('[data-delay]')?.textContent || 0),
    location: document.querySelector('[data-location]')?.textContent,
    status: document.querySelector('[data-status]')?.textContent,
  };
}
