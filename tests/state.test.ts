import { describe, expect, it } from 'vitest';
import { finishSession, startSession, updateSession } from '../src/core/geolocation';
import { walletBalance } from '../src/core/settlement';
import { advanceState, initializeState, loadState, londonDay, participants, recordSession, saveState, setPreferences, STORAGE_KEY, topUp } from '../src/core/state';
import type { AppState, Preferences, Session } from '../src/core/types';

const NOW = Date.parse('2026-10-12T08:00:00Z');
const preferences: Preferences = { gym: { id: 'home', name: 'Home Gym', address: 'London', lat: 51.515, lng: -0.13 }, target: 3, stakePence: 1000 };
const initial = (changes: Partial<Preferences> = {}) => initializeState({ name: '  Alex  ', preferences: { ...preferences, ...changes } }, NOW);
const balance = (state: AppState) => walletBalance(state.ledger, state.profile.id);

function monitoredSession(state: AppState, startedAt: number, minutes = 30, checkout = true): Session {
  let session = startSession({ userId: state.profile.id, commitmentId: state.commitment.id, gym: state.commitment.gym, position: null, now: startedAt, mode: 'demo' });
  for (let minute = 1; minute <= minutes; minute++) session = updateSession(session, null, startedAt + minute * 60_000);
  return checkout ? finishSession(session, null, startedAt + minutes * 60_000) : session;
}

function win(state: AppState): AppState {
  let result = state;
  for (let day = 0; day < state.commitment.target; day++) result = recordSession(result, monitoredSession(result, state.week.startsAt + day * 86_400_000 + 9 * 3_600_000));
  return result;
}

