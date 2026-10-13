# Success metrics

I define these as hypotheses for future usability sessions and an opt-in pilot. I have not collected production results or embedded an analytics service in this prototype.

## What I want to learn

| Metric | My definition | Initial hypothesis |
| --- | --- | --- |
| Onboarding completion | Started onboarding to a confirmed commitment | At least 80% in a guided prototype session |
| Rule comprehension | Correct explanation of deadline, qualification, simulated money, and settlement | At least 90% after onboarding |
| First-session start | Eligible on-site users who start a session successfully | At least 90%, excluding denied permissions |
| Check-in diagnosis | Users who can explain a failed check-in from its message | At least 90% |
| Qualified-session reliability | Eligible visits that count when sufficient evidence is available | At least 95% in a controlled device pilot |
| Weekly goal achievement | Funded commitments meeting their stated target | I establish a baseline before setting a target. |
| Four-week retention | Participants who return during week four | I establish a baseline before comparing incentives. |
| Trust in settlement | Users who reconcile a worked payout example correctly | At least 90% |
| Settings comprehension | Users who identify when changed settings apply | At least 90% |

## My correctness gates

I require zero negative balances caused by settlement, zero duplicate settlements, and exact conservation of stake and pool pence in the test scenarios. I require rejected invalid location evidence to contribute no qualifying minutes. I require current-week commitment fields to survive settings changes unchanged.

These are engineering gates, not adoption measurements. I record actual checks in [test results](TEST-RESULTS.md).

## Guardrails I will watch

I will watch permission denial, poor-accuracy rejection, unexpected session interruptions, support confusion about the deadline, and mistaken beliefs that the wallet is real. I will ask about stress or pressure from the stake and how people feel after a missed week.

I will separate simulated participants from human participants in every metric. I will separate demonstration sessions from verified sessions when assessing location reliability. I will not treat bot activity as evidence of user engagement.

## How I would measure responsibly

I would collect explicit event names for onboarding, permission outcome, session outcome, settings save, and settlement view. I would keep raw coordinates out of product analytics and document retention and consent before adding a backend. I would compare cohorts with a clear baseline and avoid interpreting a small prototype sample as proof of long-term habit change.
