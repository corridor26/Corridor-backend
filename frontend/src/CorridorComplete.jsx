import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = 'https://api.corridor-app.com';

// ─── DESIGN TOKENS ────────────────────────────────────────────────
const C = {
  paper: '#f5f2eb',
  paperDark: '#ece8df',
  paperLight: '#faf8f3',
  cardBg: '#fafbfd',
  ink: '#1e3a6e',
  inkMid: '#3d5585',
  inkLight: '#526480',        // darkened vs previous #8a9db8
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
  ruleLight: '#e8e3db',
};

const DISPLAY = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' };
const BODY    = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, lineHeight: 1.5 };
const MONO    = { fontFamily: "'Courier New', monospace" };
const ITALIC  = { fontFamily: "'Georgia', serif", fontStyle: 'italic' };
const TABNUM  = { fontVariantNumeric: 'tabular-nums' };

// Standardised metadata label — min 10px, high contrast
const L = (color = C.inkLight, extra = {}) => ({
  fontFamily: "'Barlow Condensed', sans-serif",
  fontWeight: 700, fontSize: '10px',
  textTransform: 'uppercase', letterSpacing: '0.1em',
  color, ...extra,
});

// ─── STATIONS (NEC + Acela only) ──────────────────────────────────
const STATIONS = [
  { code: 'BOS', name: 'Boston South Station, MA' },
  { code: 'NYP', name: 'New York Penn Station, NY' },
  { code: 'PHL', name: 'Philadelphia 30th Street, PA' },
  { code: 'WAS', name: 'Washington Union Station, DC' },
];

// ─── HELPERS ─────────────────────────────────────────────────────
const getTrainName = (trainNumber) => {
  const num = parseInt(trainNumber);
  if (num >= 2100 && num <= 2299) return 'Acela';
  return 'NEC Regional';
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch { return dateStr; }
};

const today     = () => new Date().toISOString().split('T')[0];
const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; };
const isPastDate  = (rawDate) => !!rawDate && rawDate < today();

