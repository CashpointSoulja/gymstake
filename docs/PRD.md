# Product requirements

## Why I’m building GymStake

I want to help people follow through on a gym plan they have already chosen. I am testing whether a weekly commitment, visible progress, and a small stake make the next gym visit feel more concrete. This prototype tests the interaction and motivation loop using play money.

I own the concept. I present every financial action as simulated and use no payment integration.

## Who I’m designing for

I focus on an adult who has a home gym, wants to attend consistently, and struggles to turn an intention into a routine. I assume access to a location-capable phone and a modern browser. I do not assume a wearable, gym membership integration, or account registration.

## The experience

1. I ask for a name, a home gym, a weekly target from 1 to 7 sessions, and a stake from £1 to £100. I provide gym search, a map pin, and a coordinate fallback.
2. I open a commitment for the current London calendar week and deduct its stake from the £100 opening play-money wallet.
3. I show completed sessions against the target, available wallet balance, current streak, week deadline, and simulated pool.
4. I request location only when the user starts a check-in. I accept a sufficiently accurate fix within 150 metres of the commitment’s gym.
5. I show an active session and verified duration. I count the session after at least 30 verified minutes and at most once per London calendar day.
6. I end a session on manual checkout or a reliable outside fix. I do not infer continuous presence from a missing location stream.
7. I settle the week at its end when the browser next processes state. I return winners’ stakes, distribute forfeitures, update streaks, and open the next commitment.
8. I show a leaderboard with recognisably simulated competitors and weekly results.
9. I allow changes to gym, target, and stake, applying the saved choices to the next commitment.
10. I provide a labelled Prototype lab in Settings to demonstrate gym arrival, a 30-minute visit, next-week settlement, and a £50 play-money top-up.

## Rules I fixed for the prototype

| Rule | My decision | Why I chose it |
| --- | --- | --- |
| Money | Integer pence; all funds simulated | I need exact arithmetic and an honest prototype boundary. |
| Week | Monday 00:00 to next Monday 00:00, Europe/London | I want a familiar local weekly deadline, including daylight saving changes. |
| Stake | £1–£100, locked when a commitment opens | I want the commitment to be visible before attendance begins. |
| Attendance | 150 m radius; accuracy no worse than 100 m | I accept practical phone variation while rejecting very uncertain fixes. |
| Duration | At least 30 verified minutes; evidence gaps capped at two minutes | I want attendance to mean a substantive visit. |
| Daily cap | One qualifying session per London date | I want a 7-session target to mean seven attendance days. |
| Snapshot | Gym, target, and stake immutable during the active week | I prevent an active commitment from changing after progress is known. |
| Payout | Stake return plus equal share of forfeitures | I keep the incentive understandable. |
| Penny remainder | Stable participant ordering | I make repeated settlement deterministic. |
| No winners | Carry the forfeiture pool into the next week | I preserve value when no winner can receive it. |
| No available stake | Unfunded commitment | I do not allow a negative play-money wallet or unfunded prize eligibility. |
| Competitors | Deterministic, explicitly simulated profiles | I can demonstrate the pool and leaderboard without implying live users. |

## Acceptance criteria

I consider the prototype ready when I can complete onboarding, navigate all primary screens on a narrow phone viewport, preserve the state after reload, and complete the commitment loop through labelled simulation controls. I require rejection of bad location evidence, correct 30-minute qualification, exact monetary accounting, idempotent settlement, and next-week-only settings.

I require all money-related screens to make the simulated nature clear, all simulated competitors to remain identifiable, and the deployed app to open publicly without a sign-in wall. I include install metadata and a cached application shell, while keeping the limits of browser background tracking explicit.

## Limits I accept in version one

I use browser-local state without identity, cross-device sync, or a trusted shared pool. I use location supplied by the browser and cannot prevent coordinate spoofing. I cannot guarantee location updates while the tab is suspended. I demonstrate a current-week first commitment even if onboarding happens midweek; I will evaluate a next-full-week start in version two.

I measure interest and comprehension in a prototype, not real financial outcomes. I leave real transfers, production fraud controls, gym membership verification, and account recovery outside this release.
