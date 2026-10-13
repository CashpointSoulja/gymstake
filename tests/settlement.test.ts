import { describe, expect, it } from 'vitest';
import { createCommitment, createStakeLock, getWeek, nextWeek, settleWeek, validatePreferences, walletBalance } from '../src/core/settlement';
import { SimulationPaymentRail } from '../src/core/payment-rail';
import type { AppState, Participant, Preferences, Profile } from '../src/core/types';

const preferences: Preferences = {
  gym: { id: 'gym-1', name: 'Home gym', address: 'London', lat: 51.5074, lng: -0.1278 },
  target: 3,
  stakePence: 1_000,
};

function makeState(completed = 3): AppState {
  const profile: Profile = { id: 'local', name: 'Alex', preferences: structuredClone(preferences), pendingPreferences: null, streak: 2 };
  const week = getWeek(Date.parse('2026-10-14T12:00:00Z'));
  const commitment = { ...createCommitment(profile, week, 5_000), completed };
  return {
    version: 1,
    profile,
    week,
    commitment,
    ledger: [
      { id: 'opening', userId: profile.id, weekId: null, kind: 'opening', amountPence: 5_000, createdAt: week.startsAt, rail: 'simulation', reference: 'opening' },
      createStakeLock(commitment, week.startsAt)!,
    ],
    sessions: [],
    settlements: [],
    bots: [],
    rolloverPence: 0,
    simulationNow: null,
  };
}

function participant(id: string, completed: number, stakePence = 1_000): Participant {
  return { id, name: id, initials: id.slice(0, 2), color: '#fff', target: 3, completed, stakePence, streak: 0, isBot: true };
}

describe('London weekly calendar', () => {
  it('uses Monday midnight through the following Monday, exclusively', () => {
    const week = getWeek(Date.parse('2026-10-18T22:59:59.999Z'));
    expect(week).toEqual({ id: '2026-10-12', startsAt: Date.parse('2026-10-11T23:00:00Z'), endsAt: Date.parse('2026-10-18T23:00:00Z'), timezone: 'Europe/London' });
    expect(getWeek(week.endsAt).id).toBe('2026-10-19');
    expect(nextWeek(week)).toEqual(getWeek(week.endsAt));
  });

  it('has a 167-hour week when daylight saving starts', () => {
    const week = getWeek(Date.parse('2026-03-29T12:00:00Z'));
    expect(week.id).toBe('2026-03-23');
    expect(week.startsAt).toBe(Date.parse('2026-03-23T00:00:00Z'));
    expect(week.endsAt).toBe(Date.parse('2026-03-29T23:00:00Z'));
    expect((week.endsAt - week.startsAt) / 3_600_000).toBe(167);
  });

  it('has a 169-hour week when daylight saving ends', () => {
    const week = getWeek(Date.parse('2026-10-25T12:00:00Z'));
    expect(week.id).toBe('2026-10-19');
    expect(week.startsAt).toBe(Date.parse('2026-10-18T23:00:00Z'));
    expect(week.endsAt).toBe(Date.parse('2026-10-26T00:00:00Z'));
    expect((week.endsAt - week.startsAt) / 3_600_000).toBe(169);
  });

  it('remains contiguous over both calendar and year changes', () => {
    let week = getWeek(Date.parse('2025-12-31T15:00:00Z'));
    expect(week.id).toBe('2025-12-29');
    for (let index = 0; index < 60; index += 1) {
      const following = nextWeek(week);
      expect(following.startsAt).toBe(week.endsAt);
      expect(getWeek(week.endsAt - 1).id).toBe(week.id);
      expect(following.id).not.toBe(week.id);
      week = following;
    }
  });

  it.each([NaN, Infinity, -Infinity, 9e20])('rejects invalid time %s', now => {
    expect(() => getWeek(now)).toThrow();
  });
});

