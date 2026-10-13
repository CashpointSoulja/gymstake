# GymStake

GymStake is my mobile-first gym commitment prototype. I set a weekly session target, stake play money on myself, and check in at my home gym. If I meet my target, my stake comes back with an equal share of the money forfeited by people who missed theirs.

**Every balance, stake, pool, and payout is simulated. There are no payments or real funds.** This is my independent product concept.

[Open the public prototype](https://gymstake-back-yourself.ayomideahmedcp.chatgpt.site) · [Public repository](https://github.com/CashpointSoulja/gymstake)

## Run locally

I use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

```sh
npm test
npm run build
npm run preview
```

I run browser checks with `npm run test:e2e` while a preview is running; I can set `BASE_URL` and `CHROMIUM_PATH` for my environment.

I serve the production `dist/` directory as a static site. Browser location requires HTTPS or localhost. No API keys or sign-in are needed to try the prototype.

## What I built

- Onboarding with a name, gym search and map pin, a target of 1–7 sessions, and a stake of £1–£100.
- A dashboard with weekly progress, a £100 opening play-money wallet, streak, and simulated pool.
- Location check-ins within 150 metres of the registered gym, with reported accuracy of 100 metres or better.
- Sessions that qualify after 30 minutes of verified presence, with at most one qualifying session per London calendar day.
- Weekly settlement, deterministic simulated competitors, and a leaderboard.
- Settings that take effect at the next weekly commitment.
- A dark mobile interface with a web app manifest and offline shell.

## The weekly rule

I use Europe/London calendar weeks, beginning Monday at 00:00 and ending at the following Monday at 00:00. This is the boundary immediately after Sunday ends, including daylight saving changes.

I lock the stake when the weekly commitment opens. Winners receive their stake back and a share of the forfeited pool. Losers receive no stake return. I split the pool in integer pence and allocate leftover pennies deterministically. If everyone misses, I carry the pool forward.

This prototype stores its state in the browser. I settle an expired week when the app next opens or advances its simulated clock; closing the browser does not leave a server running a midnight job. Clearing browser storage resets the prototype. Other devices and browsers have separate state.

## Trying check-ins

I ask for browser location permission when I start a real check-in. I can only verify a session while the browser supplies fixes no more than 60 seconds old, with reported accuracy of 100 metres or better. A verified session needs 30 accumulated minutes of supported on-site evidence; an elapsed timer alone is insufficient. I do not count gaps longer than two minutes as verified presence. Leaving the gym ends the session when an outside fix arrives. I can also check out manually.

I treat location verification as a prototype signal: browser coordinates can be spoofed, and mobile browsers can suspend location updates. I do not promise background or closed-tab tracking. I open **Settings → Prototype lab** to simulate being at the gym, complete a 30-minute visit, advance to the next weekly settlement, or add £50 of play money. These controls are explicitly simulated, and demonstration sessions remain distinguishable from location sessions.

Gym search and map tiles depend on public services. I can use a map pin or coordinates if search is unavailable. An offline shell does not make live search, tiles, or location available offline.

## Product and engineering notes

I record decisions in first person:

- [Product requirements](docs/PRD.md)
- [Explain it like I’m five](docs/ELI5.md)
- [Five whys](docs/FIVE-WHYS.md)
- [Jobs to be done](docs/JTBD.md)
- [Success metrics](docs/SUCCESS-METRICS.md)
- [Architecture and payment boundary](docs/ARCHITECTURE.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Test plan](docs/TEST-PLAN.md)
- [Test results](docs/TEST-RESULTS.md)
- [Version two roadmap](docs/ROADMAP.md)
- [Repository working agreement](AGENTS.md)

I distinguish test evidence from assumptions in the test results. I intend a real-money version to require a separate authenticated backend, durable settlement and reconciliation, stronger verification, and legal review before handling funds.
