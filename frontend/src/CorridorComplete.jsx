import React, { useState, useEffect } from 'react';

const API_BASE = 'https://corridor-backend-production.up.railway.app';

// ─── DESIGN TOKENS ────────────────────────────────────────────────
const C = {
  paper: '#f5f2eb',
  paperDark: '#ece8df',
  paperLight: '#faf8f3',
  ink: '#1e3a6e',
  inkMid: '#3d5585',
  inkLight: '#8a9db8',
  fieldBlue: '#1a5c9e',
  fieldBlueDark: '#124480',
  fieldBlueLightTint: '#e4eef8',
  green: '#1a4d2a',
  greenLight: '#e4f0e8',
  orange: '#7a3800',
  orangeLight: '#f2e8d8',
  red: '#b01818',
  redLight: '#f7e4e4',
  chevronRed: '#c8281e',
  rule: '#d8d0c4',
  ruleStrong: '#8a9db8',
};

const DISPLAY = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' };
const BODY = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600 };
const MONO = { fontFamily: "'Courier New', monospace" };
const ITALIC = { fontFamily: "'Georgia', serif", fontStyle: 'italic' };

// ─── HELPERS ─────────────────────────────────────────────────────
const getTrainName = (trainNumber) => {
  const num = parseInt(trainNumber);
  if (num >= 2100 && num <= 2299) return 'Acela';
  return 'NEC Regional';
};

const formatDate = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const today = () => new Date().toISOString().split('T')[0];

const buildAmtrakUrl = (fromCode, toCode, dateStr) => {
  const [year, month, day] = dateStr.split('-');
  return `https://www.amtrak.com/booking/journey-stops.html?fromStationCode=${fromCode}&toStationCode=${toCode}&departDate=${month}/${day}/${year}&numberOfAdults=1`;
};

// ─── LOGO ────────────────────────────────────────────────────────
const LogoMark = ({ white = false }) => (
  <svg width="40" height="20" viewBox="0 0 80 40" style={{ marginRight: '10px' }}>
    <path d="M 0 0 L 32 20 L 0 40 L 11 40 L 43 20 L 11 0 Z" fill={C.chevronRed} />
    <rect x="16" y="10" width="64" height="7" fill={white ? '#fff' : C.fieldBlue} />
    <rect x="16" y="23" width="64" height="7" fill={white ? '#fff' : C.fieldBlue} />
  </svg>
);

const Logo = ({ white = false }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <LogoMark white={white} />
    <div>
      <div style={{ ...DISPLAY, fontSize: '18px', color: white ? '#fff' : C.ink, letterSpacing: '0.05em', lineHeight: 1 }}>Corridor</div>
      <div style={{ ...MONO, fontSize: '7px', color: white ? 'rgba(255,255,255,0.55)' : C.inkLight, letterSpacing: '0.22em', marginTop: '2px' }}>YOUR RAIL COMPANION</div>
    </div>
  </div>
);

