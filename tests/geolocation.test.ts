import { describe, expect, it } from 'vitest';
import {
  finishSession, GEOFENCE_METERS, haversineMeters, MAX_ACCURACY_METERS,
  MAX_EVIDENCE_GAP_MS, MAX_FIX_AGE_MS, MIN_SESSION_MS, pauseSession,
  startSession, updateSession, verifyPosition,
} from '../src/core/geolocation';
import type { Gym, PositionFix, Session } from '../src/core/types';

const gym: Gym = { id: 'home', name: 'Home gym', address: 'London', lat: 51.5074, lng: -0.1278 };
const now = Date.UTC(2026, 9, 14, 8);
const fix = (timestamp = now, changes: Partial<PositionFix> = {}): PositionFix => ({
  lat: gym.lat, lng: gym.lng, accuracy: 8, timestamp, ...changes,
});
const north = (meters: number, timestamp = now, accuracy = 8): PositionFix => fix(timestamp, {
  lat: gym.lat + meters / 6_371_000 * 180 / Math.PI, accuracy,
});
const begin = (changes: Partial<Parameters<typeof startSession>[0]> = {}): Session => startSession({
  userId: 'user', commitmentId: 'commitment', gym, position: fix(), now, ...changes,
});
const monitor = (minutes: number, session = begin()): Session => {
  for (let minute = 1; minute <= minutes; minute++) {
    const timestamp = now + minute * 60_000;
    session = updateSession(session, fix(timestamp), timestamp);
  }
  return session;
};

describe('gym location verification', () => {
  it('calculates known distances and handles the date line', () => {
    expect(haversineMeters(gym, fix())).toBe(0);
    expect(haversineMeters(gym, north(150))).toBeCloseTo(150, 6);
    expect(haversineMeters({ lat: 0, lng: 179.999 }, { lat: 0, lng: -179.999 })).toBeCloseTo(222.39, 1);
  });

  it('accepts an accurate fix inside 150m and rejects a fix just beyond it', () => {
    expect(verifyPosition(gym, north(GEOFENCE_METERS - 0.001), now)).toMatchObject({ ok: true, reason: 'verified' });
    expect(verifyPosition(gym, north(GEOFENCE_METERS + 0.001), now)).toMatchObject({ ok: false, reason: 'outside' });
  });

  it('accepts the maximum accuracy and rejects uncertain fixes even at the gym', () => {
    expect(verifyPosition(gym, fix(now, { accuracy: MAX_ACCURACY_METERS }), now).ok).toBe(true);
    expect(verifyPosition(gym, fix(now, { accuracy: MAX_ACCURACY_METERS + 0.001 }), now).reason).toBe('poor_accuracy');
    expect(verifyPosition(gym, north(200, now, 101), now).reason).toBe('poor_accuracy');
  });

  it('accepts 60-second-old evidence and rejects older or future evidence', () => {
    expect(verifyPosition(gym, fix(now - MAX_FIX_AGE_MS), now).ok).toBe(true);
    expect(verifyPosition(gym, fix(now - MAX_FIX_AGE_MS - 1), now).reason).toBe('stale');
    expect(verifyPosition(gym, fix(now + 1), now).reason).toBe('future');
  });

  it.each([
    { lat: Number.NaN }, { lat: 91 }, { lng: 181 }, { accuracy: -1 },
    { accuracy: Number.POSITIVE_INFINITY }, { timestamp: Number.NaN },
  ])('rejects malformed position data %j', (changes) => {
    expect(verifyPosition(gym, fix(now, changes), now)).toMatchObject({ ok: false, reason: 'invalid_position' });
  });

  it('rejects invalid gyms and invalid evaluation times', () => {
    expect(verifyPosition({ ...gym, lat: 100 }, fix(), now).reason).toBe('invalid_gym');
    expect(verifyPosition(gym, fix(), Number.NaN).reason).toBe('invalid_time');
  });
});

describe('session entry', () => {
  it('starts an uncounted verified session with its own gym snapshot', () => {
    const session = begin();
    expect(session).toMatchObject({ startedAt: now, lastVerifiedAt: now, verifiedMs: 0,
      counted: false, status: 'active', endedAt: null, mode: 'location', evidencePaused: false,
      lastFixTimestamp: now });
    expect(session.gym).toEqual(gym);
    expect(session.gym).not.toBe(gym);
  });

  it('requires verified location by default', () => {
    expect(() => begin({ position: null })).toThrow('fresh location');
    expect(() => begin({ position: north(500) })).toThrow('outside');
    expect(() => begin({ position: fix(now, { accuracy: 500 }) })).toThrow('poor_accuracy');
    expect(() => begin({ position: fix(now - MAX_FIX_AGE_MS - 1) })).toThrow('stale');
  });

  it('allows location bypass only through an explicit demo session', () => {
    expect(begin({ mode: 'demo', position: null })).toMatchObject({ mode: 'demo', verifiedMs: 0 });
    expect(() => begin({ now: Number.NaN, mode: 'demo', position: null })).toThrow('start time');
    expect(() => begin({ gym: { ...gym, lng: 200 }, mode: 'demo', position: null })).toThrow('home gym');
  });
});

