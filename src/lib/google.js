const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;

// Kelowna center for location bias
const KELOWNA = { latitude: 49.8863, longitude: -119.4966 };

// ── Upper Mission / Kettle Valley flat-rate zone ──
// Polygon ordered around the perimeter (ray-casting point-in-polygon)
export const UPPER_MISSION_ZONE = [
  { lat: 49.7741, lng: -119.5212 }, // QFFH+MG
  { lat: 49.7897, lng: -119.5409 }, // Cedar Creek Estate Winery
  { lat: 49.8175, lng: -119.5025 }, // RF8X+X2V
  { lat: 49.8101, lng: -119.4898 }, // RG66+23
  { lat: 49.8032, lng: -119.4563 }, // RG3V+7FP
  { lat: 49.7882, lng: -119.4812 }, // QGQ9+7G6
];

export const YLW_AIRPORT = { lat: 49.9561, lng: -119.3778 };
const AIRPORT_RADIUS_KM = 3; // treat any dropoff within this radius as "the airport"

export const ZONE_FLAT_RATES = { tesla: 45, discovery: 80 };

// Push the polygon outward from its centroid by ~250m so addresses that sit
// exactly on a boundary point (e.g. Cedar Creek Winery itself) reliably land
// inside the zone rather than being excluded by ray-casting edge ambiguity.
function bufferPolygon(polygon, marginDeg = 0.0025) {
  const cLat = polygon.reduce((s, p) => s + p.lat, 0) / polygon.length;
  const cLng = polygon.reduce((s, p) => s + p.lng, 0) / polygon.length;
  return polygon.map(p => {
    const dLat = p.lat - cLat, dLng = p.lng - cLng;
    const len = Math.sqrt(dLat * dLat + dLng * dLng) || 1;
    return { lat: p.lat + (dLat / len) * marginDeg, lng: p.lng + (dLng / len) * marginDeg };
  });
}
const BUFFERED_ZONE = bufferPolygon(UPPER_MISSION_ZONE);

function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function isInZone(lat, lng, polygon = BUFFERED_ZONE) {
  if (lat == null || lng == null) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    const intersect = ((yi > lng) !== (yj > lng)) &&
      (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isAirport(lat, lng) {
  if (lat == null || lng == null) return false;
  return haversineKm({ lat, lng }, YLW_AIRPORT) <= AIRPORT_RADIUS_KM;
}

/**
 * Returns a flat zone fare if pickup/dropoff qualify (either direction),
 * or null if the standard per-km calc should be used instead.
 */
export function getZoneFare(veh, pickupLat, pickupLng, dropoffLat, dropoffLng) {
  const pickupInZone = isInZone(pickupLat, pickupLng);
  const dropoffInZone = isInZone(dropoffLat, dropoffLng);
  const pickupIsAirport = isAirport(pickupLat, pickupLng);
  const dropoffIsAirport = isAirport(dropoffLat, dropoffLng);

  const qualifies = (pickupInZone && dropoffIsAirport) || (dropoffInZone && pickupIsAirport);
  if (!qualifies) return null;

  return ZONE_FLAT_RATES[veh] ?? null;
}


/**
 * Search for addresses using Google Places API (New)
 * Returns array of { name, addr, placeId }
 */
export async function searchGooglePlaces(query) {
  if (!query || query.length < 3 || !API_KEY) return [];
  
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
      },
      body: JSON.stringify({
        input: query,
        locationBias: {
          circle: {
            center: KELOWNA,
            radius: 50000,
          },
        },
        includedRegionCodes: ['ca'],
      }),
    });

    if (!res.ok) return [];
    const data = await res.json();

    return (data.suggestions || [])
      .filter(s => s.placePrediction)
      .slice(0, 6)
      .map(s => ({
        name: s.placePrediction.structuredFormat?.mainText?.text || '',
        addr: s.placePrediction.text?.text || '',
        placeId: s.placePrediction.placeId || '',
      }));
  } catch (err) {
    console.error('Places API error:', err);
    return [];
  }
}

/**
 * Get driving distance in km between two addresses using Google Routes API.
 * Also returns pickup/dropoff coordinates (from the route's start/end location)
 * so flat-rate zone pricing can be applied without a second API call.
 * Returns { km, durationMinutes, pickup: {lat,lng}, dropoff: {lat,lng} } or null
 */
export async function getRouteDistance(originAddress, destAddress) {
  if (!originAddress || !destAddress || !API_KEY) return null;

  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.legs.startLocation,routes.legs.endLocation',
      },
      body: JSON.stringify({
        origin: { address: originAddress },
        destination: { address: destAddress },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();

    if (!data.routes || !data.routes[0]) return null;

    const route = data.routes[0];
    const km = Math.round((route.distanceMeters || 0) / 1000 * 10) / 10;
    const durationSec = parseInt(route.duration?.replace('s', '') || '0');
    const durationMinutes = Math.round(durationSec / 60);

    const legs = route.legs || [];
    const startLatLng = legs[0]?.startLocation?.latLng;
    const endLatLng = legs[legs.length - 1]?.endLocation?.latLng;

    return {
      km,
      durationMinutes,
      pickup: startLatLng ? { lat: startLatLng.latitude, lng: startLatLng.longitude } : null,
      dropoff: endLatLng ? { lat: endLatLng.latitude, lng: endLatLng.longitude } : null,
    };
  } catch (err) {
    console.error('Routes API error:', err);
    return null;
  }
}
