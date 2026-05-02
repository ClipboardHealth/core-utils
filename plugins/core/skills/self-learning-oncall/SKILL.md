---
name: self-learning-support
description: |
  On-call support workflow for the product support team. Use when:
  - User pastes a Slack thread URL from a team support channel
  - User mentions on-call support or an issue tracker ticket
  - User wants to investigate a product bug
  - User asks for a support-thread answer or issue investigation
---

# Self-Learning Support Skill

Two modes:

1. **Default**: Research a Slack or Linear question thread, draft a concise response, save to memory.
2. **`--issue`**: Investigate a bug from a Slack thread or Linear issue, diagnose root cause, propose/implement a fix.

## Getting Started

### Prerequisites

**Required MCP connections** — the skill needs these to function:

- **Slack** — reading support threads and searching prior discussion
- **Linear** (`mcp__linear__*`) — reading issues, comments, project context, related tickets, and creating follow-up tickets

**Strongly recommended** — install these for full capability:

- **Datadog** — backend logs, APM traces, RUM events, metrics, dashboards, and incident evidence
- **Codex plugin** (`/codex:rescue`, `/codex:adversarial-review`) — second-opinion diagnosis and code review
- **Hardware/device triage skill** — device-level debugging when the workspace provides one

The skill degrades gracefully without optional tools — it will skip unavailable sources and note what was missed.

### Codebases

The skill searches local clones of these repos. Ask the user for paths if not discoverable:

- `<mobile-repo>` — mobile app
- `<device-app-repo>` — device app
- `<backend-repo>` — backend services
- `<frontend-repo>` — web frontend

### Memory

The skill builds a personal Q&A memory corpus over time at `~/.claude/memory/support-qa-*.md` and `~/.claude/memory/support-issue-*.md`. This improves answer quality as the corpus grows. Prior solved answers become high-confidence sources for similar future questions. Each support rotation starts fresh but benefits from Q&As saved by previous sessions.

## Arguments

- First argument (required): Slack thread URL, `channel_id/message_ts`, or Linear issue URL/identifier
  - URL format: `https://workspace.slack.com/archives/CHANNEL/pTIMESTAMP`
  - Direct format: `<primary-channel-id>/1774656208.503899`
  - Linear: `TEAM-123`, `https://linear.app/.../issue/TEAM-123/...`, or a Linear issue ID
- `--issue` flag: activates bug investigation mode (see Phase 1-Issue below)

## Channels

- **Primary on-call channel**: `<primary-channel-id>`
- **Secondary**: `<secondary-channel-id>`, `<secondary-channel-id>`

---

## Phase 1: Research & Answer

### 1a. Parse Input, Read Thread & Shape Evidence

Parse the Slack URL to extract channel_id and message_ts:

- Strip the `p` prefix from the timestamp in the URL
- Insert a `.` before the last 6 digits (e.g., `p1774656208503899` -> `1774656208.503899`)

Read the full thread with `mcp__claude_ai_Slack__slack_read_thread`.

**Before any research or delegation**, shape the evidence from the thread:

1. Extract the asker's reported symptoms verbatim.
2. List attached artifacts: screenshots, logs, quoted UI text, device identifiers, company ID, thread history.
3. **Visual evidence gathering** — visuals are the single highest-value grounding artifact. A screenshot can instantly tell you which module you're in (e.g., legacy flow vs new flow), the exact UI state, and whether the asker's description matches what's actually on screen. In a prior investigation, a screenshot redirected the entire codebase search from the wrong module to the correct one — without it, we would have shipped a fix to code the customer never sees. If the thread or linked Linear issue mentions screenshots or video:
   - Check the Slack thread for image attachments (inspect them directly)
   - If a Linear issue is linked, fetch the issue and comments, then inspect any attachments or linked screenshots/videos.
   - **Ask the user to share any visual artifacts** from the issue that you can't access directly (e.g., video recordings or attachments behind auth). Do this early — don't start deep investigation without visual grounding if visuals exist.
   - For videos: ask the user to share key frame screenshots, or propose extracting frames if tooling is available
4. **Artifact inspection** — if screenshots or quoted UI text exist, inspect visible text before naming the screen or flow. Read the text, grep it in the codebase to confirm which screen it belongs to. Do not infer feature identity from layout alone when text is available. If artifact evidence conflicts with the thread narrative, surface the conflict explicitly.
5. Separate observed facts from hypothesis:
   - **Observed facts**: what the asker and artifacts directly show
   - **Current best classification**: your initial read of the problem category
   - **Unknowns**: what's missing or ambiguous