describe('preferences, commitments and simulated wallet', () => {
  it('accepts the complete range of targets and whole penny stakes', () => {
    for (const target of [1, 7]) for (const stakePence of [100, 101, 10_000]) {
      expect(() => validatePreferences({ ...preferences, target, stakePence })).not.toThrow();
    }
  });

  it.each([0, 8, 1.5, NaN, Infinity])('rejects invalid target %s', target => {
    expect(() => validatePreferences({ ...preferences, target })).toThrow();
  });

  it.each([0, 99, 10_001, 100.5, NaN, Infinity])('rejects invalid stake %s', stakePence => {
    expect(() => validatePreferences({ ...preferences, stakePence })).toThrow();
  });

  it('rejects missing gyms and invalid gym coordinates', () => {
    expect(() => validatePreferences({ ...preferences, gym: { ...preferences.gym, id: '' } })).toThrow();
    expect(() => validatePreferences({ ...preferences, gym: { ...preferences.gym, lat: 91 } })).toThrow();
    expect(() => validatePreferences({ ...preferences, gym: { ...preferences.gym, lng: NaN } })).toThrow();
  });

  it('snapshots preferences and funds only when the full stake is available', () => {
    const state = makeState();
    const funded = createCommitment(state.profile, state.week, 1_000);
    const unfunded = createCommitment(state.profile, state.week, 999);
    expect(funded.status).toBe('active');
    expect(unfunded.status).toBe('unfunded');
    expect(createStakeLock(unfunded, state.week.startsAt)).toBeNull();
    expect(createStakeLock(funded, state.week.startsAt)?.amountPence).toBe(-1_000);
    state.profile.preferences.gym.name = 'Changed gym';
    state.profile.preferences.target = 7;
    expect(funded.gym.name).toBe('Home gym');
    expect(funded.target).toBe(3);
    expect(createStakeLock({ ...funded, status: 'won' }, state.week.startsAt)).toBeNull();
  });

  it('computes signed whole-penny balances for the selected user', () => {
    const state = makeState();
    expect(walletBalance(state.ledger, 'local')).toBe(4_000);
    expect(walletBalance(state.ledger, 'other')).toBe(0);
    expect(() => walletBalance([{ ...state.ledger[0], amountPence: 1.5 }], 'local')).toThrow();
    expect(() => createCommitment(state.profile, state.week, NaN)).toThrow();
    expect(() => createCommitment(state.profile, state.week, -1)).toThrow();
  });
});