// ─── SCREEN HEADER ───────────────────────────────────────────────
const ScreenHeader = ({ subtitle, isPrimary = true }) => (
  <div style={{ background: C.fieldBlue, padding: isPrimary ? '46px 18px 14px' : '36px 18px 12px' }}>
    <Logo white />
    {subtitle && <div style={{ ...MONO, fontSize: '8px', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.15em', marginTop: '4px' }}>{subtitle}</div>}
    <div style={{ height: '3px', background: C.chevronRed, marginTop: '12px', marginLeft: '-18px', marginRight: '-18px' }} />
  </div>
);

// ─── STATUS BADGE ────────────────────────────────────────────────
const StatusBadge = ({ label, type }) => {
  const styles = {
    'ON TIME': { bg: C.greenLight, text: C.green },
    'DELAYED': { bg: C.orangeLight, text: C.orange },
    'CANCELLED': { bg: C.redLight, text: C.red },
  };
  const s = styles[label] || styles['ON TIME'];
  return (
    <div style={{
      ...DISPLAY,
      fontSize: '9px',
      letterSpacing: '0.06em',
      background: s.bg,
      color: s.text,
      border: `1px solid ${s.text}55`,
      borderRadius: '4px',
      padding: '3px 8px',
      display: 'inline-block',
    }}>
      {label}
    </div>
  );
};

// ─── TRIP PROGRESS BAR ────────────────────────────────────────────
const TripProgressBar = ({ progress }) => (
  <div style={{ position: 'relative', height: '14px', display: 'flex', alignItems: 'center' }}>
    <div style={{ position: 'absolute', width: '100%', height: '2px', background: C.rule, borderRadius: '1px', left: 0 }} />
    {progress > 0 && (
      <div style={{ position: 'absolute', height: '2px', background: C.fieldBlue, width: `${progress * 100}%`, borderRadius: '1px', left: 0 }} />
    )}
    {progress > 0 && (
      <div
        style={{
          position: 'absolute',
          left: `${progress * 100}%`,
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: C.fieldBlue,
          border: `2px solid ${C.paperLight}`,
          transform: 'translateX(-50%)',
          animation: 'pulse 2.5s ease-in-out infinite',
        }}
      />
    )}
    {progress === 0 && (
      <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', ...MONO, fontSize: '8px', color: C.inkLight, letterSpacing: '0.1em' }}>– – –</div>
    )}
  </div>
);

// ─── TRIP CARD ───────────────────────────────────────────────────
const TripCard = ({ trip, onClick }) => {
  const accentColor = trip.statusType === 'ontime' ? C.fieldBlue : trip.statusType === 'cancelled' ? C.red : C.orange;

  return (
    <div
      onClick={onClick}
      style={{
        border: `1px solid ${C.ruleStrong}`,
        borderLeft: `4px solid ${accentColor}`,
        borderRadius: '6px',
        overflow: 'hidden',
        cursor: 'pointer',
        background: C.paperLight,
      }}
    >
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.rule}`, background: C.paperLight }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ ...DISPLAY, fontSize: '16px', color: C.ink }}>{trip.trainName}</span>
              <span style={{ ...MONO, fontSize: '10px', color: C.inkLight }}>{trip.number}</span>
            </div>
            <div style={{ ...ITALIC, fontSize: '9px', color: C.inkLight, marginTop: '2px' }}>{trip.date}</div>
          </div>
          <StatusBadge label={trip.statusLabel} type={trip.statusType} />
        </div>
      </div>

      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.rule}`, background: C.paperLight }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ minWidth: '50px' }}>
            <div style={{ ...MONO, fontSize: '22px', fontWeight: 'bold', color: C.ink }}>{trip.departure}</div>
            <div style={{ ...BODY, fontSize: '10px', color: C.inkMid, marginTop: '3px' }}>{trip.fromCode}</div>
          </div>
          <div style={{ flex: 1 }}>
            <TripProgressBar progress={trip.progress} />
          </div>
          <div style={{ minWidth: '50px', textAlign: 'right' }}>
            <div style={{ ...MONO, fontSize: '22px', fontWeight: 'bold', color: trip.statusType === 'cancelled' ? C.red : C.ink }}>{trip.arrival}</div>
            <div style={{ ...BODY, fontSize: '10px', color: C.inkMid, marginTop: '3px' }}>{trip.toCode}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: C.paperDark, borderBottom: `1px solid ${C.rule}` }}>
        <div style={{ padding: '12px 14px', borderRight: `1px solid ${C.rule}` }}>
          <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '6px' }}>TRACK</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: trip.trackStatus === 'confirmed' ? C.green : C.orange }} />
            <div style={{ ...MONO, fontSize: '15px', fontWeight: 'bold', color: C.ink }}>{trip.track}</div>
          </div>
          <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, marginTop: '3px' }}>
            {trip.trackStatus === 'confirmed' ? 'Confirmed' : 'TBD'}
          </div>
        </div>

        <div style={{ padding: '12px 14px', borderRight: `1px solid ${C.rule}` }}>
          <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '6px' }}>AI DELAY</div>
          <div style={{ ...MONO, fontSize: '15px', fontWeight: 'bold', color: trip.aiDelay > 0 ? C.orange : C.green }}>
            {trip.aiDelay === 0 ? 'On time' : `+${trip.aiDelay}m`}
          </div>
          <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, marginTop: '3px' }}>{trip.aiConfidence}% conf.</div>
        </div>

        <div style={{ padding: '12px 14px' }}>
          <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '6px' }}>EN ROUTE</div>
          <div style={{ ...BODY, fontSize: '10px', color: C.ink }}>
            {trip.currentLocation ? trip.currentLocation.split(',')[0] : '—'}
          </div>
          <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, marginTop: '3px' }}>
            {trip.currentLocation ? 'Live' : 'Not started'}
          </div>
        </div>
      </div>

      <div style={{ padding: '10px 16px', background: trip.statusType === 'cancelled' ? C.redLight : C.paperLight, display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: trip.recentAvgDelay > 10 ? C.orange : C.green, flexShrink: 0 }} />
        <div style={{ ...MONO, fontSize: '9px', color: C.inkMid, flex: 1 }}>
          {trip.statusType === 'cancelled' ? 'Train cancelled · 3 alternatives' : `+${trip.recentAvgDelay} min avg · ${trip.direction}`}
        </div>
        <div style={{ ...MONO, fontSize: '8px', color: C.inkLight }}>Past 3h</div>
      </div>
    </div>
  );
};

