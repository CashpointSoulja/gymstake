import type { Gym } from '../core/types';
import type { Map as LeafletMap, Marker, Circle, LeafletMouseEvent } from 'leaflet';
import 'leaflet/dist/leaflet.css';

export const GYMS: Gym[] = [
  { id: 'third-space-soho', name: 'Third Space Soho', address: '67 Brewer Street, Soho, London W1F 9US', lat: 51.5102, lng: -0.1364 },
  { id: 'third-space-tower-bridge', name: 'Third Space Tower Bridge', address: '2B More London Riverside, London SE1 2AP', lat: 51.5045, lng: -0.0794 },
  { id: 'gymbox-farringdon', name: 'Gymbox Farringdon', address: '12a Leather Lane, London EC1N 7SS', lat: 51.5201, lng: -0.1099 },
  { id: 'gymbox-covent-garden', name: 'Gymbox Covent Garden', address: '42–49 St Martin’s Lane, London WC2N 4EJ', lat: 51.5114, lng: -0.1268 },
  { id: 'puregym-aldgate', name: 'PureGym London Aldgate', address: '21 Leman Street, London E1 8EN', lat: 51.5128, lng: -0.0718 },
  { id: 'puregym-marylebone', name: 'PureGym London Marylebone', address: '7 Balcombe Street, London NW1 6NA', lat: 51.5223, lng: -0.1629 },
  { id: 'fitness-first-tottenham-court-road', name: 'Fitness First Tottenham Court Road', address: '179A Tottenham Court Road, London W1T 7PA', lat: 51.5211, lng: -0.1350 },
  { id: 'virgin-active-bank', name: 'Virgin Active Bank', address: '1 Angel Court, London EC2R 7HJ', lat: 51.5149, lng: -0.0881 },
];

export function validCoordinates(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function parseCoordinates(lat: string, lng: string): { lat: number; lng: number } | null {
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
  if (!decimal.test(lat.trim()) || !decimal.test(lng.trim())) return null;
  const result = { lat: Number(lat), lng: Number(lng) };
  return validCoordinates(result.lat, result.lng) ? result : null;
}

export function searchLocalGyms(query: string): Gym[] {
  const terms = query.trim().toLocaleLowerCase('en-GB').split(/\s+/).filter(Boolean);
  return GYMS.filter(gym => {
    const content = `${gym.name} ${gym.address}`.toLocaleLowerCase('en-GB');
    return terms.every(term => content.includes(term));
  }).map(gym => ({ ...gym }));
}

export function parsePlaceResults(value: unknown): Gym[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return [];
    const place = entry as Record<string, unknown>;
    if (typeof place.lat !== 'string' || typeof place.lon !== 'string' || typeof place.display_name !== 'string') return [];
    const coordinates = parseCoordinates(place.lat, place.lon);
    if (!coordinates) return [];
    const address = place.display_name.trim().slice(0, 240);
    if (!address) return [];
    const suppliedName = typeof place.name === 'string' ? place.name.trim() : '';
    const name = (suppliedName || address.split(',')[0]).slice(0, 80);
    return [{ id: `place-${String(place.place_id ?? `${coordinates.lat}-${coordinates.lng}`).slice(0, 80)}`, name, address, ...coordinates }];
  });
}

