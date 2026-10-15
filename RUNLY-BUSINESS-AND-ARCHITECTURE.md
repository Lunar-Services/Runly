# Runly — Business Model & Architecture Brief

**Discussion consolidated: 15 October 2026**  
**Status:** Founder direction plus recommended design. Pricing, capacity, and model rates remain proposals until benchmarked. This document does not imply that the future billing or infrastructure is implemented.

## 1. Startup concept and customer promise

Runly gives customers access to uncensored/abliterated open AI models to create software projects inside a managed development workspace. Customers describe an idea, generate and edit code, and run a development preview without setting up a local environment. GitHub can serve as an optional project repository.

Initial customers: independent developers, founders prototyping products, freelancers, and technical users seeking permissive models without operating GPU infrastructure.

**Founder positioning:** “AI never says No.”  
**Recommended customer promise:** “More freedom to create. Your workspace, ready to build.”

Use the founder slogan as an ambition rather than an unconditional guarantee: models can refuse, fail, or be unavailable. Explain “abliterated” briefly as modification intended to reduce refusal behavior. Mark uncensored model access as upcoming until deployment is validated.

Launch around websites and applications. Video/image editors and always-on production hosting are future offerings.

## 2. Business model and proposed offers

Revenue combines monthly subscriptions and prepaid top-ups. **Workspace access and limited development previews are included with usage. No separate workspace fee or customer-facing workspace runtime meter.** Track those costs internally.

| Offer         | Proposed price | Credit allowance | Initial included limits               |
| ------------- | -------------: | ---------------: | ------------------------------------- |
| Pay as you go |     $10/top-up |    1,000 prepaid | 1 running preview; 2 GB saved files   |
| Standard      |      $19/month |    2,000 monthly | 1 running preview; 5 GB saved files   |
| Pro           |      $49/month |    5,500 monthly | 3 running previews; 20 GB saved files |

These are the **latest commercial recommendations**, replacing earlier proposals of 1,000 Standard/3,000 Pro credits. The repository's existing UI pricing preview may still show those earlier allowances; neither proposal is a live billing entitlement. Limits require capacity and cost validation, and aggregate demand must fit the worker pool.

- 100 credits represent $1 at published usage rates; credits are service units, not redeemable cash. Monthly bundles provide a usage discount.
- Monthly credits reset each billing period; prepaid top-ups do not reset monthly. Consume monthly credits first.
- No automatic overages. Optional auto-top-up requires explicit opt-in.
- Sleep development previews after approximately 15 minutes of inactivity. Preserve saved files independently.
- Always-on production hosting is not included. No unlimited compute promise.

## 3. Usage measurement

**Shared AI — token-based:** publish model-specific input/output token rates converted to credits. Count actual tokens processed across the agent's model calls, including submitted context and code. Do not charge for manual editing, reading responses, queue time, provider startup, or duplicate infrastructure retries. Reserve a task budget, reconcile actual usage, and release unused credits. Support customer task spending limits.

**Dedicated GPU — time-based:** explicitly reserve hardware at a displayed credit rate. Charge ready, reserved session time by the second, including pauses between prompts. Stop before balance exhaustion and support idle shutdown. Shared AI and dedicated sessions draw from the same credit allowance; they are not separate included budgets.

Token rates and task counts are **not finalized**. Earlier example token conversions were illustrations, not launch commitments.

### Dedicated GPU rate calculation

```text
Credits/hour = fully loaded cost per billable hour
               / (1 - target contribution margin)
               / net revenue per credit

Session credits = billable seconds * credits/hour / 3,600
```

Include GPU rental, unpaid startup/idle capacity, storage/bandwidth, and allocated sandbox costs. Account for payment fees in net revenue per credit without counting them twice.

Example only: $0.20 rental/hour at 80% billable utilization becomes $0.25 per billable hour. Add $0.10 infrastructure allocation: $0.35 total. Pro realizes $49/5,500 ≈ $0.00891 per credit before fees. A 65% margin target requires about 112 credits/hour before fees; **120 credits/hour is a candidate to evaluate**, not a confirmed rate. At 120, Pro buys approximately 45.8 dedicated hours if no credits go to shared AI. At the earlier illustrative 100-credit rate it buys 55 hours. Different hardware needs different rates.

## 4. Infrastructure economics and launch footprint

Founder starting position: overloaded 4 GB Zeabur VPS at approximately $4/month, Supabase Free, and an estimated marketplace GPU cost of $0.20/hour. Inspect CPU, memory, disk, and processes before attributing the overload solely to RAM.

**Budget starting recommendation:** one 8 GB VPS for the application and sandbox services during development/trusted private beta; managed Supabase and rented GPU inference remain external. Start with one build/install at a time, one preview, and a 2 GB sandbox memory limit. Reserve headroom for the application and OS. Use production builds, not `next dev`.

**Public launch recommendation:** separate the application host from sandbox workers. An 8 GB sandbox worker can be sufficient initially; 16 GB is optional capacity, not mandatory. Scale from measured concurrent builds/previews, CPU, memory, disk, and queue delay.

Published starting HostHatch prices checked during this discussion:

| Configuration                                      | Starting monthly price |
| -------------------------------------------------- | ---------------------: |
| 8 GB RAM / 2 shared CPU cores / 35 GB NVMe         |                     $9 |
| 16 GB RAM / 4 cores, 2 dedicated / 75 GB NVMe      |                    $15 |
| Supabase Pro, one Micro covered by compute credits |                    $25 |

Indicative fixed totals: $9 for one development VPS with Supabase Free; $34 with Pro; $43 for two 8 GB hosts plus Pro; $49 for an 8 GB app host, 16 GB worker, and Pro. **GPU costs and other services are additional.** Availability, region, bandwidth, renewals, backups, taxes, and storage can change totals. Supabase Pro is recommended before paid launch for production features and daily backups, not merely when the user count grows.