function storage(initialValue?: string) {
  const values = new Map<string, string>(initialValue === undefined ? [] : [[STORAGE_KEY, initialValue]]);
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe('onboarding and immutable weekly commitments', () => {
  it('opens a £100 simulated wallet and locks exactly one chosen stake', () => {
    const state = initial();
    expect(state.profile.name).toBe('Alex');
    expect(balance(state)).toBe(9000);
    expect(state.ledger.map(entry => entry.kind)).toEqual(['opening', 'stake_lock']);
    expect(state.ledger.every(entry => entry.rail === 'simulation')).toBe(true);
    expect(state.commitment.status).toBe('active');
    expect(advanceState(state, NOW)).toBe(state);
  });

  it('rejects empty and overlong profile names', () => {
    for (const name of ['', '   ', 'x'.repeat(41)]) expect(() => initializeState({ name, preferences }, NOW)).toThrow('name');
    expect(initializeState({ name: 'x'.repeat(40), preferences }, NOW).profile.name).toHaveLength(40);
  });

  it('copies the chosen gym and preferences instead of retaining mutable form values', () => {
    const input = structuredClone(preferences);
    const state = initializeState({ name: 'Alex', preferences: input }, NOW);
    input.gym.lat = 0;
    input.stakePence = 2000;
    expect(state.profile.preferences).toEqual(preferences);
    expect(state.commitment.gym).toEqual(preferences.gym);
    state.profile.preferences.gym.name = 'Changed outside the commitment';
    expect(state.commitment.gym.name).toBe('Home Gym');
  });

  it('queues gym, target and stake together while the current week stays unchanged', () => {
    const state = initial();
    const input = { gym: { ...preferences.gym, id: 'next-gym', name: 'Next Gym' }, target: 5, stakePence: 2000 };
    const changed = setPreferences(state, input);
    expect(changed.commitment).toEqual(state.commitment);
    expect(changed.profile.preferences).toEqual(state.profile.preferences);
    expect(state.profile.pendingPreferences).toBeNull();
    input.gym.name = 'Edited form';
    const advanced = advanceState(changed, changed.week.endsAt);
    expect(advanced.profile.pendingPreferences).toBeNull();
    expect(advanced.commitment).toMatchObject({ target: 5, stakePence: 2000, gym: { id: 'next-gym', name: 'Next Gym' } });
    expect(balance(advanced)).toBe(7000);
  });

  it('settles against the original target and stake before applying pending preferences', () => {
    const state = initial();
    const oneSession = recordSession(state, monitoredSession(state, NOW));
    const queued = setPreferences(oneSession, { ...preferences, target: 1, stakePence: 500 });
    const advanced = advanceState(queued, queued.week.endsAt);
    expect(advanced.settlements[0].loserIds).toContain(state.profile.id);
    expect(advanced.ledger.some(entry => entry.kind === 'stake_return')).toBe(false);
    expect(advanced.commitment.target).toBe(1);
    expect(advanced.commitment.stakePence).toBe(500);
    expect(balance(advanced)).toBe(8500);
  });
});

describe('session-to-commitment integration', () => {
  it('records monitored activity, qualifies at checkout, and refuses repeated credit', () => {
    const state = initial();
    const session = monitoredSession(state, NOW);
    const recorded = recordSession(state, session);
    expect(recorded.commitment.completed).toBe(1);
    expect(recorded.sessions).toHaveLength(1);
    expect(recordSession(recorded, session)).toBe(recorded);
    session.gym.name = 'Changed input';
    expect(recorded.sessions[0].gym.name).toBe('Home Gym');
    expect(state.sessions).toHaveLength(0);
  });

  it('keeps active and too-short sessions out of weekly progress', () => {
    const state = initial();
    const active = monitoredSession(state, NOW, 29, false);
    const recorded = recordSession(state, active);
    expect(recorded.commitment.completed).toBe(0);
    const checkedOut = recordSession(recorded, finishSession(active, null, NOW + 29 * 60_000));
    expect(checkedOut.commitment.completed).toBe(0);
    expect(checkedOut.sessions[0].status).toBe('too_short');
  });

  it('enforces one counted visit per London calendar day across UTC midnight', () => {
    const state = initial();
    const first = Date.parse('2026-10-13T23:10:00Z');
    const second = Date.parse('2026-10-14T20:00:00Z');
    expect(londonDay(first)).toBe(londonDay(second));
    const one = recordSession(state, monitoredSession(state, first));
    const two = recordSession(one, monitoredSession(one, second));
    expect(two.commitment.completed).toBe(1);
    expect(two.sessions[1]).toMatchObject({ counted: false, endReason: 'daily_limit' });
    const nextDay = recordSession(two, monitoredSession(two, Date.parse('2026-10-14T23:10:00Z')));
    expect(nextDay.commitment.completed).toBe(2);
  });

  it('rejects another user or commitment and keeps out-of-week activity uncounted', () => {
    const state = initial();
    const session = monitoredSession(state, NOW);
    expect(() => recordSession(state, { ...session, userId: 'other' })).toThrow('another commitment');
    expect(() => recordSession(state, { ...session, commitmentId: 'other-week' })).toThrow('another commitment');
    for (const time of [state.week.startsAt - 60 * 60_000, state.week.endsAt - 29 * 60_000, state.week.endsAt]) {
      const invalid = recordSession(state, monitoredSession(state, time));
      expect(invalid.commitment.completed).toBe(0);
      expect(invalid.sessions[0].endReason).toBe('outside_commitment');
    }
  });

  it('ends an active qualifying session at the weekly boundary before settlement', () => {
    const state = initial({ target: 1 });
    const session = monitoredSession(state, state.week.endsAt - 30 * 60_000, 30, false);
    const active = recordSession(state, session);
    const advanced = advanceState(active, state.week.endsAt);
    expect(advanced.sessions[0]).toMatchObject({ counted: true, endReason: 'week_ended', endedAt: state.week.endsAt });
    expect(advanced.settlements[0].winnerIds).toContain(state.profile.id);
    expect(advanced.commitment.completed).toBe(0);
    expect(advanced.profile.streak).toBe(1);
  });
});

describe('weekly transitions, wallets and catch-up', () => {
  it('returns a winning stake and pool share before locking the new weekly stake once', () => {
    const state = win(initial());
    const advanced = advanceState(state, state.week.endsAt);
    const reward = advanced.settlements[0].rewards[state.profile.id];
    expect(reward).toBeGreaterThan(0);
    expect(balance(advanced)).toBe(9000 + reward);
    expect(advanced.profile.streak).toBe(1);
    expect(advanced.ledger.filter(entry => entry.kind === 'stake_return')).toHaveLength(1);
    expect(advanced.ledger.filter(entry => entry.kind === 'stake_lock')).toHaveLength(2);
    const repeated = advanceState(advanced, state.week.endsAt);
    expect(repeated).toBe(advanced);
    expect(new Set(advanced.ledger.map(entry => entry.id)).size).toBe(advanced.ledger.length);
  });

  it('settles every missed elapsed week without adding or skipping locks', () => {
    const state = initial();
    const advanced = advanceState(state, Date.parse('2026-11-02T00:00:00Z'));
    expect(advanced.settlements).toHaveLength(3);
    expect(advanced.ledger.filter(entry => entry.kind === 'stake_lock')).toHaveLength(4);
    expect(balance(advanced)).toBe(6000);
    expect(new Set(advanced.settlements.map(entry => entry.weekId)).size).toBe(3);
    expect(advanceState(advanced, advanced.week.startsAt)).toBe(advanced);
  });

  it('excludes an unfunded new commitment from participants and future forfeits', () => {
    const state = initial({ stakePence: 10_000 });
    const unfunded = advanceState(state, state.week.endsAt);
    expect(unfunded.commitment.status).toBe('unfunded');
    expect(balance(unfunded)).toBe(0);
    expect(participants(unfunded, unfunded.week.endsAt).some(member => !member.isBot)).toBe(false);
    const advanced = advanceState(unfunded, unfunded.week.endsAt);
    expect(advanced.settlements[1].loserIds).not.toContain(state.profile.id);
    expect(advanced.ledger.filter(entry => entry.kind === 'stake_lock')).toHaveLength(1);
  });

  it('waits for enough top-up balance before funding a £100 commitment', () => {
    const state = initial({ stakePence: 10_000 });
    const unfunded = advanceState(state, state.week.endsAt);
    const first = topUp(unfunded, unfunded.week.startsAt + 1000);
    expect(balance(first)).toBe(5000);
    expect(first.commitment.status).toBe('unfunded');
    expect(first.ledger.filter(entry => entry.kind === 'stake_lock')).toHaveLength(1);
    const second = topUp(first, unfunded.week.startsAt + 2000);
    expect(balance(second)).toBe(0);
    expect(second.commitment.status).toBe('active');
    expect(second.ledger.filter(entry => entry.kind === 'stake_lock')).toHaveLength(2);
    expect(balance(topUp(second, unfunded.week.startsAt + 3000))).toBe(5000);
    expect(balance(unfunded)).toBe(0);
  });

  it('rejects an invalid transition timestamp', () => {
    expect(() => advanceState(initial(), NaN)).toThrow('valid time');
  });
});

describe('browser persistence boundaries', () => {
  it('round-trips wallets, commitments, sessions and queued preferences through JSON', () => {
    const state = setPreferences(win(initial()), { ...preferences, target: 7, stakePence: 2500 });
    const memory = storage();
    saveState(state, memory);
    const loaded = loadState(memory);
    expect(loaded).toEqual(state);
    expect(loaded).not.toBe(state);
    expect(loadState(storage())).toBeNull();
  });

  it('recovers from malformed JSON, unsupported versions, invalid preferences and negative wallets', () => {
    const state = initial();
    const invalid = [
      '{', '{}', JSON.stringify({ ...state, version: 2 }),
      JSON.stringify({ ...state, sessions: null }),
      JSON.stringify({ ...state, profile: { ...state.profile, preferences: { ...preferences, target: 8 } } }),
      JSON.stringify({ ...state, ledger: [{ ...state.ledger[0], amountPence: -1 }] }),
      JSON.stringify({ ...state, week: { ...state.week, endsAt: null } }),
    ];
    for (const raw of invalid) expect(loadState(storage(raw))).toBeNull();
    expect(loadState({ getItem: () => { throw new Error('Storage denied'); } })).toBeNull();
  });
});
