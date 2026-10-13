import type { AppState, Commitment, LedgerEntry, Participant, Preferences, Profile, Week } from './types';

const TIMEZONE = 'Europe/London' as const;
const londonDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function assertTimestamp(value: number): void {
  if (!Number.isFinite(value) || Number.isNaN(new Date(value).getTime())) {
    throw new RangeError('A valid timestamp is required.');
  }
}

function dateParts(timestamp: number): Record<string, number> {
  return Object.fromEntries(londonDate.formatToParts(timestamp)
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, Number(part.value)]));
}

function londonMidnight(year: number, month: number, day: number): number {
  const wallClock = Date.UTC(year, month - 1, day);
  let result = wallClock;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = dateParts(result);
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    result += wallClock - represented;
  }
  return result;
}

function calendarId(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function getWeek(now: number): Week {
  assertTimestamp(now);
  const local = dateParts(now);
  const monday = new Date(Date.UTC(local.year, local.month - 1, local.day));
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
  return {
    id: calendarId(monday),
    startsAt: londonMidnight(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate()),
    endsAt: londonMidnight(nextMonday.getUTCFullYear(), nextMonday.getUTCMonth() + 1, nextMonday.getUTCDate()),
    timezone: TIMEZONE,
  };
}

export function nextWeek(week: Week): Week {
  return getWeek(week.endsAt);
}

function assertPence(amount: number, label: string): void {
  if (!Number.isSafeInteger(amount)) throw new RangeError(`${label} must be a whole number of pence.`);
}

function assertTarget(target: number): void {
  if (!Number.isInteger(target) || target < 1 || target > 7) {
    throw new RangeError('The weekly target must be between 1 and 7 sessions.');
  }
}

function assertStake(stakePence: number): void {
  assertPence(stakePence, 'The stake');
  if (stakePence < 100 || stakePence > 10_000) throw new RangeError('The stake must be between £1 and £100.');
}

export function validatePreferences(preferences: Preferences): void {
  assertTarget(preferences.target);
  assertStake(preferences.stakePence);
  const { gym } = preferences;
  if (!gym || typeof gym.id !== 'string' || !gym.id.trim() || typeof gym.name !== 'string' || !gym.name.trim()) {
    throw new TypeError('Choose a home gym.');
  }
  if (!Number.isFinite(gym.lat) || gym.lat < -90 || gym.lat > 90 ||
      !Number.isFinite(gym.lng) || gym.lng < -180 || gym.lng > 180) {
    throw new RangeError('The gym pin must have valid coordinates.');
  }
}

export function walletBalance(ledger: LedgerEntry[], userId: string): number {
  return ledger.filter(entry => entry.userId === userId).reduce((balance, entry) => {
    assertPence(entry.amountPence, 'The ledger amount');
    const next = balance + entry.amountPence;
    assertPence(next, 'The wallet balance');
    return next;
  }, 0);
}

export function createCommitment(profile: Profile, week: Week, availablePence: number): Commitment {
  validatePreferences(profile.preferences);
  assertPence(availablePence, 'The available balance');
  if (availablePence < 0) throw new RangeError('The available balance cannot be negative.');
  return {
    id: `commitment:${week.id}:${profile.id}`,
    userId: profile.id,
    weekId: week.id,
    gym: { ...profile.preferences.gym },
    target: profile.preferences.target,
    stakePence: profile.preferences.stakePence,
    completed: 0,
    status: availablePence >= profile.preferences.stakePence ? 'active' : 'unfunded',
  };
}

export function createStakeLock(commitment: Commitment, createdAt: number): LedgerEntry | null {
  if (commitment.status !== 'active') return null;
  assertStake(commitment.stakePence);
  assertTimestamp(createdAt);
  return {
    id: `stake-lock:${commitment.id}`,
    userId: commitment.userId,
    weekId: commitment.weekId,
    kind: 'stake_lock',
    amountPence: -commitment.stakePence,
    createdAt,
    rail: 'simulation',
    reference: `simulation:stake-lock:${commitment.id}`,
  };
}

function validateParticipant(participant: Participant): void {
  if (!participant.id) throw new TypeError('Every participant needs an ID.');
  assertTarget(participant.target);
  assertStake(participant.stakePence);
  if (!Number.isSafeInteger(participant.completed) || participant.completed < 0) {
    throw new RangeError('Completed sessions must be a non-negative integer.');
  }
}

export function settleWeek(state: AppState, participants: Participant[], now: number): AppState {
  assertTimestamp(now);
  if (now < state.week.endsAt || state.settlements.some(settlement => settlement.weekId === state.week.id)) return state;
  if (state.commitment.weekId !== state.week.id || state.commitment.userId !== state.profile.id) {
    throw new Error('The commitment must belong to the current user and week.');
  }
  assertPence(state.rolloverPence, 'The rollover pool');
  if (state.rolloverPence < 0) throw new RangeError('The rollover pool cannot be negative.');
  const seen = new Set<string>();
  for (const participant of participants) {
    if (seen.has(participant.id)) throw new Error('Participant IDs must be unique.');
    seen.add(participant.id);
  }
  const eligible = participants.filter(participant => participant.id !== state.profile.id);
  if (state.commitment.status !== 'unfunded') {
    eligible.push({
      id: state.profile.id,
      name: state.profile.name,
      initials: '',
      color: '',
      target: state.commitment.target,
      completed: state.commitment.completed,
      stakePence: state.commitment.stakePence,
      streak: state.profile.streak,
      isBot: false,
    });
  }
  eligible.forEach(validateParticipant);
  const winners = eligible.filter(participant => participant.completed >= participant.target)
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const losers = eligible.filter(participant => participant.completed < participant.target)
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const poolPence = losers.reduce((pool, participant) => pool + participant.stakePence, state.rolloverPence);
  assertPence(poolPence, 'The weekly pool');
  const share = winners.length ? Math.floor(poolPence / winners.length) : 0;
  const remainder = winners.length ? poolPence % winners.length : 0;
  const rewards: Record<string, number> = Object.fromEntries(winners.map((participant, index) =>
    [participant.id, share + (index < remainder ? 1 : 0)]));
  const localWon = winners.some(participant => participant.id === state.profile.id);
  const entries: LedgerEntry[] = [];
  if (localWon) {
    const returnId = `stake-return:${state.week.id}:${state.profile.id}`;
    entries.push({
      id: returnId,
      userId: state.profile.id,
      weekId: state.week.id,
      kind: 'stake_return',
      amountPence: state.commitment.stakePence,
      createdAt: now,
      rail: 'simulation',
      reference: `simulation:${returnId}`,
    });
    if (rewards[state.profile.id] > 0) {
      const rewardId = `pool-reward:${state.week.id}:${state.profile.id}`;
      entries.push({
        id: rewardId,
        userId: state.profile.id,
        weekId: state.week.id,
        kind: 'pool_reward',
        amountPence: rewards[state.profile.id],
        createdAt: now,
        rail: 'simulation',
        reference: `simulation:${rewardId}`,
      });
    }
  }
  const rolloverPence = winners.length ? 0 : poolPence;
  return {
    ...state,
    profile: { ...state.profile, streak: localWon ? state.profile.streak + 1 : 0 },
    commitment: { ...state.commitment, status: state.commitment.status === 'unfunded' ? 'unfunded' : localWon ? 'won' : 'lost' },
    ledger: [...state.ledger, ...entries],
    settlements: [...state.settlements, {
      id: `settlement:${state.week.id}`,
      weekId: state.week.id,
      settledAt: now,
      winnerIds: winners.map(participant => participant.id),
      loserIds: losers.map(participant => participant.id),
      poolPence,
      rewards,
      rolloverPence,
    }],
    rolloverPence,
  };
}
