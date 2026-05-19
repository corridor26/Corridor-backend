// scraper/scheduler.js
import cron from 'node-cron';
import { scrapeAmtrakDelays } from '../scrapers/amtrakScraper.js';
import { scrapeAmtrakPrices, seedHistoricalDelays } from '../scrapers/priceScraper.js';
import { scrapeFares } from '../scrapers/fareScraper.js';

export function initializeScheduler() {
  console.log('[SCHEDULER] Initializing cron jobs...');

  // Run Amtrak delays scraper every hour at the top of the hour
  cron.schedule('0 * * * *', async () => {
    console.log('[CRON] Running hourly Amtrak delays scraper...');
    try {
      await scrapeAmtrakDelays();
    } catch (error) {
      console.error('[CRON] Error in delays scraper:', error);
    }
  });

  // Run price scraper every hour (at 15 minutes past)
  cron.schedule('15 * * * *', async () => {
    console.log('[CRON] Running hourly price scraper...');
    try {
      await scrapeAmtrakPrices();
    } catch (error) {
      console.error('[CRON] Error in price scraper:', error);
    }
  });

  // Run fare observation scraper every hour (at 45 minutes past)
  cron.schedule('45 * * * *', async () => {
    console.log('[CRON] Running fare observation scraper...');
    try {
      await scrapeFares();
    } catch (error) {
      console.error('[CRON] Error in fare scraper:', error);
    }
  });

  // Seed historical data once per day (at 2 AM)
  cron.schedule('0 2 * * *', async () => {
    console.log('[CRON] Running daily historical data seed...');
    try {
      await seedHistoricalDelays();
    } catch (error) {
      console.error('[CRON] Error in historical scraper:', error);
    }
  });

  console.log('[SCHEDULER] ✓ All cron jobs scheduled:');
  console.log('  - Delays scraper: Every hour at :00');
  console.log('  - Price scraper: Every hour at :15');
  console.log('  - Historical seed: Daily at 2:00 AM');
}

// For testing: Run scrapers immediately on startup
export async function runScrapersOnStartup() {
  console.log('[STARTUP] Running initial scrapers...');
  try {
    await scrapeAmtrakDelays();
    await scrapeAmtrakPrices();
    await seedHistoricalDelays();
    await scrapeFares();
    console.log('[STARTUP] ✓ Initial scrapers completed');
  } catch (error) {
    console.error('[STARTUP] Error:', error);
  }
}
