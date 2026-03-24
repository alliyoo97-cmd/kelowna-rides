import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from './lib/supabase';
import { searchGooglePlaces, getRouteDistance } from './lib/google';

// ── Constants ──
const DEFAULT_SETTINGS = {
  pin: '1234', businessName: 'Private Rides Kelowna',
  tagline: 'Premium private rides. Direct booking, no platform fees, no middleman.',
  driverPhone: '', baseRate: 5, perKmRate: 2, tierKm: 20, perKmRate2: 1.5,
  minFare: 15, discoveryMultiplier: 1.3,
  teslaAvailable: true, discoveryAvailable: true,
};

const POPULAR_ROUTES = [
  { from: 'Downtown', to: 'YLW Airport', km: 15 },
  { from: 'Airport', to: 'Big White', km: 62 },
  { from: 'Downtown', to: 'Big White', km: 58 },
  { from: 'Downtown', to: 'West Kelowna', km: 12 },
  { from: 'Downtown', to: 'UBCO', km: 18 },
  { from: 'Airport', to: 'Vernon', km: 55 },
];

const VEHICLES = [
  { id: 'tesla', icon: '⚡', name: 'Tesla Model 3', sub: 'Performance · 4 seats', maxPax: 4 },
  { id: 'discovery', icon: '🏔️', name: 'Land Rover Discovery', sub: '7 seats · extra luggage', maxPax: 7 },
];

const TIMES = ['ASAP','5:00 AM','5:30 AM','6:00 AM','6:30 AM','7:00 AM','7:30 AM','8:00 AM','8:30 AM','9:00 AM','9:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM','12:00 PM','12:30 PM','1:00 PM','1:30 PM','2:00 PM','2:30 PM','3:00 PM','3:30 PM','4:00 PM','4:30 PM','5:00 PM','5:30 PM','6:00 PM','6:30 PM','7:00 PM','7:30 PM','8:00 PM','8:30 PM','9:00 PM','9:30 PM','10:00 PM','10:30 PM','11:00 PM','11:30 PM','12:00 AM','12:30 AM','1:00 AM','1:30 AM','2:00 AM'];

const STATUS_MAP = {
  pending: { label: 'Pending', color: '#e8a83e', bg: 'rgba(232,168,62,0.12)' },
  pending_payment: { label: 'Awaiting Payment', color: '#c8a44e', bg: 'rgba(200,164,78,0.12)' },
  confirmed: { label: 'Confirmed', color: '#5cb85c', bg: 'rgba(92,184,92,0.12)' },
  completed: { label: 'Completed', color: '#888', bg: 'rgba(136,136,136,0.1)' },
  cancelled: { label: 'Cancelled', color: '#d9534f', bg: 'rgba(217,83,79,0.1)' },
};

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const G = '#c8a44e';

