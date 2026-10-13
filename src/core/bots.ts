import type { Bot, Participant, Week } from './types';

const MEMBERS = [
  ['Amelia Brooks', '#BBA9F4'], ['Noah Taylor', '#8DBDD4'],
  ['Maya Patel', '#EDB093'], ['Oliver Morgan', '#96C3A9'],
  ['Sofia Chen', '#E1AED5'], ['Leo Wilson', '#D9BD82'],
  ['Isla Campbell', '#9AB5E7'], ['Ethan Clarke', '#D7A7A1'],
  ['Grace Okafor', '#ADCB97'], ['Lucas Evans', '#B5AADE'],
  ['Freya Ahmed', '#E3B49C'], ['Theo Williams', '#8BBDB5'],
  ['Ava Robinson', '#CAA6C8'], ['Jude Thompson', '#BFC08A'],
  ['Nina Shah', '#92B3D5'], ['Oscar Davies', '#D4AC89'],
  ['Ruby Lewis', '#B4CAA3'], ['Adam Hassan', '#ACA9E0'],
  ['Chloe Martin', '#D7AFC4'], ['Ben Wright', '#97C3CC'],
  ['Zara Ali', '#D8C196'], ['Daniel Jones', '#A7BBA1'],
] as const;

function seededRandom(key: string): () => number {
  let seed = 2166136261;
  for (const character of key) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const next = Math.floor(random() * (index + 1));
    [result[index], result[next]] = [result[next], result[index]];
  }
  return result;
}

function winnerOrder(weekKey: string): number[] {
  return shuffle(MEMBERS.map((_, index) => index), seededRandom(`${weekKey}:outcomes`));
}

function calendarWeekKey(week: Week): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(week.id)) return week.id;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: week.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(week.startsAt);
  const part = (type: string) => parts.find(value => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function createBots(week: Week): Bot[] {
  if (!Number.isFinite(week.startsAt) || !Number.isFinite(week.endsAt) || week.endsAt <= week.startsAt) {
    throw new Error('The simulation needs a valid week.');
  }
  const random = seededRandom(week.id);
  const weekKey = calendarWeekKey(week);
  const outcomeOrder = winnerOrder(weekKey);
  const winners = new Set(outcomeOrder.slice(0, 14));
  const sundayFinishers = new Set(outcomeOrder.slice(0, 4));
  const calendarStart = Date.parse(`${weekKey}T00:00:00Z`);
  const history = Array.from({ length: 15 }, (_, offset) => {
    const previousKey = new Date(calendarStart - (offset + 1) * 7 * 86400000).toISOString().slice(0, 10);
    return new Set(winnerOrder(previousKey).slice(0, 14));
  });
  const dayDuration = (week.endsAt - week.startsAt) / 7;

  return MEMBERS.map(([name, color], index) => {
    const target = 1 + Math.floor(random() * 5);
    const sessions = winners.has(index) ? target : Math.floor(random() * target);
    const lateFinish = sundayFinishers.has(index);
    const days = shuffle([0, 1, 2, 3, 4, 5], random).slice(0, lateFinish ? sessions - 1 : sessions);
    if (lateFinish) days.push(6);
    const schedule = days.sort((a, b) => a - b).map(day => {
      const hour = 7 + random() * 14;
      return Math.floor(week.startsAt + dayDuration * (day + hour / 24));
    });
    let streak = 0;
    for (const previousWinners of history) {
      if (!previousWinners.has(index)) break;
      streak++;
    }
    return {
      id: `sim-member-${index + 1}`,
      name,
      initials: name.split(' ').map(part => part[0]).join(''),
      color,
      target,
      stakePence: (1 + Math.floor(random() * 6)) * 500,
      streak,
      schedule,
    };
  });
}

export function getBotParticipants(bots: Bot[], week: Week, now: number): Participant[] {
  return bots.map(bot => ({
    id: bot.id,
    name: bot.name,
    initials: bot.initials,
    color: bot.color,
    target: bot.target,
    completed: Math.min(bot.target, bot.schedule.filter(timestamp =>
      timestamp >= week.startsAt && timestamp < week.endsAt && timestamp <= now,
    ).length),
    stakePence: bot.stakePence,
    streak: bot.streak,
    isBot: true,
  }));
}

export function projectedPoolPence(participants: Participant[]): number {
  return participants.reduce((pool, participant) =>
    pool + (participant.completed < participant.target ? participant.stakePence : 0), 0,
  );
}

export function rankParticipants(participants: Participant[], sort: 'progress' | 'streak' = 'progress'): Participant[] {
  return [...participants].sort((a, b) => {
    const progressDifference = b.completed / b.target - a.completed / a.target;
    const streakDifference = b.streak - a.streak;
    const primaryDifference = sort === 'streak' ? streakDifference : progressDifference;
    const secondaryDifference = sort === 'streak' ? progressDifference : streakDifference;
    if (primaryDifference) return primaryDifference;
    if (secondaryDifference) return secondaryDifference;
    if (a.completed !== b.completed) return b.completed - a.completed;
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
