# Test results

I ran the release checks on 14 October 2026, using the Europe/London date. I keep actual results separate from checks that still require a physical device or live deployment.

## Domain and build results

| Check I ran | Actual result |
| --- | --- |
| `npm test` | 115 tests passed across five files: 39 location, 39 settlement/payment, 12 simulation, 17 state integration, and 8 gym-search tests. |
| `npm run build` | Passed TypeScript checking and the production bundle build. |
| Development browser flow | 13 of 13 scenario checks passed before adding the production-only offline and hidden-page checks. |
| Final production browser flow | 15 of 15 scenario checks passed against the built bundle, including the service worker and offline shell. |

I verified integer-pence conservation, deterministic remainder allocation, no-winner rollover, unfunded exclusion, payment-request idempotency, repeated settlement, London calendar boundaries and both daylight-saving changes. I verified immutable current commitments, pending preferences, multiple missed weeks, exact 30-minute qualification, duplicate daily visit prevention, and corrupt-storage recovery.

I verified fresh location evidence, the 150-metre fence, reported accuracy, stale and out-of-order fixes, evidence gaps, checkout tails, auto-exit, explicit demo sessions, and simulated member continuity.

## Defects I caught and retested

- I caught a £50 top-up activating a £100 unfunded commitment before enough money was available. I added a regression test; the wallet now remains non-negative and the commitment waits for sufficient balance.
- I identified active-session restoration needing an explicit evidence pause. I verified that reopening re-anchors instead of crediting the reload gap.
- I identified simulated streaks changing independently of past outcomes. I verified that winning simulated members now carry streaks forward and missed targets reset them.
- I identified mismatched gym-picker style names. I inspected the corrected result rows, controls, and mobile layout.
- I reproduced a production offline-shell failure: the document was cached, but cached script and stylesheet requests returned 503. I retested the corrected static-asset cache lookup with the version-two shell cache: offline reload now preserves the commitment and renders the dashboard without failed asset requests.

## Browser scope

I use injected browser location samples and an explicit test clock for deterministic check-in coverage. I exercise the actual browser UI, storage, session engine, and settlement engine; I do not infer physical presence from injected coordinates.

I exercise onboarding validation, catalogue and remote place search, search failure and cancellation, map taps, coordinate validation, queued settings, denied permission, outside and inaccurate positions, valid sessions, short checkout, leaving the gym, 30 monitored minutes, the daily cap, successful and missed settlement, wallet top-ups, reset, leaderboard tabs, and persistence.

I inspect 390-pixel mobile screenshots and a 1440-pixel desktop screenshot. I check all four tabs for horizontal overflow at 320, 768, and 1440 pixels. I use reduced-motion preference during the automated browser run.

## Checks I have not claimed

I have not completed a physical walk into and out of a gym, real GPS accuracy testing, iOS Safari installation, Android installation, or a screen-reader audit. I simulate permission errors and browser visibility changes; I do not claim an operating-system permission dialog or background-location guarantee.

I control external search and map responses in the repeatable browser suite. Live place-search coverage and tile availability still depend on public services. I do not treat their uptime as a passed local assertion.

## Final production browser run

I ran the checked production bundle through this repeatable command, using a locally installed Chromium executable:

```sh
CHROMIUM_PATH=/usr/bin/chromium BASE_URL=http://127.0.0.1:4173 CHECK_PWA=1 npm run test:e2e
```

I received **15 passed checks out of 15**, with no uncaught application exceptions. I verified successful and missed simulated settlement against the ledger amounts, pending gym/target/stake changes, reload idempotency, reset cancellation and confirmation, the leaderboard, and wallet top-ups.

I verified map selection by tapping and dragging the actual marker, alongside manual coordinates and mocked remote-search success, failure, and cancellation. I checked that location errors cannot start a session and that an outside fix ends a live session. I verified a short checkout, 30 monitored minutes, duplicate daily prevention, and reload persistence.

I verified that hidden-page samples and watcher errors cannot resume or credit a paused gap. I inspected all four tabs without horizontal overflow at 320, 768, and 1440 pixels; the main flow used a 390-pixel mobile viewport.

I fetched the production manifest and every declared icon successfully. I verified service-worker control, switched the browser offline, reloaded the app, and confirmed that the cached dashboard and saved commitment returned.

I keep the final browser evidence in `tests/e2e.mjs`. Its generated screenshots and machine-readable results are local scratch artifacts and are excluded from the repository.

## Public release evidence and verification limit

I published the checked assets through a native Cloudflare deployment on 14 October 2026. The deployment service reported success and confirmed the active HTTPS address, public access mode, and no visitor-supplied credentials. I pushed the matching implementation to the new public repository at commit `d5fde0e`.

I published production script `index-BK7k_nh8.js`, stylesheet `index-BMNkDezJ.css`, and the version-two service-worker cache that passed the local production browser suite.

I attempted an independent request to the public address through the execution environment’s configured network proxy. The proxy rejected the HTTPS tunnel with HTTP 403 because the destination was outside its allowed network policy. That response came from the execution proxy before reaching the app. I did not bypass the restriction.

I therefore distinguish the successful deployment and confirmed public configuration from an independently completed remote browser check. I have not claimed that the external HTTP response, public-browser rendering, or live GPS flow was verified from this restricted environment. The 15 passing browser scenarios ran against the same built assets served locally.
