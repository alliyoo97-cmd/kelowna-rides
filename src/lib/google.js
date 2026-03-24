const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;

// Kelowna center for location bias
const KELOWNA = { latitude: 49.8863, longitude: -119.4966 };

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
 * Get driving distance in km between two addresses using Google Routes API
 * Returns { km, durationMinutes } or null
 */
export async function getRouteDistance(originAddress, destAddress) {
  if (!originAddress || !destAddress || !API_KEY) return null;

  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
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

    return { km, durationMinutes };
  } catch (err) {
    console.error('Routes API error:', err);
    return null;
  }
}