**Clarification check**: If the core symptom category is still ambiguous after evidence shaping — e.g., you can't tell if it's a config issue vs a bug, or the screenshot text is unreadable, or the thread combines two separate issues — consider whether one narrow clarifying question would be more valuable than speculative research. If so, propose that question instead of diving into research.

### 1b. Research (run in parallel)

Launch these searches concurrently:

1. **Slack history**: Use `mcp__claude_ai_Slack__slack_search_public_and_private` with key terms from the question. Search broadly across all of Slack, but weigh results from `<primary-channel-id>` highest.

2. **Linear context**: Fetch the Linear issue, related issues, parent/child issues, project, labels, and comments. Check whether a duplicate or follow-up already exists before proposing a new ticket.

3. **Prior on-call answers**: Glob `~/.claude/memory/support-qa-*.md` and read any files whose descriptions match the topic. Prior answers with `status: solved` are high-confidence sources.

4. **Codebase** (if the question involves product behavior, bugs, or feature details — launch **at least 2** parallel Explore agents with different focuses):
   - **Agent A**: Search for the specific UI/screen/component mentioned. Use artifact text, screen names, or feature keywords to locate the exact code path.
   - **Agent B**: Search for the symptom pattern (e.g., "ScrollView not scrolling", "button cut off", similar layout issues) and recent changes to the area (git log).
   - Available codebases — agents should search whichever are relevant, not just the "obvious" one. Use paths from the Getting Started section or ask the user:
     - `<mobile-repo>` (mobile app)
     - `<device-app-repo>` (device app)
     - `<backend-repo>` (backend — check when the question involves API behavior, policy logic, or data issues)
     - `<frontend-repo>` (web frontend — check when comparing "works on web but not mobile" or understanding how a flow works on web)
   - **Cross-codebase signals**: If the issue involves a feature that spans frontend + backend, or if the asker says "it works on web but not mobile," launch agents in both relevant codebases. The bug often lives in a different layer than the symptom — a mobile UI issue might be caused by a backend API returning unexpected data, or a "missing feature" might exist in the web frontend but never got implemented in mobile.

5. **Datadog observability** (when the question involves runtime errors, crashes, latency, intermittent behavior, or a workplace/user/device/request identifier):
   - Search Datadog logs by route, service, request ID, workplace ID, user ID, trace ID, error text, and timestamp.
   - Search APM traces/spans for the affected route or operation. Capture the slow/error span and upstream/downstream service context.
   - Search RUM events for frontend errors, page actions, route changes, and browser/device context.
   - Check dashboard or metric trends when the question is about scale, frequency, or blast radius.
   - Include Datadog links, queries, time windows, and caveats in the research summary.
   - These tools require authentication. If auth fails, skip and note it. Don't block on them.

6. **Linear ticket status** (when search results include related Linear tickets):
   - Check current state, owner, labels, project, priority, parent/child relation, and recent comments.
   - A closed/resolved issue does not prove the current problem is fixed. Treat it as history unless evidence matches.
   - Do not cite a closed ticket as a current known issue without noting that it is closed.
   - If all related tickets are closed, be honest in the research summary. The support person needs to know whether this is a regression, recurrence, or new issue.

7. **Hardware triage** (only when 1a evidence shaping suggests a hardware/device issue AND a hardware triage skill/tool is available — if not installed, skip and note "hardware triage unavailable" in the research summary):
   - Delegate to a strong subagent that runs the hardware triage workflow
   - **Trigger when** shaped evidence points to: face recognition failure, fingerprint reader behavior, badge flow failure, timezone drift on device, WiFi/connectivity on device, white screen/OOM tied to device state, app version/update issues on a specific device
   - **Do not trigger** just because the thread mentions a device. The issue must be device/hardware-specific, not a policy or config question.
   - **Input contract** — pass the subagent:
     - Company ID and device serial/ID
     - Exact symptom description from thread
     - Relevant screenshot text or UI wording from 1a artifact inspection
     - Whether the symptom is: option missing / option present but malfunctioning / intermittent / device-specific vs fleet-wide
   - **Synthesis rule**: treat subagent output as evidence, not conclusion. In the research summary, note what the subagent found, what in the thread supports it, what doesn't yet support it, and whether the finding is confirmed, plausible, or just a lead

### 1b-bis. Secondary Research Checkpoint

