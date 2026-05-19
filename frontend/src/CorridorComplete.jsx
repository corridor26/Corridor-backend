import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = 'https://corridor-backend-production.up.railway.app';

// ─── DESIGN TOKENS ────────────────────────────────────────────────
const C = {
  paper: '#f5f2eb',
  paperDark: '#ece8df',
  paperLight: '#faf8f3',
  cardBg: '#fafbfd',
  ink: '#1e3a6e',
  inkMid: '#3d5585',
  inkLight: '#8a9db8',
  fieldBlue: '#1a5c9e',
  fieldBlueDark: '#124480',
  fieldBlueLightTint: '#e4eef8',
  green: '#1a4d2a',
  greenLight: '#e4f0e8',
  successGreen: '#16a34a',
  amber: '#f59e0b',
  amberLight: '#fef3c7',
  orange: '#7a3800',
  orangeLight: '#f2e8d8',
  red: '#b01818',
  redLight: '#f7e4e4',
  dangerRed: '#dc2626',
  chevronRed: '#d32f2f',
  rule: '#d8d0c4',
  ruleLight: '#e0dcd5',
  ruleStrong: '#8a9db8',
};

const DISPLAY = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' };
const BODY = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, lineHeight: 1.6 };
const MONO = { fontFamily: "'Courier New', monospace" };
const ITALIC = { fontFamily: "'Georgia', serif", fontStyle: 'italic' };

// ─── STATIONS (NEC + Acela only) ──────────────────────────────────
const STATIONS = [
  { code: 'ABE', name: 'Aberdeen, MD' },
  { code: 'BAL', name: 'Baltimore Penn Station, MD' },
  { code: 'BOS', name: 'Boston South Station, MA' },
  { code: 'BRP', name: 'Bridgeport, CT' },
  { code: 'BWI', name: 'BWI Airport, MD' },
  { code: 'CWH', name: 'Cornwells Heights, PA' },
  { code: 'MET', name: 'Metropark, NJ' },
  { code: 'MYS', name: 'Mystic, CT' },
  { code: 'NCR', name: 'New Carrollton, MD' },
  { code: 'NHV', name: 'New Haven, CT' },
  { code: 'NLC', name: 'New London, CT' },
  { code: 'NRO', name: 'New Rochelle, NY' },
  { code: 'NWK', name: 'Newark Penn Station, NJ' },
  { code: 'NYP', name: 'New York Penn Station, NY' },
  { code: 'OSB', name: 'Old Saybrook, CT' },
  { code: 'PHL', name: 'Philadelphia 30th Street, PA' },
  { code: 'PVD', name: 'Providence, RI' },
  { code: 'RTE', name: 'Route 128, MA' },
  { code: 'STM', name: 'Stamford, CT' },
  { code: 'TRE', name: 'Trenton, NJ' },
  { code: 'WAS', name: 'Washington Union Station, DC' },
  { code: 'WIL', name: 'Wilmington, DE' },
  { code: 'WLY', name: 'Westerly, RI' },
].sort((a, b) => a.code.localeCompare(b.code));

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

const tomorrowStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
};

const getStationName = (code) => STATIONS.find(s => s.code === code)?.name || code;

const getCountdown = (rawDate, departure) => {
  if (!rawDate || !departure) return null;
  try {
    const [h, mAmPm] = departure.split(':');
    const parts = mAmPm ? mAmPm.match(/(\d+)\s*(AM|PM)?/i) : null;
    const mins = parts ? parseInt(parts[1]) : 0;
    const ampm = parts && parts[2] ? parts[2].toUpperCase() : null;
    let hours = parseInt(h);
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    const depDate = new Date(`${rawDate}T${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}:00`);
    const now = new Date();
    const diff = depDate - now;
    if (diff <= 0) return null;
    const totalMins = Math.floor(diff / 60000);
    const hr = Math.floor(totalMins / 60);
    const mn = totalMins % 60;
    if (hr > 0) return `${hr}h ${mn}m`;
    return `${mn}m`;
  } catch {
    return null;
  }
};

const buildAmtrakUrl = (fromCode, toCode, dateStr) => {
  const [year, month, day] = dateStr.split('-');
  return `https://www.amtrak.com/booking/journey-stops.html?fromStationCode=${fromCode}&toStationCode=${toCode}&departDate=${month}/${day}/${year}&numberOfAdults=1`;
};

// ─── SKELETON CARD ────────────────────────────────────────────────
const SkeletonCard = () => (
  <div style={{ border: `1px solid ${C.rule}`, borderRadius: '6px', overflow: 'hidden', height: '90px' }} className="shimmer" />
);

