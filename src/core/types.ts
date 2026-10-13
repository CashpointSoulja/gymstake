export type Money = number;
export interface Gym {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
}
export interface Preferences {
    gym: Gym;
    target: number;
    stakePence: Money;
}
export interface Profile {
    id: string;
    name: string;
    preferences: Preferences;
    pendingPreferences: Preferences | null;
    streak: number;
}
export interface Week {
    id: string;
    startsAt: number;
    endsAt: number;
    timezone: 'Europe/London';
}
export interface Commitment {
    id: string;
    userId: string;
    weekId: string;
    gym: Gym;
    target: number;
    stakePence: Money;
    completed: number;
    status: 'active' | 'won' | 'lost' | 'unfunded';
}
export interface PositionFix {
    lat: number;
    lng: number;
    accuracy: number;
    timestamp: number;
}
export interface Session {
    id: string;
    userId: string;
    commitmentId: string;
    gym: Gym;
    startedAt: number;
    endedAt: number | null;
    lastVerifiedAt: number;
    lastFixTimestamp: number | null;
    evidencePaused: boolean;
    verifiedMs: number;
    counted: boolean;
    mode: 'location' | 'demo';
    status: 'active' | 'completed' | 'too_short' | 'interrupted';
    endReason: string | null;
}
export interface LedgerEntry {
    id: string;
    userId: string;
    weekId: string | null;
    kind: 'opening' | 'stake_lock' | 'stake_return' | 'pool_reward' | 'top_up';
    amountPence: Money;
    createdAt: number;
    rail: 'simulation';
    reference: string;
}
export interface Bot {
    id: string;
    name: string;
    initials: string;
    color: string;
    target: number;
    stakePence: number;
    streak: number;
    schedule: number[];
}
export interface Participant {
    id: string;
    name: string;
    initials: string;
    color: string;
    target: number;
    completed: number;
    stakePence: number;
    streak: number;
    isBot: boolean;
}
export interface Settlement {
    id: string;
    weekId: string;
    settledAt: number;
    winnerIds: string[];
    loserIds: string[];
    poolPence: number;
    rewards: Record<string, number>;
    rolloverPence: number;
}
export interface AppState {
    version: 1;
    profile: Profile;
    week: Week;
    commitment: Commitment;
    sessions: Session[];
    ledger: LedgerEntry[];
    settlements: Settlement[];
    bots: Bot[];
    rolloverPence: number;
    simulationNow: number | null;
}
export interface PaymentRail {
    kind: 'simulation' | 'external';
    lockStake(input: {
        userId: string;
        commitmentId: string;
        amountPence: number;
        idempotencyKey: string;
    }): Promise<{
        reference: string;
    }>;
    release(input: {
        userId: string;
        amountPence: number;
        idempotencyKey: string;
    }): Promise<{
        reference: string;
    }>;
}