describe('monitored session duration', () => {
  it('qualifies exactly at 30 minutes, and never before checkout', () => {
    const active = monitor(30);
    expect(active.verifiedMs).toBe(MIN_SESSION_MS);
    expect(active.counted).toBe(false);
    const finished = finishSession(active, fix(now + MIN_SESSION_MS), now + MIN_SESSION_MS);
    expect(finished).toMatchObject({ counted: true, status: 'completed', endedAt: now + MIN_SESSION_MS });
  });

  it('rejects a session one millisecond below the required duration', () => {
    const active = monitor(29);
    const timestamp = now + MIN_SESSION_MS - 1;
    expect(finishSession(active, fix(timestamp), timestamp)).toMatchObject({
      verifiedMs: MIN_SESSION_MS - 1, counted: false, status: 'too_short',
    });
  });

  it('accepts monitored evidence gaps up to exactly two minutes', () => {
    const timestamp = now + MAX_EVIDENCE_GAP_MS;
    expect(updateSession(begin(), fix(timestamp), timestamp).verifiedMs).toBe(MAX_EVIDENCE_GAP_MS);
  });

  it('does not count a background/reload gap and resumes from new evidence', () => {
    const beforeReload = monitor(10);
    const resumeAt = now + 25 * 60_000;
    const resumed = updateSession(beforeReload, fix(resumeAt), resumeAt);
    expect(resumed.verifiedMs).toBe(10 * 60_000);
    expect(resumed.lastVerifiedAt).toBe(resumeAt);
    const nextAt = resumeAt + 60_000;
    expect(updateSession(resumed, fix(nextAt), nextAt).verifiedMs).toBe(11 * 60_000);
    expect(finishSession(resumed, null, resumeAt + 20 * 60_000).counted).toBe(false);
  });

  it('does not count a gap one millisecond over the evidence limit', () => {
    const timestamp = now + MAX_EVIDENCE_GAP_MS + 1;
    expect(updateSession(begin(), fix(timestamp), timestamp).verifiedMs).toBe(0);
  });

  it.each([
    { accuracy: 101 }, { timestamp: now - MAX_FIX_AGE_MS }, { lat: Number.NaN },
  ])('pauses on rejected evidence and does not bridge that interval %j', (changes) => {
    const invalidAt = now + 60_000;
    const paused = updateSession(begin(), fix(invalidAt, changes), invalidAt);
    expect(paused).toMatchObject({ evidencePaused: true, verifiedMs: 0, status: 'active' });
    const resumeAt = now + 90_000;
    const resumed = updateSession(paused, fix(resumeAt), resumeAt);
    expect(resumed.verifiedMs).toBe(0);
    expect(updateSession(resumed, fix(now + 120_000), now + 120_000).verifiedMs).toBe(30_000);
  });

  it('pauses explicitly on permission/watch interruption and resumes without bridging', () => {
    const active = monitor(1);
    const paused = pauseSession(active);
    const resumeAt = now + 90_000;
    const resumed = updateSession(paused, fix(resumeAt), resumeAt);
    expect(resumed.verifiedMs).toBe(60_000);
    expect(resumed.evidencePaused).toBe(false);
    expect(pauseSession(paused)).toBe(paused);
  });

  it('ignores duplicate cached fixes and waits for fresh evidence', () => {
    const active = monitor(1);
    const duplicate = updateSession(active, fix(now + 60_000), now + 90_000);
    expect(duplicate).toBe(active);
    expect(duplicate.verifiedMs).toBe(60_000);
    expect(updateSession(duplicate, fix(now + 120_000), now + 120_000).verifiedMs).toBe(120_000);
  });

  it('uses evidence time instead of delayed receipt time', () => {
    const delayed = updateSession(begin(), fix(now + 30_000), now + 60_000);
    expect(delayed).toMatchObject({ lastVerifiedAt: now + 30_000, verifiedMs: 30_000 });
    expect(finishSession(delayed, null, now + 120_000).endedAt).toBe(now + 30_000);
  });

  it('does not credit a delayed cached fix received after an unmonitored gap', () => {
    const evidenceAt = now + MAX_EVIDENCE_GAP_MS;
    const receiptAt = evidenceAt + MAX_FIX_AGE_MS;
    const refreshed = updateSession(begin(), fix(evidenceAt), receiptAt);
    expect(refreshed.verifiedMs).toBe(0);
    expect(refreshed.lastVerifiedAt).toBe(evidenceAt);
  });

  it('does not credit cached evidence recorded before session entry', () => {
    const session = begin({ position: fix(now - 60_000) });
    const refreshed = updateSession(session, fix(now - 30_000), now);
    expect(refreshed.lastVerifiedAt).toBe(now);
    expect(refreshed.verifiedMs).toBe(0);
  });

  it('rejects backwards and invalid evaluation times without altering earned time', () => {
    const active = monitor(1);
    expect(updateSession(active, fix(now), now)).toMatchObject({ verifiedMs: 60_000, evidencePaused: true });
    expect(updateSession(active, fix(), Number.NaN)).toMatchObject({ verifiedMs: 60_000, evidencePaused: true });
  });

  it('leaves input sessions immutable', () => {
    const session = begin();
    const snapshot = structuredClone(session);
    updateSession(session, fix(now + 60_000), now + 60_000);
    finishSession(session, null, now + 60_000);
    expect(session).toEqual(snapshot);
  });
});

