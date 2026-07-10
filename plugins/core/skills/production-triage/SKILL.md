---
name: production-triage
description: Route a fired production alert to its owning team using the groundtruth registry, then orient and hand off. Use when a Datadog monitor fires, a production alert or page needs an owner, or the user asks who owns a service or where a production alert should route.
---

# Production Triage

Resolve a production alert to its owning team — alerts channel, Incident.io schedule/escalation, and Linear key — using the groundtruth registry, then orient (repo, wiki, blast radius) and hand off. This skill finds the owner; deep investigation (traces, logs, deploy correlation) belongs to the skills you hand off to, e.g. `datadog-investigate`.

This skill encodes the triage consumption contract ratified on [DEVOP-5819](https://linear.app/clipboardhealth/issue/DEVOP-5819) (2026-07-09). The registry stays generic; the routing policy lives here.

## Hard rules

- **Routing is registry-only.** Ownership and paging come from `registry/services.json` and `registry/teams.json`, never from the architecture map, Datadog team tags alone, Notion, or GitHub.
- **Never guess-page.** A page goes only to a team resolved through the registry (or the severity escape hatch below). An unconfident route is labeled as degraded or broadcast without paging.
- **Every miss files a ticket.** Any `service:` tag that fails registry resolution files a deduped DEVOP registry-gap ticket — the same worklist as the architecture map's `unregistered[]`.
- **Production only.** All Datadog reads for triage are scoped `env:production`. Do not widen to staging/dev.

## Data access

The registry is a local groundtruth checkout at `<repoRoot>/groundtruth`:

- `repoRoot` defaults to `~/dev`; a per-dev override lives in `~/.config/groundtruth/config.json` as `{"repoRoot": "/path/to/repos"}`.
- Clone if missing: `gh repo clone ClipboardHealth/groundtruth`.
- **Pull before every resolution** (`git -C <repoRoot>/groundtruth pull --ff-only`). A stale checkout silently routing to a pre-rename team is the exact failure the registry exists to prevent. If the checkout has local changes or a non-main branch, read via the degraded mode instead of trusting it.
- Degraded mode (environments that can't clone or pull): raw reads off `main`, e.g. `gh api repos/ClipboardHealth/groundtruth/contents/registry/teams.json -H "Accept: application/vnd.github.raw"`. Note in your output when you used it.

## Stage 1 — routing (normative)

1. **Extract the `service:` tag** from the monitor (its query, scope, or tags). If there is no `service:` tag, skip to [Misses](#misses-degraded-routes-and-dead-ends) and work from the `team:` tag.
2. **Normalize the name** using the same rules as groundtruth's `src/serviceNames.ts` — read that file from the checkout for the authoritative behavior. Gist: trim, lowercase, replace runs of `_`, `.`, and whitespace with `-`, collapse repeated `-`, strip leading/trailing `-`, then strip a single trailing peer-service suffix (`-mongodb`, `-postgres`, `-redis`, `-http-client`, `-aws-sqs`, and the rest of the `PEER_SERVICE_SUFFIXES` list). `cbh-shifts-mongodb` is Datadog's name for the database as seen from `cbh-shifts`; it routes as `cbh-shifts`.
3. **Look up `registry/services.json`** by `id`, then by `aliases[]` once any service grows aliases. No match → [Misses](#misses-degraded-routes-and-dead-ends).
4. **Resolve `owners[]` through `registry/teams.json`** by team `id`. `owners[]` is ordered: **`owners[0]` is the primary contact**. From the team entry take:
   - `slack.alertsChannel` — where the triage post goes (fall back to `slack.channel` if a team has no alerts channel).
   - `incidentIo.scheduleId` and `incidentIo.escalationPath` — who to page, when paging is warranted.
   - `linearKeys` — where follow-up tickets go (first key is the team's primary).
5. Single owner → post the triage report to that team's alerts channel. Page only when the alert's severity warrants it (an active or imminent high-severity incident — e.g. P1/P2 monitor priority or SEV-1/SEV-2 signals — not a routine threshold breach). Multiple owners → [Multi-owner routing](#multi-owner-routing).

Mechanics for reading monitors, posting, and paging are discovered at runtime from whatever tooling is available (dd-pup, the Datadog API, Slack tooling, the Incident.io MCP); the contract fixes the questions and the route, not command literals.

## Stage 2 — orientation (after routing)

After the route is decided, consult `architecture/serviceMap.json` / `serviceMap.md` for orientation only:

- The service's `repo`, wiki pointer (`wikiPath` / `context/devin-wiki/<repo>/`), and purpose — include in the triage post so the owning team starts oriented.
- Liveness: if the resolved service has `apmObserved: false`, add the caveat "registry knows this service but production APM hasn't seen it in 7d — possibly a stale monitor". This is a caveat in the post, **never a routing change**.
- `registry/employees.json` when a specific human is needed (email ↔ GitHub ↔ manager).

**Absence rule:** if `architecture/` is missing or stale, skip orientation silently — routing is unaffected. The map never blocks a route.

## Live queries

Answer two questions live from Datadog APM (`env:production` only), best-effort, after routing:

1. **Current dependencies** of the affected service — upstream suspects, downstream blast radius.
2. **Recent error rate / latency** for the service and its immediate dependencies — is the problem isolated or cascading?

Dependency and error-rate data are high-churn and deliberately not committed to the registry. Discover the current command shapes at runtime (dd-pup et al.). Summarize findings in the triage post; anything deeper is a handoff, not triage.

## Multi-owner routing

When `owners[]` has several teams:

1. **`registry/ownershipAreas.json` is the tiebreaker the moment it exists**: map alert content → area → single owning team. Its absence is just another degraded mode — do not block on it.
2. **Interim, evidence-based pick**: disambiguate from the monitor name and query, the service's `notes`, and route hints (e.g. an endpoint path in the monitor scope). If confident, route to that one team, state the rationale in the post, and name the other owners.
3. **No confident pick**: post to **all** owners' alerts channels, marked "multi-owner, no tiebreaker — needs a claim". Page nobody.
4. **High severity**: page the primary owner, `owners[0]`, regardless of tiebreak confidence (ratified ordering: alchemy is primary for cbh-shifts, cbh-shiftmonitor, cbh-db-triggers; action for cbh-agentprofile).

## Misses, degraded routes, and dead ends

A miss is any alert whose `service:` tag resolves to nothing in `services.json` (or that has no `service:` tag). Use every signal, label what you did, never guess silently:

- **Degraded resolution**: the monitor's `team:` tag resolves through `teams.json` — matching team `id`, `aliases[]`, or `knockCategories` with the same case-insensitive normalization (`resolveTeamName` in groundtruth's `src/serviceNames.ts`; a name matching several teams is unresolved), or through `retiredTeams[]` (follow the `successor` chain; a `successor: null` team may still route via `notes`, e.g. value's documented split: cbh-lastminute → alchemy, cbh-pricing → synapse). Route to the resolved team **with an explicit caveat** that the route came from the team tag, not service ownership — and still file the gap ticket. A degraded-but-labeled route beats a dead letter.
- **Dead end** — unknown service and no resolvable team signal (unknown `service:` tag with no usable `team:` tag; retired team with `successor: null` and no usable `notes`): post the evidence bundle to **platform's alerts channel** (resolve `platform` in `teams.json` — platform stewards the registry, so the symptom and the fix route to the same team), plus the DEVOP ticket. The evidence bundle contains: the raw tag, the normalized form, the alias/team-tag attempts made, and any `unregistered[]` candidates.
- **Severity escape hatch**: an unroutable alert signaling an active high-severity incident escalates to **Incident Commanders (EP014)**. It must not sit unclaimed in a Slack channel.

On every miss, before composing the route:

1. Consult `architecture/serviceMap.json` `unregistered[]` for prior evidence and candidates for the observed name (skip silently if the map is absent).
2. **File a deduped registry-gap ticket in DEVOP**: search open DEVOP issues for the normalized service name first; if one exists, comment with the new observation instead of duplicating. Ticket body: the evidence bundle plus the monitor link. Title convention: `Registry gap: unresolved service "<normalized-name>"`.

## Triage post format

Post to the resolved alerts channel (thread off the alert when possible):

- **Alert**: monitor name + link, when it fired, priority.
- **Service**: raw tag → normalized → registry `id` (or "unresolved").
- **Route**: owning team(s), primary owner, and why (registry hit / ownership area / evidence-based pick / degraded via team tag / dead end).
- **Paging decision**: paged `<team>` via `<escalationPath>` / not paged, and why.
- **Caveats**: degraded mode used, `apmObserved: false`, multi-owner without tiebreaker, stale map.
- **Orientation**: repo, wiki pointer, purpose (when the map is available).
- **Live signal**: dependency and error-rate summary (best-effort).
- **Follow-ups**: gap ticket filed/commented (link), suggested Linear team key for the owning team.

## Dry runs

When asked to dry-run a resolution (or when validating this skill), execute the full read path — pull, resolve, orient, live-query — but produce no side effects: render the exact posts, pages, and tickets that would be sent, each labeled with its destination, instead of sending them. Never page during a dry run.