const S = {
  inp: (e) => ({ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: `1px solid ${e ? 'rgba(220,80,80,0.6)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, padding: '13px 16px', color: '#e0e0e0', fontSize: 15, fontFamily: "'DM Sans',sans-serif", outline: 'none', transition: 'border-color 0.2s' }),
  lbl: { color: '#888', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8, display: 'block' },
  btn: (a) => ({ background: a ? 'rgba(200,164,78,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${a ? 'rgba(200,164,78,0.25)' : 'rgba(255,255,255,0.08)'}`, color: a ? G : '#888', borderRadius: 10, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", transition: 'all 0.15s' }),
  pri: { width: '100%', padding: '15px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg,${G},#a8843e)`, color: '#0a0a0a', fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", letterSpacing: 0.3, boxShadow: '0 4px 24px rgba(200,164,78,0.3)' },
  gho: { background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#aaa', padding: '12px 24px', borderRadius: 10, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontWeight: 500 },
};

// ── DB Helpers ──
function toDbBooking(b) {
  return {
    id: b.id, status: b.status, pickup: b.pickup, dropoff: b.dropoff,
    date: b.date, time: b.time, vehicle: b.vehicle, passengers: b.passengers,
    name: b.name, phone: b.phone, notes: b.notes || null,
    driver_note: b.driverNote || null,
    est_fare: b.estFare || null, est_km: b.estKm || null,
    fare: b.fare || null, mileage: b.mileage || null,
    created_at: b.createdAt, completed_at: b.completedAt || null,
  };
}
function fromDbBooking(r) {
  return {
    id: r.id, status: r.status, pickup: r.pickup, dropoff: r.dropoff,
    date: r.date, time: r.time, vehicle: r.vehicle, passengers: r.passengers,
    name: r.name, phone: r.phone, notes: r.notes,
    driverNote: r.driver_note, estFare: r.est_fare ? Number(r.est_fare) : null,
    estKm: r.est_km ? Number(r.est_km) : null, fare: r.fare ? Number(r.fare) : null,
    mileage: r.mileage ? Number(r.mileage) : null,
    createdAt: r.created_at, completedAt: r.completed_at,
  };
}
function fromDbSettings(r) {
  return {
    pin: r.pin, businessName: r.business_name, tagline: r.tagline,
    driverPhone: r.driver_phone, baseRate: Number(r.base_rate),
    perKmRate: Number(r.per_km_rate), tierKm: Number(r.tier_km || 20),
    perKmRate2: Number(r.per_km_rate_2 || 1.5), minFare: Number(r.min_fare),
    discoveryMultiplier: Number(r.discovery_multiplier),
    teslaAvailable: r.tesla_available, discoveryAvailable: r.discovery_available,
  };
}
function toDbSettings(s) {
  return {
    pin: s.pin, business_name: s.businessName, tagline: s.tagline,
    driver_phone: s.driverPhone, base_rate: s.baseRate, per_km_rate: s.perKmRate,
    tier_km: s.tierKm, per_km_rate_2: s.perKmRate2,
    min_fare: s.minFare, discovery_multiplier: s.discoveryMultiplier,
    tesla_available: s.teslaAvailable, discovery_available: s.discoveryAvailable,
  };
}

async function fetchBookings() {
  const { data } = await supabase.from('bookings').select('*').order('created_at', { ascending: false });
  return (data || []).map(fromDbBooking);
}
async function insertBooking(b) {
  await supabase.from('bookings').insert(toDbBooking(b));
}
async function updateBooking(id, fields) {
  const dbFields = {};
  if (fields.status !== undefined) dbFields.status = fields.status;
  if (fields.fare !== undefined) dbFields.fare = fields.fare;
  if (fields.mileage !== undefined) dbFields.mileage = fields.mileage;
  if (fields.driverNote !== undefined) dbFields.driver_note = fields.driverNote;
  if (fields.completedAt !== undefined) dbFields.completed_at = fields.completedAt;
  await supabase.from('bookings').update(dbFields).eq('id', id);
}
async function fetchSettings() {
  const { data } = await supabase.from('settings').select('*').eq('id', 1).single();
  return data ? fromDbSettings(data) : DEFAULT_SETTINGS;
}
async function saveSettings(s) {
  await supabase.from('settings').update(toDbSettings(s)).eq('id', 1);
}
async function fetchBlocked() {
  const { data } = await supabase.from('blocked_dates').select('*');
  return (data || []).map(r => ({ date: r.date }));
}
async function addBlocked(date) {
  await supabase.from('blocked_dates').insert({ date });
}
async function removeBlocked(date) {
  await supabase.from('blocked_dates').delete().eq('date', date);
}

// ── Fare calc (tiered) ──
function calcFare(s, veh, km) {
  if (!km || km <= 0) return null;
  const m = veh === 'discovery' ? (s.discoveryMultiplier || 1.3) : 1;
  const tierKm = s.tierKm || 20;
  const rate1 = s.perKmRate || 2;
  const rate2 = s.perKmRate2 || rate1;
  let distCost;
  if (km <= tierKm) {
    distCost = rate1 * km;
  } else {
    distCost = (rate1 * tierKm) + (rate2 * (km - tierKm));
  }
  return Math.max(((s.baseRate || 5) + distCost) * m, s.minFare || 15);
}

function fareBreakdown(s, veh, km) {
  if (!km || km <= 0) return null;
  const m = veh === 'discovery' ? (s.discoveryMultiplier || 1.3) : 1;
  const tierKm = s.tierKm || 20;
  const rate1 = s.perKmRate || 2;
  const rate2 = s.perKmRate2 || rate1;
  if (km <= tierKm) {
    return `$${s.baseRate.toFixed(2)} base + ${km} km × $${rate1.toFixed(2)}`;
  } else {
    const overKm = Math.round((km - tierKm) * 10) / 10;
    return `$${s.baseRate.toFixed(2)} base + ${tierKm} km × $${rate1.toFixed(2)} + ${overKm} km × $${rate2.toFixed(2)}`;
  }
}

// ── Debounce ──
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const t = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return debounced;
}

// ── Shared UI ──
function Badge({ status }) { const s = STATUS_MAP[status] || STATUS_MAP.pending; return <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, color: s.color, background: s.bg, letterSpacing: 0.5, textTransform: 'uppercase' }}>{s.label}</span>; }
function Header({ title, onBack, right }) { return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}><div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>{onBack && <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#aaa', width: 38, height: 38, borderRadius: 10, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>}<h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>{title}</h2></div>{right}</div>; }
function Row({ label, value, last, gold, onClick }) { return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '9px 0', borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.08)' }}><span style={{ color: '#666', fontSize: 12, fontWeight: 600, minWidth: 85 }}>{label}</span><span onClick={onClick} style={{ color: gold ? G : '#e0e0e0', fontSize: 14, textAlign: 'right', flex: 1, wordBreak: 'break-word', ...(onClick ? { cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(200,164,78,0.3)' } : {}) }}>{value}</span></div>; }

// ── Google Address Input ──
function AddressInput({ value, onChange, placeholder, hasError }) {
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debouncedVal = useDebounce(value, 400);

  useEffect(() => {
    if (!focused || !debouncedVal || debouncedVal.length < 3) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    searchGooglePlaces(debouncedVal).then(r => {
      if (!cancelled) { setResults(r); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [debouncedVal, focused]);

  const handleSelect = (place) => { onChange(place.addr); setResults([]); setFocused(false); };

  return (
    <div style={{ position: 'relative' }}>
      <input style={S.inp(hasError)} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 250)} />
      {focused && results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)', borderTop: 'none', borderRadius: '0 0 10px 10px', boxShadow: '0 12px 32px rgba(0,0,0,0.5)', maxHeight: 260, overflowY: 'auto' }}>
          {results.map((p, i) => (
            <button key={i} onMouseDown={e => { e.preventDefault(); handleSelect(p); }} style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '12px 16px', fontFamily: "'DM Sans',sans-serif" }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(200,164,78,0.08)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ color: '#e0e0e0', fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{p.name}</div>
              <div style={{ color: '#666', fontSize: 12 }}>{p.addr}</div>
            </button>
          ))}
        </div>
      )}
      {focused && loading && <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '12px 16px' }}><span style={{ color: '#666', fontSize: 13 }}>Searching...</span></div>}
    </div>
  );
}