const computeDuration = (dep, arr) => {
  if (!dep || !arr) return null;
  const [dh, dm] = dep.split(':').map(Number);
  const [ah, am] = arr.split(':').map(Number);
  let mins = (ah * 60 + am) - (dh * 60 + dm);
  if (mins < 0) mins += 1440;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const getStationName = (code) => STATIONS.find(s => s.code === code)?.name || code;

const getCountdown = (rawDate, departure) => {
  if (!rawDate || !departure) return null;
  try {
    const [h, mAmPm] = departure.split(':');
    const parts = mAmPm ? mAmPm.match(/(\d+)\s*(AM|PM)?/i) : null;
    const mins = parts ? parseInt(parts[1]) : 0;
    const ampm = parts?.[2]?.toUpperCase() || null;
    let hours = parseInt(h);
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    const depDate = new Date(`${rawDate}T${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}:00`);
    const diff = depDate - new Date();
    if (diff <= 0) return null;
    const totalMins = Math.floor(diff / 60000);
    const hr = Math.floor(totalMins / 60);
    const mn = totalMins % 60;
    return hr > 0 ? `${hr}h ${mn}m` : `${mn}m`;
  } catch { return null; }
};

const buildAmtrakUrl = (fromCode, toCode, dateStr) => {
  const [year, month, day] = (dateStr || today()).split('-');
  return `https://www.amtrak.com/booking/journey-stops.html?fromStationCode=${fromCode}&toStationCode=${toCode}&departDate=${month}/${day}/${year}&numberOfAdults=1`;
};

const getDelayRange = (delayMins) => {
  if (!delayMins || delayMins <= 0) return '0 – 10 min';
  if (delayMins <= 10) return `+${delayMins} – ${delayMins + 10} min`;
  return `+${delayMins} min`;
};

// ─── SKELETON ─────────────────────────────────────────────────────
const SkeletonCard = () => (
  <div style={{ borderRadius: '6px', height: '96px', background: C.paperDark }} className="shimmer" />
);

// ─── FARE CHART ──────────────────────────────────────────────────
const FareChart = ({ origin, destination, departureDate, trainNumber }) => {
  const [win, setWin] = useState('7d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!origin || !destination || !departureDate || !trainNumber) return;
    setLoading(true);
    setData(null);
    fetch(`${API_BASE}/api/fares/chart?origin=${origin}&destination=${destination}&departureDate=${departureDate}&trainNumber=${trainNumber}&window=${win}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [origin, destination, departureDate, trainNumber, win]);

  const buildPath = (points, w = 320, h = 72, pad = 8) => {
    if (!points || points.length < 2) return null;
    const fares = points.map(p => p.fare);
    const mn = Math.min(...fares) * 0.97;
    const mx = Math.max(...fares) * 1.03;
    const tx = i => pad + (i / (points.length - 1)) * (w - pad * 2);
    const ty = v => h - pad - ((v - mn) / (mx - mn || 1)) * (h - pad * 2);
    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${tx(i)},${ty(p.fare)}`).join(' ');
    return {
      line,
      fill: line + ` L ${tx(points.length - 1)},${h} L ${pad},${h} Z`,
      lastX: tx(points.length - 1),
      lastY: ty(fares[fares.length - 1]),
    };
  };

  const chart = data?.points?.length >= 2 ? buildPath(data.points) : null;
  const hasPoints = (data?.observationCount || 0) > 0;

  return (
    <div style={{ border: `1px solid ${C.rule}`, borderRadius: '6px', background: C.paperLight, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.rule}`, background: C.paperDark, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ ...L() }}>Fare History</div>
        <div style={{ display: 'flex', gap: '2px' }}>
          {['24h', '7d', '30d'].map(v => (
            <button
              key={v}
              onClick={() => setWin(v)}
              style={{
                ...L(win === v ? '#fff' : C.inkMid), fontSize: '9px',
                padding: '4px 9px', borderRadius: '3px', border: 'none',
                cursor: 'pointer', background: win === v ? C.fieldBlue : 'transparent',
              }}
            >{v.toUpperCase()}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px' }}>
        {loading && (
          <div style={{ ...BODY, fontSize: '12px', color: C.inkLight, textAlign: 'center', padding: '20px 0' }}>
            Loading fare history…
          </div>
        )}

        {!loading && !hasPoints && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ ...DISPLAY, fontSize: '12px', color: C.ink, marginBottom: '6px' }}>Fare Tracking Active</div>
            <div style={{ ...BODY, fontSize: '12px', color: C.inkLight, marginBottom: '4px' }}>
              {(data?.daysCovered || 0) > 0
                ? `${data.daysCovered} day${data.daysCovered !== 1 ? 's' : ''} of fare history collected`
                : 'Observations starting — check back soon'}
            </div>
            {data?.lastObserved && (
              <div style={{ ...L(), fontSize: '9px', marginTop: '4px' }}>Last observed {data.lastObserved}</div>
            )}
          </div>
        )}

        {!loading && hasPoints && (
          <>
            {chart ? (
              <svg width="100%" height="80" viewBox="0 0 320 80" preserveAspectRatio="xMidYMid meet" style={{ marginBottom: '10px' }}>
                <defs>
                  <linearGradient id="fareGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style={{ stopColor: C.fieldBlue, stopOpacity: 0.12 }} />
                    <stop offset="100%" style={{ stopColor: C.fieldBlue, stopOpacity: 0 }} />
                  </linearGradient>
                </defs>
                {[20, 40, 60].map(y => <line key={y} x1="8" y1={y} x2="312" y2={y} stroke={C.ruleLight} strokeWidth="0.5" />)}
                <path d={chart.fill} fill="url(#fareGrad)" />
                <path d={chart.line} fill="none" stroke={C.fieldBlue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={chart.lastX} cy={chart.lastY} r="3.5" fill={C.fieldBlue} stroke={C.paperLight} strokeWidth="2" />
              </svg>
            ) : (
              <div style={{ ...BODY, fontSize: '12px', color: C.inkLight, textAlign: 'center', padding: '10px 0 14px' }}>
                {data?.points?.length === 1 ? '1 observation — chart available after more data is collected' : 'Insufficient data for chart'}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
              {[
                { label: 'Current',        val: data.currentFare, color: C.fieldBlue },
                { label: `${win} High`,     val: data.windowHigh,  color: C.red },
                { label: `${win} Low`,      val: data.windowLow,   color: C.successGreen },
              ].map(item => (
                <div key={item.label} style={{ background: C.paperDark, borderRadius: '4px', padding: '10px 8px' }}>
                  <div style={{ ...L(), marginBottom: '4px' }}>{item.label}</div>
                  <div style={{ ...MONO, fontSize: '15px', fontWeight: 'bold', color: item.color, ...TABNUM }}>
                    {item.val != null ? `$${Math.round(item.val)}` : '—'}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', ...L(), fontSize: '9px' }}>
              <span>{data.daysCovered} day{data.daysCovered !== 1 ? 's' : ''} of history · {data.totalObservations} observations</span>
              {data.lastObserved && <span>Updated {data.lastObserved}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── SPLASH SCREEN ───────────────────────────────────────────────
const SplashScreen = ({ onDone }) => {
  const [fading, setFading] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), 2000);
    const t2 = setTimeout(onDone, 2600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 9999,
      background: C.fieldBlue,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: '18px',
      opacity: fading ? 0 : 1,
      transition: 'opacity 0.55s ease',
    }}>
      <div style={{ animation: 'splashFadeUp 0.65s ease-out both', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
        <svg width="56" height="28" viewBox="0 0 80 40">
          <path d="M 0 0 L 32 20 L 0 40 L 11 40 L 43 20 L 11 0 Z" fill={C.chevronRed} />
          <rect x="16" y="10" width="64" height="7" fill="#fff" />
          <rect x="16" y="23" width="64" height="7" fill="#fff" />
        </svg>
        <div style={{ ...DISPLAY, fontSize: '30px', color: '#fff', letterSpacing: '0.1em' }}>CORRIDOR</div>
      </div>
      <div style={{ animation: 'splashFadeUp 0.65s 0.28s ease-out both', ...ITALIC, fontSize: '12px', color: 'rgba(255,255,255,0.6)', textAlign: 'center', maxWidth: '210px', lineHeight: 1.55 }}>
        Intelligent train travel across the Northeast Corridor
      </div>
      <div style={{ animation: 'splashFadeUp 0.65s 0.45s ease-out both', width: '56px', height: '2px', background: 'rgba(255,255,255,0.18)', borderRadius: '1px', overflow: 'hidden', marginTop: '4px' }}>
        <div style={{ width: '28px', height: '100%', background: 'rgba(255,255,255,0.7)', borderRadius: '1px', animation: 'trackSlide 1.1s ease-in-out infinite' }} />
      </div>
    </div>
  );
};

// ─── STATION SELECT ───────────────────────────────────────────────
const StationSelect = ({ value, onChange, label, exclude }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const inputRef = useRef(null);
  const selected = STATIONS.find(s => s.code === value);
  const displayText = selected ? `${selected.code} · ${selected.name.split(',')[0]}` : 'Select station';
  const filtered = STATIONS.filter(s => {
    if (exclude && s.code === exclude) return false;
    const q = query.toLowerCase();
    return s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
  });

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  useEffect(() => { if (open && inputRef.current) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {label && <div style={{ ...L(), marginBottom: '5px' }}>{label}</div>}
      <div
        onClick={() => { setOpen(!open); setQuery(''); }}
        style={{
          ...BODY, fontSize: '13px', padding: '9px 10px', borderRadius: '6px',
          border: `1.5px solid ${open ? C.fieldBlue : C.rule}`, background: C.paperDark, color: C.ink,
          cursor: 'pointer', boxSizing: 'border-box', userSelect: 'none',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {displayText}
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: C.paperLight, border: `1.5px solid ${C.fieldBlue}`, borderRadius: '6px',
          boxShadow: '0 6px 20px rgba(0,0,0,0.13)', marginTop: '2px',
          maxHeight: '240px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '8px', borderBottom: `1px solid ${C.rule}` }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search stations…"
              style={{
                width: '100%', ...BODY, fontSize: '13px', padding: '7px 10px',
                border: `1px solid ${C.rule}`, borderRadius: '4px',
                background: C.paper, color: C.ink, boxSizing: 'border-box', outline: 'none',
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0
              ? <div style={{ padding: '14px', ...BODY, fontSize: '12px', color: C.inkLight, textAlign: 'center' }}>No stations found</div>
              : filtered.map(s => (
                <div
                  key={s.code}
                  onMouseDown={e => { e.preventDefault(); onChange(s.code); setOpen(false); setQuery(''); }}
                  style={{
                    padding: '10px 12px', cursor: 'pointer',
                    background: s.code === value ? C.fieldBlueLightTint : 'transparent',
                    borderBottom: `1px solid ${C.ruleLight}`,
                    display: 'flex', gap: '10px', alignItems: 'center',
                  }}
                  onMouseEnter={e => { if (s.code !== value) e.currentTarget.style.background = C.paperDark; }}
                  onMouseLeave={e => { if (s.code !== value) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ ...DISPLAY, fontSize: '12px', color: C.fieldBlue, minWidth: '36px' }}>{s.code}</span>
                  <span style={{ ...BODY, fontSize: '12px', color: C.ink }}>{s.name}</span>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
};

// ─── LOGO ────────────────────────────────────────────────────────
const Logo = () => (
  <div style={{ display: 'flex', alignItems: 'center' }}>
    <svg width="28" height="14" viewBox="0 0 80 40" style={{ marginRight: '7px' }}>
      <path d="M 0 0 L 32 20 L 0 40 L 11 40 L 43 20 L 11 0 Z" fill={C.chevronRed} />
      <rect x="16" y="10" width="64" height="7" fill="#fff" />
      <rect x="16" y="23" width="64" height="7" fill="#fff" />
    </svg>
    <div style={{ ...DISPLAY, fontSize: '17px', color: '#fff', letterSpacing: '0.05em', lineHeight: 1 }}>Corridor</div>
  </div>
);

// ─── SCREEN HEADER ───────────────────────────────────────────────
const ScreenHeader = ({ subtitle, rightContent }) => (
  <div style={{ background: C.fieldBlue, padding: '26px 16px 10px', flexShrink: 0 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Logo />
      {rightContent}
    </div>
    {subtitle && <div style={{ ...L('rgba(255,255,255,0.65)'), marginTop: '4px', fontSize: '9px' }}>{subtitle}</div>}
    <div style={{ height: '2px', background: C.chevronRed, marginTop: '10px', marginLeft: '-16px', marginRight: '-16px' }} />
  </div>
);

// ─── STATUS BADGE ────────────────────────────────────────────────
const StatusBadge = ({ label }) => {
  const s = { 'ON TIME': { bg: C.greenLight, text: C.green }, 'DELAYED': { bg: C.orangeLight, text: C.orange }, 'CANCELLED': { bg: C.redLight, text: C.red } }[label] || { bg: C.greenLight, text: C.green };
  return (
    <div style={{ ...DISPLAY, fontSize: '10px', letterSpacing: '0.08em', background: s.bg, color: s.text, border: `1.5px solid ${s.text}`, borderRadius: '3px', padding: '3px 8px', display: 'inline-block' }}>
      {label}
    </div>
  );
};

// ─── PROGRESS BAR ────────────────────────────────────────────────
const TripProgressBar = ({ progress }) => (
  <div style={{ position: 'relative', height: '14px', display: 'flex', alignItems: 'center' }}>
    <div style={{ position: 'absolute', width: '100%', height: '2px', background: C.rule, borderRadius: '1px' }} />
    {progress > 0 && <>
      <div style={{ position: 'absolute', height: '2px', background: C.fieldBlue, width: `${progress * 100}%`, borderRadius: '1px' }} />
      <div style={{ position: 'absolute', left: `${progress * 100}%`, width: '10px', height: '10px', borderRadius: '50%', background: C.fieldBlue, border: `2px solid ${C.paperLight}`, transform: 'translateX(-50%)', animation: 'pulse 2.5s ease-in-out infinite' }} />
    </>}
    {progress === 0 && <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', ...BODY, fontSize: '10px', color: C.rule, letterSpacing: '0.25em' }}>· · ·</div>}
  </div>
);

// ─── TRACK TRAIN BUTTON (replaces FAB) ───────────────────────────
const TrackTrainBtn = ({ onPress }) => (
  <button
    onClick={onPress}
    className="book-btn"
    style={{
      ...DISPLAY, fontSize: '12px', padding: '14px', borderRadius: '4px',
      background: C.fieldBlue, color: '#fff', border: 'none', cursor: 'pointer',
      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
    }}
  >
    <span style={{ fontSize: '16px', lineHeight: 1, fontWeight: 400 }}>+</span> Track a Train
  </button>
);

// ─── TRIP CARD ───────────────────────────────────────────────────
const TripCard = ({ trip, onClick, onDelete, isNext, index = 0, dimmed = false }) => {
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiped, setIsSwiped] = useState(false);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  const accentColor = trip.statusType === 'ontime' ? C.fieldBlue : trip.statusType === 'cancelled' ? C.red : C.orange;
  const delayRange   = getDelayRange(trip.aiDelay);
  const delayColor   = (trip.aiDelay || 0) === 0 ? C.successGreen : C.orange;
  const isToday      = trip.rawDate === today();
  const isTomorrow   = trip.rawDate === tomorrowStr();
  const countdown    = isNext ? getCountdown(trip.rawDate, trip.departure) : null;

  const onTouchStart = e => { touchStartX.current = e.touches[0].clientX; touchStartY.current = e.touches[0].clientY; };
  const onTouchMove  = e => {
    if (touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0) { const nx = Math.max(dx, -80); setSwipeX(nx); if (Math.abs(nx) > 5) e.preventDefault(); }
    else if (isSwiped) setSwipeX(Math.min(0, -80 + dx));
  };
  const onTouchEnd = () => {
    if (swipeX < -60) { setSwipeX(-80); setIsSwiped(true); } else { setSwipeX(0); setIsSwiped(false); }
    touchStartX.current = null; touchStartY.current = null;
  };
  const handleClick = () => { if (isSwiped) { setSwipeX(0); setIsSwiped(false); } else onClick(); };

  return (
    <div className="card-enter" style={{ animationDelay: `${index * 60}ms`, opacity: dimmed ? 0.55 : 1 }}>
      {isNext && (
        <div style={{ background: C.fieldBlue, color: '#fff', padding: '5px 12px', ...L('#fff'), fontSize: '9px', borderRadius: '4px 4px 0 0' }}>
          NEXT TRIP{countdown ? ` · Departs in ${countdown}` : ''}
        </div>
      )}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: isNext ? '0 0 6px 6px' : '6px' }}>
        {/* Delete zone */}
        <div
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '80px', background: C.dangerRed, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 0 }}
          onClick={e => { e.stopPropagation(); onDelete?.(trip.id); }}
        >
          <div style={{ color: '#fff', ...L('#fff'), fontSize: '9px', textAlign: 'center' }}>
            <div style={{ fontSize: '16px', marginBottom: '2px' }}>✕</div>REMOVE
          </div>
        </div>
        {/* Card */}
        <div
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onClick={handleClick}
          style={{
            position: 'relative', zIndex: 1,
            transform: `translateX(${swipeX}px)`,
            transition: touchStartX.current ? 'none' : 'transform 0.25s ease',
            border: `1px solid ${C.rule}`, borderLeft: `4px solid ${accentColor}`,
            borderRadius: isNext ? '0 0 6px 6px' : '6px',
            background: C.cardBg, cursor: 'pointer', touchAction: 'pan-y',
          }}
        >
          {/* Header */}
          <div style={{ padding: '11px 14px 7px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '7px' }}>
                <span style={{ ...DISPLAY, fontSize: '17px', color: C.ink }}>{trip.trainName}</span>
                <span style={{ ...BODY, fontSize: '13px', color: C.inkMid, ...TABNUM }}>#{trip.number}</span>
              </div>
              <div style={{ ...BODY, fontSize: '11px', color: C.inkLight, marginTop: '2px' }}>
                {isToday ? 'Today' : isTomorrow ? 'Tomorrow' : (trip.date || '—')} · {trip.fromCode} → {trip.toCode}
              </div>
            </div>
            {(isToday || isTomorrow) && <StatusBadge label={trip.statusLabel || 'ON TIME'} />}
          </div>

          {/* Times */}
          <div style={{ padding: '0 14px 10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ minWidth: '52px' }}>
              <div style={{ ...MONO, fontSize: '22px', fontWeight: 'bold', color: C.ink, ...TABNUM }}>{trip.departure || '—'}</div>
              <div style={{ ...DISPLAY, fontSize: '11px', color: C.inkMid }}>{trip.fromCode}</div>
            </div>
            <div style={{ flex: 1 }}><TripProgressBar progress={trip.progress || 0} /></div>
            <div style={{ minWidth: '52px', textAlign: 'right' }}>
              <div style={{ ...MONO, fontSize: '22px', fontWeight: 'bold', color: C.ink, ...TABNUM }}>{trip.arrival || '—'}</div>
              <div style={{ ...DISPLAY, fontSize: '11px', color: C.inkMid }}>{trip.toCode}</div>
            </div>
          </div>

          {/* Stats bar */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: C.paperDark, borderTop: `1px solid ${C.ruleLight}` }}>
            <div style={{ padding: '8px 12px', borderRight: `1px solid ${C.ruleLight}` }}>
              <div style={{ ...L(), marginBottom: '3px' }}>Track</div>
              <div style={{ ...MONO, fontSize: '14px', fontWeight: 'bold', color: C.ink, ...TABNUM }}>{trip.track || 'TBD'}</div>
            </div>
            <div style={{ padding: '8px 12px', borderRight: `1px solid ${C.ruleLight}` }}>
              <div style={{ ...L(), marginBottom: '3px' }}>Forecast</div>
              <div style={{ ...BODY, fontSize: '12px', fontWeight: 700, color: delayColor, ...TABNUM }}>{delayRange}</div>
            </div>
            <div style={{ padding: '8px 12px' }}>
              <div style={{ ...L(), marginBottom: '3px' }}>En Route</div>
              <div style={{ ...BODY, fontSize: '11px', color: C.ink, lineHeight: 1.2 }}>
                {trip.currentLocation ? trip.currentLocation.split(',')[0] : '—'}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '6px', borderTop: `1px solid ${C.ruleLight}` }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: (trip.recentAvgDelay || 0) > 10 ? C.orange : C.successGreen, flexShrink: 0 }} />
            <div style={{ ...BODY, fontSize: '11px', color: C.inkMid, flex: 1 }}>
              Avg +{trip.recentAvgDelay || 0} min · {trip.direction || ''}
            </div>
            <div style={{ ...L(), fontSize: '9px' }}>Past 3h</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── SCREEN: TRIPS ───────────────────────────────────────────────
const TripsScreen = ({ onSelectTrip, onTrackTrain, addToast }) => {
  const [trips, setTrips] = useState([]);
  const [pastTrips, setPastTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showPast, setShowPast] = useState(false);
  const [loadingPast, setLoadingPast] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const scrollRef = useRef(null);
  const pullStartY = useRef(null);

  const fetchTrips = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/trips`);
      const data = await res.json();
      const seen = new Set();
      const mapped = data
        .filter(t => { const k = `${t.trainNumber}-${t.date}`; if (seen.has(k)) return false; seen.add(k); return true; })
        .map(t => ({ ...t, trainName: getTrainName(t.trainNumber), number: t.trainNumber, rawDate: t.date, date: formatDate(t.date), aiConfidence: t.aiConfidence || 72 }));
      setTrips(mapped);
      setLastUpdated(new Date());
    } catch { addToast?.('Could not load trips', 'error'); }
    setLoading(false);
  }, [addToast]);

  useEffect(() => { fetchTrips(); }, [fetchTrips]);

  const fetchPastTrips = async () => {
    setLoadingPast(true);
    try {
      const res = await fetch(`${API_BASE}/api/trips?past=true`);
      const data = await res.json();
      const mapped = data.map(t => ({ ...t, trainName: getTrainName(t.trainNumber), number: t.trainNumber, rawDate: t.date, date: formatDate(t.date), aiConfidence: t.aiConfidence || 72 }));
      setPastTrips(mapped);
    } catch {}
    setLoadingPast(false);
  };

  // Pull-to-refresh
  const onPTRStart = e => { if (scrollRef.current?.scrollTop === 0) pullStartY.current = e.touches[0].clientY; };
  const onPTRMove  = e => { if (pullStartY.current === null) return; const dy = e.touches[0].clientY - pullStartY.current; if (dy > 0) setIsPulling(dy > 40); };
  const onPTREnd   = () => { if (isPulling) fetchTrips(); setIsPulling(false); pullStartY.current = null; };

  const todayStr = today();
  const weekEnd  = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);

  const filteredTrips = trips.filter(t => {
    if (filter === 'today')   return t.rawDate === todayStr;
    if (filter === 'week')    return new Date(t.rawDate + 'T00:00:00') <= weekEnd;
    if (filter === 'delayed') return (t.aiDelay || 0) > 0;
    return true;
  });

  // Next trip
  let nextTripId = null, closestDiff = Infinity;
  trips.forEach(t => {
    if (!t.departure || !t.rawDate) return;
    try {
      const [h, mRaw] = t.departure.split(':');
      const depDate = new Date(`${t.rawDate}T${String(parseInt(h)).padStart(2,'0')}:${String(parseInt(mRaw || 0)).padStart(2,'0')}:00`);
      const diff = depDate - new Date();
      if (diff > 0 && diff < closestDiff) { closestDiff = diff; nextTripId = t.id; }
    } catch {}
  });

  const handleDelete = async (id) => {
    const del = trips.find(t => t.id === id);
    setTrips(prev => prev.filter(t => t.id !== id));
    try {
      await fetch(`${API_BASE}/api/trips/${id}`, { method: 'DELETE' });
      addToast?.('Trip removed', 'info', async () => {
        if (!del) return;
        try {
          await fetch(`${API_BASE}/api/trips`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trainNumber: del.number, origin: del.fromCode, destination: del.toCode, departureDate: del.rawDate, departureTime: del.departure, arrivalTime: del.arrival }) });
          fetchTrips();
        } catch {}
      });
    } catch { setTrips(prev => [...prev, del]); addToast?.('Failed to remove trip', 'error'); }
  };

  const lastUpdatedText = lastUpdated ? (() => { const d = Math.floor((new Date() - lastUpdated) / 60000); return d < 1 ? 'Just now' : `${d}m ago`; })() : null;

  const FILTERS = [{ id: 'all', label: 'All' }, { id: 'today', label: 'Today' }, { id: 'week', label: 'This Week' }, { id: 'delayed', label: 'Delayed' }];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.paper }}>
      <ScreenHeader subtitle="UPCOMING TRIPS" />

      <div style={{ padding: '10px 16px 6px', display: 'flex', gap: '6px', overflowX: 'auto', flexShrink: 0 }}>
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{ ...L(filter === f.id ? '#fff' : C.inkMid), fontSize: '9px', padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer', flexShrink: 0, background: filter === f.id ? C.fieldBlue : C.paperDark, transition: 'all 0.15s' }}>
            {f.label}
          </button>
        ))}
      </div>

      <div ref={scrollRef} onTouchStart={onPTRStart} onTouchMove={onPTRMove} onTouchEnd={onPTREnd}
        style={{ flex: 1, overflowY: 'auto', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '100px' }}>

        {isPulling && <div style={{ textAlign: 'center', ...L(), fontSize: '9px', color: C.inkLight }}>Release to refresh</div>}

        {loading && [1,2,3].map(i => <SkeletonCard key={i} />)}

        {!loading && trips.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 20px', gap: '14px' }}>
            <svg width="64" height="48" viewBox="0 0 80 60" fill="none">
              <rect x="5" y="25" width="70" height="20" rx="4" fill={C.paperDark} stroke={C.rule} strokeWidth="1.5" />
              <rect x="10" y="30" width="12" height="10" rx="2" fill={C.fieldBlueLightTint} stroke={C.rule} strokeWidth="1" />
              <rect x="25" y="30" width="12" height="10" rx="2" fill={C.fieldBlueLightTint} stroke={C.rule} strokeWidth="1" />
              <rect x="40" y="30" width="12" height="10" rx="2" fill={C.fieldBlueLightTint} stroke={C.rule} strokeWidth="1" />
              <rect x="2" y="21" width="8" height="8" rx="1" fill={C.chevronRed} />
              <circle cx="18" cy="47" r="4" fill={C.inkMid} />
              <circle cx="62" cy="47" r="4" fill={C.inkMid} />
              <line x1="0" y1="45" x2="80" y2="45" stroke={C.rule} strokeWidth="1.5" />
            </svg>
            <div style={{ ...DISPLAY, fontSize: '15px', color: C.inkMid }}>No tracked trips yet</div>
            <div style={{ ...BODY, fontSize: '13px', color: C.inkLight, textAlign: 'center', lineHeight: 1.5 }}>
              Track a train to get delay forecasts and fare alerts.
            </div>
            <TrackTrainBtn onPress={onTrackTrain} />
          </div>
        )}

        {!loading && trips.length > 0 && filteredTrips.length === 0 && (
          <div style={{ ...BODY, fontSize: '13px', color: C.inkLight, textAlign: 'center', padding: '28px 20px' }}>No trips match this filter.</div>
        )}

        {!loading && filteredTrips.map((trip, idx) => (
          <TripCard key={trip.id} trip={trip} index={idx} onClick={() => onSelectTrip(trip)} onDelete={handleDelete} isNext={trip.id === nextTripId} />
        ))}

        {!loading && trips.length > 0 && (
          <TrackTrainBtn onPress={onTrackTrain} />
        )}

        {/* Past trips */}
        {!loading && (
          <button
            onClick={() => { setShowPast(p => !p); if (!showPast && pastTrips.length === 0) fetchPastTrips(); }}
            style={{ ...DISPLAY, fontSize: '10px', padding: '10px', background: 'transparent', border: 'none', color: C.inkLight, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%' }}
          >
            {showPast ? '▲ Hide' : '▼ Show'} Past Trips
          </button>
        )}
        {showPast && (
          loadingPast
            ? <SkeletonCard />
            : pastTrips.length === 0
              ? <div style={{ ...BODY, fontSize: '12px', color: C.inkLight, textAlign: 'center', padding: '12px' }}>No past trips found.</div>
              : pastTrips.map((trip, idx) => (
                <TripCard key={trip.id} trip={trip} index={idx} onClick={() => onSelectTrip(trip)} onDelete={handleDelete} isNext={false} dimmed />
              ))
        )}

        {lastUpdatedText && !loading && (
          <div style={{ ...L(), fontSize: '9px', textAlign: 'center', paddingTop: '2px' }}>Updated {lastUpdatedText}</div>
        )}
      </div>
    </div>
  );
};