// ─── STATION SELECT ───────────────────────────────────────────────
const StationSelect = ({ value, onChange, label, exclude }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const inputRef = useRef(null);

  const selected = STATIONS.find(s => s.code === value);
  const displayText = selected ? `${selected.code} (${selected.name})` : value;

  const filtered = STATIONS.filter(s => {
    if (exclude && s.code === exclude) return false;
    const q = query.toLowerCase();
    return s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
  });

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
    }
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {label && <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '6px' }}>{label}</div>}
      <div
        onClick={() => { setOpen(!open); setQuery(''); }}
        style={{
          width: '100%', ...MONO, fontSize: '11px', fontWeight: 'bold',
          padding: '8px 10px', borderRadius: '6px',
          border: `1px solid ${C.rule}`, background: C.paperDark, color: C.ink,
          cursor: 'pointer', boxSizing: 'border-box', userSelect: 'none',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {displayText}
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: C.paperLight, border: `1px solid ${C.rule}`, borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', marginTop: '2px',
          maxHeight: '220px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '6px 8px', borderBottom: `1px solid ${C.rule}` }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search stations..."
              style={{
                width: '100%', ...MONO, fontSize: '11px', padding: '6px 8px',
                border: `1px solid ${C.rule}`, borderRadius: '4px',
                background: C.paper, color: C.ink, boxSizing: 'border-box', outline: 'none',
              }}
              onFocus={e => { e.target.style.borderColor = C.fieldBlue; }}
              onBlur={e => { e.target.style.borderColor = C.rule; }}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '12px', ...MONO, fontSize: '10px', color: C.inkLight, textAlign: 'center' }}>No stations found</div>
            ) : filtered.map(s => (
              <div
                key={s.code}
                onMouseDown={(e) => { e.preventDefault(); onChange(s.code); setOpen(false); setQuery(''); }}
                style={{
                  padding: '8px 10px', cursor: 'pointer',
                  background: s.code === value ? C.fieldBlueLightTint : 'transparent',
                  borderBottom: `1px solid ${C.ruleLight}`,
                  display: 'flex', gap: '8px', alignItems: 'center',
                }}
                onMouseEnter={e => { if (s.code !== value) e.currentTarget.style.background = C.paperDark; }}
                onMouseLeave={e => { if (s.code !== value) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ ...MONO, fontSize: '11px', fontWeight: 'bold', color: C.fieldBlue, minWidth: '32px' }}>{s.code}</span>
                <span style={{ ...BODY, fontSize: '10px', color: C.ink }}>{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── LOGO ────────────────────────────────────────────────────────
const LogoMark = ({ white = false }) => (
  <svg width="32" height="16" viewBox="0 0 80 40" style={{ marginRight: '8px' }}>
    <path d="M 0 0 L 32 20 L 0 40 L 11 40 L 43 20 L 11 0 Z" fill={C.chevronRed} />
    <rect x="16" y="10" width="64" height="7" fill={white ? '#fff' : C.fieldBlue} />
    <rect x="16" y="23" width="64" height="7" fill={white ? '#fff' : C.fieldBlue} />
  </svg>
);

const Logo = ({ white = false }) => (
  <div style={{ display: 'flex', alignItems: 'center' }}>
    <LogoMark white={white} />
    <div style={{ ...DISPLAY, fontSize: '16px', color: white ? '#fff' : C.ink, letterSpacing: '0.05em', lineHeight: 1 }}>Corridor</div>
  </div>
);

// ─── SCREEN HEADER ───────────────────────────────────────────────
const ScreenHeader = ({ subtitle, isPrimary = true, rightContent }) => (
  <div style={{ background: C.fieldBlue, padding: '28px 18px 10px', flexShrink: 0 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Logo white />
      {rightContent}
    </div>
    {subtitle && <div style={{ ...MONO, fontSize: '8px', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.15em', marginTop: '4px' }}>{subtitle}</div>}
    <div style={{ height: '2px', background: C.chevronRed, marginTop: '10px', marginLeft: '-18px', marginRight: '-18px' }} />
  </div>
);

// ─── STATUS BADGE ────────────────────────────────────────────────
const StatusBadge = ({ label, type }) => {
  const styles = {
    'ON TIME':   { bg: C.greenLight,  text: C.green  },
    'DELAYED':   { bg: C.orangeLight, text: C.orange },
    'CANCELLED': { bg: C.redLight,    text: C.red    },
  };
  const s = styles[label] || styles['ON TIME'];
  return (
    <div style={{
      ...DISPLAY,
      fontSize: '9px',
      letterSpacing: '0.06em',
      background: s.bg,
      color: s.text,
      border: `1.5px solid ${s.text}`,
      borderRadius: '4px',
      padding: '3px 8px',
      display: 'inline-block',
      fontWeight: 800,
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
      <div style={{
        position: 'absolute',
        left: `${progress * 100}%`,
        width: '10px', height: '10px',
        borderRadius: '50%',
        background: C.fieldBlue,
        border: `2px solid ${C.paperLight}`,
        transform: 'translateX(-50%)',
        animation: 'pulse 2.5s ease-in-out infinite',
      }} />
    )}
    {progress === 0 && (
      <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', ...MONO, fontSize: '8px', color: C.inkLight, letterSpacing: '0.1em' }}>– – –</div>
    )}
  </div>
);

// ─── TRIP CARD ───────────────────────────────────────────────────
const TripCard = ({ trip, onClick, onDelete, isNext, index = 0 }) => {
  const [hovered, setHovered] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiped, setIsSwiped] = useState(false);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const cardRef = useRef(null);

  const accentColor = trip.statusType === 'ontime' ? C.fieldBlue : trip.statusType === 'cancelled' ? C.red : C.orange;
  const bg = hovered && swipeX === 0 ? '#f5f3f0' : C.cardBg;

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0) {
      const newX = Math.max(dx, -80);
      setSwipeX(newX);
      if (Math.abs(newX) > 5) e.preventDefault();
    } else if (isSwiped) {
      setSwipeX(Math.min(0, -80 + dx));
    }
  };

  const handleTouchEnd = () => {
    if (swipeX < -60) {
      setSwipeX(-80);
      setIsSwiped(true);
    } else {
      setSwipeX(0);
      setIsSwiped(false);
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const handleCardClick = () => {
    if (isSwiped) {
      setSwipeX(0);
      setIsSwiped(false);
    } else {
      onClick();
    }
  };

  const todayStr = today();
  const tomorrowS = tomorrowStr();
  let showBadge = false;
  let badgeSuffix = '';
  if (trip.rawDate === todayStr) { showBadge = true; badgeSuffix = ''; }
  else if (trip.rawDate === tomorrowS) { showBadge = true; badgeSuffix = ' (PRED.)'; }

  const countdown = isNext ? getCountdown(trip.rawDate, trip.departure) : null;

  return (
    <div style={{ position: 'relative' }} className="card-enter" style={{ animationDelay: `${index * 60}ms` }}>
      {isNext && (
        <div style={{
          background: C.fieldBlue, color: '#fff', padding: '6px 12px',
          ...MONO, fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.1em',
          borderRadius: '4px 4px 0 0',
        }}>
          NEXT TRIP{countdown ? ` · Departs in ${countdown}` : ''}
        </div>
      )}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: isNext ? '0 0 6px 6px' : '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        {/* Delete zone */}
        <div
          style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: '80px',
            background: C.dangerRed, display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 0,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete && onDelete(trip.id); }}
        >
          <div style={{ color: '#fff', ...MONO, fontSize: '9px', textAlign: 'center', letterSpacing: '0.1em' }}>
            <div style={{ fontSize: '18px', marginBottom: '2px' }}>✕</div>
            DELETE
          </div>
        </div>

        {/* Card content */}
        <div
          ref={cardRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleCardClick}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            position: 'relative', zIndex: 1,
            transform: `translateX(${swipeX}px)`,
            transition: touchStartX.current ? 'none' : 'transform 0.25s ease, background 0.15s',
            border: `1px solid ${C.ruleStrong}`,
            borderLeft: `4px solid ${accentColor}`,
            borderRadius: isNext ? '0 0 6px 6px' : '6px',
            cursor: 'pointer',
            background: bg,
            touchAction: 'pan-y',
          }}
        >
          {/* Header row */}
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.ruleLight}`, background: bg }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ ...DISPLAY, fontSize: '18px', color: C.ink }}>{trip.trainName}</span>
                  <span style={{ ...MONO, fontSize: '12px', color: C.inkLight }}>{trip.number}</span>
                </div>
                <div style={{ ...ITALIC, fontSize: '9px', color: C.inkLight, marginTop: '4px' }}>{trip.date}</div>
              </div>
              {showBadge && (
                <StatusBadge
                  label={trip.statusLabel + badgeSuffix}
                  type={trip.statusType}
                />
              )}
            </div>
          </div>

          {/* Times row */}
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.ruleLight}`, background: bg }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ minWidth: '50px' }}>
                <div style={{ ...MONO, fontSize: '22px', fontWeight: 'bold', color: C.ink }}>{trip.departure}</div>
                <div style={{ ...BODY, fontSize: '12px', color: C.inkMid, marginTop: '2px' }}>{trip.fromCode}</div>
              </div>
              <div style={{ flex: 1 }}>
                <TripProgressBar progress={trip.progress} />
              </div>
              <div style={{ minWidth: '50px', textAlign: 'right' }}>
                <div style={{ ...MONO, fontSize: '22px', fontWeight: 'bold', color: trip.statusType === 'cancelled' ? C.red : C.ink }}>{trip.arrival}</div>
                <div style={{ ...BODY, fontSize: '12px', color: C.inkMid, marginTop: '2px' }}>{trip.toCode}</div>
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: C.paperDark, borderBottom: `1px solid ${C.ruleLight}` }}>
            <div style={{ padding: '10px 12px', borderRight: `1px solid ${C.ruleLight}` }}>
              <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '5px' }}>TRACK</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: trip.trackStatus === 'confirmed' ? C.successGreen : C.amber }} />
                <div style={{ ...MONO, fontSize: '14px', fontWeight: 'bold', color: C.ink }}>{trip.track}</div>
              </div>
              <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, marginTop: '2px' }}>
                {trip.trackStatus === 'confirmed' ? 'Confirmed' : 'TBD'}
              </div>
            </div>
            <div style={{ padding: '10px 12px', borderRight: `1px solid ${C.ruleLight}` }}>
              <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '5px' }}>AI DELAY</div>
              <div style={{ ...MONO, fontSize: '14px', fontWeight: 'bold', color: (trip.aiDelay || 0) > 0 ? C.orange : C.successGreen }}>
                {(trip.aiDelay || 0) === 0 ? 'On time' : `+${trip.aiDelay}m`}
              </div>
              <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, marginTop: '2px' }}>{trip.aiConfidence || 72}% conf.</div>
            </div>
            <div style={{ padding: '10px 12px' }}>
              <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '5px' }}>EN ROUTE</div>
              <div style={{ ...BODY, fontSize: '10px', color: C.ink, lineHeight: 1.2 }}>
                {trip.currentLocation ? trip.currentLocation.split(',')[0] : '—'}
              </div>
              <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, marginTop: '2px' }}>
                {trip.currentLocation ? 'Live' : 'Not started'}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: '8px 14px', background: trip.statusType === 'cancelled' ? C.redLight : bg, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: (trip.recentAvgDelay || 0) > 10 ? C.orange : C.successGreen, flexShrink: 0 }} />
            <div style={{ ...MONO, fontSize: '9px', color: C.inkMid, flex: 1 }}>
              {trip.statusType === 'cancelled' ? 'Train cancelled · 3 alternatives' : `+${trip.recentAvgDelay || 0} min avg · ${trip.direction || ''}`}
            </div>
            <div style={{ ...MONO, fontSize: '8px', color: C.inkLight }}>Past 3h</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── SCREEN: TRIPS ───────────────────────────────────────────────