// ═══════════════════════════════════════
// CUSTOMER: Landing
// ═══════════════════════════════════════
function LandingPage({ onBook, onDriver, settings }) {
  return (
    <div style={{ padding: '56px 24px 48px', textAlign: 'center', animation: 'fadeUp 0.6s ease-out', position: 'relative', maxWidth: 480, margin: '0 auto' }}>
      <div style={{ position: 'absolute', top: -80, left: '50%', transform: 'translateX(-50%)', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(200,164,78,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: 40, fontWeight: 600, color: '#fff', margin: '0 0 12px', letterSpacing: -1, lineHeight: 1.1 }}>{settings.businessName}</h1>
      <p style={{ color: '#777', fontSize: 16, margin: '0 0 36px', maxWidth: 360, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>{settings.tagline}</p>
      <button onClick={onBook} style={S.pri}>Book a Ride</button>

      {/* Vehicles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 400, margin: '40px auto 0' }}>
        {VEHICLES.map(v => {
          const avail = (v.id === 'tesla' && settings.teslaAvailable) || (v.id === 'discovery' && settings.discoveryAvailable);
          return (
            <div key={v.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', padding: '20px 14px', opacity: avail ? 1 : 0.4, position: 'relative' }}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>{v.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#ccc', marginBottom: 4 }}>{v.name}</div>
              <div style={{ fontSize: 11, color: '#666' }}>{v.sub}</div>
              <div style={{ position: 'absolute', top: 10, right: 12, fontSize: 10, fontWeight: 600, color: avail ? '#5cb85c' : '#d9534f', background: avail ? 'rgba(92,184,92,0.1)' : 'rgba(217,83,79,0.1)', padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase' }}>{avail ? 'Available' : 'Unavailable'}</div>
            </div>
          );
        })}
      </div>

      {/* Popular Routes */}
      <div style={{ maxWidth: 440, margin: '32px auto 0', textAlign: 'left' }}>
        <h3 style={{ color: '#aaa', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 14, textAlign: 'center' }}>Popular Routes</h3>
        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ color: '#555', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Route</span>
            <span style={{ color: '#555', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'right' }}>⚡ Tesla</span>
            <span style={{ color: '#555', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'right' }}>🏔️ Disc.</span>
          </div>
          {POPULAR_ROUTES.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px', padding: '12px 16px', borderBottom: i < POPULAR_ROUTES.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none', alignItems: 'center' }}>
              <div><span style={{ color: '#ccc', fontSize: 13, fontWeight: 500 }}>{r.from} → {r.to}</span><span style={{ color: '#555', fontSize: 11, marginLeft: 8 }}>{r.km} km</span></div>
              <span style={{ color: G, fontSize: 14, fontWeight: 700, textAlign: 'right' }}>${calcFare(settings, 'tesla', r.km)?.toFixed(0)}</span>
              <span style={{ color: '#aaa', fontSize: 14, fontWeight: 600, textAlign: 'right' }}>${calcFare(settings, 'discovery', r.km)?.toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, maxWidth: 400, margin: '24px auto 0' }}>
        {[{ icon: '💬', label: 'Direct', sub: 'Text to confirm' }, { icon: '💰', label: 'Fair Rates', sub: 'Transparent pricing' }, { icon: '🕐', label: 'Flexible', sub: 'Your schedule' }].map((f, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', padding: '16px 10px' }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{f.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#ccc', marginBottom: 3 }}>{f.label}</div>
            <div style={{ fontSize: 10, color: '#666' }}>{f.sub}</div>
          </div>
        ))}
      </div>

      {settings.driverPhone && <p style={{ color: '#555', fontSize: 13, marginTop: 32 }}>Questions? Text <span style={{ color: G }}>{settings.driverPhone}</span></p>}
      <button onClick={onDriver} style={{ background: 'none', border: 'none', color: '#333', fontSize: 12, cursor: 'pointer', marginTop: 40, padding: '8px 16px', fontFamily: "'DM Sans',sans-serif" }}>Driver Dashboard →</button>
    </div>
  );
}