Rent rather than buy GPU hardware initially. Evaluate a 24 GB GPU and a quantized 7B–14B coding model, subject to model compatibility and context-memory requirements. A Runpod RTX A5000 was listed at $0.27/hour: 100 operating hours ≈ $27; 730 hours ≈ $197.10, excluding extras. Do not assume $0.20/hour is consistently available. Compare cost per successful coding task, not rental price alone.

## 5. Architecture: founder proposal and recommended implementation

**Founder proposal:** two independently deployable projects within this repository:

1. **Web:** SSR landing/account/billing and a client-interactive workspace.
2. **Sandbox provider:** load project files into segregated containers, run applications, and deliver previews.

**Recommended refinement:** retain those two applications, with a trusted agent worker as a separate process belonging to Web. GPU inference and managed data services are external dependencies.

```text
Browser -> Web/API -> Supabase: auth, metadata, jobs, credit ledger
                  -> Durable project snapshots

Trusted agent worker -> GPU model servers
                     -> Sandbox provider -> Isolated project runtimes

Browser -> Authenticated preview/runtime gateway -> Project runtime
```

### Ownership and trust boundaries

- **Web:** identity, ownership checks, customer pages, project metadata, conversations, Stripe, credit accounting, GitHub credentials, and model-provider integration. Server-render initial pages/data; hydrate interactive workspace components. Long agent jobs run in the worker, not a long-lived page/API request.
- **Trusted agent worker:** claim durable jobs, coordinate model calls and tools, record progress, reconcile usage, and request snapshots. Never put provider or billing credentials inside customer runtimes.
- **Sandbox provider:** start/stop runtimes; restore/save files; execute commands; expose logs/terminals/previews; enforce resource and network limits. It does not determine subscription rights or credit balances.
- **GPU servers:** one loaded model can serve multiple customer requests using continuous batching. Memory and latency constrain concurrency. Queue excess demand and add replicas based on measured pressure; parallel users do not imply linear throughput gains.

### Runtime and preview design

One isolated writable runtime per active project. Keep credentials, Docker sockets, host files, and internal/metadata networks inaccessible to customer code. For public execution, evaluate gVisor-backed containers and compatibility on the chosen host. Ordinary containers alone are not a sufficient isolation design for arbitrary customer code. Firecracker is an alternative only if KVM access and operational support are verified.

Previews use HTTP/WebSocket proxying into an iframe, **not screen-video streaming**. Serve them on a separate domain, e.g. `<session>.runly-preview.net`, with private access by default, project-scoped short-lived authorization, and no main-site cookies. Keep preview traffic out of the Next.js request path; use the provider's gateway.

Sandbox disks are working copies. Persist checkpoints and snapshots before sleep/destruction. GitHub is optional, not the sole recovery mechanism.

### Job lifecycle and repository shape

Web verifies ownership and reserves credits -> durable job -> worker claims a lease -> restore/start sandbox -> model/tool loop -> stream events -> persist changes -> reconcile usage and release reservation.

Use the existing Postgres queue initially, with leases, retries, and idempotency to prevent duplicate work or charges. No Kubernetes or mandatory Redis at launch.

```text
apps/web/                 # Next.js + trusted agent worker
apps/sandbox-provider/    # Runtime manager + preview gateway
packages/runtime-contracts/ # Validated requests/events
```

The repository already has a Web app, runtime jobs, access tickets, and a gateway/worker. Reorganize incrementally: separate orchestration from execution, add a sandbox-provider interface, decouple runtime startup from OpenAI configuration, and split credentials/networks. This structure is recommended future work, not the current repository layout.

## 6. Profit controls, launch stages, and unresolved decisions

Profit is **not guaranteed**. Target >=65% contribution margin for shared AI and >=50% for dedicated sessions after direct delivery costs. Validate at full allowance consumption, not assumed unused credits. On Pro, 100 credits realize ≈$0.89 before fees; a 65% target leaves about $0.31 for total direct cost.

Protect margins with prepaid balances, model-specific rates, bounded tasks, resource limits, idle shutdown, capacity queues, and monitoring. Separate contribution margin from net profit: salaries, acquisition, taxes, and general overhead still need funding.

**Launch sequence:** benchmark one model/GPU and representative coding tasks -> capped paid beta with top-ups/Standard -> validate Pro concurrency -> expand models and dedicated sessions. Acquire early customers through real project demos, templates, developer communities, and referrals.

**Measure:** model cost per token/task, GPU utilization, latency/queue delay, failures/retries, sandbox cost per paying customer, contribution margin by plan, conversion, retention, top-ups, and acquisition cost.

**Still to validate:** actual VPS overload cause; HostHatch region/renewal/disk capacity and isolation support; chosen model/license/coding quality; GPU offers/throughput; final token and hardware credit rates; plan resource limits; durable file/storage costs; credit ledger/payment behavior. Current production billing remains token-quota subscriptions until migrated. Customer UI changes do not implement uncensored model hosting or credit billing.

## References

Official sources checked during the discussion; prices are not guaranteed quotes:

- [HostHatch products](https://hosthatch.com/products)
- [Supabase pricing](https://supabase.com/pricing)
- [Runpod GPU pricing](https://www.runpod.io/pricing)
- [Vast.ai billing](https://github.com/vast-ai/docs/blob/main/guides/reference/billing.mdx)
- [Continuous batching](https://huggingface.co/docs/transformers/continuous_batching)
- [gVisor production guidance](https://gvisor.dev/docs/user_guide/production/)
- [Firecracker requirements](https://github.com/firecracker-microvm/firecracker/blob/main/docs/getting-started.md)
- [Browser embedding and isolation](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content/General_embedding_technologies)