const TripsScreen = ({ onSelectTrip, addToast }) => {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [pullY, setPullY] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const scrollRef = useRef(null);
  const pullStartY = useRef(null);

  const fetchTrips = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/trips`);
      const data = await res.json();
      const seen = new Set();
      const deduped = data.filter(t => {
        const key = `${t.trainNumber}-${t.date}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const mapped = deduped.map(t => ({
        ...t,
        trainName: getTrainName(t.trainNumber),
        number: t.trainNumber,
        rawDate: t.date,
        date: formatDate(t.date),
        aiConfidence: t.aiConfidence || 72,
      }));
      setTrips(mapped);
      setLastUpdated(new Date());
    } catch {
      addToast && addToast('Could not load trips', 'error');
    }
    setLoading(false);
  }, [addToast]);

  useEffect(() => { fetchTrips(); }, [fetchTrips]);

  // Pull-to-refresh
  const handleScrollTouchStart = (e) => {
    if (scrollRef.current && scrollRef.current.scrollTop === 0) {
      pullStartY.current = e.touches[0].clientY;
    }
  };
  const handleScrollTouchMove = (e) => {
    if (pullStartY.current === null) return;
    const dy = e.touches[0].clientY - pullStartY.current;
    if (dy > 0) {
      setPullY(Math.min(dy, 80));
      setIsPulling(dy > 40);
    }
  };
  const handleScrollTouchEnd = () => {
    if (isPulling) {
      fetchTrips();
    }
    setPullY(0);
    setIsPulling(false);
    pullStartY.current = null;
  };

  const todayStr = today();
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);

  const filteredTrips = trips.filter(t => {
    if (filter === 'today') return t.rawDate === todayStr;
    if (filter === 'week') {
      const d = new Date(t.rawDate + 'T00:00:00');
      return d >= new Date(todayStr + 'T00:00:00') && d <= weekEnd;
    }
    if (filter === 'delayed') return t.statusType === 'delayed' || (t.aiDelay || 0) > 0;
    return true;
  });

  // Next trip
  const now = new Date();
  let nextTripId = null;
  let closestDiff = Infinity;
  trips.forEach(t => {
    if (!t.departure || !t.rawDate) return;
    const countdown = getCountdown(t.rawDate, t.departure);
    if (!countdown) return;
    try {
      const [h, mAmPm] = t.departure.split(':');
      const parts = mAmPm ? mAmPm.match(/(\d+)\s*(AM|PM)?/i) : null;
      const mins = parts ? parseInt(parts[1]) : 0;
      const ampm = parts && parts[2] ? parts[2].toUpperCase() : null;
      let hours = parseInt(h);
      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      const depDate = new Date(`${t.rawDate}T${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}:00`);
      const diff = depDate - now;
      if (diff > 0 && diff < closestDiff) {
        closestDiff = diff;
        nextTripId = t.id;
      }
    } catch {}
  });

  const handleDelete = async (id) => {
    const tripToDelete = trips.find(t => t.id === id);
    setTrips(prev => prev.filter(t => t.id !== id));
    try {
      await fetch(`${API_BASE}/api/trips/${id}`, { method: 'DELETE' });
      addToast && addToast('Trip deleted', 'info', async () => {
        if (!tripToDelete) return;
        try {
          await fetch(`${API_BASE}/api/trips`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              trainNumber: tripToDelete.number || tripToDelete.trainNumber,
              origin: tripToDelete.fromCode,
              destination: tripToDelete.toCode,
              departureDate: tripToDelete.rawDate,
              departureTime: tripToDelete.departure,
              arrivalTime: tripToDelete.arrival,
            }),
          });
          fetchTrips();
        } catch {}
      });
    } catch {
      setTrips(prev => [...prev, tripToDelete]);
      addToast && addToast('Failed to delete trip', 'error');
    }
  };

  const lastUpdatedText = lastUpdated ? (() => {
    const diff = Math.floor((new Date() - lastUpdated) / 60000);
    if (diff < 1) return 'Just now';
    return `${diff} min ago`;
  })() : null;

  const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'This Week' },
    { id: 'delayed', label: 'Delayed Only' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.paper }}>
      <ScreenHeader subtitle="UPCOMING TRIPS" isPrimary />

      {/* Filter chips */}
      <div style={{ padding: '10px 16px 0', display: 'flex', gap: '6px', flexWrap: 'nowrap', overflowX: 'auto', flexShrink: 0 }}>
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              ...MONO, fontSize: '9px', fontWeight: 'bold', padding: '5px 12px',
              borderRadius: '20px', border: 'none', cursor: 'pointer', flexShrink: 0,
              background: filter === f.id ? C.fieldBlue : C.paperDark,
              color: filter === f.id ? '#fff' : C.inkMid,
              transition: 'all 0.15s',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        onTouchStart={handleScrollTouchStart}
        onTouchMove={handleScrollTouchMove}
        onTouchEnd={handleScrollTouchEnd}
        style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '100px' }}
      >
        {isPulling && (
          <div style={{ textAlign: 'center', padding: '8px', ...MONO, fontSize: '9px', color: C.inkLight }}>
            Release to refresh...
          </div>
        )}

        {loading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {!loading && filteredTrips.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', gap: '12px' }}>
            <svg width="80" height="60" viewBox="0 0 80 60" fill="none">
              <rect x="5" y="25" width="70" height="20" rx="4" fill={C.paperDark} stroke={C.rule} strokeWidth="1.5" />
              <rect x="10" y="30" width="12" height="10" rx="2" fill={C.fieldBlueLightTint} stroke={C.ruleStrong} strokeWidth="1" />
              <rect x="25" y="30" width="12" height="10" rx="2" fill={C.fieldBlueLightTint} stroke={C.ruleStrong} strokeWidth="1" />
              <rect x="40" y="30" width="12" height="10" rx="2" fill={C.fieldBlueLightTint} stroke={C.ruleStrong} strokeWidth="1" />
              <rect x="2" y="21" width="8" height="8" rx="1" fill={C.chevronRed} />
              <circle cx="18" cy="47" r="4" fill={C.inkMid} />
              <circle cx="62" cy="47" r="4" fill={C.inkMid} />
              <line x1="0" y1="45" x2="80" y2="45" stroke={C.rule} strokeWidth="1.5" />
              <line x1="10" y1="45" x2="10" y2="52" stroke={C.rule} strokeWidth="1.5" />
              <line x1="25" y1="45" x2="25" y2="52" stroke={C.rule} strokeWidth="1.5" />
              <line x1="40" y1="45" x2="40" y2="52" stroke={C.rule} strokeWidth="1.5" />
              <line x1="55" y1="45" x2="55" y2="52" stroke={C.rule} strokeWidth="1.5" />
              <line x1="70" y1="45" x2="70" y2="52" stroke={C.rule} strokeWidth="1.5" />
            </svg>
            <div style={{ ...DISPLAY, fontSize: '13px', color: C.inkMid, textAlign: 'center' }}>Your trips will appear here</div>
            <div style={{ ...MONO, fontSize: '10px', color: C.inkLight, textAlign: 'center' }}>Search trains to get started →</div>
          </div>
        )}

        {!loading && filteredTrips.map((trip, idx) => (
          <TripCard
            key={trip.id}
            trip={trip}
            index={idx}
            onClick={() => onSelectTrip(trip)}
            onDelete={handleDelete}
            isNext={trip.id === nextTripId}
          />
        ))}

        {lastUpdatedText && !loading && (
          <div style={{ ...MONO, fontSize: '8px', color: C.inkLight, textAlign: 'center', paddingTop: '4px' }}>
            Last updated: {lastUpdatedText}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        className="no-scale"
        onClick={() => {}}
        style={{
          position: 'absolute', bottom: '90px', right: '16px',
          width: '56px', height: '56px', borderRadius: '50%',
          background: C.fieldBlue, border: 'none', color: '#fff',
          fontSize: '24px', cursor: 'pointer', lineHeight: 1,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10,
        }}
      >
        +
      </button>
    </div>
  );
};

