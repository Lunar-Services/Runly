# Customer offer

## Current marketing: AI Workspace Hours

The public `/pricing` page advertises Standard ($9/month, 3 hours/week,
2 GB files), Plus ($19/month, 10 hours/week, 5 GB), and Pro ($49/month,
30 hours/week, 20 GB). Pay as you go is a separate $10 purchase of 5 hours,
valid for 30 days, with 2 GB files. Every user has one workspace and one
development sandbox. AI with all supported models, code execution, and live
previews are included. Fair-use, request, and capacity limits apply.

The timer starts when the development runtime is ready, pauses when sleeping,
and excludes GPU provisioning waits. Subscription hours follow four releases
per billing cycle (start, days 7, 14, 21); unused hours expire at the next release.
There are no automatic overages. Storage does not consume time. Production
hosting is excluded. This supersedes all credit/token offers below.

This is a marketing UI change only. Actual account billing, Stripe products,
entitlements, inference usage accounting, and runtime metering remain unchanged
and must be migrated before this offer can be sold and enforced.

## Archived credit proposals (superseded)

This UI phase updates Landing, Plans, Billing, and Workspace Projects copy.
It does not change project editors, inference providers, entitlements, prices,
Stripe products, runtime metering, or stored balances.

In development, open `/pricing?offer=preview` to explore proposed pricing and
a labeled sample of the future credit balance. Signed-in users can also open
`/settings/billing?offer=preview`. Production ignores the query parameter.
The regular Plans and Billing pages keep their real token allowances and checkout.

## Proposed offer, pending implementation

### Latest marketing direction

AI credits convert to model input/output token usage. Sandbox runtime is a
separate included weekly/monthly allowance; it does not deduct AI credits.
Workspace access remains included. This supersedes the earlier dedicated-GPU
credit/time proposal below for the current marketing phase. Dedicated GPU
sessions are outside this offer. No backend metering or entitlement is changed.
The marketing preview no longer embeds the sample account balance section.
Saved files use storage capacity but not runtime hours; concurrent sandboxes
consume aggregate sandbox-hours. Idle sandboxes auto-sleep. Weekly and monthly
runtime allowances are non-rollover limits, not always-on production hosting.

Founder-specified preview values:

| Offer              | AI allowance                             | Sandbox time                        | Storage | Concurrent sandboxes |
| ------------------ | ---------------------------------------- | ----------------------------------- | ------- | -------------------- |
| $10 top-up         | 1,000 per purchase                       | 5 hours per purchase, valid 30 days | 2 GB    | 1                    |
| Standard $19/month | 500 per allowance, 2,000/billing month   | 10 hours per allowance, 40/cycle    | 5 GB    | 1                    |
| Pro $49/month      | 1,375 per allowance, 5,500/billing month | 30 hours per allowance, 120/cycle   | 20 GB   | 1                    |

Subscribers receive exactly four grants, at start and days 7/14/21. The fourth
period lasts to monthly renewal. Unused subscription credits/hours expire at
the next release; no rollover. Prepaid credits remain until spent and are used
after expiring subscription credits. Top-ups never refresh weekly. Maximum
continuous sessions: 2/4/6 hours; idle shutdown: 15/15/20 minutes respectively.

Proposed Ajax Abliterated rates: 200 credits per million input tokens, 600 per
million output tokens. At 80% input/20% output, estimates are 3.57M tokens per
top-up, 1.79M per Standard grant, and 4.91M per Pro grant. Billing-cycle estimates
are 7.14M/19.64M, not guaranteed token caps. These rates and GPU throughput/cost
assumptions are unbenchmarked. Financial projections are not net-profit promises.
No backend configuration, grants, resets, or runtime metering are implemented.

### Earlier proposal (historical; superseded for marketing)

100 credits represent $1 of usage. Pay as you go: $10 for 1,000 prepaid credits.
Standard: $19/month with 1,000 monthly credits. Pro: $49/month with 3,000 monthly
credits. Workspace access and limited development previews are included with
usage across the proposed offers. There is no separate workspace fee or meter;
their infrastructure costs are covered internally by the offer's margin.
These are proposals, not active products or available credit balances.

Shared AI consumes credits at model-specific input/output token rates. Dedicated
GPU sessions consume credits by active reserved time, metered per second and
priced before launch. Editing and queue time are free. Development previews
auto-sleep when idle; saved files do not require a running sandbox. Always-on
production hosting is separate future work. Resource limits remain to be costed.

Spend monthly credits first; they reset each billing period. Prepaid credits do
not reset monthly. No automatic overages. Optional auto-top-up requires explicit
customer opt-in. Do not advertise these billing capabilities as live yet.

## Cost guardrails for the backend phase

The founder's $0.20/GPU-hour assumption is not a guaranteed provider price.
At $0.50/hour retail, GPU-only margin is 60% at full billable utilization.
Include idle capacity, model loading, failure costs, storage, bandwidth, payment
fees, and development sandbox costs before setting prices.

Target >=65% contribution margin for shared inference and >=50% for dedicated
sessions after direct costs. Dedicated rate = fully loaded hourly cost / 0.50.
Only offer $0.50/hour if fully loaded cost is <=$0.25/hour. Benchmark each model,
long contexts, internal agent calls, and sandbox cost per paying customer before
publishing usage rates or resource limits. Do not depend on unused credits to
make the offer viable and do not promise unlimited compute.

The current provider integration does not establish availability of uncensored
model hosting. Treat new positioning as an upcoming offer until the model fleet
is integrated and validated. GitHub repository integration requires deployment
configuration. Next phase: benchmark costs, finalize rates, implement the credit
ledger and billing/metering, and validate uncensored model deployment.
