import type { Gym, PositionFix, Session } from './types';

export const MIN_SESSION_MS = 30 * 60 * 1000;
export const GEOFENCE_METERS = 150;
export const MAX_FIX_AGE_MS = 60 * 1000;
export const MAX_EVIDENCE_GAP_MS = 2 * 60 * 1000;
export const MAX_ACCURACY_METERS = 100;

export type VerificationReason = 'verified' | 'outside' | 'poor_accuracy' | 'stale'
  | 'invalid_position' | 'invalid_gym' | 'invalid_time' | 'future';

export interface PositionVerification {
  ok: boolean;
  reason: VerificationReason;
  distanceMeters: number;
}

function validCoordinates(value: { lat: number; lng: number }): boolean {
  return Number.isFinite(value.lat) && Number.isFinite(value.lng)
    && Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180;
}

export function haversineMeters(gym: Pick<Gym, 'lat' | 'lng'>, fix: Pick<PositionFix, 'lat' | 'lng'>): number {
  if (!validCoordinates(gym) || !validCoordinates(fix)) return Number.NaN;
  const radians = Math.PI / 180;
  const latitudeDelta = (fix.lat - gym.lat) * radians;
  const longitudeDelta = (fix.lng - gym.lng) * radians;
  const arc = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(gym.lat * radians) * Math.cos(fix.lat * radians)
    * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(Math.min(1, arc)), Math.sqrt(Math.max(0, 1 - arc)));
}

export function verifyPosition(gym: Gym, fix: PositionFix, now = Date.now()): PositionVerification {
  const distanceMeters = haversineMeters(gym, fix);
  const rejected = (reason: VerificationReason): PositionVerification => ({ ok: false, reason, distanceMeters });
  if (!validCoordinates(gym)) return rejected('invalid_gym');
  if (!Number.isFinite(now)) return rejected('invalid_time');
  if (!validCoordinates(fix) || !Number.isFinite(fix.accuracy) || fix.accuracy < 0
    || !Number.isFinite(fix.timestamp)) return rejected('invalid_position');
  if (fix.timestamp > now) return rejected('future');
  if (now - fix.timestamp > MAX_FIX_AGE_MS) return rejected('stale');
  if (fix.accuracy > MAX_ACCURACY_METERS) return rejected('poor_accuracy');
  if (distanceMeters > GEOFENCE_METERS) return rejected('outside');
  return { ok: true, reason: 'verified', distanceMeters };
}

export interface StartSessionInput {
  userId: string;
  commitmentId: string;
  gym: Gym;
  position: PositionFix | null;
  now: number;
  mode?: Session['mode'];
}

export function startSession(input: StartSessionInput): Session {
  const mode = input.mode ?? 'location';
  if (!Number.isFinite(input.now)) throw new Error('A valid session start time is required.');
  if (!validCoordinates(input.gym)) throw new Error('A valid home gym is required.');
  if (mode !== 'location' && mode !== 'demo') throw new Error('Unsupported session mode.');
  if (mode === 'location') {
    if (!input.position) throw new Error('A fresh location fix is required.');
    const verification = verifyPosition(input.gym, input.position, input.now);
    if (!verification.ok) throw new Error(`Location could not be verified: ${verification.reason}.`);
  }
  return {
    id: `session-${globalThis.crypto?.randomUUID?.() ?? `${input.now}-${Math.random().toString(36).slice(2)}`}`,
    userId: input.userId,
    commitmentId: input.commitmentId,
    gym: { ...input.gym },
    startedAt: input.now,
    endedAt: null,
    lastVerifiedAt: input.now,
    lastFixTimestamp: mode === 'location' ? input.position!.timestamp : null,
    evidencePaused: false,
    verifiedMs: 0,
    counted: false,
    mode,
    status: 'active',
    endReason: null,
  };
}

export function pauseSession(session: Session): Session {
  if (session.status !== 'active' || session.evidencePaused) return session;
  return { ...session, evidencePaused: true };
}

function endAtEvidence(session: Session, reason: string): Session {
  const counted = session.verifiedMs >= MIN_SESSION_MS;
  const interrupted = reason !== 'manual' && reason !== 'left_gym';
  return {
    ...session,
    endedAt: session.lastVerifiedAt,
    evidencePaused: true,
    counted,
    status: counted ? 'completed' : interrupted ? 'interrupted' : 'too_short',
    endReason: reason,
  };
}

export function updateSession(session: Session, position: PositionFix | null, now: number): Session {
  if (session.status !== 'active') return session;
  if (!Number.isFinite(now) || now < session.lastVerifiedAt) return pauseSession(session);

  let evidenceAt = now;
  if (session.mode === 'location') {
    if (!position) return pauseSession(session);
    const verification = verifyPosition(session.gym, position, now);
    if (verification.reason === 'outside') {
      if (session.lastFixTimestamp !== null && position.timestamp <= session.lastFixTimestamp) return session;
      return endAtEvidence(session, 'left_gym');
    }
    if (!verification.ok) return pauseSession(session);
    if (session.lastFixTimestamp !== null && position.timestamp <= session.lastFixTimestamp) return session;
    evidenceAt = Math.max(session.startedAt, position.timestamp);
  }

  const elapsed = evidenceAt - session.lastVerifiedAt;
  const monitored = !session.evidencePaused && elapsed >= 0 && elapsed <= MAX_EVIDENCE_GAP_MS
    && now - session.lastVerifiedAt <= MAX_EVIDENCE_GAP_MS;
  return {
    ...session,
    lastVerifiedAt: evidenceAt,
    lastFixTimestamp: session.mode === 'location' ? position!.timestamp : null,
    evidencePaused: false,
    verifiedMs: session.verifiedMs + (monitored ? elapsed : 0),
  };
}

export function finishSession(
  session: Session,
  position: PositionFix | null,
  now: number,
  reason = 'manual',
): Session {
  if (session.status !== 'active') return session;
  const updated = updateSession(session, position, now);
  if (updated.status !== 'active') return updated;
  return endAtEvidence(updated, reason);
}
