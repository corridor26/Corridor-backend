import express from 'express';
import axios from 'axios';
import pool from '../config/database.js';

const router = express.Router();

const STATIONS = {
  NYP: { lat: 40.7506, lon: -73.9971, name: 'New York Penn Station' },
  WAS: { lat: 38.8977, lon: -77.0065, name: 'Washington Union Station' },
  PHL: { lat: 39.9566, lon: -75.1817, name: 'Philadelphia 30th Street' },
  BOS: { lat: 42.3517, lon: -71.0551, name: 'Boston South Station' },
  BAL: { lat: 39.2904, lon: -76.6122, name: 'Baltimore Penn Station' },
  NWK: { lat: 40.7349, lon: -74.1644, name: 'Newark Penn Station' },
};

const WEATHER_DESC = (code) => {
  if (code === 0) return 'Clear';
  if (code <= 3) return code === 1 ? 'Mostly Clear' : code === 2 ? 'Partly Cloudy' : 'Overcast';
  if (code <= 48) return 'Foggy';
  if (code <= 55) return 'Drizzle';
  if (code <= 65) return 'Rainy';
  if (code <= 77) return 'Snowy';
  if (code <= 82) return 'Showers';
  return 'Thunderstorms';
};

router.get('/:stationCode', async (req, res) => {
  const code = req.params.stationCode.toUpperCase();
  const station = STATIONS[code];
  if (!station) return res.status(404).json({ error: 'Unknown station' });

  // Serve from cache if fresh (< 1 hour)
  try {
    const cached = await pool.query(
      `SELECT temp_f, condition FROM weather
       WHERE station_code = $1 AND last_updated > NOW() - INTERVAL '1 hour'
       ORDER BY last_updated DESC LIMIT 1`,
      [code]
    );
    if (cached.rows.length > 0) {
      return res.json({ station: station.name, temp: cached.rows[0].temp_f, condition: cached.rows[0].condition });
    }
  } catch { /* fall through to live fetch */ }

  // Fetch from Open-Meteo (free, no key required)
  try {
    const { data } = await axios.get('https://api.open-meteo.com/v1/forecast', {
      params: {
        latitude: station.lat,
        longitude: station.lon,
        current: 'temperature_2m,weather_code',
        temperature_unit: 'fahrenheit',
        timezone: 'auto',
      },
      timeout: 8000,
    });

    const temp = Math.round(data.current.temperature_2m);
    const condition = WEATHER_DESC(data.current.weather_code);

    await pool.query(
      `DELETE FROM weather WHERE station_code = $1`, [code]
    );
    await pool.query(
      `INSERT INTO weather (station_code, station_name, temp_f, condition, forecast_date, last_updated)
       VALUES ($1, $2, $3, $4, CURRENT_DATE, NOW())`,
      [code, station.name, temp, condition]
    );

    res.json({ station: station.name, temp, condition });
  } catch {
    res.status(503).json({ error: 'Weather unavailable' });
  }
});

export default router;
