# Test plan

I use automated domain tests for rules and accounting, a production build for type and bundle checks, and browser checks for the complete experience. I record executed commands, observed outcomes, and gaps separately in [test results](TEST-RESULTS.md).

## Domain checks

| Area | Cases I require | Expected result |
| --- | --- | --- |
| Week boundaries | Sunday before deadline, Monday exactly at deadline, year change, London DST start and end | Correct London week identity and midnight boundary; no fixed-168-hour assumption |
| Preferences | Targets 1 and 7, outside bounds, stakes £1 and £100, invalid/fractional pence, invalid coordinates | Valid values accepted; invalid input rejected |
| Opening commitment | £100 opening wallet, stake lock, repeated processing | One immutable commitment and one stake debit |
| Unfunded commitment | Balance smaller than next stake | No negative wallet, no prize eligibility from an unfunded stake |
| Settlement | All win, all miss, mixed results, pre-existing rollover | Winners receive stakes and rewards; losses create pool; no-winner pool carries forward |
| Precision | Pool not divisible by winner count, small amounts | Integer pence conserved; pennies allocated in stable order |
| Idempotency | Same week settled twice, reload after settlement | Same result without extra credits or debits |
| Catch-up | Several missed weeks, pending preferences | Expired weeks settle in order; preferences apply at the next boundary once |
| Accounting | Sum of returned stakes, rewards, retained forfeitures | Exact conservation with no invented payout |
| Streak | Win, loss, repeated settlement | Win increments once; loss resets; replay changes nothing |
| Bots | Same seed/week, different weeks, partial-week progress | Deterministic schedules, bounded progress, explicit simulated identity |
| Settings | Change gym, target, and stake midweek | Active commitment snapshot unchanged; next commitment uses the saved values |

## Location and session checks

I test the 150-metre boundary with valid fixes just inside, exactly at, and just outside it. I test reported accuracy at 100 metres and above it, invalid coordinates, missing permission, location unavailable, and stale or out-of-order fixes. I test freshness at 60 seconds and beyond it.

I verify that insufficient or rejected evidence contributes no minutes. I test 29:59, exactly 30:00, and longer verified durations. I test evidence intervals up to two minutes and intervals beyond that limit. I verify that elapsed wall-clock time cannot qualify an unattended session and that delayed receipts or checkout add no unverified tail time. I verify that rejected evidence and hidden-page pauses re-anchor without counting the gap.

I test manual checkout, an outside fix ending the session, interrupted evidence, page visibility changes, and reopening after the tab has closed. I verify that a session uses the commitment’s gym snapshot and cannot be moved by pending settings. I test the London daily cap and two sessions on the same calendar date. I verify that each completed session can credit progress at most once.

I test a session crossing the weekly boundary and ensure it cannot incorrectly credit the new commitment. I distinguish simulation mode from location mode in stored data and user-facing controls.

## Browser checks

I exercise onboarding through a name, gym choice, target, and stake. I inspect search results, map-pin selection, manual coordinate fallback, and a search failure. I test validation and keyboard access.

I inspect the dashboard, active session, leaderboard, settlement feedback, and settings at narrow mobile, tablet, and desktop widths. I check readable contrast, sufficiently large tap targets, focus visibility, reduced-motion behaviour, and no horizontal scrolling.

I reload after onboarding, during a session, after saving pending settings, and after settlement. I verify that storage survives those reloads, that reset has an understandable effect, and that malformed stored state has a recoverable outcome.

I use the labelled simulation route to complete a successful week and a missed week. I compare displayed progress and payouts with the domain output. I check that bots and financial values remain identifiable as simulated throughout.

## Deployment and install checks

I build the production bundle and serve it over HTTPS. I open the public address without signing in, refresh a routed view, inspect the manifest and icons, and verify that the application shell can load after it has been cached. I verify that browser location requests occur in a secure context.

I treat installation prompts as browser-dependent. I do not infer background location tracking from service worker installation. I document any unavailable physical-device or live-location checks instead of reporting them as passes.

## My release gate

I require domain tests and the production build to pass. I require the public flow to work with explicit simulation labels and no real payment calls. I review source, package metadata, docs, and commit content for accidental attribution or secrets before publishing. I record unresolved limitations and the exact verification scope in the results.
