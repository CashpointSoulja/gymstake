# Version two roadmap

I prioritise trust and reliable attendance before introducing real money. Each stage has an exit condition.

## 1. Learn from the prototype

I will test onboarding, the weekly rules, settlement comprehension, and the emotional response to missing a target. I will compare stake motivation with reminders and streaks. I will evaluate beginning a commitment on the next full week when someone joins late.

I will consider adjustable visit duration, planned rest days, accessibility needs, and a transparent recovery or pause policy. I will keep fairness rules explicit before adding exceptions.

**Exit condition:** I can show that users understand the simulated loop and identify a specific improvement in follow-through worth testing further.

## 2. Add identity and a trusted record

I will add accounts, cross-device sync, an authenticated API, a durable event and ledger store, and a server-side settlement scheduler. I will design migrations, reconciliation, recovery, audit history, and privacy retention together.

I will keep the play-money environment separate while validating those changes. I will support idempotent writes and replay-safe settlement rather than relying on one browser’s clock or storage.

**Exit condition:** I can recover from failed jobs and duplicate requests without changing the financial outcome.

## 3. Improve attendance verification

I will test location accuracy on physical devices and investigate stronger evidence such as gym-issued QR codes, membership integrations, or a supported native location flow. I will define spoofing and abuse controls, dispute handling, and false-rejection recovery before claiming reliable verification.

I will avoid collecting more location history than the attendance decision requires. I will establish how suspended sessions, boundary crossings, and gym moves are handled.

**Exit condition:** I have measured verification reliability and an understandable appeal path.

## 4. Evaluate a real payment rail

I will obtain legal and regulatory advice on the model, including jurisdiction, prize-pool treatment, custody, eligibility, and consumer protections. I will define funding, held funds, withdrawals, chargebacks, payout failures, refunds, and provider reconciliation.

I will connect a real rail through a separate adapter only after the backend, ledger, controls, and product disclosures are ready. I will not convert existing play-money balances into real claims.

**Exit condition:** I have an approved operating model, a suitable provider arrangement, and tested money movement with a durable audit trail.

## 5. Expand the community carefully

I will evaluate private groups, optional accountability partners, opt-in leaderboards, useful reminders, and gym partnerships. I will distinguish real members from demonstration participants and measure whether social features help without creating avoidable pressure.

**Exit condition:** I can attribute a user benefit to a feature and keep participation and visibility controls clear.