// ═══════════════════════════════════════
// CUSTOMER: Booking Form
// ═══════════════════════════════════════
function BookingForm({ onBack, onSubmit, settings, blocked }) {
  const availV = VEHICLES.filter(v => (v.id === 'tesla' && settings.teslaAvailable) || (v.id === 'discovery' && settings.discoveryAvailable));
  const defaultVeh = availV.length ? availV[0].id : 'tesla';
  const [form, setForm] = useState({ pickup: '', dropoff: '', date: '', time: 'ASAP', passengers: '1', vehicle: defaultVeh, name: '', phone: '', notes: '' });
  const [errors, setErrors] = useState({});
  const [routeInfo, setRouteInfo] = useState(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const selV = VEHICLES.find(v => v.id === form.vehicle);
  const paxOpts = Array.from({ length: selV?.maxPax || 4 }, (_, i) => String(i + 1));
  const isBlocked = useMemo(() => form.date && blocked.some(b => b.date === form.date), [form.date, blocked]);

  // Debounced route calculation via Google Routes API
  const debouncedPickup = useDebounce(form.pickup, 800);
  const debouncedDropoff = useDebounce(form.dropoff, 800);

  useEffect(() => {
    if (!debouncedPickup || !debouncedDropoff || debouncedPickup.length < 5 || debouncedDropoff.length < 5) {
      setRouteInfo(null); return;
    }
    let cancelled = false;
    setLoadingRoute(true);
    getRouteDistance(debouncedPickup, debouncedDropoff).then(info => {
      if (!cancelled) { setRouteInfo(info); setLoadingRoute(false); }
    });
    return () => { cancelled = true; };
  }, [debouncedPickup, debouncedDropoff]);

  const estFare = useMemo(() => routeInfo ? calcFare(settings, form.vehicle, routeInfo.km) : null, [routeInfo, settings, form.vehicle]);

  const validate = () => { const e = {}; if (!form.pickup.trim()) e.pickup = true; if (!form.dropoff.trim()) e.dropoff = true; if (!form.date) e.date = true; if (!form.name.trim()) e.name = true; if (!form.phone.trim()) e.phone = true; if (isBlocked) e.date = true; setErrors(e); return Object.keys(e).length === 0; };

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', animation: 'fadeUp 0.5s ease-out' }}>
      <Header title="Book Your Ride" onBack={onBack} />
      <div style={{ padding: '24px 24px 48px' }}>

        {/* Vehicle */}
        {availV.length > 1 ? (
          <div style={{ marginBottom: 24 }}>
            <label style={S.lbl}>Vehicle</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {availV.map(v => (
                <button key={v.id} onClick={() => setForm({ ...form, vehicle: v.id, passengers: parseInt(form.passengers) > v.maxPax ? String(v.maxPax) : form.passengers })} style={{ ...S.btn(form.vehicle === v.id), flex: 1, padding: '14px 12px', borderRadius: 12, textAlign: 'left' }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{v.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: form.vehicle === v.id ? G : '#ccc', marginBottom: 2 }}>{v.name}</div>
                  <div style={{ fontSize: 11, color: '#666' }}>{v.sub}</div>
                </button>
              ))}
            </div>
          </div>
        ) : availV.length === 1 ? (
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: '14px 16px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 22 }}>{availV[0].icon}</span>
            <div><div style={{ color: '#ccc', fontSize: 14, fontWeight: 600 }}>{availV[0].name}</div><div style={{ color: '#666', fontSize: 12 }}>{availV[0].sub}</div></div>
          </div>
        ) : null}

        <div style={{ marginBottom: 24 }}><label style={S.lbl}>Pickup</label><AddressInput value={form.pickup} onChange={v => setForm({ ...form, pickup: v })} placeholder="Start typing an address..." hasError={errors.pickup} /></div>
        <div style={{ marginBottom: 24 }}><label style={S.lbl}>Dropoff</label><AddressInput value={form.dropoff} onChange={v => setForm({ ...form, dropoff: v })} placeholder="Where are you headed?" hasError={errors.dropoff} /></div>

        {/* Fare estimate */}
        {loadingRoute && <div style={{ background: 'rgba(200,164,78,0.05)', borderRadius: 14, padding: '14px 20px', border: '1px solid rgba(200,164,78,0.1)', marginBottom: 24 }}><span style={{ color: '#888', fontSize: 13 }}>Calculating route...</span></div>}
        {estFare && routeInfo && !loadingRoute && (
          <div style={{ background: 'linear-gradient(135deg, rgba(200,164,78,0.1), rgba(200,164,78,0.04))', borderRadius: 14, padding: '18px 20px', border: '1px solid rgba(200,164,78,0.2)', marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: '#aaa', fontSize: 13, fontWeight: 500 }}>Estimated Total</span>
              <span style={{ color: G, fontSize: 28, fontWeight: 700 }}>${estFare.toFixed(2)}</span>
            </div>
            <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{routeInfo.km} km · ~{routeInfo.durationMinutes} min drive</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#555', fontSize: 11 }}>{fareBreakdown(settings, form.vehicle, routeInfo.km)}</span>
              {form.vehicle === 'discovery' && <span style={{ color: '#666', fontSize: 11, background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 6 }}>× {settings.discoveryMultiplier} XL</span>}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
          <div><label style={S.lbl}>Date</label><input type="date" min={today} style={S.inp(errors.date)} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />{isBlocked && <p style={{ color: 'rgba(220,100,100,0.9)', fontSize: 12, marginTop: 6 }}>Not available on this date</p>}</div>
          <div><label style={S.lbl}>Time</label><select style={{ ...S.inp(false), appearance: 'none', cursor: 'pointer' }} value={form.time} onChange={e => setForm({ ...form, time: e.target.value })}>{TIMES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
        </div>

        <div style={{ marginBottom: 24 }}><label style={S.lbl}>Passengers</label><div style={{ display: 'flex', gap: 8 }}>{paxOpts.map(n => <button key={n} onClick={() => setForm({ ...form, passengers: n })} style={{ ...S.btn(form.passengers === n), flex: 1, padding: '11px 0', fontSize: 15, fontWeight: 600 }}>{n}</button>)}</div></div>

        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '28px 0' }} />

        <div style={{ marginBottom: 24 }}><label style={S.lbl}>Your Name</label><input style={S.inp(errors.name)} placeholder="First and last" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
        <div style={{ marginBottom: 24 }}><label style={S.lbl}>Phone</label><input style={S.inp(errors.phone)} placeholder="250-555-0000" type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
        <div style={{ marginBottom: 32 }}><label style={S.lbl}>Notes <span style={{ color: '#555', fontWeight: 400, textTransform: 'none' }}>(optional)</span></label><textarea style={{ ...S.inp(false), resize: 'vertical', minHeight: 64 }} placeholder="Extra stops, luggage, accessibility needs..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>

        {Object.keys(errors).length > 0 && <p style={{ color: 'rgba(220,100,100,0.9)', fontSize: 13, marginBottom: 14, textAlign: 'center' }}>Please fill in all required fields</p>}

        {estFare && routeInfo && !loadingRoute ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => { if (validate()) onSubmit({ ...form, estFare, estKm: routeInfo?.km || null, payNow: true }); }} style={S.pri}>
              {`Pay & Book · $${estFare.toFixed(2)}`}
            </button>
            <button onClick={() => { if (validate()) onSubmit({ ...form, estFare, estKm: routeInfo?.km || null, payNow: false }); }} style={{ ...S.gho, width: '100%', textAlign: 'center' }}>
              Book Now, Pay Later
            </button>
            <p style={{ color: '#555', fontSize: 11, textAlign: 'center', lineHeight: 1.5 }}>
              Pay later via e-transfer or tap at pickup
            </p>
          </div>
        ) : (
          <div>
            <button onClick={() => { if (validate()) onSubmit({ ...form, estFare: null, estKm: routeInfo?.km || null, payNow: false }); }} style={S.pri}>
              Request Ride
            </button>
            <p style={{ color: '#555', fontSize: 12, textAlign: 'center', marginTop: 14, lineHeight: 1.6 }}>
              You'll receive a text to confirm your booking and fare.<br />Payment via e-transfer or tap at pickup.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// CUSTOMER: Confirmation
// ═══════════════════════════════════════
function Confirmation({ booking, onHome }) {
  const veh = VEHICLES.find(v => v.id === booking.vehicle);
  const rows = [['Date', booking.date], ['Time', booking.time], ['Vehicle', veh ? `${veh.icon} ${veh.name}` : booking.vehicle], ['Pickup', booking.pickup], ['Dropoff', booking.dropoff], ['Passengers', booking.passengers], ['Name', booking.name], ['Phone', booking.phone]];
  if (booking.estFare) rows.push(['Est. Fare', `$${booking.estFare.toFixed(2)}`]);
  if (booking.notes) rows.push(['Notes', booking.notes]);
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '48px 24px', textAlign: 'center', animation: 'fadeUp 0.6s ease-out' }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: `linear-gradient(135deg,${G},#e8c86e)`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 32, boxShadow: '0 0 40px rgba(200,164,78,0.3)' }}>✓</div>
      <h2 style={{ fontFamily: "'Playfair Display',serif", color: '#fff', fontSize: 28, fontWeight: 600, margin: '0 0 6px' }}>Booking Requested</h2>
      <p style={{ color: '#888', fontSize: 14, margin: '0 0 32px' }}>You'll receive a text confirmation shortly</p>
      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 16, border: '1px solid rgba(200,164,78,0.25)', padding: '24px 20px', textAlign: 'left', marginBottom: 20 }}>{rows.map(([l, v], i) => <Row key={i} label={l} value={v} last={i === rows.length - 1} />)}</div>
      <div style={{ background: 'rgba(200,164,78,0.07)', borderRadius: 12, padding: '14px 18px', border: '1px solid rgba(200,164,78,0.12)', marginBottom: 28 }}><p style={{ color: G, fontSize: 13, margin: 0, lineHeight: 1.6 }}>{booking.paid ? '✓ Payment received. ' : ''}Final fare confirmed by driver. {!booking.paid ? 'Payment via e-transfer or tap at pickup.' : ''}</p></div>
      <button onClick={onHome} style={S.gho}>Back to Home</button>
    </div>
  );
}