describe('session exit', () => {
  it('ends automatically at the last verified fix after leaving the gym', () => {
    const active = monitor(30);
    const leftAt = now + 31 * 60_000;
    expect(updateSession(active, north(300, leftAt), leftAt)).toMatchObject({
      status: 'completed', counted: true, verifiedMs: MIN_SESSION_MS,
      endedAt: now + MIN_SESSION_MS, endReason: 'left_gym',
    });
  });

  it('ends too-short exits without counting the unobserved departure tail', () => {
    const active = monitor(29);
    const leftAt = now + MIN_SESSION_MS;
    expect(updateSession(active, north(300, leftAt), leftAt)).toMatchObject({
      status: 'too_short', counted: false, verifiedMs: 29 * 60_000,
      endedAt: now + 29 * 60_000,
    });
  });

  it('does not infer leaving from an inaccurate or stale outside fix', () => {
    const active = monitor(1);
    const nextAt = now + 120_000;
    expect(updateSession(active, north(300, nextAt, 200), nextAt).status).toBe('active');
    expect(updateSession(active, north(300, now), nextAt).status).toBe('active');
  });

  it('ignores older outside evidence when a newer fix already verified the gym', () => {
    const active = monitor(1);
    expect(updateSession(active, north(300, now + 30_000), now + 60_000)).toBe(active);
    expect(updateSession(active, north(300, now + 60_000), now + 60_000)).toBe(active);
  });

  it('manual checkout with no current fix adds no time', () => {
    const active = monitor(29);
    expect(finishSession(active, null, now + MIN_SESSION_MS)).toMatchObject({
      counted: false, status: 'too_short', verifiedMs: 29 * 60_000,
      endedAt: now + 29 * 60_000, endReason: 'manual',
    });
  });

  it('manual checkout with an invalid fix adds no time', () => {
    const active = monitor(29);
    const checkoutAt = now + MIN_SESSION_MS;
    expect(finishSession(active, fix(checkoutAt, { accuracy: 200 }), checkoutAt).counted).toBe(false);
  });

  it('marks permission interruption and preserves already-earned qualification', () => {
    const unfinished = finishSession(monitor(10), null, now + 20 * 60_000, 'permission_denied');
    expect(unfinished).toMatchObject({ status: 'interrupted', counted: false, verifiedMs: 10 * 60_000 });
    expect(finishSession(monitor(30), null, now + 40 * 60_000, 'permission_denied')).toMatchObject({
      status: 'completed', counted: true, verifiedMs: MIN_SESSION_MS,
    });
  });

  it('ignores every update and checkout after a session ends', () => {
    const finished = finishSession(monitor(30), null, now + MIN_SESSION_MS);
    expect(updateSession(finished, fix(now + 60 * 60_000), now + 60 * 60_000)).toBe(finished);
    expect(finishSession(finished, null, now + 60 * 60_000)).toBe(finished);
    expect(pauseSession(finished)).toBe(finished);
  });
});

describe('explicit demo sessions', () => {
  it('uses simulated evidence time but still refuses unmonitored long jumps', () => {
    const demo = begin({ mode: 'demo', position: null });
    const step = updateSession(demo, null, now + 60_000);
    expect(step.verifiedMs).toBe(60_000);
    const jump = updateSession(step, null, now + MIN_SESSION_MS);
    expect(jump.verifiedMs).toBe(60_000);
    expect(finishSession(jump, null, now + MIN_SESSION_MS).counted).toBe(false);
  });

  it('counts a fully monitored demo session and retains its demo label', () => {
    const demo = monitor(30, begin({ mode: 'demo', position: null }));
    expect(finishSession(demo, null, now + MIN_SESSION_MS)).toMatchObject({
      mode: 'demo', counted: true, status: 'completed', verifiedMs: MIN_SESSION_MS,
    });
  });
});
