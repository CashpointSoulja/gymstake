# Architecture

## My prototype boundary

I build GymStake as a static TypeScript web app with browser-local state. I separate presentation, location evidence, deterministic simulation, and the commitment and settlement rules. I keep those rules testable without a browser or a live location provider.

I use integer pence for money and epoch timestamps for instants. I derive week boundaries and daily attendance dates from Europe/London. I do not substitute the browser’s current timezone or assume every week is exactly 168 hours.

## My data model

| Record | What I retain | Why I retain it |
| --- | --- | --- |
| Profile | Stable user identity, display name, preferences, pending preferences, streak | I separate future choices from the active commitment. |
| Gym | Identity, name, address, latitude, longitude | I register a verification destination. |
| Week | Identity, start instant, end instant, timezone | I have an explicit settlement boundary. |
| Commitment | User, week, gym snapshot, target, stake pence, completion count, status | I freeze the rules for a particular week. |
| Session | Commitment link, gym snapshot, start/end, last verified time, evidence timestamp and pause state, verified duration, mode, outcome | I distinguish evidence from elapsed time and prevent duplicate credit. |
| Ledger entry | Identity, user, week, kind, signed pence, timestamp, rail, reference | I derive the available wallet from an auditable sequence of simulated movements. |
| Settlement | Week, timestamp, winners, losers, pool, per-user rewards, rollover | I retain the result and make repeat processing harmless. |
| Bot | Stable identity, display details, target, stake, streak, schedule | I reproduce demonstration activity consistently. |
| Application state | Schema version, active records, history, rollover, optional simulation clock | I persist and restore one local prototype instance. |

I identify simulated and location sessions separately. I keep the rail marker on ledger records even though every current entry uses the simulation rail.

## How I account for the wallet

I open the wallet with £100 of play money. A clearly labelled lab top-up adds £50 through its own ledger entry; it is a simulation action rather than a deposit. If a commitment was unfunded and the top-up supplies enough balance, I lock that commitment’s unchanged stake and activate it. I debit a stake once when a funded commitment begins. When it wins, I credit its stake return and pool reward as separate entries. When it loses, the locked stake remains forfeited; I do not debit the same stake a second time.

I compute the pool from forfeitures and any carried value. I divide it by the number of eligible winners using integer division, then assign remaining pennies in stable participant order. A no-winner result carries the whole pool forward. Unfunded commitments cannot generate a forfeiture or receive a funded prize.

For example, if three winners each staked £10 and two people each forfeit £10, I return each winner’s £10 and divide £20 as £6.67, £6.67, and £6.66. The stable ordering determines who receives the extra pennies.

I treat the bots as a deterministic local simulation of participants. Their presence demonstrates settlement maths; it is not a pooled account shared with other browsers.

## How I process a week change

I compare the active week’s end with the current effective time. I settle expired commitments once, store their results, apply saved preferences to the next commitment, and open that commitment if sufficient play money is available. If the app has been closed for several weeks, I process expired boundaries in order when it returns.

I use the real current time for normal operation and an explicit simulation time for demonstrations. I do not run settlement in the background after the browser closes. The installable shell is not a backend scheduler.

## How I verify a session

I use browser geolocation after an explicit check-in action. I compare a valid position with the commitment’s registered coordinates and reject reported accuracy worse than 100 metres. I accept fixes no more than 60 seconds old within 150 metres and count only intervals between fresh, increasing evidence timestamps. I reject intervals beyond the two-minute evidence limit. Stale or inaccurate fixes, denied permission, and a hidden-page pause reset the evidence anchor without crediting the gap. I do not add unverified time between the last accepted fix and a delayed receipt or checkout.

I end a session when reliable evidence places it outside the gym, or when the user checks out. Leaving ends verified presence at the last accepted evidence. I distinguish a completed visit from one that is too short or interrupted. I cap qualifying credit at one visit per London date and bind that credit to the session’s original commitment.

I cannot use browser coordinates as a production fraud guarantee. I cannot assume a mobile browser will keep delivering fixes in the background. I keep the visible timer and stored verified duration tied to the evidence policy.

## How I would attach a real rail

I define a payment-rail boundary around stake locking and release, with stable idempotency keys and provider references. This is a future seam, not a real integration. I would move authority to an authenticated backend and extend the ledger with currency, funding and payout states, provider events, reconciliation, reversals, and dispute handling.

I would keep provider secrets off the client, verify payment events on the server, and use a durable scheduler for settlement. I would separate internal ledger settlement from external transfer success so a failed payout cannot silently alter the result. I would review custody, eligibility, consumer disclosures, and the legal treatment of the pool before handling real funds.

## My operational limits

I rely on public search and tile services for the map experience and provide manual coordinates as a fallback. I cache the application shell for an installable feel. Browser storage can be cleared or edited, lacks cross-device sync, and is not a trusted ledger. I keep those limitations explicit in the product and test documentation.