// ═══════════════════════════════════════
// DRIVER PAGES
// ═══════════════════════════════════════
function PinGate({ onAuth, settings }) {
  const [pin, setPin] = useState(''); const [err, setErr] = useState(false);
  const ck = () => { if (pin === (settings.pin || '1234')) onAuth(); else { setErr(true); setPin(''); } };
  return <div style={{ maxWidth: 360, margin: '0 auto', padding: '60px 24px', textAlign: 'center', animation: 'fadeUp 0.5s ease-out' }}><div style={{ fontSize: 32, marginBottom: 16 }}>🔒</div><h2 style={{ fontFamily: "'Playfair Display',serif", color: '#fff', fontSize: 24, margin: '0 0 8px' }}>Driver Dashboard</h2><p style={{ color: '#666', fontSize: 14, margin: '0 0 28px' }}>Enter PIN to continue</p><input type="password" inputMode="numeric" maxLength={6} placeholder="PIN" style={{ ...S.inp(err), textAlign: 'center', fontSize: 24, letterSpacing: 8, maxWidth: 200, margin: '0 auto 16px' }} value={pin} onChange={e => { setPin(e.target.value); setErr(false); }} onKeyDown={e => e.key === 'Enter' && ck()} />{err && <p style={{ color: 'rgba(220,100,100,0.9)', fontSize: 13, marginBottom: 12 }}>Wrong PIN</p>}<button onClick={ck} style={{ ...S.pri, maxWidth: 200, margin: '0 auto' }}>Unlock</button></div>;
}

