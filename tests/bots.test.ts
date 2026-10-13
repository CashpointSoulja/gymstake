import { describe, expect, it } from 'vitest';
import { createBots, getBotParticipants, projectedPoolPence, rankParticipants } from '../src/core/bots';
import type { Participant, Week } from '../src/core/types';

const week: Week = {
  id: '2026-10-12',
  startsAt: Date.parse('2026-10-11T23:00:00Z'),
  endsAt: Date.parse('2026-10-18T23:00:00Z'),
  timezone: 'Europe/London',
};

function participant(overrides: Partial<Participant>): Participant {
  return { id: 'example', name: 'Example Member', initials: 'EM', color: '#AAAAAA', target: 3, completed: 0, stakePence: 1000, streak: 0, isBot: true, ...overrides };
}

describe('simulated members', () => {
  it('recreates exactly the same week after a refresh without shared mutable state', () => {
    const first = createBots(week);
    const refreshed = createBots(week);
    expect(first).toEqual(refreshed);
    first[0].schedule.push(week.startsAt);
    expect(createBots(week)).toEqual(refreshed);
  });

  it('varies commitments and activity in a new week while preserving member identities', () => {
    const nextWeek = { ...week, id: '2026-10-19', startsAt: week.endsAt, endsAt: week.endsAt + 7 * 86400000 };
    const first = createBots(week);
    const next = createBots(nextWeek);
    expect(next.map(bot => [bot.id, bot.name])).toEqual(first.map(bot => [bot.id, bot.name]));
    expect(next.map(bot => [bot.target, bot.stakePence, bot.streak])).not.toEqual(first.map(bot => [bot.target, bot.stakePence, bot.streak]));
  });

  it('carries winning streaks forward next week and resets missed commitments', () => {
    const first = createBots(week);
    const nextWeek = { ...week, id: '2026-10-19', startsAt: week.endsAt, endsAt: week.endsAt + 7 * 86400000 };
    const next = createBots(nextWeek);
    const final = getBotParticipants(first, week, week.endsAt);
    final.forEach((member, index) => {
      const expectedStreak = member.completed >= member.target ? Math.min(member.streak + 1, 15) : 0;
      expect(next[index].streak).toBe(expectedStreak);
    });
  });

  it('keeps all simulated commitments and schedules within their documented ranges', () => {
    const bots = createBots(week);
    expect(bots).toHaveLength(22);
    expect(new Set(bots.map(bot => bot.id)).size).toBe(22);
    for (const bot of bots) {
      expect(bot.target).toBeGreaterThanOrEqual(1);
      expect(bot.target).toBeLessThanOrEqual(5);
      expect(bot.stakePence).toBeGreaterThanOrEqual(500);
      expect(bot.stakePence).toBeLessThanOrEqual(3000);
      expect(Number.isInteger(bot.stakePence)).toBe(true);
      expect(bot.streak).toBeGreaterThanOrEqual(0);
      expect(bot.streak).toBeLessThanOrEqual(15);
      expect(bot.initials).toMatch(/^[A-Z]{2}$/);
      expect(bot.color).toMatch(/^#[A-F\d]{6}$/);
      expect(bot.schedule).toEqual([...bot.schedule].sort((a, b) => a - b));
      expect(bot.schedule.length).toBeLessThanOrEqual(bot.target);
      for (const timestamp of bot.schedule) {
        expect(timestamp).toBeGreaterThanOrEqual(week.startsAt);
        expect(timestamp).toBeLessThan(week.endsAt);
      }
    }
  });

  it('counts activity monotonically and explicitly identifies every participant as simulated', () => {
    const bots = createBots(week);
    let previous = getBotParticipants(bots, week, week.startsAt - 1);
    expect(previous.every(member => member.completed === 0)).toBe(true);
    for (let day = 1; day <= 7; day++) {
      const current = getBotParticipants(bots, week, week.startsAt + day * 86400000);
      current.forEach((member, index) => {
        expect(member.completed).toBeGreaterThanOrEqual(previous[index].completed);
        expect(member.completed).toBeLessThanOrEqual(member.target);
        expect(member.isBot).toBe(true);
      });
      previous = current;
    }
  });

  it('includes activity exactly at its timestamp and rejects stale or out-of-week activity', () => {
    const bots = createBots(week);
    const timestamp = week.startsAt + 1000;
    bots[0].target = 3;
    bots[0].schedule = [week.startsAt - 1, timestamp, week.endsAt];
    expect(getBotParticipants(bots, week, timestamp - 1)[0].completed).toBe(0);
    expect(getBotParticipants(bots, week, timestamp)[0].completed).toBe(1);
    expect(getBotParticipants(bots, week, week.endsAt + 1)[0].completed).toBe(1);
  });

  it('keeps winners, misses, and Sunday finishers in every tested week, including clock changes', () => {
    for (const durationHours of [167, 168, 169]) {
      const candidate = { ...week, id: `week-${durationHours}`, endsAt: week.startsAt + durationHours * 3600000 };
      const bots = createBots(candidate);
      const final = getBotParticipants(bots, candidate, candidate.endsAt);
      expect(final.filter(member => member.completed >= member.target)).toHaveLength(14);
      expect(final.filter(member => member.completed < member.target)).toHaveLength(8);
      const beforeSunday = getBotParticipants(bots, candidate, candidate.startsAt + (candidate.endsAt - candidate.startsAt) * 6 / 7);
      expect(beforeSunday.filter(member => member.completed >= member.target)).toHaveLength(10);
    }
  });

  it('rejects an invalid week instead of producing unbounded schedules', () => {
    expect(() => createBots({ ...week, endsAt: week.startsAt })).toThrow('valid week');
    expect(() => createBots({ ...week, startsAt: NaN })).toThrow('valid week');
  });
});

describe('pool estimates and leaderboard ranking', () => {
  it('sums only unmet stakes without treating the estimate as a guaranteed payout', () => {
    expect(projectedPoolPence([
      participant({ completed: 3, stakePence: 500 }),
      participant({ completed: 2, stakePence: 1000 }),
      participant({ completed: 0, stakePence: 1500 }),
    ])).toBe(2500);
    expect(projectedPoolPence([])).toBe(0);
  });

  it('reduces the estimate as members finish and ends at the actual forfeit total', () => {
    const bots = createBots(week);
    const opening = getBotParticipants(bots, week, week.startsAt);
    const final = getBotParticipants(bots, week, week.endsAt);
    expect(projectedPoolPence(opening)).toBe(bots.reduce((sum, bot) => sum + bot.stakePence, 0));
    expect(projectedPoolPence(final)).toBeLessThan(projectedPoolPence(opening));
    expect(projectedPoolPence(final)).toBe(final.filter(member => member.completed < member.target).reduce((sum, member) => sum + member.stakePence, 0));
  });

  it('ranks by fraction of target met, then streak, without changing the input list', () => {
    const members = [
      participant({ id: 'half', target: 4, completed: 2, streak: 9 }),
      participant({ id: 'winner-low-streak', target: 1, completed: 1, streak: 1 }),
      participant({ id: 'winner-high-streak', target: 3, completed: 3, streak: 5 }),
    ];
    expect(rankParticipants(members).map(member => member.id)).toEqual(['winner-high-streak', 'winner-low-streak', 'half']);
    expect(members.map(member => member.id)).toEqual(['half', 'winner-low-streak', 'winner-high-streak']);
    expect(rankParticipants(members, 'streak').map(member => member.id)).toEqual(['half', 'winner-high-streak', 'winner-low-streak']);
  });

  it('uses predictable name and identity ordering for equal scores', () => {
    const members = [participant({ id: 'b', name: 'Alice' }), participant({ id: 'c', name: 'Zara' }), participant({ id: 'a', name: 'Alice' })];
    expect(rankParticipants(members).map(member => member.id)).toEqual(['a', 'b', 'c']);
  });
});