After ALL parallel research streams from 1b have returned (including background agents), pause and evaluate before synthesizing. Do not draft a response or diagnosis until this step completes.

**Why this step exists**: In practice, synthesizing before all streams return produces premature conclusions. A Slack/Linear-only synthesis can propose a UI fix while a background codebase or Datadog stream is still running. That late stream may find the real root cause and invalidate the earlier conclusion.

1. Re-read the original thread/ticket
2. List what each research stream found — one line per stream
3. Check for gaps: "Slack found a related thread mentioning a backend error, but we didn't search Datadog logs" or "Agent A found the component but didn't check recent git history for regressions"
4. Check for conflicts: if two agents found different potential causes, note both
5. If gaps exist, launch **targeted follow-up investigations** before proceeding
6. Only after all streams are complete and gaps are addressed, move to 1c

### 1c. Mid-Flight Reset

If research (1b) changed your understanding of the problem — e.g., you started thinking it was face recognition but evidence now points to photo check-in, or you found a known bug but its symptoms don't quite match — do NOT layer the new understanding on top of the old framing. Instead:

1. Stop building on the old interpretation.
2. Re-read the original thread from scratch.
3. Restate the case using only thread evidence, not prior assumptions.

Document briefly:

- **Old framing**: what you initially thought
- **Why it's no longer reliable**: what evidence contradicted it
- **New framing**: restated from thread evidence only

If your understanding didn't change during research, skip this step.

### 1d. Steel-Man Review

Re-read the original thread, then pressure-test your findings. This step validates your diagnosis.

1. **Re-read the question** with fresh eyes. List every factual claim the asker made (e.g., "all other clocks show X", "this only happens when Y").
2. **Check each claim against your findings.** If your explanation doesn't account for a claim — or contradicts it — that's a red flag. Don't ignore it; investigate further.
3. **Ask "what would disprove this?"** For your proposed answer, identify what evidence would make it wrong. Then check whether that evidence exists.
4. **Watch for terminology assumptions.** The asker may use imprecise terms (e.g., "badge" when they mean "numeric ID", or "all clients" when they mean "web + mobile"). But don't assume imprecision. Take their statements at face value first and only reinterpret if evidence supports it.
5. **Known-issue citation gate.** If you plan to reference a specific bug, Linear issue, PR, or known issue as related to the question, you MUST first:
   - Write the bug's required symptom signature in one sentence (e.g., "face scan option does not appear on the dashboard")
   - List the evidence in the current thread that matches it
   - List any evidence that does NOT match or is unknown
   - Label the citation: `Confirmed match`, `Plausible match — not confirmed`, or `Not a match — do not cite`
   - Special rule for lookalike bugs: when two bugs are commonly conflated (e.g., "option absent from UI" vs "option present but failing at recognition"), require explicit differentiation. These must never be treated as equivalent.
6. **Restate and compare.** State the asker's actual question in your own words. State the answer you plan to give. Compare them:
   - Am I answering the reported symptom, not a nearby issue?
   - Am I distinguishing observed facts from inference?
   - If my understanding changed during research, did I fully discard the old framing (per 1c)?

If the steel-man check reveals a gap, do another round of targeted research before proceeding. It's better to spend an extra minute investigating than to present a plausible-sounding answer that doesn't hold up.

7. **Codex second opinion** (for complex or high-stakes answers, if the Codex plugin is installed): Call `/codex:rescue` with the diagnosis, key evidence, and proposed answer. Ask Codex to pressure-test the reasoning: is the root cause analysis solid? Are there alternative explanations? Does the proposed response actually address the symptom? This is especially valuable when codebase investigation was involved. If Codex is not available, proceed without — the steel-man steps above still validate the diagnosis. (Note: this is `/codex:rescue` for diagnosis review. For reviewing a final code fix, use `/codex:adversarial-review` instead — see Phase 1-Issue-g.)

### 1e. Final Thread Re-Read (Communication Alignment)

This step is not diagnostic — it's about making sure the response fits what the asker actually needs. Re-read the thread one more time and check:

