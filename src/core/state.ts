import type { AppState, Preferences, Participant, Session } from './types';
import { createBots, getBotParticipants } from './bots';
import { createCommitment, createStakeLock, getWeek, nextWeek, settleWeek, validatePreferences, walletBalance } from './settlement';
import { finishSession } from './geolocation';

export const STORAGE_KEY = 'gymstake:v1';
export function londonDay(timestamp: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(timestamp);
}
export function initializeState(input: { name: string; preferences: Preferences }, now = Date.now()): AppState {
  if (!input.name.trim() || input.name.trim().length > 40) throw new Error('Enter a name between 1 and 40 characters.');
  validatePreferences(input.preferences);
  const profile = { id: 'local-member', name: input.name.trim(), preferences: structuredClone(input.preferences), pendingPreferences: null, streak: 0 };
  const week = getWeek(now);
  const commitment = createCommitment(profile, week, 10000);
  const lock = createStakeLock(commitment, now);
  return { version: 1, profile, week, commitment, sessions: [], bots: createBots(week), ledger: [
    { id: 'opening:local-member', userId: profile.id, weekId: null, kind: 'opening', amountPence: 10000, createdAt: now, rail: 'simulation', reference: 'simulation:opening' },
    ...(lock ? [lock] : []),
  ], settlements: [], rolloverPence: 0, simulationNow: null };
}
export function participants(state: AppState, now: number): Participant[] {
  const list = getBotParticipants(state.bots, state.week, now);
  if (state.commitment.status !== 'unfunded') list.push({ id: state.profile.id, name: state.profile.name, initials: state.profile.name.slice(0, 2).toUpperCase(), color: '#d6fc70', target: state.commitment.target, completed: state.commitment.completed, stakePence: state.commitment.stakePence, streak: state.profile.streak, isBot: false });
  return list;
}
export function recordSession(state: AppState, session: Session): AppState {
  if (session.commitmentId !== state.commitment.id || session.userId !== state.profile.id) throw new Error('This session belongs to another commitment.');
  const existing = state.sessions.find(s => s.id === session.id);
  if (existing?.endedAt !== null && existing?.endedAt !== undefined) return state;
  const copy = structuredClone(session);
  const sameDay = state.sessions.some(s => s.id !== copy.id && s.counted && londonDay(s.startedAt) === londonDay(copy.startedAt));
  if (copy.counted && (sameDay || state.commitment.status !== 'active' || copy.startedAt < state.week.startsAt || copy.startedAt >= state.week.endsAt || (copy.endedAt ?? Infinity) > state.week.endsAt)) {
    copy.counted = false;
    copy.endReason = sameDay ? 'daily_limit' : 'outside_commitment';
  }
  const sessions = [...state.sessions.filter(s => s.id !== copy.id), copy];
  return { ...state, sessions, commitment: { ...state.commitment, completed: state.commitment.completed + (copy.counted && !existing?.counted ? 1 : 0) } };
}
export function advanceState(input: AppState, now: number): AppState {
  if (!Number.isFinite(now)) throw new Error('A valid time is required.');
  let state = input;
  while (now >= state.week.endsAt) {
    const active = state.sessions.find(s => s.endedAt === null);
    if (active) state = recordSession(state, finishSession(active, null, state.week.endsAt, 'week_ended'));
    state = settleWeek(state, participants(state, state.week.endsAt), state.week.endsAt);
    const week = nextWeek(state.week);
    const profile = { ...state.profile, preferences: structuredClone(state.profile.pendingPreferences ?? state.profile.preferences), pendingPreferences: null };
    const commitment = createCommitment(profile, week, walletBalance(state.ledger, profile.id));
    const lock = createStakeLock(commitment, week.startsAt);
    state = { ...state, profile, week, commitment, bots: createBots(week), ledger: lock ? [...state.ledger, lock] : state.ledger };
  }
  return state;
}
export function setPreferences(state: AppState, preferences: Preferences): AppState {
  validatePreferences(preferences);
  return { ...state, profile: { ...state.profile, pendingPreferences: structuredClone(preferences) } };
}
export function topUp(state: AppState, now: number): AppState {
  const next: AppState = { ...state, ledger: [...state.ledger, { id: `top-up:${crypto.randomUUID()}`, userId: state.profile.id, weekId: null, kind: 'top_up', amountPence: 5000, createdAt: now, rail: 'simulation', reference: 'simulation:top-up' }] };
  if (next.commitment.status === 'unfunded' && walletBalance(next.ledger, next.profile.id) >= next.commitment.stakePence) {
    next.commitment = { ...next.commitment, status: 'active' };
    const lock = createStakeLock(next.commitment, now);
    if (lock) next.ledger.push(lock);
  }
  return next;
}
export function loadState(storage: Pick<Storage, 'getItem'> = localStorage): AppState | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as AppState;
    if (state.version !== 1 || !state.profile?.id || !state.profile.name || !Array.isArray(state.sessions) || !Array.isArray(state.ledger) || !Array.isArray(state.settlements) || !Array.isArray(state.bots) || !state.commitment || !Number.isFinite(state.week?.endsAt) || !Number.isFinite(state.week.startsAt)) return null;
    validatePreferences(state.profile.preferences);
    if (state.profile.pendingPreferences) validatePreferences(state.profile.pendingPreferences);
    if (walletBalance(state.ledger, state.profile.id) < 0) return null;
    return state;
  } catch { return null; }
}
export function saveState(state: AppState, storage: Pick<Storage, 'setItem'> = localStorage): void { storage.setItem(STORAGE_KEY, JSON.stringify(state)); }
