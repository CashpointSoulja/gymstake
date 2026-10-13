import { describe, expect, it } from 'vitest';
import { GYMS, parseCoordinates, parsePlaceResults, searchLocalGyms, validCoordinates } from '../src/ui/gym-picker';

describe('gym catalogue search', () => {
  it('provides eight distinct London gyms with valid pins', () => {
    expect(GYMS).toHaveLength(8);
    expect(new Set(GYMS.map(gym => gym.id)).size).toBe(8);
    GYMS.forEach(gym => {
      expect(validCoordinates(gym.lat, gym.lng)).toBe(true);
      expect(gym.address).toContain('London');
    });
  });

  it('matches names and addresses case-insensitively across query terms', () => {
    expect(searchLocalGyms(' SOHO  third ')).toEqual([GYMS[0]]);
    expect(searchLocalGyms('EC1N')).toEqual([GYMS[2]]);
    expect(searchLocalGyms('not-a-real-place')).toEqual([]);
    expect(searchLocalGyms('')).toHaveLength(8);
  });

  it('returns independent result objects so edits cannot corrupt the catalogue', () => {
    const first = searchLocalGyms('Soho');
    first[0].name = 'Changed name';
    expect(searchLocalGyms('Soho')[0].name).toBe('Third Space Soho');
  });
});

describe('gym coordinate validation', () => {
  it('accepts zero, signed decimal coordinates, and inclusive world boundaries', () => {
    expect(parseCoordinates('0', '0')).toEqual({ lat: 0, lng: 0 });
    expect(parseCoordinates(' 51.5102 ', '-.1364')).toEqual({ lat: 51.5102, lng: -0.1364 });
    expect(parseCoordinates('-90', '180')).toEqual({ lat: -90, lng: 180 });
    expect(parseCoordinates('90', '-180')).toEqual({ lat: 90, lng: -180 });
  });

  it('rejects missing, malformed, infinite, and out-of-range coordinates', () => {
    for (const [lat, lng] of [['', '0'], [' ', '0'], ['51,5', '0'], ['Infinity', '0'], ['NaN', '0'], ['0x10', '0'], ['91', '0'], ['0', '181'], ['-90.1', '0']]) {
      expect(parseCoordinates(lat, lng)).toBeNull();
    }
    expect(validCoordinates(NaN, 0)).toBe(false);
    expect(validCoordinates(0, Infinity)).toBe(false);
  });
});

describe('place-search result validation', () => {
  it('maps valid external results into safe gym records without requiring provider IDs', () => {
    expect(parsePlaceResults([{ place_id: 42, name: 'Example Gym', lat: '51.5', lon: '-0.1', display_name: 'Example Gym, London' }])).toEqual([
      { id: 'place-42', name: 'Example Gym', lat: 51.5, lng: -0.1, address: 'Example Gym, London' },
    ]);
    expect(parsePlaceResults([{ lat: '0', lon: '0', display_name: 'Unnamed Venue, Example Road' }])[0].name).toBe('Unnamed Venue');
  });

  it('drops malformed coordinates, missing addresses, and untrusted response shapes', () => {
    expect(parsePlaceResults({ results: [] })).toEqual([]);
    expect(parsePlaceResults([null, {}, { lat: '91', lon: '0', display_name: 'Bad pin' }, { lat: '0', lon: '0', display_name: ' ' }])).toEqual([]);
  });

  it('bounds result count and external text lengths', () => {
    const results = parsePlaceResults(Array.from({ length: 20 }, () => ({ name: 'x'.repeat(200), lat: '51', lon: '0', display_name: 'x'.repeat(400) })));
    expect(results).toHaveLength(8);
    expect(results.every(gym => gym.name.length <= 80 && gym.address.length <= 240)).toBe(true);
  });
});