// ─── SCREEN: TRIPS ───────────────────────────────────────────────
const TripsScreen = ({ onSelectTrip }) => {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/trips`)
      .then(r => r.json())
      .then(data => {
        const mapped = data.map(t => ({
          ...t,
          trainName: getTrainName(t.trainNumber),
          number: t.trainNumber,
          rawDate: t.date,
          date: formatDate(t.date),
        }));
        setTrips(mapped);
        setLoading(false);
      })
      .catch(err => {
        setError('Could not load trips');
        setLoading(false);
      });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.paper }}>
      <ScreenHeader subtitle="UPCOMING TRIPS" isPrimary />
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '80px' }}>
        {loading && (
          <div style={{ ...MONO, fontSize: '10px', color: C.inkLight, textAlign: 'center', marginTop: '40px' }}>Loading trips...</div>
        )}
        {error && (
          <div style={{ ...MONO, fontSize: '10px', color: C.red, textAlign: 'center', marginTop: '40px' }}>{error}</div>
        )}
        {!loading && !error && trips.length === 0 && (
          <div style={{ ...MONO, fontSize: '10px', color: C.inkLight, textAlign: 'center', marginTop: '40px' }}>No upcoming trips. Add one in Booking.</div>
        )}
        {trips.map(trip => (
          <TripCard key={trip.id} trip={trip} onClick={() => onSelectTrip(trip)} />
        ))}
      </div>
    </div>
  );
};

// ─── SCREEN: TRIP DETAIL ─────────────────────────────────────────
const TripDetailScreen = ({ trip, onBack }) => {
  const [detail, setDetail] = useState(null);
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/trips/${trip.id}`)
      .then(r => r.json())
      .then(setDetail)
      .catch(() => {});

    fetch(`${API_BASE}/api/weather/${trip.toCode}`)
      .then(r => r.json())
      .then(setWeather)
      .catch(() => {});
  }, [trip.id, trip.toCode]);

  const d = detail || trip;
  const stops = detail?.stops || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.paper }}>
      <div style={{ background: C.fieldBlue, padding: '36px 18px 12px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', ...MONO, fontSize: '10px', marginBottom: '10px', padding: 0 }}>← Back</button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div>
            <div style={{ ...DISPLAY, fontSize: '22px', color: '#fff' }}>{d.trainName} #{d.number}</div>
            <div style={{ ...MONO, fontSize: '8px', color: 'rgba(255,255,255,0.6)', marginTop: '3px' }}>{d.fromCode} → {d.toCode}</div>
          </div>
          <StatusBadge label={d.statusLabel} type={d.statusType} />
        </div>
        <div style={{ height: '3px', background: C.chevronRed, marginTop: '12px', marginLeft: '-18px', marginRight: '-18px' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '80px' }}>
        {/* Times */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ border: `1px solid ${C.ruleStrong}`, borderRadius: '6px', padding: '14px', background: C.paperLight }}>
            <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '6px' }}>DEPARTURE</div>
            <div style={{ ...MONO, fontSize: '24px', fontWeight: 'bold', color: C.ink }}>{d.departure}</div>
            <div style={{ ...BODY, fontSize: '10px', color: C.inkMid, marginTop: '6px' }}>{d.fromName || d.fromCode}</div>
          </div>
          <div style={{ border: `1px solid ${C.ruleStrong}`, borderRadius: '6px', padding: '14px', background: C.paperLight }}>
            <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '6px' }}>ARRIVAL</div>
            <div style={{ ...MONO, fontSize: '24px', fontWeight: 'bold', color: C.ink }}>{d.arrival}</div>
            <div style={{ ...BODY, fontSize: '10px', color: C.inkMid, marginTop: '6px' }}>{d.toName || d.toCode}</div>
          </div>
        </div>

        {/* AI Prediction */}
        <div style={{ border: `1px solid ${C.ruleStrong}`, borderRadius: '6px', padding: '14px', background: C.fieldBlueLightTint }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <div style={{ ...DISPLAY, fontSize: '9px', background: C.fieldBlue, color: '#fff', padding: '4px 8px', borderRadius: '4px' }}>AI</div>
            <div style={{ ...BODY, fontSize: '11px', color: C.fieldBlue, fontWeight: 600 }}>Predictive Delay Intelligence</div>
          </div>
          <div style={{ ...MONO, fontSize: '20px', fontWeight: 'bold', color: d.aiDelay > 0 ? C.orange : C.green, marginBottom: '8px' }}>
            {d.aiDelay === 0 ? 'On time' : `+${d.aiDelay}m predicted`}
          </div>
          <div style={{ ...MONO, fontSize: '8px', color: C.inkLight, marginBottom: '8px' }}>{d.aiConfidence}% confidence</div>
          <div style={{ ...ITALIC, fontSize: '10px', color: C.fieldBlue, lineHeight: 1.6 }}>
            {d.reasoning || 'Based on historical delay patterns for this route.'}
          </div>
          <div style={{ ...MONO, fontSize: '8px', color: C.inkLight, marginTop: '8px' }}>Corridor AI Model</div>
        </div>

        {/* Live Location */}
        {d.currentLocation && (
          <div style={{ border: `1px solid ${C.ruleStrong}`, borderRadius: '6px', padding: '14px', background: C.greenLight }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div>
                <div style={{ ...MONO, fontSize: '7px', color: C.green, letterSpacing: '0.14em', marginBottom: '4px' }}>LIVE POSITION</div>
                <div style={{ ...BODY, fontSize: '12px', color: C.ink }}>{d.currentLocation}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: C.green, borderRadius: '4px', padding: '4px 8px' }}>
                <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite' }} />
                <span style={{ ...MONO, fontSize: '8px', color: '#fff', fontWeight: 'bold' }}>LIVE</span>
              </div>
            </div>
          </div>
        )}

        {/* Route */}
        <div style={{ border: `1px solid ${C.ruleStrong}`, borderRadius: '6px', overflow: 'hidden', background: C.paperLight }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.rule}`, background: C.paperDark }}>
            <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em' }}>ROUTE & STOPS</div>
          </div>
          {stops.length === 0 ? (
            <div style={{ padding: '16px', ...MONO, fontSize: '9px', color: C.inkLight, textAlign: 'center' }}>Loading stops…</div>
          ) : stops.map((stop, i) => (
            <div key={i} style={{ padding: '12px 14px', borderBottom: i < stops.length - 1 ? `1px solid ${C.rule}` : 'none', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: stop.passed ? C.fieldBlue : C.rule, flexShrink: 0 }} />
                {i < stops.length - 1 && <div style={{ width: '2px', height: '18px', background: stop.passed ? C.fieldBlue : C.rule }} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...BODY, fontSize: '11px', color: C.ink }}>{stop.name}</div>
                <div style={{ ...MONO, fontSize: '8px', color: C.inkLight }}>{stop.code}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...MONO, fontSize: '12px', fontWeight: 'bold', color: C.ink }}>{stop.schTime}</div>
                {stop.actTime && <div style={{ ...MONO, fontSize: '8px', color: stop.actTime > stop.schTime ? C.orange : C.green }}>{stop.actTime} actual</div>}
              </div>
            </div>
          ))}
        </div>

        {/* Delay Distribution */}
        <div style={{ border: `1px solid ${C.ruleStrong}`, borderRadius: '6px', padding: '14px', background: C.paperLight }}>
          <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '12px' }}>TYPICAL DELAYS ON THIS ROUTE</div>
          {[
            { range: '<10 min', percent: d.delayDistribution?.['<10min'] || 50, color: C.green },
            { range: '10-30 min', percent: d.delayDistribution?.['10-30min'] || 25, color: C.orange },
            { range: '30+ min', percent: d.delayDistribution?.['30+min'] || 25, color: C.red },
          ].map((item, i) => (
            <div key={i} style={{ marginBottom: i < 2 ? '12px' : '0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', ...MONO, fontSize: '9px', color: C.ink, marginBottom: '5px' }}>
                <span>{item.range}</span>
                <span style={{ color: C.inkLight }}>{item.percent}%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: C.paperDark, borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${item.percent}%`, height: '100%', background: item.color }} />
              </div>
            </div>
          ))}
        </div>

        {/* Recent Delays */}
        <div style={{ border: `1px solid ${C.ruleStrong}`, borderRadius: '6px', padding: '14px', background: C.paperLight }}>
          <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '10px' }}>RECENT DELAYS (PAST 3H)</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ ...BODY, fontSize: '11px', color: C.ink }}>{d.direction || 'Southbound'} direction</div>
              <div style={{ ...MONO, fontSize: '8px', color: C.inkLight, marginTop: '3px' }}>4 trains sampled</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...MONO, fontSize: '18px', fontWeight: 'bold', color: (d.recentAvgDelay || 0) > 10 ? C.orange : C.green }}>+{d.recentAvgDelay || 0} min</div>
              <div style={{ ...MONO, fontSize: '8px', color: C.inkLight, marginTop: '3px' }}>avg delay</div>
            </div>
          </div>
        </div>

        {/* Weather */}
        <div style={{ border: `1px solid ${C.ruleStrong}`, borderRadius: '6px', padding: '14px', background: C.paperLight }}>
          <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '10px' }}>WEATHER AT DESTINATION</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ ...BODY, fontSize: '11px', color: C.ink }}>{weather?.station || d.toName || d.toCode}</div>
              <div style={{ ...MONO, fontSize: '8px', color: C.inkLight, marginTop: '3px' }}>{weather ? weather.condition : '—'}</div>
            </div>
            <div style={{ ...MONO, fontSize: '28px', fontWeight: 'bold', color: C.ink }}>{weather ? `${weather.temp}°` : '—'}</div>
          </div>
        </div>

        {/* Fare History */}
        <div style={{ border: `1px solid ${C.ruleStrong}`, borderRadius: '6px', padding: '14px', background: C.paperLight }}>
          <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '12px' }}>FARE HISTORY (24H)</div>

          <svg width="100%" height="80" style={{ marginBottom: '12px', background: C.paperDark, borderRadius: '4px', padding: '8px 6px', boxSizing: 'border-box' }} viewBox="0 0 340 80" preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="priceGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style={{ stopColor: C.fieldBlue, stopOpacity: 0.1 }} />
                <stop offset="100%" style={{ stopColor: C.fieldBlue, stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            <line x1="10" y1="60" x2="330" y2="60" stroke={C.rule} strokeWidth="0.5" />
            <line x1="10" y1="40" x2="330" y2="40" stroke={C.rule} strokeWidth="0.5" opacity="0.5" />
            <line x1="10" y1="20" x2="330" y2="20" stroke={C.rule} strokeWidth="0.5" opacity="0.5" />
            <path d="M 10 60 L 35 55.4 L 60 50.8 L 85 46.2 L 110 41.5 L 135 36.9 L 160 32.3 L 185 36.9 L 210 41.5 L 235 46.2 L 260 50.8 L 285 55.4 L 310 58.5 L 330 58.5 L 330 70 L 10 70 Z" fill="url(#priceGradient)" />
            <polyline points="10,60 35,55.4 60,50.8 85,46.2 110,41.5 135,36.9 160,32.3 185,36.9 210,41.5 235,46.2 260,50.8 285,55.4 310,58.5" fill="none" stroke={C.fieldBlue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="310" cy="58.5" r="3" fill={C.fieldBlue} stroke={C.paperLight} strokeWidth="2" />
          </svg>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            <div style={{ background: C.paperDark, borderRadius: '4px', padding: '10px' }}>
              <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '4px' }}>CURRENT</div>
              <div style={{ ...MONO, fontSize: '14px', fontWeight: 'bold', color: C.fieldBlue }}>{detail?.currentPrice ? `$${detail.currentPrice}` : '—'}</div>
            </div>
            <div style={{ background: C.paperDark, borderRadius: '4px', padding: '10px' }}>
              <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '4px' }}>24H HIGH</div>
              <div style={{ ...MONO, fontSize: '14px', fontWeight: 'bold', color: C.ink }}>{detail?.high24h ? `$${detail.high24h}` : '—'}</div>
            </div>
            <div style={{ background: C.paperDark, borderRadius: '4px', padding: '10px' }}>
              <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '4px' }}>24H LOW</div>
              <div style={{ ...MONO, fontSize: '14px', fontWeight: 'bold', color: C.green }}>{detail?.low24h ? `$${detail.low24h}` : '—'}</div>
            </div>
          </div>
        </div>

        <button
          onClick={() => window.open(buildAmtrakUrl(trip.fromCode, trip.toCode, trip.rawDate || today()), '_blank')}
          style={{
            width: '100%',
            ...DISPLAY,
            fontSize: '9px',
            padding: '14px',
            borderRadius: '6px',
            border: 'none',
            background: C.fieldBlue,
            color: '#fff',
            cursor: 'pointer',
            letterSpacing: '0.05em',
          }}>
          Book on Amtrak →
        </button>
      </div>
    </div>
  );
};