export function mountGymPicker(container: HTMLElement, initial: Gym, onChange: (gym: Gym) => void): () => void {
  let selected = { ...(validCoordinates(initial.lat, initial.lng) ? initial : GYMS[0]) };
  let disposed = false;
  let map: LeafletMap | null = null;
  let marker: Marker | null = null;
  let radius: Circle | null = null;
  let request: AbortController | null = null;
  let requestTimer: ReturnType<typeof setTimeout> | null = null;
  let searchVersion = 0;
  const cleanups: (() => void)[] = [];
  const uniqueId = `gym-${crypto.randomUUID()}`;

  container.innerHTML = `
    <div class="gym-picker">
      <div class="selected-gym" aria-live="polite"><strong data-selected-name></strong><p data-selected-address></p></div>
      <label class="field" for="${uniqueId}-search">Find your gym
        <input id="${uniqueId}-search" type="search" placeholder="Search a gym or postcode" autocomplete="off" maxlength="120">
      </label>
      <button class="button secondary" type="button" data-search>Search places</button>
      <div class="gym-results" aria-label="Gym search results" data-results></div>
      <p class="notice" role="status" aria-live="polite" data-notice>Confirm your gym’s entrance pin before committing. Check-ins use a 150 m radius.</p>
      <div class="map-picker" data-map role="region" aria-label="Choose your gym on the map" style="height:220px;min-height:220px;border-radius:18px;overflow:hidden;background:#171b25;color:#d8deec;isolation:isolate"></div>
      <button class="button secondary" type="button" data-location>Use my current location</button>
      <label class="field" for="${uniqueId}-name">Gym name
        <input id="${uniqueId}-name" type="text" maxlength="80" autocomplete="off">
      </label>
      <div class="gym-coordinate-fields">
        <label class="field" for="${uniqueId}-lat">Latitude
          <input id="${uniqueId}-lat" type="number" inputmode="decimal" step="any" min="-90" max="90">
        </label>
        <label class="field" for="${uniqueId}-lng">Longitude
          <input id="${uniqueId}-lng" type="number" inputmode="decimal" step="any" min="-180" max="180">
        </label>
      </div>
      <button class="button secondary" type="button" data-coordinate-save>Set these coordinates</button>
      <p class="notice">Tap the map or drag the pin to set your gym entrance. You can also enter coordinates.</p>
    </div>`;

  const element = <T extends HTMLElement>(selector: string) => container.querySelector<T>(selector)!;
  const selectedName = element<HTMLElement>('[data-selected-name]');
  const selectedAddress = element<HTMLElement>('[data-selected-address]');
  const search = element<HTMLInputElement>(`#${uniqueId}-search`);
  const searchButton = element<HTMLButtonElement>('[data-search]');
  const results = element<HTMLElement>('[data-results]');
  const notice = element<HTMLElement>('[data-notice]');
  const mapElement = element<HTMLElement>('[data-map]');
  const locationButton = element<HTMLButtonElement>('[data-location]');
  const nameInput = element<HTMLInputElement>(`#${uniqueId}-name`);
  const latitude = element<HTMLInputElement>(`#${uniqueId}-lat`);
  const longitude = element<HTMLInputElement>(`#${uniqueId}-lng`);
  const coordinateButton = element<HTMLButtonElement>('[data-coordinate-save]');

  function listen(target: HTMLElement, event: string, listener: EventListener) {
    target.addEventListener(event, listener);
    cleanups.push(() => target.removeEventListener(event, listener));
  }

  function refreshSelection() {
    selectedName.textContent = selected.name;
    selectedAddress.textContent = selected.address;
    nameInput.value = selected.name;
    latitude.value = selected.lat.toFixed(6);
    longitude.value = selected.lng.toFixed(6);
    marker?.setLatLng([selected.lat, selected.lng]);
    radius?.setLatLng([selected.lat, selected.lng]);
  }

  function choose(gym: Gym, recenter = true) {
    if (disposed || !validCoordinates(gym.lat, gym.lng)) return;
    selected = { ...gym };
    refreshSelection();
    if (recenter) map?.setView([selected.lat, selected.lng], 16);
    onChange({ ...selected });
  }

  function setPin(lat: number, lng: number, name = selected.name) {
    if (!validCoordinates(lat, lng)) {
      notice.textContent = 'Enter a latitude from −90 to 90 and longitude from −180 to 180.';
      return;
    }
    choose({ id: `pin-${lat.toFixed(6)}-${lng.toFixed(6)}`, name, address: `Pinned at ${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng });
    notice.textContent = 'Gym pin updated. Check the entrance is in the right place.';
  }

  function renderResults(gyms: Gym[]) {
    results.replaceChildren();
    for (const gym of gyms) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gym-result';
      const title = document.createElement('strong');
      const address = document.createElement('span');
      title.textContent = gym.name;
      address.textContent = gym.address;
      button.append(title, address);
      button.onclick = () => {
        choose(gym);
        notice.textContent = 'Gym selected. Confirm its entrance pin on the map.';
      };
      results.append(button);
    }
  }

  function cancelSearch() {
    searchVersion++;
    request?.abort();
    request = null;
    if (requestTimer !== null) clearTimeout(requestTimer);
    requestTimer = null;
    searchButton.disabled = false;
    searchButton.textContent = 'Search places';
  }

  listen(search, 'input', () => {
    cancelSearch();
    const local = searchLocalGyms(search.value);
    renderResults(local);
    notice.textContent = local.length ? 'Choose a result or search places for more gyms.' : 'No catalogue match. Search places or set a pin yourself.';
  });

  async function searchPlaces() {
    cancelSearch();
    const query = search.value.trim();
    if (query.length < 2) {
      notice.textContent = 'Enter at least two characters to search places.';
      return;
    }
    const version = searchVersion;
    const controller = new AbortController();
    request = controller;
    let timedOut = false;
    requestTimer = setTimeout(() => { timedOut = true; controller.abort(); }, 8000);
    searchButton.disabled = true;
    searchButton.textContent = 'Searching…';
    notice.textContent = 'Searching places…';
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.search = new URLSearchParams({ q: query, format: 'jsonv2', limit: '6', addressdetails: '1' }).toString();
      const response = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'strict-origin-when-cross-origin', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Place search unavailable');
      const gyms = parsePlaceResults(await response.json());
      if (disposed || version !== searchVersion) return;
      renderResults(gyms);
      notice.textContent = gyms.length ? 'Choose a place, then confirm the entrance pin.' : 'No places found. Try a fuller name or postcode, or set the pin yourself.';
    } catch {
      if (disposed || version !== searchVersion) return;
      renderResults(searchLocalGyms(query));
      notice.textContent = timedOut ? 'Place search timed out. Catalogue results and manual pins still work.' : 'Place search is unavailable. Use a catalogue result or set the pin yourself.';
    } finally {
      if (version === searchVersion) {
        if (requestTimer !== null) clearTimeout(requestTimer);
        requestTimer = null;
        request = null;
        searchButton.disabled = false;
        searchButton.textContent = 'Search places';
      }
    }
  }

  listen(searchButton, 'click', () => { void searchPlaces(); });
  listen(search, 'keydown', event => {
    if ((event as KeyboardEvent).key === 'Enter') {
      event.preventDefault();
      void searchPlaces();
    }
  });
  listen(nameInput, 'change', () => {
    const name = nameInput.value.trim().slice(0, 80);
    if (!name) {
      notice.textContent = 'Give your gym a name before saving it.';
      nameInput.setAttribute('aria-invalid', 'true');
      return;
    }
    nameInput.removeAttribute('aria-invalid');
    choose({ ...selected, name }, false);
  });
  listen(coordinateButton, 'click', () => {
    const coordinates = parseCoordinates(latitude.value, longitude.value);
    latitude.setAttribute('aria-invalid', coordinates ? 'false' : 'true');
    longitude.setAttribute('aria-invalid', coordinates ? 'false' : 'true');
    if (!coordinates) {
      notice.textContent = 'Enter valid latitude (−90 to 90) and longitude (−180 to 180).';
      return;
    }
    setPin(coordinates.lat, coordinates.lng, nameInput.value.trim() || selected.name);
  });
  listen(locationButton, 'click', () => {
    if (!navigator.geolocation) {
      notice.textContent = 'Location is unavailable in this browser. Choose a gym or set coordinates.';
      return;
    }
    locationButton.disabled = true;
    locationButton.textContent = 'Finding your location…';
    notice.textContent = 'Allow location access to place your gym pin.';
    navigator.geolocation.getCurrentPosition(position => {
      if (disposed) return;
      locationButton.disabled = false;
      locationButton.textContent = 'Use my current location';
      setPin(position.coords.latitude, position.coords.longitude, 'My gym');
    }, error => {
      if (disposed) return;
      locationButton.disabled = false;
      locationButton.textContent = 'Use my current location';
      notice.textContent = error.code === 1 ? 'Location permission was denied. Choose a gym or set the pin manually.' : 'Your location could not be found. Try again or set the pin manually.';
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  });

  refreshSelection();
  renderResults(searchLocalGyms(''));
  void import('leaflet').then(L => {
    if (disposed) return;
    map = L.map(mapElement, { zoomControl: true, scrollWheelZoom: false, attributionControl: true }).setView([selected.lat, selected.lng], 16);
    const tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 20,
    }).addTo(map);
    tiles.on('tileerror', () => {
      if (!disposed) notice.textContent = 'Map tiles are unavailable. Your selected gym and coordinate controls still work.';
    });
    marker = L.marker([selected.lat, selected.lng], {
      draggable: true,
      icon: L.divIcon({ className: 'gym-map-pin', html: '<span style="display:block;width:24px;height:24px;border:4px solid #f4f9ff;border-radius:50%;background:#a8df86;box-shadow:0 0 0 8px #a8df862e,0 3px 12px #0008"></span>', iconSize: [24, 24], iconAnchor: [12, 12] }),
    }).addTo(map);
    radius = L.circle([selected.lat, selected.lng], { radius: 150, color: '#a8df86', weight: 1, opacity: 0.7, fillColor: '#a8df86', fillOpacity: 0.08 }).addTo(map);
    marker.on('dragend', () => {
      const position = marker!.getLatLng();
      setPin(position.lat, position.lng);
    });
    map.on('click', (event: LeafletMouseEvent) => setPin(event.latlng.lat, event.latlng.lng));
    requestAnimationFrame(() => { if (!disposed) map?.invalidateSize(); });
  }).catch(() => {
    if (disposed) return;
    map?.remove();
    map = null;
    mapElement.textContent = 'Map unavailable. Choose a result or enter coordinates below.';
    mapElement.style.display = 'grid';
    mapElement.style.placeItems = 'center';
    mapElement.style.padding = '24px';
  });

  return () => {
    disposed = true;
    cancelSearch();
    cleanups.forEach(cleanup => cleanup());
    map?.remove();
    map = null;
    marker = null;
    radius = null;
  };
}