// ─── SCREEN: TRIP DETAIL ─────────────────────────────────────────
const TripDetailScreen = ({ trip, onBack, addToast }) => {
  const [detail, setDetail] = useState(null);
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/trips/${trip.id}`).then(r => r.json()).then(setDetail).catch(() => {});
    fetch(`${API_BASE}/api/weather/${trip.toCode}`).then(r => r.json()).then(setWeather).catch(() => {});
  }, [trip.id, trip.toCode]);

  const d = detail || trip;
  const stops = detail?.stops || [];
  const delayRange = getDelayRange(d.aiDelay);
  const delayColor = (d.aiDelay || 0) === 0 ? C.successGreen : C.orange;

  const handleShare = () => {
    const url = buildAmtrakUrl(trip.fromCode, trip.toCode, trip.rawDate || today());
    if (navigator.share) navigator.share({ title: `${d.trainName} #${d.number}`, url }).catch(() => {});
    else { navigator.clipboard?.writeText(url); addToast?.('Link copied', 'success'); }
  };

  const handleCalendar = () => {
    const raw = trip.rawDate || today();
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${d.trainName} #${d.number} ${d.fromCode}→${d.toCode}`)}&dates=${raw.replace(/-/g,'')}/${raw.replace(/-/g,'')}`;
    window.open(url, '_blank');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.paper }}>
      {/* Detail header */}
      <div style={{ background: C.fieldBlue, padding: '26px 16px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.75)', cursor: 'pointer', ...BODY, fontSize: '13px', padding: 0 }}>← Back</button>
          <button onClick={handleShare} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', cursor: 'pointer', ...L('#fff'), fontSize: '9px', padding: '6px 12px', borderRadius: '4px' }}>Share</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
          <div>
            <div style={{ ...DISPLAY, fontSize: '22px', color: '#fff' }}>{d.trainName} #{d.number}</div>
            <div style={{ ...BODY, fontSize: '12px', color: 'rgba(255,255,255,0.65)', marginTop: '3px' }}>
              {d.fromCode} → {d.toCode} · {formatDate(trip.rawDate)}
            </div>
          </div>
          <StatusBadge label={d.statusLabel || 'ON TIME'} />
        </div>
        <div style={{ height: '2px', background: C.chevronRed, marginLeft: '-16px', marginRight: '-16px' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '80px' }}>

        {/* Departure / Arrival */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {[
            { label: 'Departure', time: d.departure, name: d.fromName || getStationName(d.fromCode) },
            { label: 'Arrival',   time: d.arrival,   name: d.toName   || getStationName(d.toCode)   },
          ].map(item => (
            <div key={item.label} style={{ border: `1px solid ${C.rule}`, borderRadius: '6px', padding: '12px', background: C.paperLight }}>
              <div style={{ ...L(), marginBottom: '5px' }}>{item.label}</div>
              <div style={{ ...MONO, fontSize: '26px', fontWeight: 'bold', color: C.ink, ...TABNUM }}>{item.time || '—'}</div>
              <div style={{ ...BODY, fontSize: '11px', color: C.inkMid, marginTop: '4px', lineHeight: 1.3 }}>{item.name}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button onClick={handleCalendar} style={{ ...BODY, fontSize: '12px', padding: '10px', borderRadius: '4px', border: `1px solid ${C.fieldBlue}`, background: 'transparent', color: C.fieldBlue, cursor: 'pointer' }}>+ Add to Calendar</button>
          <button onClick={() => addToast?.('Price alerts coming soon', 'info')} style={{ ...BODY, fontSize: '12px', padding: '10px', borderRadius: '4px', border: `1px solid ${C.amber}`, background: 'transparent', color: C.orange, cursor: 'pointer' }}>Set Price Alert</button>
        </div>

        {/* Delay Forecast — no AI pill */}
        <div style={{ borderLeft: `4px solid ${C.fieldBlue}`, background: C.fieldBlueLightTint, borderRadius: '6px', padding: '14px 16px' }}>
          <div style={{ ...L(C.fieldBlue), marginBottom: '8px' }}>Delay Forecast</div>
          <div style={{ ...MONO, fontSize: '24px', fontWeight: 'bold', color: delayColor, ...TABNUM, marginBottom: '6px' }}>
            {delayRange}
          </div>
          <div style={{ ...BODY, fontSize: '12px', color: C.inkMid, marginBottom: '8px', ...TABNUM }}>
            Based on {d.recentAvgDelay !== undefined ? '4 recent trains' : 'historical data'}
          </div>
          <div style={{ ...ITALIC, fontSize: '11px', color: C.fieldBlue, lineHeight: 1.5 }}>
            {d.reasoning || 'Based on historical delay patterns for this route.'}
          </div>
        </div>

        {/* Live Location */}
        {d.currentLocation && (
          <div style={{ border: `1px solid ${C.rule}`, borderRadius: '6px', padding: '12px', background: C.greenLight }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ ...L(C.green), marginBottom: '4px' }}>Live Position</div>
                <div style={{ ...BODY, fontSize: '13px', color: C.ink }}>{d.currentLocation}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: C.green, borderRadius: '4px', padding: '4px 9px' }}>
                <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite' }} />
                <span style={{ ...L('#fff'), fontSize: '9px' }}>Live</span>
              </div>
            </div>
          </div>
        )}

        {/* Route & Stops */}
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: '6px', overflow: 'hidden', background: C.paperLight }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.rule}`, background: C.paperDark }}>
            <div style={{ ...L() }}>Route & Stops</div>
          </div>
          {stops.length === 0
            ? <div style={{ padding: '16px', ...BODY, fontSize: '12px', color: C.inkLight, textAlign: 'center' }}>Loading stops…</div>
            : stops.map((stop, i) => (
              <div key={i} style={{ padding: '11px 14px', borderBottom: i < stops.length - 1 ? `1px solid ${C.ruleLight}` : 'none', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: stop.passed ? C.fieldBlue : C.rule }} />
                  {i < stops.length - 1 && <div style={{ width: '2px', height: '16px', background: stop.passed ? C.fieldBlue : C.ruleLight }} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ ...BODY, fontSize: '13px', color: C.ink }}>{stop.name}</div>
                  <div style={{ ...L(), fontSize: '9px', marginTop: '1px' }}>{stop.code}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ ...MONO, fontSize: '13px', fontWeight: 'bold', color: C.ink, ...TABNUM }}>{stop.schTime}</div>
                  {stop.actTime && <div style={{ ...BODY, fontSize: '11px', color: stop.actTime > stop.schTime ? C.orange : C.successGreen }}>{stop.actTime} actual</div>}
                </div>
              </div>
            ))
          }
        </div>

        {/* Delay Distribution */}
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: '6px', padding: '14px', background: C.paperLight }}>
          <div style={{ ...L(), marginBottom: '12px' }}>Typical Delays on This Route</div>
          {[
            { range: 'Under 10 min',  percent: d.delayDistribution?.['<10min']   || 50, color: C.successGreen },
            { range: '10 – 30 min',   percent: d.delayDistribution?.['10-30min'] || 25, color: C.orange },
            { range: '30+ min',       percent: d.delayDistribution?.['30+min']   || 25, color: C.red },
          ].map((item, i) => (
            <div key={i} style={{ marginBottom: i < 2 ? '10px' : 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <div style={{ ...BODY, fontSize: '12px', color: C.ink }}>{item.range}</div>
                <div style={{ ...MONO, fontSize: '12px', fontWeight: 'bold', color: item.color, ...TABNUM }}>{item.percent}%</div>
              </div>
              <div style={{ width: '100%', height: '8px', background: C.paperDark, borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${item.percent}%`, height: '100%', background: item.color, borderRadius: '2px' }} />
              </div>
            </div>
          ))}
        </div>

        {/* Recent Delays */}
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: '6px', padding: '14px', background: C.paperLight }}>
          <div style={{ ...L(), marginBottom: '10px' }}>Recent Performance · Past 3 Hours</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ ...BODY, fontSize: '13px', color: C.ink }}>{d.direction || 'Southbound'} direction</div>
              <div style={{ ...BODY, fontSize: '11px', color: C.inkLight, marginTop: '3px' }}>Based on 4 recent trains</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...MONO, fontSize: '20px', fontWeight: 'bold', color: (d.recentAvgDelay || 0) > 10 ? C.orange : C.successGreen, ...TABNUM }}>+{d.recentAvgDelay || 0} min</div>
              <div style={{ ...L(), fontSize: '9px', marginTop: '2px' }}>avg delay</div>
            </div>
          </div>
        </div>

        {/* Weather */}
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: '6px', padding: '14px', background: C.paperLight }}>
          <div style={{ ...L(), marginBottom: '10px' }}>Weather at Destination</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ ...BODY, fontSize: '13px', color: C.ink }}>{weather?.station || d.toName || d.toCode}</div>
              <div style={{ ...BODY, fontSize: '12px', color: C.inkLight, marginTop: '3px' }}>{weather?.condition || '—'}</div>
            </div>
            <div style={{ ...MONO, fontSize: '32px', fontWeight: 'bold', color: C.ink, ...TABNUM }}>{weather ? `${weather.temp}°` : '—'}</div>
          </div>
        </div>

        {/* Fare History */}
        <FareChart
          origin={trip.fromCode}
          destination={trip.toCode}
          departureDate={trip.rawDate}
          trainNumber={trip.number}
        />

        <button
          onClick={() => window.open(buildAmtrakUrl(trip.fromCode, trip.toCode, trip.rawDate || today()), '_blank')}
          className="book-btn"
          style={{ width: '100%', ...DISPLAY, fontSize: '11px', padding: '15px', borderRadius: '4px', border: 'none', background: C.fieldBlue, color: '#fff', cursor: 'pointer' }}
        >
          Book on Amtrak →
        </button>
      </div>
    </div>
  );
};