// ─── SCREEN: TRIP DETAIL ─────────────────────────────────────────
const TripDetailScreen = ({ trip, onBack, addToast }) => {
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

  const handleShare = () => {
    const url = buildAmtrakUrl(trip.fromCode, trip.toCode, trip.rawDate || today());
    if (navigator.share) {
      navigator.share({ title: `${d.trainName} #${d.number}`, url }).catch(() => {});
    } else {
      navigator.clipboard && navigator.clipboard.writeText(url);
      addToast && addToast('Link copied to clipboard', 'success');
    }
  };

  const handleAddToCalendar = () => {
    const rawDate = trip.rawDate || today();
    const gcUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${d.trainName} #${d.number} ${d.fromCode}→${d.toCode}`)}&dates=${rawDate.replace(/-/g,'')}/${rawDate.replace(/-/g,'')}&details=${encodeURIComponent(buildAmtrakUrl(trip.fromCode, trip.toCode, rawDate))}`;
    window.open(gcUrl, '_blank');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.paper }}>
      <div style={{ background: C.fieldBlue, padding: '28px 18px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', ...MONO, fontSize: '10px', padding: 0 }}>← Back</button>
          <button
            onClick={handleShare}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', cursor: 'pointer', ...MONO, fontSize: '9px', padding: '5px 10px', borderRadius: '4px' }}
          >
            Share
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div>
            <div style={{ ...DISPLAY, fontSize: '22px', color: '#fff' }}>{d.trainName} #{d.number}</div>
            <div style={{ ...MONO, fontSize: '8px', color: 'rgba(255,255,255,0.6)', marginTop: '3px' }}>{d.fromCode} → {d.toCode}</div>
          </div>
          <StatusBadge label={d.statusLabel || 'ON TIME'} type={d.statusType} />
        </div>
        <div style={{ height: '2px', background: C.chevronRed, marginLeft: '-18px', marginRight: '-18px' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '80px' }}>
        {/* Times */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ border: `1px solid ${C.ruleStrong}`, borderRadius: '6px', padding: '14px', background: C.paperLight, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '6px' }}>DEPARTURE</div>
            <div style={{ ...MONO, fontSize: '24px', fontWeight: 'bold', color: C.ink }}>{d.departure}</div>
            <div style={{ ...BODY, fontSize: '10px', color: C.inkMid, marginTop: '6px' }}>{d.fromName || getStationName(d.fromCode)}</div>
          </div>
          <div style={{ border: `1px solid ${C.ruleStrong}`, borderRadius: '6px', padding: '14px', background: C.paperLight, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '6px' }}>ARRIVAL</div>
            <div style={{ ...MONO, fontSize: '24px', fontWeight: 'bold', color: C.ink }}>{d.arrival}</div>
            <div style={{ ...BODY, fontSize: '10px', color: C.inkMid, marginTop: '6px' }}>{d.toName || getStationName(d.toCode)}</div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button
            onClick={handleAddToCalendar}
            style={{ ...MONO, fontSize: '9px', padding: '10px', borderRadius: '6px', border: `1px solid ${C.fieldBlue}`, background: 'transparent', color: C.fieldBlue, cursor: 'pointer' }}
          >
            + Add to Calendar
          </button>
          <button
            onClick={() => addToast && addToast('Price alerts coming soon', 'info')}
            style={{ ...MONO, fontSize: '9px', padding: '10px', borderRadius: '6px', border: `1px solid ${C.amber}`, background: 'transparent', color: C.orange, cursor: 'pointer' }}
          >
            Set Price Alert
          </button>
        </div>

        {/* AI Prediction */}
        <div style={{ border: `1px solid ${C.ruleStrong}`, borderLeft: `4px solid ${C.fieldBlue}`, borderRadius: '6px', padding: '18px', background: C.fieldBlueLightTint, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <div style={{ ...DISPLAY, fontSize: '9px', background: C.fieldBlue, color: '#fff', padding: '4px 8px', borderRadius: '4px' }}>AI</div>
            <div style={{ ...BODY, fontSize: '11px', color: C.fieldBlue, fontWeight: 600 }}>Predictive Delay Intelligence</div>
          </div>
          <div style={{ ...MONO, fontSize: '20px', fontWeight: 'bold', color: (d.aiDelay || 0) > 0 ? C.orange : C.successGreen, marginBottom: '8px' }}>
            {(d.aiDelay || 0) === 0 ? 'On time' : `+${d.aiDelay}m predicted`}
          </div>
          <div style={{ ...MONO, fontSize: '8px', color: C.inkLight, marginBottom: '8px' }}>{d.aiConfidence || 72}% confidence</div>
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

        {/* Route & Stops */}
        <div style={{ border: `1px solid ${C.ruleStrong}`, borderRadius: '6px', overflow: 'hidden', background: C.paperLight, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
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
                <div style={{ ...BODY, fontSize: '12px', color: C.ink }}>{stop.name}</div>
                <div style={{ ...MONO, fontSize: '8px', color: C.inkLight }}>{stop.code}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...MONO, fontSize: '12px', fontWeight: 'bold', color: C.ink }}>{stop.schTime}</div>
                {stop.actTime && <div style={{ ...MONO, fontSize: '8px', color: stop.actTime > stop.schTime ? C.orange : C.successGreen }}>{stop.actTime} actual</div>}
              </div>
            </div>
          ))}
        </div>

        {/* Delay Distribution */}
        <div style={{ border: `1px solid ${C.ruleStrong}`, borderRadius: '6px', padding: '14px', background: C.paperLight, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '12px' }}>TYPICAL DELAYS ON THIS ROUTE</div>
          {[
            { range: '<10 min',   percent: d.delayDistribution?.['<10min']   || 50, color: C.successGreen },
            { range: '10-30 min', percent: d.delayDistribution?.['10-30min'] || 25, color: C.orange },
            { range: '30+ min',   percent: d.delayDistribution?.['30+min']   || 25, color: C.red    },
          ].map((item, i) => (
            <div key={i} style={{ marginBottom: i < 2 ? '12px' : '0' }}>
              <div style={{ ...MONO, fontSize: '9px', color: C.ink, marginBottom: '5px' }}>{item.range}</div>
              <div style={{ position: 'relative', width: '100%', height: '14px', background: C.paperDark, borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${item.percent}%`, height: '100%', background: item.color, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '4px', boxSizing: 'border-box' }}>
                  {item.percent >= 15 && <span style={{ ...MONO, fontSize: '7px', color: '#fff', fontWeight: 'bold' }}>{item.percent}%</span>}
                </div>
                {item.percent < 15 && (
                  <span style={{ position: 'absolute', left: `${item.percent + 2}%`, top: '50%', transform: 'translateY(-50%)', ...MONO, fontSize: '7px', color: C.inkMid }}>{item.percent}%</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Recent Delays */}
        <div style={{ border: `1px solid ${C.ruleStrong}`, borderRadius: '6px', padding: '14px', background: C.paperLight, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '10px' }}>RECENT DELAYS (PAST 3H)</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ ...BODY, fontSize: '11px', color: C.ink }}>{d.direction || 'Southbound'} direction</div>
              <div style={{ ...MONO, fontSize: '8px', color: C.inkLight, marginTop: '3px' }}>4 trains sampled</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...MONO, fontSize: '18px', fontWeight: 'bold', color: (d.recentAvgDelay || 0) > 10 ? C.orange : C.successGreen }}>+{d.recentAvgDelay || 0} min</div>
              <div style={{ ...MONO, fontSize: '8px', color: C.inkLight, marginTop: '3px' }}>avg delay</div>
            </div>
          </div>
        </div>

        {/* Weather */}
        <div style={{ border: `1px solid ${C.ruleStrong}`, borderRadius: '6px', padding: '14px', background: C.paperLight, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
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
        <div style={{ border: `1px solid ${C.ruleStrong}`, borderRadius: '6px', padding: '14px', background: C.paperLight, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '12px' }}>FARE HISTORY (24H)</div>
          <svg width="100%" height="80" style={{ marginBottom: '12px', background: C.paperDark, borderRadius: '4px', padding: '8px 6px', boxSizing: 'border-box' }} viewBox="0 0 340 80" preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="priceGradientDetail" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style={{ stopColor: C.fieldBlue, stopOpacity: 0.1 }} />
                <stop offset="100%" style={{ stopColor: C.fieldBlue, stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            <line x1="10" y1="60" x2="330" y2="60" stroke={C.rule} strokeWidth="0.5" />
            <line x1="10" y1="40" x2="330" y2="40" stroke={C.rule} strokeWidth="0.5" opacity="0.5" />
            <line x1="10" y1="20" x2="330" y2="20" stroke={C.rule} strokeWidth="0.5" opacity="0.5" />
            <path d="M 10 60 L 35 55.4 L 60 50.8 L 85 46.2 L 110 41.5 L 135 36.9 L 160 32.3 L 185 36.9 L 210 41.5 L 235 46.2 L 260 50.8 L 285 55.4 L 310 58.5 L 330 58.5 L 330 70 L 10 70 Z" fill="url(#priceGradientDetail)" />
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
              <div style={{ ...MONO, fontSize: '14px', fontWeight: 'bold', color: C.successGreen }}>{detail?.low24h ? `$${detail.low24h}` : '—'}</div>
            </div>
          </div>
        </div>

        <button
          onClick={() => window.open(buildAmtrakUrl(trip.fromCode, trip.toCode, trip.rawDate || today()), '_blank')}
          className="book-btn"
          style={{ width: '100%', ...DISPLAY, fontSize: '9px', padding: '14px', borderRadius: '6px', border: 'none', background: C.fieldBlue, color: '#fff', cursor: 'pointer', letterSpacing: '0.06em' }}
        >
          Book on Amtrak <span style={{ fontSize: '1.2em' }}>→</span>
        </button>
      </div>
    </div>
  );
};

// ─── SCREEN: BOOKING ─────────────────────────────────────────────
const BookingScreen = ({ onSaved, addToast, searchState, setSearchState }) => {
  const { from, to, date, results: searchResults } = searchState;
  const setFrom = (v) => setSearchState(s => ({ ...s, from: v }));
  const setTo = (v) => setSearchState(s => ({ ...s, to: v }));
  const setDate = (v) => setSearchState(s => ({ ...s, date: v }));
  const setSearchResults = (v) => setSearchState(s => ({ ...s, results: v }));

  const [searching, setSearching] = useState(false);
  const [savedId, setSavedId] = useState(null);
  const [recentSearches, setRecentSearches] = useState(() => {
    try { return JSON.parse(localStorage.getItem('corridorRecentSearches') || '[]'); } catch { return []; }
  });

  const saveRecentSearch = (f, t, d) => {
    const entry = { from: f, to: t, date: d };
    const filtered = recentSearches.filter(r => !(r.from === f && r.to === t && r.date === d));
    const updated = [entry, ...filtered].slice(0, 3);
    setRecentSearches(updated);
    try { localStorage.setItem('corridorRecentSearches', JSON.stringify(updated)); } catch {}
  };

  const runSearch = async (f, t, d) => {
    setSearching(true);
    try {
      const res = await fetch(`${API_BASE}/api/search?origin=${f}&destination=${t}&date=${d}`);
      const data = await res.json();
      if (data.error) {
        addToast && addToast(data.error, 'error');
        setSearchResults([]);
        setSearching(false);
        return;
      }
      if (!Array.isArray(data) || data.length === 0) {
        setSearchResults([]);
        setSearching(false);
        return;
      }
      const mapped = data.map((r, i) => ({
        id: i + 1,
        time: r.time,
        arrival: r.arriveTime,
        price: r.price,
        train: r.train,
        avgDelay: r.delay ?? 0,
        officialStatus: (r.delay ?? 0) === 0 ? 'On time' : `+${r.delay}m delayed`,
        aiDelay: r.delay ?? 0,
        aiConfidence: r.aiConfidence || 75,
        priceHigh: Math.round(r.price * 1.2),
        priceLow: Math.round(r.price * 0.85),
      }));
      setSearchResults(mapped);
      saveRecentSearch(f, t, d);
    } catch {
      addToast && addToast('Network error — please try again', 'error');
      setSearchResults([]);
    }
    setSearching(false);
  };

  const handleSearch = () => runSearch(from, to, date);

  const handleRecentSearch = (r) => {
    setSearchState(s => ({ ...s, from: r.from, to: r.to, date: r.date }));
    runSearch(r.from, r.to, r.date);
  };

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
      addToast && addToast('Trip saved to your trips', 'success');
      setTimeout(() => setSavedId(null), 2000);
    } catch {
      addToast && addToast('Failed to save trip', 'error');
    }
  };

  const isSameDay = () => date === today();
  const getOfficialStatusColor = (status) => status === 'On time' ? C.successGreen : C.orange;
  const getDelayColor = (delay) => delay === 0 ? C.successGreen : delay <= 10 ? C.orange : C.red;

  const results = searchResults ?? [];
  const hasResults = results.length > 0;

  const formatRecentLabel = (r) => {
    const isToday = r.date === today();
    return `${r.from}→${r.to} · ${isToday ? 'Today' : r.date}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.paper }}>
      <ScreenHeader subtitle="SEARCH & BOOK" isPrimary />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '80px' }}>
        {/* Recent searches */}
        {recentSearches.length > 0 && (
          <div>
            <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '6px' }}>RECENT SEARCHES</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {recentSearches.map((r, i) => (
                <button
                  key={i}
                  onClick={() => handleRecentSearch(r)}
                  style={{ ...MONO, fontSize: '9px', padding: '5px 10px', borderRadius: '20px', border: `1px solid ${C.rule}`, background: C.paperDark, color: C.inkMid, cursor: 'pointer' }}
                >
                  {formatRecentLabel(r)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search form */}
        <div style={{ border: `1px solid ${C.ruleStrong}`, borderRadius: '6px', padding: '20px', background: C.paperLight, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ ...DISPLAY, fontSize: '11px', color: C.ink, marginBottom: '14px' }}>Find a Train</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '8px', marginBottom: '12px', alignItems: 'flex-end' }}>
            <StationSelect
              value={from}
              onChange={setFrom}
              label="FROM"
              exclude={to}
            />
            <button
              onClick={() => { setSearchState(s => ({ ...s, from: s.to, to: s.from })); }}
              title="Swap stations"
              style={{ background: 'none', border: 'none', ...MONO, fontSize: '16px', color: C.fieldBlue, cursor: 'pointer', padding: '0 4px', alignSelf: 'flex-end', paddingBottom: '8px' }}
            >
              ⇄
            </button>
            <StationSelect
              value={to}
              onChange={setTo}
              label="TO"
              exclude={from}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em', marginBottom: '6px' }}>DATE</div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ width: '100%', ...MONO, fontSize: '14px', fontWeight: 'bold', padding: '8px 10px', borderRadius: '6px', border: `1px solid ${C.rule}`, background: C.paperDark, color: C.ink, cursor: 'pointer', boxSizing: 'border-box' }}
            />
          </div>

          <button
            onClick={handleSearch}
            disabled={searching}
            className="book-btn"
            style={{ width: '100%', ...DISPLAY, fontSize: '9px', padding: '12px', borderRadius: '6px', border: 'none', background: searching ? C.inkLight : C.fieldBlue, color: '#fff', cursor: searching ? 'default' : 'pointer' }}
          >
            {searching ? 'Searching...' : 'Search Trains'}
          </button>
        </div>

        {/* Results */}
        {searchResults !== null && (
          <div>
            <div style={{ ...DISPLAY, fontSize: '9px', color: C.ink, marginBottom: '10px' }}>
              {hasResults ? `${results.length} Available Option${results.length !== 1 ? 's' : ''}` : 'No trains found'}
            </div>

            {!hasResults && (
              <div style={{ border: `1px solid ${C.rule}`, borderRadius: '6px', padding: '24px', background: C.paperLight, textAlign: 'center' }}>
                <div style={{ ...MONO, fontSize: '10px', color: C.inkLight, marginBottom: '8px' }}>No trains found for this route/date.</div>
                <div style={{ ...MONO, fontSize: '9px', color: C.inkLight }}>Try a different date or nearby station.</div>
              </div>
            )}

            {results.map((result) => {
              const isGoodValue = result.price <= (result.priceHigh + result.priceLow) / 2;
              const isSaved = savedId === result.id;
              return (
                <div key={result.id} style={{ border: `1px solid ${C.ruleStrong}`, borderRadius: '6px', padding: '14px', background: C.paperLight, marginBottom: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div style={{ ...DISPLAY, fontSize: '18px', color: C.ink }}>Train #{result.train}</div>
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
                        <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em' }}>STATUS</div>
                        <div style={{ ...MONO, fontSize: '11px', fontWeight: 'bold', color: getOfficialStatusColor(result.officialStatus) }}>{result.officialStatus}</div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ ...MONO, fontSize: '7px', color: C.inkLight, letterSpacing: '0.14em' }}>AVG. DELAY</div>
                        <div style={{ ...MONO, fontSize: '11px', fontWeight: 'bold', color: getDelayColor(result.avgDelay) }}>{result.avgDelay === 0 ? 'On time' : `+${result.avgDelay}m`}</div>
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
                      <div style={{ ...DISPLAY, fontSize: '8px', padding: '3px 8px', borderRadius: '4px', background: C.greenLight, color: C.successGreen }}>
                        {result.price <= result.priceLow * 1.1 ? 'Great Value' : isGoodValue ? 'Good Value' : 'Fair Value'}
                      </div>
                    </div>
                    <svg width="100%" height="80" viewBox="0 0 300 80" preserveAspectRatio="xMidYMid meet" style={{ marginBottom: '8px' }}>
                      <defs>
                        <linearGradient id={`priceGradient${result.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" style={{ stopColor: C.fieldBlue, stopOpacity: 0.15 }} />
                          <stop offset="100%" style={{ stopColor: C.fieldBlue, stopOpacity: 0 }} />
                        </linearGradient>
                      </defs>
                      <line x1="15" y1="65" x2="285" y2="65" stroke={C.rule} strokeWidth="0.5" opacity="0.5" />
                      <line x1="15" y1="40" x2="285" y2="40" stroke={C.rule} strokeWidth="0.5" opacity="0.5" />
                      <line x1="15" y1="15" x2="285" y2="15" stroke={C.rule} strokeWidth="0.5" opacity="0.5" />
                      <path d="M 15 65 L 35 60 L 55 54 L 75 48 L 95 42 L 115 35 L 135 28 L 155 35 L 175 42 L 195 48 L 215 54 L 235 60 L 255 65 L 275 68 L 285 68 L 285 75 L 15 75 Z" fill={`url(#priceGradient${result.id})`} />
                      <polyline points="15,65 35,60 55,54 75,48 95,42 115,35 135,28 155,35 175,42 195,48 215,54 235,60 255,65 275,68" fill="none" stroke={C.fieldBlue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="275" cy="68" r="2.5" fill={C.fieldBlue} stroke={C.paperDark} strokeWidth="1.5" />
                    </svg>
                    <div style={{ display: 'flex', justifyContent: 'space-between', ...MONO, fontSize: '8px', color: C.inkLight }}>
                      <span>${result.priceLow}</span>
                      <span style={{ fontWeight: 'bold', color: C.fieldBlue }}>${result.price}</span>
                      <span>${result.priceHigh}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => window.open(buildAmtrakUrl(from, to, date), '_blank')}
                    className="book-btn"
                    style={{ width: '100%', ...DISPLAY, fontSize: '9px', padding: '10px', borderRadius: '4px', border: 'none', background: C.fieldBlue, color: '#fff', cursor: 'pointer', letterSpacing: '0.06em', marginBottom: '6px' }}
                  >
                    Book on Amtrak <span style={{ fontSize: '1.2em' }}>→</span>
                  </button>
                  <button
                    onClick={() => !isSaved && handleSave(result)}
                    disabled={isSaved}
                    style={{
                      width: '100%', ...DISPLAY, fontSize: '9px', padding: '10px', borderRadius: '4px',
                      border: `1px solid ${isSaved ? C.successGreen : C.fieldBlue}`,
                      background: isSaved ? C.greenLight : 'transparent',
                      color: isSaved ? C.successGreen : C.fieldBlue,
                      cursor: isSaved ? 'default' : 'pointer', letterSpacing: '0.06em',
                      animation: isSaved ? 'checkmark 0.3s ease' : 'none',
                    }}
                  >
                    {isSaved ? '✓ Saved' : 'Save Trip'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── TOAST SYSTEM ─────────────────────────────────────────────────
const ToastContainer = ({ toasts, onRemove }) => (
  <div style={{ position: 'absolute', bottom: '80px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center', pointerEvents: 'none', width: '340px' }}>
    {toasts.map(toast => (
      <div
        key={toast.id}
        style={{
          background: toast.type === 'success' ? C.successGreen : toast.type === 'error' ? C.dangerRed : C.fieldBlue,
          color: '#fff', borderRadius: '24px', padding: '10px 18px',
          ...MONO, fontSize: '11px', fontWeight: 'bold',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          animation: 'slideUp 0.2s ease-out both',
          pointerEvents: 'auto',
          display: 'flex', alignItems: 'center', gap: '10px',
          maxWidth: '320px',
        }}
      >
        <span style={{ flex: 1 }}>{toast.message}</span>
        {toast.undoFn && (
          <button
            onClick={() => { toast.undoFn(); onRemove(toast.id); }}
            style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: '#fff', borderRadius: '12px', padding: '3px 10px', cursor: 'pointer', ...MONO, fontSize: '10px', fontWeight: 'bold' }}
          >
            Undo
          </button>
        )}
      </div>
    ))}
  </div>
);

// ─── NAVBAR ──────────────────────────────────────────────────────
const NavBar = ({ active, onNav }) => (
  <div style={{
    position: 'absolute', bottom: 0, left: 0, right: 0,
    background: 'rgba(245,242,235,0.85)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderTop: `1.5px solid ${C.rule}`,
    display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
    gap: '60px', padding: '12px 0 24px',
    zIndex: 100,
  }}>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&display=swap');
      @keyframes pulse { 0%, 100% { opacity:1; transform:translateX(-50%) scale(1); } 50% { opacity:0.5; transform:translateX(-50%) scale(1.4); } }
      @keyframes fadeInUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
      @keyframes shimmer { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }
      @keyframes slideUp { from { opacity:0; transform:translate(-50%, 10px); } to { opacity:1; transform:translate(-50%, 0); } }
      @keyframes checkmark { 0% { transform:scale(0.8); } 50% { transform:scale(1.1); } 100% { transform:scale(1); } }
      .card-enter { animation: fadeInUp 0.2s ease-out both; }
      .shimmer { background: linear-gradient(90deg, #f0eee8 25%, #e8e6e0 50%, #f0eee8 75%); background-size:200% 100%; animation:shimmer 1.5s infinite; }
      .book-btn:hover { background: #124480 !important; }
      .book-btn:active { transform: scale(0.97); }
      button:active:not(.no-scale) { transform: scale(0.97); }
      .corridor-select:focus { outline:none; border-color:#1a5c9e !important; box-shadow:0 0 0 2px rgba(26,92,158,0.2); }
    `}</style>
    {['TRIPS', 'BOOKING'].map((tab) => {
      const isActive = active === tab.toLowerCase();
      return (
        <button
          key={tab}
          onClick={() => onNav(tab.toLowerCase())}
          className="no-scale"
          style={{
            ...DISPLAY, fontSize: '8px', background: 'none',
            color: isActive ? C.fieldBlue : C.inkLight,
            border: 'none', cursor: 'pointer', padding: '0',
            transition: 'all 0.15s',
            borderBottom: isActive ? `2px solid ${C.fieldBlue}` : '2px solid transparent',
            paddingBottom: '4px',
          }}
        >
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
  const [toasts, setToasts] = useState([]);
  const [searchState, setSearchState] = useState({
    from: 'NYP',
    to: 'WAS',
    date: today(),
    results: null,
  });

  const addToast = useCallback((message, type = 'info', undoFn = null) => {
    const id = Date.now() + Math.random();
    setToasts(prev => {
      const next = [...prev, { id, message, type, undoFn }].slice(-2);
      return next;
    });
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <div style={{ width: '390px', height: '844px', background: C.paper, color: C.ink, fontFamily: "'Barlow Condensed', sans-serif", margin: '0 auto', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflowY: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {detailScreen && selectedTrip ? (
          <TripDetailScreen
            trip={selectedTrip}
            onBack={() => setDetailScreen(false)}
            addToast={addToast}
          />
        ) : activeTab === 'trips' ? (
          <TripsScreen
            onSelectTrip={(trip) => { setSelectedTrip(trip); setDetailScreen(true); }}
            addToast={addToast}
          />
        ) : (
          <BookingScreen
            onSaved={() => { setActiveTab('trips'); setDetailScreen(false); }}
            addToast={addToast}
            searchState={searchState}
            setSearchState={setSearchState}
          />
        )}
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </div>
      <NavBar
        active={activeTab}
        onNav={(tab) => { setActiveTab(tab); setDetailScreen(false); }}
      />
    </div>
  );
}