function SmsTemplates({ booking }) {
  const name = booking.name.split(' ')[0];
  const templates = [
    { label: 'Confirm', msg: `Hi ${name}, your ride on ${booking.date} at ${booking.time} is confirmed. Pickup: ${booking.pickup}. ${booking.fare ? `Fare: $${parseFloat(booking.fare).toFixed(2)}.` : ''} See you then!` },
    { label: 'En Route', msg: `Hi ${name}, I'm on my way to pick you up at ${booking.pickup}. Be there in about 10 min.` },
    { label: 'Arrived', msg: `Hi ${name}, I've arrived at ${booking.pickup}. I'm in the ${booking.vehicle === 'discovery' ? 'Land Rover Discovery' : 'white Tesla Model 3 Performance'}. See you out front!` },
  ];
  const [copied, setCopied] = useState(null);
  const copy = (msg, i) => { navigator.clipboard?.writeText(msg); setCopied(i); setTimeout(() => setCopied(null), 1500); };
  return <div style={{ marginTop: 16 }}><p style={{ color: '#666', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Quick SMS</p><div style={{ display: 'flex', gap: 8 }}>{templates.map((t, i) => <button key={i} onClick={() => copy(t.msg, i)} style={{ ...S.btn(false), flex: 1, padding: '10px 8px', fontSize: 12, fontWeight: 600, borderRadius: 8, textAlign: 'center', color: copied === i ? '#5cb85c' : '#aaa' }}>{copied === i ? '✓ Copied' : t.label}</button>)}</div></div>;
}

function BookingsTab({ bookings, onUpdate }) {
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [fareInput, setFareInput] = useState('');
  const [kmInput, setKmInput] = useState('');
  const [driverNote, setDriverNote] = useState('');

  const filtered = bookings.filter(b => {
    if (filter === 'active') return b.status === 'pending' || b.status === 'confirmed';
    if (filter === 'completed') return b.status === 'completed';
    if (filter === 'cancelled') return b.status === 'cancelled';
    return true;
  }).filter(b => !search || b.name.toLowerCase().includes(search.toLowerCase()) || b.phone.includes(search) || b.pickup.toLowerCase().includes(search.toLowerCase()) || b.dropoff.toLowerCase().includes(search.toLowerCase()));

  if (selected) {
    const b = bookings.find(x => x.id === selected);
    if (!b) { setSelected(null); return null; }
    const veh = VEHICLES.find(v => v.id === b.vehicle);
    const rows = [['Customer', b.name], ['Phone', b.phone], ['Date', b.date], ['Time', b.time], ['Vehicle', veh ? `${veh.icon} ${veh.name}` : b.vehicle], ['Passengers', b.passengers], ['Pickup', b.pickup], ['Dropoff', b.dropoff]];
    if (b.notes) rows.push(['Cust. Notes', b.notes]);
    if (b.estKm) rows.push(['Est. Distance', `${b.estKm} km`]);
    if (b.estFare) rows.push(['Est. Fare', `$${b.estFare.toFixed(2)}`]);
    if (b.fare) rows.push(['Final Fare', `$${parseFloat(b.fare).toFixed(2)}`]);
    if (b.mileage) rows.push(['Mileage', `${b.mileage} km`]);
    if (b.driverNote) rows.push(['My Notes', b.driverNote]);

    return (
      <div style={{ animation: 'fadeUp 0.3s ease-out' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px 12px' }}>
          <button onClick={() => setSelected(null)} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#aaa', padding: '8px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>← Back</button>
          <Badge status={b.status} />
        </div>
        <div style={{ padding: '0 24px 24px' }}>
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', padding: '20px 18px', marginBottom: 16 }}>
            {rows.map(([l, v], i) => <Row key={i} label={l} value={v} last={i === rows.length - 1} gold={l === 'Phone'} onClick={l === 'Phone' ? () => navigator.clipboard?.writeText(v) : undefined} />)}
          </div>
          {(b.status === 'pending' || b.status === 'confirmed') && (
            <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1 }}><label style={{ ...S.lbl, marginBottom: 6 }}>Fare ($)</label><input style={S.inp(false)} placeholder={b.estFare ? b.estFare.toFixed(2) : '0.00'} value={fareInput} onChange={e => setFareInput(e.target.value)} type="number" step="0.01" /></div>
                <div style={{ flex: 1 }}><label style={{ ...S.lbl, marginBottom: 6 }}>Mileage (km)</label><input style={S.inp(false)} placeholder={b.estKm ? String(b.estKm) : '0'} value={kmInput} onChange={e => setKmInput(e.target.value)} type="number" step="0.1" /></div>
              </div>
              <div style={{ marginBottom: 16 }}><label style={{ ...S.lbl, marginBottom: 6 }}>My Notes</label><textarea style={{ ...S.inp(false), resize: 'vertical', minHeight: 48, fontSize: 13 }} placeholder="Private notes..." value={driverNote} onChange={e => setDriverNote(e.target.value)} /></div>
            </>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            {b.status === 'pending' && (
              <><button onClick={() => { onUpdate(b.id, 'confirmed', { fare: fareInput || b.estFare || '', mileage: kmInput || b.estKm || '', driverNote: driverNote || b.driverNote || '' }); }} style={{ ...S.pri, width: 'auto', flex: 1, padding: '13px', fontSize: 14 }}>Confirm</button><button onClick={() => { onUpdate(b.id, 'cancelled'); setSelected(null); }} style={{ ...S.gho, flex: 1, color: '#d9534f', borderColor: 'rgba(217,83,79,0.3)' }}>Decline</button></>
            )}
            {b.status === 'confirmed' && (
              <><button onClick={() => { onUpdate(b.id, 'completed', { fare: fareInput || b.fare || b.estFare || '', mileage: kmInput || b.mileage || b.estKm || '', driverNote: driverNote || b.driverNote || '', completedAt: new Date().toISOString() }); }} style={{ ...S.pri, width: 'auto', flex: 1, padding: '13px', fontSize: 14 }}>Complete</button><button onClick={() => { onUpdate(b.id, 'cancelled'); setSelected(null); }} style={{ ...S.gho, flex: 1, color: '#d9534f', borderColor: 'rgba(217,83,79,0.3)' }}>Cancel</button></>
            )}
          </div>
          {(b.status === 'pending' || b.status === 'confirmed') && <SmsTemplates booking={b} />}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, padding: '16px 24px' }}>
        {[{ n: bookings.filter(b => b.status === 'pending' || b.status === 'confirmed').length, l: 'Active' }, { n: bookings.filter(b => b.status === 'completed').length, l: 'Completed' }, { n: bookings.length, l: 'Total' }].map((s, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: '14px 10px', textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{s.n}</div><div style={{ fontSize: 11, color: '#666', fontWeight: 500 }}>{s.l}</div></div>
        ))}
      </div>
      <div style={{ padding: '0 24px 8px' }}><input style={{ ...S.inp(false), fontSize: 13, padding: '10px 14px' }} placeholder="Search by customer, phone, or location..." value={search} onChange={e => setSearch(e.target.value)} /></div>
      <div style={{ display: 'flex', gap: 6, padding: '8px 24px 12px', flexWrap: 'wrap' }}>
        {[{ id: 'active', l: 'Active' }, { id: 'completed', l: 'Done' }, { id: 'cancelled', l: 'Cancelled' }, { id: 'all', l: 'All' }].map(t => (
          <button key={t.id} onClick={() => setFilter(t.id)} style={{ ...S.btn(filter === t.id), padding: '7px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8 }}>{t.l}</button>
        ))}
      </div>
      <div style={{ padding: '0 24px 24px' }}>
        {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '48px 0', color: '#555', fontSize: 14 }}>{search ? 'No matching bookings' : `No ${filter === 'all' ? '' : filter} bookings`}</div>}
        {filtered.map(b => {
          const veh = VEHICLES.find(v => v.id === b.vehicle);
          return (
            <button key={b.id} onClick={() => { setSelected(b.id); setFareInput(b.fare ? String(b.fare) : ''); setKmInput(b.mileage ? String(b.mileage) : ''); setDriverNote(b.driverNote || ''); }} style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${b.status === 'pending' ? 'rgba(200,164,78,0.25)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 14, padding: '16px 18px', marginBottom: 10, fontFamily: "'DM Sans',sans-serif" }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}><span style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>{b.name}</span><Badge status={b.status} /></div>
              <div style={{ color: '#888', fontSize: 13 }}>{b.date} · {b.time} · {veh?.icon} {b.passengers} pax{b.fare ? ` · $${parseFloat(b.fare).toFixed(2)}` : ''}</div>
              <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>{b.pickup} → {b.dropoff}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EarningsTab({ bookings }) {
  const [view, setView] = useState('summary');
  const completed = bookings.filter(b => b.status === 'completed' && b.fare);
  const totalE = completed.reduce((s, b) => s + parseFloat(b.fare || 0), 0);
  const totalKm = completed.reduce((s, b) => s + parseFloat(b.mileage || 0), 0);
  const avgFare = completed.length ? totalE / completed.length : 0;
  const perKm = totalKm > 0 ? totalE / totalKm : 0;

  const groupBy = (fn) => { const g = {}; completed.forEach(b => { const k = fn(b); if (!g[k]) g[k] = { revenue: 0, km: 0, rides: 0 }; g[k].revenue += parseFloat(b.fare || 0); g[k].km += parseFloat(b.mileage || 0); g[k].rides++; }); return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0])); };
  const today = new Date().toISOString().split('T')[0];
  const todayE = completed.filter(b => b.date === today);
  const todayRev = todayE.reduce((s, b) => s + parseFloat(b.fare || 0), 0);
  const now = new Date(); const dow = now.getDay() || 7; const ws = new Date(now); ws.setDate(now.getDate() - dow + 1);
  const weekStartStr = ws.toISOString().split('T')[0];
  const weekE = completed.filter(b => b.date >= weekStartStr && b.date <= today);
  const weekRev = weekE.reduce((s, b) => s + parseFloat(b.fare || 0), 0);
  const monthly = groupBy(b => b.date?.slice(0, 7) || 'Unknown');
  const daily = groupBy(b => b.date || 'Unknown');

  const exportCsv = () => {
    const h = 'ID,Date,Time,Customer,Phone,Pickup,Dropoff,Vehicle,Passengers,Status,Fare,Mileage_km,CustomerNotes,DriverNotes\n';
    const r = bookings.map(b => [b.id, b.date, b.time, `"${b.name}"`, b.phone, `"${b.pickup}"`, `"${b.dropoff}"`, b.vehicle, b.passengers, b.status, b.fare || '', b.mileage || '', `"${(b.notes || '').replace(/"/g, '""')}"`, `"${(b.driverNote || '').replace(/"/g, '""')}"`].join(',')).join('\n');
    const blob = new Blob([h + r], { type: 'text/csv' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `rides-${today}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div style={{ background: 'linear-gradient(135deg, rgba(200,164,78,0.1), rgba(200,164,78,0.04))', borderRadius: 12, border: '1px solid rgba(200,164,78,0.15)', padding: '16px 14px' }}>
          <div style={{ color: '#888', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Today</div>
          <div style={{ color: G, fontSize: 22, fontWeight: 700 }}>${todayRev.toFixed(2)}</div>
          <div style={{ color: '#666', fontSize: 11 }}>{todayE.length} rides</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: '16px 14px' }}>
          <div style={{ color: '#888', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>This Week</div>
          <div style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>${weekRev.toFixed(2)}</div>
          <div style={{ color: '#666', fontSize: 11 }}>{weekE.length} rides</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 20 }}>
        {[{ n: `$${totalE.toFixed(2)}`, l: 'All Time' }, { n: `${totalKm.toFixed(0)} km`, l: 'Total Mileage' }, { n: `$${avgFare.toFixed(2)}`, l: 'Avg per Ride' }, { n: `$${perKm.toFixed(2)}/km`, l: 'Revenue/KM' }].map((s, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: '14px 12px' }}><div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{s.n}</div><div style={{ fontSize: 11, color: '#666', fontWeight: 500, marginTop: 2 }}>{s.l}</div></div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>{[{ id: 'summary', l: 'Monthly' }, { id: 'daily', l: 'Daily' }].map(t => <button key={t.id} onClick={() => setView(t.id)} style={{ ...S.btn(view === t.id), padding: '7px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8 }}>{t.l}</button>)}</div>
      {(view === 'summary' ? monthly : daily).slice(0, 30).map(([k, d]) => (
        <div key={k} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: '14px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={{ color: '#ccc', fontSize: 14, fontWeight: 600 }}>{k}</div><div style={{ color: '#666', fontSize: 12 }}>{d.rides} rides · {d.km.toFixed(0)} km</div></div>
          <div style={{ color: G, fontSize: 18, fontWeight: 700 }}>${d.revenue.toFixed(2)}</div>
        </div>
      ))}
      <button onClick={exportCsv} style={{ ...S.gho, width: '100%', textAlign: 'center', marginTop: 16 }}>Export All Bookings (CSV)</button>
    </div>
  );
}

function CalendarTab({ blocked, onAdd, onRemove }) {
  const [nd, setNd] = useState('');
  const today = new Date().toISOString().split('T')[0];
  const sorted = [...blocked].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div style={{ padding: '20px 24px' }}>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>Block off dates you're unavailable. Customers will see these as unavailable.</p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}><input type="date" min={today} style={{ ...S.inp(false), flex: 1 }} value={nd} onChange={e => setNd(e.target.value)} /><button onClick={() => { if (nd && !blocked.find(b => b.date === nd)) { onAdd(nd); setNd(''); } }} style={{ ...S.pri, width: 'auto', padding: '13px 24px', fontSize: 14 }}>Block</button></div>
      {sorted.length === 0 && <p style={{ color: '#555', fontSize: 14, textAlign: 'center', padding: '32px 0' }}>No blocked dates</p>}
      {sorted.map(b => <div key={b.date} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: '14px 16px', marginBottom: 8 }}><div><div style={{ color: '#ccc', fontSize: 14, fontWeight: 600 }}>{b.date}</div><div style={{ color: '#666', fontSize: 12 }}>Unavailable</div></div><button onClick={() => onRemove(b.date)} style={{ background: 'rgba(217,83,79,0.1)', border: '1px solid rgba(217,83,79,0.2)', color: '#d9534f', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>Remove</button></div>)}
    </div>
  );
}

function SettingsTab({ settings, onSave }) {
  const [l, setL] = useState({ ...settings });
  const [saved, setSaved] = useState(false);
  const doSave = () => { onSave(l); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  return (
    <div style={{ padding: '20px 24px' }}>
      <h3 style={{ color: '#aaa', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Branding</h3>
      <div style={{ marginBottom: 18 }}><label style={S.lbl}>Business Name</label><input style={S.inp(false)} value={l.businessName} onChange={e => setL({ ...l, businessName: e.target.value })} /></div>
      <div style={{ marginBottom: 18 }}><label style={S.lbl}>Tagline</label><input style={S.inp(false)} value={l.tagline} onChange={e => setL({ ...l, tagline: e.target.value })} /></div>
      <div style={{ marginBottom: 18 }}><label style={S.lbl}>Your Phone</label><input style={S.inp(false)} value={l.driverPhone} onChange={e => setL({ ...l, driverPhone: e.target.value })} /></div>

      <h3 style={{ color: '#aaa', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16, marginTop: 28 }}>Vehicle Availability</h3>
      <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
        {VEHICLES.map(v => {
          const key = v.id === 'tesla' ? 'teslaAvailable' : 'discoveryAvailable';
          const on = l[key];
          return <button key={v.id} onClick={() => setL({ ...l, [key]: !on })} style={{ flex: 1, padding: '14px 12px', borderRadius: 12, textAlign: 'left', background: on ? 'rgba(92,184,92,0.08)' : 'rgba(217,83,79,0.06)', border: `1px solid ${on ? 'rgba(92,184,92,0.25)' : 'rgba(217,83,79,0.2)'}`, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{v.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: on ? '#5cb85c' : '#d9534f' }}>{v.name}</div>
            <div style={{ fontSize: 12, color: on ? '#5cb85c' : '#d9534f', fontWeight: 600, marginTop: 4 }}>{on ? '✓ Available' : '✗ Unavailable'}</div>
          </button>;
        })}
      </div>

      <h3 style={{ color: '#aaa', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16, marginTop: 28 }}>Pricing</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div><label style={S.lbl}>Base Rate ($)</label><input style={S.inp(false)} type="number" step="0.5" value={l.baseRate} onChange={e => setL({ ...l, baseRate: parseFloat(e.target.value) || 0 })} /></div>
        <div><label style={S.lbl}>Minimum Fare ($)</label><input style={S.inp(false)} type="number" step="1" value={l.minFare} onChange={e => setL({ ...l, minFare: parseFloat(e.target.value) || 0 })} /></div>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: '16px', marginBottom: 12 }}>
        <p style={{ color: '#888', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Distance Tiers</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div><label style={S.lbl}>Rate 1 ($/km)</label><input style={S.inp(false)} type="number" step="0.05" value={l.perKmRate} onChange={e => setL({ ...l, perKmRate: parseFloat(e.target.value) || 0 })} /></div>
          <div><label style={S.lbl}>Up to (km)</label><input style={S.inp(false)} type="number" step="1" value={l.tierKm} onChange={e => setL({ ...l, tierKm: parseFloat(e.target.value) || 0 })} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={S.lbl}>Rate 2 ($/km)</label><input style={S.inp(false)} type="number" step="0.05" value={l.perKmRate2} onChange={e => setL({ ...l, perKmRate2: parseFloat(e.target.value) || 0 })} /></div>
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}><span style={{ color: '#666', fontSize: 12 }}>After {l.tierKm || 20} km</span></div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <div><label style={S.lbl}>Discovery Multiplier</label><input style={S.inp(false)} type="number" step="0.05" value={l.discoveryMultiplier} onChange={e => setL({ ...l, discoveryMultiplier: parseFloat(e.target.value) || 1 })} /></div>
      </div>

      <h3 style={{ color: '#aaa', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16, marginTop: 28 }}>Security</h3>
      <div style={{ marginBottom: 28 }}><label style={S.lbl}>Dashboard PIN</label><input style={S.inp(false)} value={l.pin} onChange={e => setL({ ...l, pin: e.target.value })} /></div>
      <button onClick={doSave} style={S.pri}>{saved ? '✓ Saved!' : 'Save Settings'}</button>
    </div>
  );
}

function DriverDashboard({ bookings, onUpdate, onBack, settings, onSaveSettings, blocked, onAddBlocked, onRemoveBlocked, onRefresh }) {
  const [tab, setTab] = useState('bookings');
  const pc = bookings.filter(b => b.status === 'pending').length;
  const tabs = [{ id: 'bookings', label: 'Rides', icon: '🚗' }, { id: 'earnings', label: 'Earnings', icon: '💰' }, { id: 'calendar', label: 'Calendar', icon: '📅' }, { id: 'settings', label: 'Settings', icon: '⚙️' }];

  // Auto-refresh bookings every 30 seconds
  useEffect(() => { const iv = setInterval(onRefresh, 30000); return () => clearInterval(iv); }, [onRefresh]);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', animation: 'fadeUp 0.4s ease-out' }}>
      <Header title="Dashboard" onBack={onBack} right={pc > 0 ? <span style={{ background: 'rgba(232,168,62,0.15)', color: '#e8a83e', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8 }}>{pc} new</span> : null} />
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: '12px 0', background: 'transparent', border: 'none', borderBottom: tab === t.id ? `2px solid ${G}` : '2px solid transparent', color: tab === t.id ? G : '#666', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}><span style={{ fontSize: 14, display: 'block', marginBottom: 2 }}>{t.icon}</span>{t.label}</button>)}
      </div>
      {tab === 'bookings' && <BookingsTab bookings={bookings} onUpdate={onUpdate} />}
      {tab === 'earnings' && <EarningsTab bookings={bookings} />}
      {tab === 'calendar' && <CalendarTab blocked={blocked} onAdd={onAddBlocked} onRemove={onRemoveBlocked} />}
      {tab === 'settings' && <SettingsTab settings={settings} onSave={onSaveSettings} />}
    </div>
  );
}

// ═══════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════
export default function App() {
  const [page, setPage] = useState('home');
  const [bookings, setBookings] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [blocked, setBlocked] = useState([]);
  const [lastBooking, setLastBooking] = useState(null);
  const [driverAuth, setDriverAuth] = useState(false);
  const [loading, setLoading] = useState(true);

  // Hash routing
  useEffect(() => {
    const h = () => {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      if (hash.startsWith('confirmed?')) {
        const params = new URLSearchParams(hash.split('?')[1]);
        const bookingId = params.get('booking');
        const paid = params.get('paid');
        if (bookingId && paid === 'true') {
          updateBooking(bookingId, { status: 'pending' });
          setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'pending' } : b));
          fetchBookings().then(all => {
            const found = all.find(b => b.id === bookingId);
            if (found) setLastBooking({ ...found, status: 'pending' });
            setPage('confirmation');
          });
        }
      } else if (hash === 'book' || hash.startsWith('book?')) {
        setPage('book');
      } else if (hash === 'driver') {
        setPage('driver');
      }
    };
    h();
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  useEffect(() => { if (page === 'home') window.history.replaceState(null, '', window.location.pathname); else window.history.replaceState(null, '', `#${page}`); }, [page]);

  // Load data from Supabase
  useEffect(() => {
    Promise.all([fetchBookings(), fetchSettings(), fetchBlocked()]).then(([b, s, bl]) => {
      setBookings(b); setSettings({ ...DEFAULT_SETTINGS, ...s }); setBlocked(bl); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const refreshBookings = useCallback(async () => { const b = await fetchBookings(); setBookings(b); }, []);

  const handleBook = async (form) => {
    const payNow = form.payNow;
    const booking = { ...form, id: genId(), status: payNow ? 'pending_payment' : 'pending', createdAt: new Date().toISOString() };
    delete booking.payNow;

    setBookings(prev => [booking, ...prev]);
    await insertBooking(booking);

    if (payNow && form.estFare) {
      try {
        const res = await fetch('/api/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingId: booking.id,
            amount: form.estFare,
            customerName: form.name,
            pickup: form.pickup,
            dropoff: form.dropoff,
            date: form.date,
            time: form.time,
            vehicle: form.vehicle,
          }),
        });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
          return;
        }
      } catch (err) {
        console.error('Stripe redirect failed:', err);
      }
    }

    setLastBooking(booking);
    setPage('confirmation');
  };

  const handleUpdate = async (id, status, extra = {}) => {
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status, ...extra } : b));
    await updateBooking(id, { status, ...extra });
  };

  const handleSaveSettings = async (s) => { setSettings(s); await saveSettings(s); };
  const handleAddBlocked = async (date) => { setBlocked(prev => [...prev, { date }]); await addBlocked(date); };
  const handleRemoveBlocked = async (date) => { setBlocked(prev => prev.filter(b => b.date !== date)); await removeBlocked(date); };

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ color: '#555' }}>Loading...</div></div>;

  return (
    <>
      {page === 'home' && <LandingPage onBook={() => setPage('book')} onDriver={() => setPage('driver')} settings={settings} />}
      {page === 'book' && <BookingForm onBack={() => setPage('home')} onSubmit={handleBook} settings={settings} blocked={blocked} />}
      {page === 'confirmation' && lastBooking && <Confirmation booking={lastBooking} onHome={() => setPage('home')} />}
      {page === 'driver' && !driverAuth && <div><Header title="" onBack={() => setPage('home')} /><PinGate onAuth={() => { setDriverAuth(true); refreshBookings(); }} settings={settings} /></div>}
      {page === 'driver' && driverAuth && <DriverDashboard bookings={bookings} onUpdate={handleUpdate} onBack={() => { setDriverAuth(false); setPage('home'); }} settings={settings} onSaveSettings={handleSaveSettings} blocked={blocked} onAddBlocked={handleAddBlocked} onRemoveBlocked={handleRemoveBlocked} onRefresh={refreshBookings} />}
    </>
  );
}