// ─── SCREEN: BOOKING ─────────────────────────────────────────────
const BookingScreen = ({ addToast, searchState, setSearchState }) => {
  const { from, to, date, results: searchResults } = searchState;
  const setFrom = v => setSearchState(s => ({ ...s, from: v }));
  const setTo   = v => setSearchState(s => ({ ...s, to: v }));
  const setDate = v => setSearchState(s => ({ ...s, date: v }));
  const setSearchResults = v => setSearchState(s => ({ ...s, results: v }));

  const [searching, setSearching] = useState(false);
  const [savedId, setSavedId] = useState(null);
  const [recentSearches, setRecentSearches] = useState(() => {
    try { return JSON.parse(localStorage.getItem('corridorRecentSearches') || '[]'); } catch { return []; }
  });

  const saveRecent = (f, t, d) => {
    const updated = [{ from: f, to: t, date: d }, ...recentSearches.filter(r => !(r.from === f && r.to === t && r.date === d))].slice(0, 3);
    setRecentSearches(updated);
    try { localStorage.setItem('corridorRecentSearches', JSON.stringify(updated)); } catch {}
  };

  const runSearch = async (f, t, d) => {
    setSearching(true);
    try {
      const res = await fetch(`${API_BASE}/api/search?origin=${f}&destination=${t}&date=${d}`);
      const data = await res.json();
      if (data.error) { addToast?.(data.error, 'error'); setSearchResults([]); setSearching(false); return; }
      if (!Array.isArray(data) || data.length === 0) { setSearchResults([]); setSearching(false); return; }
      const now = new Date();
      const currentHHMM = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      const mapped = data.map((r, i) => ({
        id: i + 1, time: r.time, arrival: r.arriveTime, price: r.price,
        train: r.train, trainName: r.trainName,
        trainType: r.trainType,
        avgDelay: r.delay ?? 0,
        aiDelay: r.delay ?? 0,
        trend: r.trend,
        duration: r.duration || computeDuration(r.time, r.arriveTime),
        fareSource: r.fareSource || 'estimate',
      }));
      const filtered = (f === d && d === today())
        ? mapped.filter(r => !r.time || r.time >= currentHHMM)
        : mapped;
      setSearchResults(filtered);
      saveRecent(f, t, d);
    } catch { addToast?.('Network error — please try again', 'error'); setSearchResults([]); }
    setSearching(false);
  };

  const handleSave = async (result) => {
    try {
      await fetch(`${API_BASE}/api/trips`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainNumber: result.train, origin: from, destination: to, departureDate: date, departureTime: result.time, arrivalTime: result.arrival }),
      });
      setSavedId(result.id);
      addToast?.('Trip saved', 'success');
      setTimeout(() => setSavedId(null), 2000);
    } catch { addToast?.('Failed to save trip', 'error'); }
  };

  const isSameDay = date === today();
  const results = searchResults ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.paper }}>
      <ScreenHeader subtitle="SEARCH & BOOK" />

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '80px' }}>

        {/* Recent searches */}
        {recentSearches.length > 0 && (
          <div>
            <div style={{ ...L(), marginBottom: '7px' }}>Recent Searches</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {recentSearches.map((r, i) => (
                <button
                  key={i}
                  onClick={() => { setSearchState(s => ({ ...s, from: r.from, to: r.to, date: r.date })); runSearch(r.from, r.to, r.date); }}
                  style={{ ...BODY, fontSize: '12px', padding: '6px 12px', borderRadius: '20px', border: `1px solid ${C.rule}`, background: C.paperDark, color: C.inkMid, cursor: 'pointer' }}
                >
                  {r.from}→{r.to} · {r.date === today() ? 'Today' : r.date}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search form */}
        <div style={{ borderRadius: '6px', padding: '16px', background: C.paperLight, border: `1px solid ${C.rule}` }}>
          <div style={{ ...DISPLAY, fontSize: '12px', color: C.ink, marginBottom: '14px' }}>Find a Train</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '8px', marginBottom: '12px', alignItems: 'flex-end' }}>
            <StationSelect value={from} onChange={setFrom} label="From" exclude={to} />
            <button
              onClick={() => setSearchState(s => ({ ...s, from: s.to, to: s.from }))}
              style={{ background: 'none', border: 'none', ...BODY, fontSize: '18px', color: C.fieldBlue, cursor: 'pointer', padding: '0 4px', alignSelf: 'flex-end', paddingBottom: '9px' }}
            >⇄</button>
            <StationSelect value={to} onChange={setTo} label="To" exclude={from} />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <div style={{ ...L(), marginBottom: '5px' }}>Date</div>
            <input
              type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ width: '100%', ...BODY, fontSize: '14px', fontWeight: 700, padding: '9px 10px', borderRadius: '6px', border: `1px solid ${C.rule}`, background: C.paperDark, color: C.ink, cursor: 'pointer', boxSizing: 'border-box' }}
            />
          </div>

          <button
            onClick={() => runSearch(from, to, date)}
            disabled={searching}
            className="book-btn"
            style={{ width: '100%', ...DISPLAY, fontSize: '11px', padding: '13px', borderRadius: '4px', border: 'none', background: searching ? C.inkLight : C.fieldBlue, color: '#fff', cursor: searching ? 'default' : 'pointer' }}
          >
            {searching ? 'Searching…' : 'Search Trains'}
          </button>
        </div>

        {/* Results */}
        {searchResults !== null && (
          <div>
            <div style={{ ...DISPLAY, fontSize: '10px', color: C.inkMid, marginBottom: '10px' }}>
              {results.length > 0 ? `${results.length} train${results.length !== 1 ? 's' : ''} found` : 'No trains found'}
            </div>

            {results.length === 0 && (
              <div style={{ borderRadius: '6px', padding: '24px', background: C.paperLight, border: `1px solid ${C.rule}`, textAlign: 'center' }}>
                <div style={{ ...BODY, fontSize: '13px', color: C.inkLight, marginBottom: '6px' }}>No trains found for this route and date.</div>
                <div style={{ ...BODY, fontSize: '12px', color: C.inkLight }}>Try a different date or nearby station.</div>
              </div>
            )}

            {results.map(result => {
              const isSaved = savedId === result.id;
              const delayRange = getDelayRange(result.aiDelay);
              const delayColor = result.aiDelay === 0 ? C.successGreen : result.aiDelay <= 10 ? C.orange : C.red;

              return (
                <div key={result.id} style={{ border: `1px solid ${C.rule}`, borderRadius: '6px', padding: '14px', background: C.paperLight, marginBottom: '10px' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <div style={{ ...DISPLAY, fontSize: '17px', color: C.ink }}>{result.trainName || getTrainName(result.train)} #{result.train}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ ...MONO, fontSize: '20px', fontWeight: 'bold', color: C.fieldBlue, ...TABNUM }}>${result.price}</div>
                      <div style={{ ...L(), marginTop: '2px' }}>{result.fareSource === 'estimate' ? 'Est. fare' : 'Current fare'}</div>
                    </div>
                  </div>

                  {/* Times */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <div>
                      <div style={{ ...L(), marginBottom: '3px' }}>Depart</div>
                      <div style={{ ...MONO, fontSize: '16px', fontWeight: 'bold', color: C.ink, ...TABNUM }}>{result.time}</div>
                    </div>
                    <div>
                      <div style={{ ...L(), marginBottom: '3px' }}>Arrive</div>
                      <div style={{ ...MONO, fontSize: '16px', fontWeight: 'bold', color: C.ink, ...TABNUM }}>{result.arrival}</div>
                      {result.duration && <div style={{ ...BODY, fontSize: '10px', color: C.inkLight, marginTop: '2px', ...TABNUM }}>{result.duration}</div>}
                    </div>
                    <div>
                      <div style={{ ...L(), marginBottom: '3px' }}>{isSameDay ? 'Status' : 'Avg Delay'}</div>
                      <div style={{ ...BODY, fontSize: '13px', fontWeight: 700, color: delayColor, ...TABNUM }}>
                        {isSameDay ? (result.aiDelay === 0 ? 'On time' : `+${result.aiDelay}m`) : (result.avgDelay === 0 ? 'On time' : `+${result.avgDelay}m`)}
                      </div>
                    </div>
                  </div>

                  {/* Delay Forecast */}
                  {isSameDay ? (
                    <div style={{ marginBottom: '12px', padding: '10px 12px', background: C.fieldBlueLightTint, borderRadius: '4px' }}>
                      <div style={{ ...L(C.fieldBlue), marginBottom: '3px' }}>Delay Forecast</div>
                      <div style={{ ...MONO, fontSize: '15px', fontWeight: 'bold', color: delayColor, ...TABNUM }}>{delayRange}</div>
                    </div>
                  ) : (
                    <div style={{ marginBottom: '12px', padding: '10px 12px', background: C.paperDark, borderRadius: '4px' }}>
                      <div style={{ ...L(), marginBottom: '3px' }}>Historical Avg Delay</div>
                      <div style={{ ...MONO, fontSize: '15px', fontWeight: 'bold', color: result.avgDelay === 0 ? C.successGreen : C.orange, ...TABNUM }}>
                        {result.avgDelay === 0 ? 'Typically on time' : `+${result.avgDelay} min`}
                      </div>
                    </div>
                  )}

                  {/* Fare History */}
                  <FareChart
                    origin={from}
                    destination={to}
                    departureDate={date}
                    trainNumber={result.train}
                  />

                  <button
                    onClick={() => window.open(buildAmtrakUrl(from, to, date), '_blank')}
                    className="book-btn"
                    style={{ width: '100%', ...DISPLAY, fontSize: '10px', padding: '11px', borderRadius: '4px', border: 'none', background: C.fieldBlue, color: '#fff', cursor: 'pointer', marginBottom: '6px' }}
                  >
                    Book on Amtrak →
                  </button>
                  <button
                    onClick={() => !isSaved && handleSave(result)}
                    disabled={isSaved}
                    style={{
                      width: '100%', ...DISPLAY, fontSize: '10px', padding: '11px', borderRadius: '4px',
                      border: `1px solid ${isSaved ? C.successGreen : C.fieldBlue}`,
                      background: isSaved ? C.greenLight : 'transparent',
                      color: isSaved ? C.successGreen : C.fieldBlue,
                      cursor: isSaved ? 'default' : 'pointer',
                    }}
                  >
                    {isSaved ? '✓ Saved to Trips' : 'Save Trip'}
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

// ─── TOAST ────────────────────────────────────────────────────────
const ToastContainer = ({ toasts, onRemove }) => (
  <div style={{ position: 'absolute', bottom: '80px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center', pointerEvents: 'none', width: '340px' }}>
    {toasts.map(t => (
      <div key={t.id} style={{ background: t.type === 'success' ? C.successGreen : t.type === 'error' ? C.dangerRed : C.fieldBlue, color: '#fff', borderRadius: '24px', padding: '10px 18px', ...BODY, fontSize: '13px', fontWeight: 700, boxShadow: '0 4px 12px rgba(0,0,0,0.2)', animation: 'slideUp 0.2s ease-out both', pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '320px' }}>
        <span style={{ flex: 1 }}>{t.message}</span>
        {t.undoFn && <button onClick={() => { t.undoFn(); onRemove(t.id); }} style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: '#fff', borderRadius: '12px', padding: '3px 10px', cursor: 'pointer', ...BODY, fontSize: '11px', fontWeight: 700 }}>Undo</button>}
      </div>
    ))}
  </div>
);

// ─── NAVBAR ──────────────────────────────────────────────────────
const NavBar = ({ active, onNav }) => (
  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(245,242,235,0.9)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderTop: `1.5px solid ${C.rule}`, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: '64px', padding: '12px 0 24px', zIndex: 100 }}>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&display=swap');
      @keyframes pulse { 0%,100%{opacity:1;transform:translateX(-50%) scale(1)}50%{opacity:.5;transform:translateX(-50%) scale(1.4)} }
      @keyframes fadeInUp { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)} }
      @keyframes shimmer { 0%{background-position:-200% 0}100%{background-position:200% 0} }
      @keyframes slideUp { from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)} }
      @keyframes splashFadeUp { from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)} }
      @keyframes trackSlide { 0%{transform:translateX(-120%)}100%{transform:translateX(320%)} }
      .card-enter { animation: fadeInUp .2s ease-out both; }
      .shimmer { background: linear-gradient(90deg,#f0eee8 25%,#e8e6e0 50%,#f0eee8 75%);background-size:200% 100%;animation:shimmer 1.5s infinite; }
      .book-btn:hover { background: #124480 !important; }
      .book-btn:active, button:active { transform: scale(0.97); }
    `}</style>
    {['TRIPS', 'BOOKING'].map(tab => {
      const active2 = active === tab.toLowerCase();
      return (
        <button key={tab} onClick={() => onNav(tab.toLowerCase())} style={{ ...DISPLAY, fontSize: '9px', background: 'none', color: active2 ? C.fieldBlue : C.inkLight, border: 'none', cursor: 'pointer', padding: '0 0 4px', borderBottom: `2px solid ${active2 ? C.fieldBlue : 'transparent'}`, transition: 'all 0.15s', minWidth: '44px', textAlign: 'center' }}>
          {tab}
        </button>
      );
    })}
  </div>
);

// ─── ROOT ─────────────────────────────────────────────────────────
export default function CorridorApp() {
  const [activeTab, setActiveTab] = useState('trips');
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [detailScreen, setDetailScreen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [searchState, setSearchState] = useState({ from: 'NYP', to: 'WAS', date: today(), results: null });
  const [showSplash, setShowSplash] = useState(true);

  const addToast = useCallback((message, type = 'info', undoFn = null) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type, undoFn }].slice(-2));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  const removeToast = useCallback(id => setToasts(prev => prev.filter(t => t.id !== id)), []);

  return (
    <div style={{ width: '390px', height: '844px', background: C.paper, color: C.ink, fontFamily: "'Barlow Condensed', sans-serif", margin: '0 auto', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      <div style={{ flex: 1, overflowY: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {detailScreen && selectedTrip ? (
          <TripDetailScreen trip={selectedTrip} onBack={() => setDetailScreen(false)} addToast={addToast} />
        ) : activeTab === 'trips' ? (
          <TripsScreen
            onSelectTrip={trip => { setSelectedTrip(trip); setDetailScreen(true); }}
            onTrackTrain={() => setActiveTab('booking')}
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
      <NavBar active={activeTab} onNav={tab => { setActiveTab(tab); setDetailScreen(false); }} />
    </div>
  );
}