- Did the asker want explanation or immediate action?
- Did they ask one question or several? (Don't miss the second question.)
- Does the response claim too much certainty? (Especially for biometrics/hardware.)
- Would one clarifying question be more valuable than a speculative answer?

### 1f. Output

Present **two things**:

**1. Research Summary** (for the on-call person's understanding):

- What the question is asking
- What you found and where (with links to Linear issues, Slack threads, Datadog queries, and code paths)
- Your confidence level and any caveats
- Any claims from the asker that your findings don't fully explain (flag these explicitly)
- Keep this as detailed as it needs to be — sometimes a sentence, sometimes a few paragraphs

**2. Proposed Slack Response** (for pasting into the thread):

**Style calibration**: Before drafting, read the 3 most recent `support-qa-*.md` files that have an `Actual` field filled in. Use those real posted responses as your primary style reference. They reflect the on-call person's actual voice. The `references/tone-examples.md` file provides baseline guidance, but the Actual responses take precedence when they differ.

Apply the rules in `references/humanizer.md` and match the tone in `references/tone-examples.md`. Key rules:

- **Lead with the answer.** Not a preamble, not "great question", not "here's what I found".
- **1-3 sentences** for straightforward questions. A few bullets max for complex ones.
- **Link to sources** — Linear issue, Datadog query/dashboard, prior Slack thread, or code path if one exists.
- **Escalate fast** if you don't know — name who to loop in rather than guessing.
- **Never use**: "Great question!", "I hope this helps!", "Let me know if...", "Here's the breakdown:"
- **Never** break a simple answer into bullet points. If one sentence covers it, use one sentence.
- **Hedge appropriately for thorny areas** — biometrics, hardware issues, and intermittent bugs deserve "this looks like it could be" rather than "this is a known issue." Do not claim certainty when the underlying problem is hard to reproduce or verify.

Present the proposed response in a code block so the user can copy it easily.

---

## Phase 1-Issue: Bug Investigation Mode (`--issue`)

When `--issue` is passed, the skill shifts from "draft a Slack response" to "diagnose root cause and propose/implement a fix." The research phases (1a, 1b) still apply, with these modifications:

### Investigation-specific changes to Phase 1

- **1a**: If a Linear issue is provided (URL or identifier), fetch it immediately. Extract all identifiers, symptoms, comments, related issues, labels, priority, and attachments. Visual grounding is even more critical here — request screenshots/video from the user before deep investigation.
- **1b item 4 (Codebase)**: Launch **at least 3** parallel Explore agents with different focuses:
  - **Agent A**: Locate the exact component/screen from visual evidence or ticket description
  - **Agent B**: Search for the symptom pattern and similar bugs (git log, grep for related issues)
  - **Agent C**: Trace the feature end-to-end (data flow, navigation, container hierarchy)
  - Intentional overlap is good — agents with different starting points that converge on the same file are strong confirmation. Agents that find different files expose competing hypotheses early, before you commit to a fix direction.
- **1b item 5 (Observability)**: Actively use Datadog logs, APM traces, metrics, and RUM when IDs or timestamps are available. Look for runtime errors, slow spans, failed requests, frontend errors, and route-level regressions.
- **1b-bis**: The secondary research checkpoint is especially important. Findings from one agent often reveal that a different codebase or a different part of the same codebase needs investigation.
- **1d item 7 (Codex)**: If the Codex plugin is installed, always run it for `--issue` mode. Pass the full diagnosis, proposed fix approach, and key file paths.

### 1-Issue-f. Diagnosis Output

Present:

1. **Root cause** — what's broken and why, with code references
2. **Red herrings** — what looked related but wasn't (and why you ruled it out)
3. **Proposed fix** — specific code changes, with rationale
4. **Confidence level** — high/medium/low
5. **Open questions** — anything the investigation couldn't resolve

### 1-Issue-g. Fix Execution (user-approved)

If the user approves the proposed fix:

1. Create a fix branch
2. Implement the changes
3. **Codex adversarial review on the final code** (if Codex plugin is installed) — run `/codex:adversarial-review --wait` to challenge the implementation approach, design choices, and assumptions. This is different from the earlier `/codex:rescue` (which pressure-tested the *diagnosis*) — adversarial review challenges whether the *fix itself* is the right approach. If Codex is not available, present the diff directly to the user.
4. Present the Codex review output + final diff to the user
5. **PAUSE for user review** — do not push or create a PR until the user explicitly approves. The user may catch domain-specific issues that automated review misses, and a premature PR creates noise for reviewers.
6. Only after user approval: commit, push, create PR
7. Update the Linear issue or create a follow-up ticket with findings

### 1-Issue Memory Format

Save as `~/.claude/memory/support-issue-YYYYMMDD-<slug>.md`:

```markdown
---
name: support-issue-<slug>
description: "Issue: <short description>"
type: reference
---

## Issue
**Ticket**: <linear url>
**Thread**: <slack url if applicable>
**Date**: YYYY-MM-DD
**Company**: <name> (<id>)
**Summary**: <1-line>

## Diagnosis
**Root cause**: <what's broken and why>
**Red herrings**: <what looked related but wasn't>
**Visual grounding**: <what the screenshot/video showed that guided investigation>

## Fix
**PR**: <url>
**Approach**: <what was changed and why>
**Confidence**: high/medium/low
**Verified**: yes/no/partial

## Retrospective
**What worked**: <investigation approaches that paid off>
**What didn't**: <wrong turns, wasted effort>
```

---

## Phase 2: Save to Memory

After presenting the answer, ask the user:

> Did you paste this response as-is, or did you modify it? If modified, paste what you actually sent.

Then save a memory file:

**File**: `~/.claude/memory/support-qa-YYYYMMDD-<slug>.md`

The slug should be 2-4 words describing the topic (e.g., `unsupported-device`, `mobile-visibility`, `export-mismatch`).

```markdown
---
name: support-qa-<slug>
description: "Q: <short question summary>"
type: reference
---

## Question
**Thread**: <full slack thread URL>
**Date**: <YYYY-MM-DD>
**Asker**: <name from thread>
**Channel**: <channel_id>
**Summary**: <1-line summary of the question>

## Answer
**Proposed**: <the response the skill suggested>
**Actual**: <what the user actually posted — same as proposed if pasted as-is>
**Sources**: <list of Linear issues, Slack threads, Datadog queries, and code paths used>

## Effectiveness
**Status**: pending
**Rating**: 
**Notes**: 
```

Then update (or create) `~/.claude/memory/MEMORY.md`:

- Add one line: `- [support-qa-<slug>](support-qa-YYYYMMDD-<slug>.md) -- Q: <short summary>`
- Keep entries sorted by date, newest first
- Keep total lines under 200

---

## Phase 3: Postmortem

After saving the new Q&A, check for pending reviews.

### 3a. Find Pending Q&As

Glob `~/.claude/memory/support-qa-*.md` and read files where `Status: pending`. Take the **3 most recent** (by date in filename).

### 3b. For Each Pending Q&A

1. Show the user:
   - Original question summary
   - The answer that was given (Actual field)
   - Date it was answered

2. Re-read the original Slack thread (`slack_read_thread` using the saved Thread URL) to check for follow-up messages:
   - Did the asker reply with thanks, confirmation, or "that worked"? -> Propose `solved`
   - Did the asker ask follow-up questions or say it didn't help? -> Propose `partially_solved` or `not_solved`
   - No follow-up at all? -> Propose `unknown`

3. Present your proposed rating with reasoning. Ask the user to confirm or override.

### 3c. Update Memory

For each reviewed Q&A, update the memory file:

- Set `Status` to `reviewed`
- Set `Rating` to the confirmed value (`solved`, `partially_solved`, `not_solved`, `unknown`)
- Add any notes from the user to `Notes`

### 3d. Skill Retrospective

After completing the postmortem reviews, reflect on the full support session: the research, the proposed response, the user's edits, and the postmortem ratings. Propose any improvements to the skill itself.

Consider:

- **Response quality**: Did the user heavily edit the proposed response? What does that suggest about the tone/style rules?
- **Research gaps**: Was there a source that would have helped but wasn't searched? A search that returned noise?
- **Postmortem patterns**: Are `partially_solved` or `not_solved` answers clustering around a topic? Does the skill need better guidance for that area?
- **Process friction**: Did any phase feel unnecessary or slow? Could steps be reordered or parallelized better?
- **New anti-patterns**: Did the proposed response fall into an AI writing pattern not yet covered in `references/humanizer.md`?

Present proposed changes briefly. If the user approves, apply the edits to the skill files directly. As the skill matures, expect fewer suggestions — that's a sign it's working. Don't propose changes for the sake of it.

**Tone examples refresh**: If there are 3+ new `solved` or `partially_solved` Q&As since the last update to `references/tone-examples.md`, propose replacing or adding examples in that file using real Q&A pairs from the Actual field. Keep the file to 5-7 examples max — rotate out generic/hypothetical examples in favor of real ones as the corpus grows.

---

## Reference Files

- `references/humanizer.md` — AI writing anti-patterns to avoid in Slack responses
- `references/tone-examples.md` — Real before/after examples of target response tone