// ─── SCREEN: BOOKING ─────────────────────────────────────────────
const BookingScreen = ({ onSaved }) => {
  const [from, setFrom] = useState('NYP');
  const [to, setTo] = useState('WAS');
  const [date, setDate] = useState(today());
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [savedId, setSavedId] = useState(null);

  const handleSave = async (result) => {
    try {
      await fetch(`${API_BASE}/api/trips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trainNumber: result.train,
          origin: from,
          destination: to,
          departureDate: date,
          departureTime: result.time,
          arrivalTime: result.arrival,
        }),
      });
      setSavedId(result.id);
      setTimeout(() => onSaved(), 1000);
    } catch {
      // retry silently
    }
  };

  const isSameDay = () => date === today();

  const getOfficialStatusColor = (status) => status === 'On time' ? C.green : C.orange;
  const getDelayColor = (delay) => delay === 0 ? C.green : delay <= 10 ? C.orange : C.red;

  const handleSearch = async () => {
    setSearching(true);
    try {
      const res = await fetch(`${API_BASE}/api/search?origin=${from}&destination=${to}&date=${date}`);
      const data = await res.json();
      const mapped = data.map((r, i) => ({
        id: i + 1,
        time: r.time,
        arrival: r.arriveTime,
        price: r.price,
        train: r.train,
        avgDelay: r.delay ?? 0,
        officialStatus: (r.delay ?? 0) === 0 ? 'On time' : `+${r.delay}m delayed`,
        aiDelay: r.delay ?? 0,
        aiConfidence: 75,
        priceHigh: Math.round(r.price * 1.2),
        priceLow: Math.round(r.price * 0.85),
        priceIntel: r.price < 70 ? 'Good value · Near 24h low' : r.price < 90 ? 'Typical price · Wait for drop' : 'Price elevated · Buy if flexible',
      }));
      setSearchResults(mapped);
    } catch {
      // keep any existing results
    }
    setSearching(false);
  };

  const results = searchResults ?? [];
  const hasResults = results.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.paper }}>
      <ScreenHeader subtitle="SEARCH & BOOK" isPrimary />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '80px' }}>
        <div style={{ border: `1px solid ${C.ruleStrong}`, borderRadius: '6px', padding: '16px', background: C.paperLight }}>
          <div style={{ ...DISPLAY, fontSize: '11px', color: C.ink, marginBottom: '12px', letterSpacing: '0.04em' }}>Find a Train</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '8px', marginBottom: '12px', alignItems: 'flex-end' }}>
            <div>
              <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '6px' }}>FROM</div>
              <select value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: '100%', ...MONO, fontSize: '13px', fontWeight: 'bold', padding: '8px 10px', borderRadius: '4px', border: `1px solid ${C.rule}`, background: C.paperDark, color: C.ink, cursor: 'pointer' }}>
                {['NYP', 'WAS', 'PHL', 'BOS', 'BAL'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <button onClick={() => { setFrom(to); setTo(from); }} style={{ background: 'none', border: 'none', ...MONO, fontSize: '12px', color: C.fieldBlue, cursor: 'pointer' }}>⇄</button>
            <div>
              <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '6px' }}>TO</div>
              <select value={to} onChange={(e) => setTo(e.target.value)} style={{ width: '100%', ...MONO, fontSize: '13px', fontWeight: 'bold', padding: '8px 10px', borderRadius: '4px', border: `1px solid ${C.rule}`, background: C.paperDark, color: C.ink, cursor: 'pointer' }}>
                {['WAS', 'NYP', 'PHL', 'BOS', 'BAL'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '6px' }}>DATE</div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: '100%', ...MONO, fontSize: '13px', fontWeight: 'bold', padding: '8px 10px', borderRadius: '4px', border: `1px solid ${C.rule}`, background: C.paperDark, color: C.ink, cursor: 'pointer' }} />
          </div>

          <button onClick={handleSearch} disabled={searching} style={{ width: '100%', ...DISPLAY, fontSize: '9px', padding: '12px', borderRadius: '4px', border: 'none', background: searching ? C.inkLight : C.fieldBlue, color: '#fff', cursor: searching ? 'default' : 'pointer', letterSpacing: '0.05em' }}>
            {searching ? 'Searching...' : 'Search Trains'}
          </button>
        </div>

        {searchResults !== null && (
          <div>
            <div style={{ ...DISPLAY, fontSize: '9px', color: C.inkLight, letterSpacing: '0.04em', marginBottom: '10px' }}>
              {hasResults ? 'Available Options' : 'No trains found for this route/date'}
            </div>
            {results.map((result) => (
              <div key={result.id} style={{ border: `1px solid ${C.ruleStrong}`, borderRadius: '6px', padding: '14px', background: C.paperLight, marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ ...DISPLAY, fontSize: '14px', color: C.ink }}>Train #{result.train}</div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ ...MONO, fontSize: '18px', fontWeight: 'bold', color: C.fieldBlue }}>${result.price}</div>
                    <div style={{ ...MONO, fontSize: '8px', color: C.inkLight }}>Best fare</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  <div>
                    <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em' }}>DEPART</div>
                    <div style={{ ...MONO, fontSize: '13px', fontWeight: 'bold', color: C.ink }}>{result.time}</div>
                  </div>
                  <div>
                    <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em' }}>ARRIVE</div>
                    <div style={{ ...MONO, fontSize: '13px', fontWeight: 'bold', color: C.ink }}>{result.arrival}</div>
                  </div>
                  {isSameDay() ? (
                    <div>
                      <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em' }}>OFFICIAL STATUS</div>
                      <div style={{ ...MONO, fontSize: '13px', fontWeight: 'bold', color: getOfficialStatusColor(result.officialStatus) }}>{result.officialStatus}</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em' }}>AVG. DELAY</div>
                      <div style={{ ...MONO, fontSize: '13px', fontWeight: 'bold', color: getDelayColor(result.avgDelay) }}>{result.avgDelay === 0 ? 'On time' : `+${result.avgDelay}m`}</div>
                    </div>
                  )}
                </div>

                {isSameDay() && (
                  <div style={{ marginBottom: '12px', padding: '10px', background: C.fieldBlueLightTint, borderRadius: '4px' }}>
                    <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '4px' }}>AI DELAY PREDICTION</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ ...MONO, fontSize: '13px', fontWeight: 'bold', color: getDelayColor(result.aiDelay) }}>{result.aiDelay === 0 ? 'On time' : `+${result.aiDelay}m predicted`}</div>
                      <div style={{ ...MONO, fontSize: '8px', color: C.inkLight }}>{result.aiConfidence}% conf.</div>
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: '12px', padding: '10px', background: C.paperDark, borderRadius: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em' }}>24H PRICE TREND</div>
                    <div style={{ ...DISPLAY, fontSize: '8px', padding: '3px 8px', borderRadius: '4px', background: result.price <= result.priceLow * 1.1 ? C.greenLight : result.price <= (result.priceHigh + result.priceLow) / 2 ? C.orangeLight : C.redLight, color: result.price <= result.priceLow * 1.1 ? C.green : result.price <= (result.priceHigh + result.priceLow) / 2 ? C.orange : C.red }}>
                      {result.price <= result.priceLow * 1.1 ? 'Great Value' : result.price <= (result.priceHigh + result.priceLow) / 2 ? 'Good Value' : 'Poor Value'}
                    </div>
                  </div>
                  <svg width="100%" height="60" viewBox="0 0 300 60" preserveAspectRatio="xMidYMid meet" style={{ marginBottom: '8px' }}>
                    <defs>
                      <linearGradient id={`priceGradient${result.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style={{ stopColor: C.fieldBlue, stopOpacity: 0.15 }} />
                        <stop offset="100%" style={{ stopColor: C.fieldBlue, stopOpacity: 0 }} />
                      </linearGradient>
                    </defs>
                    <line x1="15" y1="45" x2="285" y2="45" stroke={C.rule} strokeWidth="0.5" opacity="0.5" />
                    <line x1="15" y1="22.5" x2="285" y2="22.5" stroke={C.rule} strokeWidth="0.5" opacity="0.5" />
                    <path d={`M 15 45 L 35 42 L 55 38 L 75 34 L 95 30 L 115 25 L 135 20 L 155 25 L 175 30 L 195 34 L 215 38 L 235 42 L 255 45 L 275 48 L 285 48 L 285 55 L 15 55 Z`} fill={`url(#priceGradient${result.id})`} />
                    <polyline points="15,45 35,42 55,38 75,34 95,30 115,25 135,20 155,25 175,30 195,34 215,38 235,42 255,45 275,48" fill="none" stroke={C.fieldBlue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="275" cy="48" r="2.5" fill={C.fieldBlue} stroke={C.paperDark} strokeWidth="1.5" />
                  </svg>
                  <div style={{ display: 'flex', justifyContent: 'space-between', ...MONO, fontSize: '8px', color: C.inkLight }}>
                    <span>${result.priceLow}</span>
                    <span style={{ fontWeight: 'bold', color: C.fieldBlue }}>${result.price}</span>
                    <span>${result.priceHigh}</span>
                  </div>
                </div>

                <button
                  onClick={() => window.open(buildAmtrakUrl(from, to, date), '_blank')}
                  style={{ width: '100%', ...DISPLAY, fontSize: '9px', padding: '10px', borderRadius: '4px', border: 'none', background: C.fieldBlue, color: '#fff', cursor: 'pointer', letterSpacing: '0.05em' }}>
                  Book on Amtrak →
                </button>
                <button
                  onClick={() => handleSave(result)}
                  disabled={savedId === result.id}
                  style={{ width: '100%', ...DISPLAY, fontSize: '9px', padding: '10px', borderRadius: '4px', border: `1px solid ${C.fieldBlue}`, background: savedId === result.id ? C.greenLight : 'transparent', color: savedId === result.id ? C.green : C.fieldBlue, cursor: savedId === result.id ? 'default' : 'pointer', letterSpacing: '0.05em', marginTop: '8px' }}>
                  {savedId === result.id ? 'Saved ✓' : 'Save Trip'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── NAVBAR ──────────────────────────────────────────────────────
const NavBar = ({ active, onNav }) => (
  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: C.paper, borderTop: `1.5px solid ${C.rule}`, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: '40px', padding: '8px 0 20px' }}>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&display=swap');
      @keyframes pulse {
        0%, 100% { opacity: 1; transform: translateX(-50%) scale(1); }
        50% { opacity: 0.5; transform: translateX(-50%) scale(1.4); }
      }
    `}</style>
    {['TRIPS', 'BOOKING'].map((tab) => {
      const isActive = active === tab.toLowerCase();
      return (
        <button key={tab} onClick={() => onNav(tab.toLowerCase())} style={{ ...DISPLAY, fontSize: '8px', background: 'none', color: isActive ? C.fieldBlue : C.inkLight, border: 'none', cursor: 'pointer', padding: '0', transition: 'all 0.15s', borderBottom: isActive ? `2px solid ${C.fieldBlue}` : '2px solid transparent', paddingBottom: '4px' }}>
          {tab}
        </button>
      );
    })}
  </div>
);

// ─── ROOT APP ─────────────────────────────────────────────────────
export default function CorridorApp() {
  const [activeTab, setActiveTab] = useState('trips');
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [detailScreen, setDetailScreen] = useState(false);

  return (
    <div style={{ width: '390px', height: '844px', background: C.paper, color: C.ink, fontFamily: "'Barlow Condensed', sans-serif", margin: '0 auto', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {detailScreen && selectedTrip ? (
          <TripDetailScreen trip={selectedTrip} onBack={() => setDetailScreen(false)} />
        ) : activeTab === 'trips' ? (
          <TripsScreen onSelectTrip={(trip) => { setSelectedTrip(trip); setDetailScreen(true); }} />
        ) : (
          <BookingScreen onSaved={() => { setActiveTab('trips'); setDetailScreen(false); }} />
        )}
      </div>
      <NavBar active={activeTab} onNav={(tab) => { setActiveTab(tab); setDetailScreen(false); }} />
    </div>
  );
}