describe('weekly settlement', () => {
  it('does nothing before the exact settlement boundary', () => {
    const state = makeState();
    expect(settleWeek(state, [], state.week.endsAt - 1)).toBe(state);
    expect(settleWeek(state, [], state.week.endsAt).settlements).toHaveLength(1);
  });

  it('returns the stake and equally distributes forfeits with a deterministic penny remainder', () => {
    const state = makeState();
    const result = settleWeek(state, [participant('z-winner', 3), participant('a-winner', 4), participant('miss', 2, 1_001)], state.week.endsAt);
    expect(result.settlements[0].winnerIds).toEqual(['a-winner', 'local', 'z-winner']);
    expect(result.settlements[0].rewards).toEqual({ 'a-winner': 334, local: 334, 'z-winner': 333 });
    expect(walletBalance(result.ledger, 'local')).toBe(5_334);
    expect(result.ledger.filter(entry => entry.userId !== 'local')).toHaveLength(0);
    expect(result.commitment.status).toBe('won');
    expect(result.profile.streak).toBe(3);
    expect(result.rolloverPence).toBe(0);
    expect(result.week).toBe(state.week);
  });

  it('conserves all locked stakes and existing rollover across outcomes', () => {
    for (let winnerCount = 0; winnerCount < 8; winnerCount += 1) {
      const state = makeState(winnerCount === 0 ? 0 : 3);
      state.rolloverPence = 57;
      const bots = Array.from({ length: 7 }, (_, index) => participant(`bot-${index}`, index < winnerCount - 1 ? 3 : 0, 101 + index * 137));
      const result = settleWeek(state, bots, state.week.endsAt);
      const settlement = result.settlements[0];
      const all = [participant('local', state.commitment.completed, state.commitment.stakePence), ...bots];
      const totalHeld = all.reduce((sum, person) => sum + person.stakePence, state.rolloverPence);
      const totalReturned = all.filter(person => settlement.winnerIds.includes(person.id)).reduce((sum, person) => sum + person.stakePence, 0);
      const totalRewards = Object.values(settlement.rewards).reduce((sum, reward) => sum + reward, 0);
      expect(totalReturned + totalRewards + result.rolloverPence).toBe(totalHeld);
      expect(Object.values(settlement.rewards).every(Number.isSafeInteger)).toBe(true);
    }
  });

  it('forfeits a missed stake and resets the local streak', () => {
    const state = makeState(2);
    const result = settleWeek(state, [participant('winner', 3)], state.week.endsAt);
    expect(result.commitment.status).toBe('lost');
    expect(result.profile.streak).toBe(0);
    expect(result.ledger).toEqual(state.ledger);
    expect(walletBalance(result.ledger, 'local')).toBe(4_000);
    expect(result.settlements[0].rewards).toEqual({ winner: 1_000 });
  });

  it('carries the pool forward when nobody wins', () => {
    const state = makeState(0);
    state.rolloverPence = 333;
    const result = settleWeek(state, [participant('miss', 0, 100)], state.week.endsAt);
    expect(result.settlements[0].winnerIds).toEqual([]);
    expect(result.settlements[0].rewards).toEqual({});
    expect(result.rolloverPence).toBe(1_433);
    expect(result.ledger).toEqual(state.ledger);
  });

  it('returns stakes without creating pool money when everyone wins', () => {
    const state = makeState();
    const result = settleWeek(state, [participant('winner', 3)], state.week.endsAt);
    expect(result.settlements[0].poolPence).toBe(0);
    expect(result.settlements[0].rewards).toEqual({ local: 0, winner: 0 });
    expect(result.ledger.filter(entry => entry.kind === 'pool_reward')).toHaveLength(0);
    expect(walletBalance(result.ledger, 'local')).toBe(5_000);
  });

  it('supports any string participant ID without losing reward entries', () => {
    const state = makeState(0);
    const result = settleWeek(state, [participant('__proto__', 3)], state.week.endsAt);
    expect(Object.hasOwn(result.settlements[0].rewards, '__proto__')).toBe(true);
    expect(result.settlements[0].rewards.__proto__).toBe(1_000);
    expect(Object.values(result.settlements[0].rewards)).toEqual([1_000]);
  });

  it('excludes unfunded users from the pool and rewards even if their sessions meet the target', () => {
    const state = makeState();
    state.commitment.status = 'unfunded';
    state.ledger = state.ledger.filter(entry => entry.kind !== 'stake_lock');
    const result = settleWeek(state, [participant('local', 3), participant('winner', 3), participant('miss', 0, 100)], state.week.endsAt);
    expect(result.commitment.status).toBe('unfunded');
    expect(result.settlements[0].winnerIds).toEqual(['winner']);
    expect(result.settlements[0].loserIds).toEqual(['miss']);
    expect(result.settlements[0].rewards).toEqual({ winner: 100 });
    expect(walletBalance(result.ledger, 'local')).toBe(5_000);
  });

  it('settles once, leaves the input untouched and uses canonical local progress', () => {
    const state = makeState();
    const original = structuredClone(state);
    const result = settleWeek(state, [participant('local', 0)], state.week.endsAt);
    expect(state).toEqual(original);
    expect(result.commitment.status).toBe('won');
    expect(settleWeek(result, [], state.week.endsAt + 1)).toBe(result);
    expect(result.settlements).toHaveLength(1);
    expect(result.ledger.filter(entry => entry.kind === 'stake_return')).toHaveLength(1);
  });

  it('rejects duplicate participants, fractional money and inconsistent commitments', () => {
    const state = makeState();
    expect(() => settleWeek(state, [participant('duplicate', 0), participant('duplicate', 3)], state.week.endsAt)).toThrow();
    expect(() => settleWeek(state, [participant('fractional', 0, 100.5)], state.week.endsAt)).toThrow();
    expect(() => settleWeek({ ...state, commitment: { ...state.commitment, weekId: 'other-week' } }, [], state.week.endsAt)).toThrow();
    expect(() => settleWeek({ ...state, rolloverPence: -1 }, [], state.week.endsAt)).toThrow();
  });
});

describe('simulation payment adapter', () => {
  it('returns stable references for repeated requests and rejects key reuse with different inputs', async () => {
    const rail = new SimulationPaymentRail();
    const request = { userId: 'local', commitmentId: 'week-1', amountPence: 1_000, idempotencyKey: 'lock-week-1' };
    expect(rail.kind).toBe('simulation');
    expect(await rail.lockStake(request)).toEqual(await rail.lockStake(request));
    await expect(rail.lockStake({ ...request, amountPence: 2_000 })).rejects.toThrow();
    await expect(rail.release({ userId: 'local', amountPence: 1_000, idempotencyKey: 'lock-week-1' })).rejects.toThrow();
    expect((await rail.release({ userId: 'local', amountPence: 1_000, idempotencyKey: 'return-week-1' })).reference).toMatch(/^simulation:release:/);
  });

  it.each([0, -1, 100.5, NaN, Infinity])('rejects invalid transfer amounts %s', async amountPence => {
    const rail = new SimulationPaymentRail();
    await expect(rail.release({ userId: 'local', amountPence, idempotencyKey: 'invalid' })).rejects.toThrow();
  });
});
