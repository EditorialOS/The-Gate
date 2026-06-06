# Review Gate Template — Universal AI Output Quality Control

## What This Is

A portable quality gate that evaluates AI agent output before it reaches the end user. Works for any domain, any agent architecture, any delivery method.

The review gate answers one question: **is this output good enough to deliver, or does it need revision?**

It can be implemented as:
- A self-review step inside a single agent (the agent checks its own work)
- A separate reviewer agent in a multi-agent pipeline (one agent produces, another reviews)
- A module in an orchestration layer (a conductor or runtime runs the gate between execution and delivery)
- A human-in-the-loop checkpoint (the gate produces a structured assessment, a human makes the final call)

The gate is deliberately opinionated: it blocks delivery when quality is insufficient, and it provides specific, actionable feedback when it does. Vague "needs improvement" verdicts are not permitted.

---

## How to Use This Template

1. Choose your gate criteria (Section 2) — select from the universal criteria and add domain-specific ones
2. Set your scoring method (Section 3) — choose pass/fail, numeric scoring, or rubric-based
3. Define your verdicts (Section 4) — what happens at each quality level
4. Configure your revision loop (Section 5) — how many retries, what feedback looks like
5. Wire it into your system (Section 6) — where in your pipeline the gate runs
6. Calibrate (Section 7) — tune the gate so it catches real problems without blocking good work

---

## 1. Gate Architecture

### Where the Gate Sits

```
Input → Agent Produces Output → REVIEW GATE → Deliver or Revise
                                     │
                                     ├── APPROVED → Deliver to user
                                     ├── REVISE → Send back to agent with feedback
                                     └── BLOCKED → Halt, notify operator
```

### Gate Inputs

The review gate receives:

| Input | Why It's Needed |
|-------|----------------|
| **The output being reviewed** | The thing being evaluated |
| **The original request or brief** | What was asked for — the gate checks whether the output answers it |
| **The context that was available** | What the agent had to work with — the gate checks whether the output is grounded in it |
| **The quality criteria** | The standards the output is measured against |
| **Revision history** (if applicable) | Prior attempts and feedback, so the gate can assess whether revision instructions were followed |

### Gate Output

The review gate returns a structured verdict:

```
{
  "verdict": "APPROVED | REVISE | BLOCKED",
  "confidence": 0.0 - 1.0,
  "criteria_results": {
    "criterion_name": {
      "pass": true/false,
      "score": 0-5 or 0-10 (if using numeric scoring),
      "assessment": "Specific assessment of this criterion",
      "evidence": "The specific part of the output that supports the assessment"
    }
  },
  "strengths": ["What the output does well"],
  "gaps": ["What's missing or needs work"],
  "revision_instructions": "If REVISE: specific, actionable instructions for what to fix",
  "missing_context": "If BLOCKED: what additional context is needed to produce acceptable output"
}
```

---

## 2. Gate Criteria

### Universal Criteria (Apply to any domain)

These criteria apply regardless of what the agent produces. Select all that apply to your use case.

#### Context Grounding

*Is the output based on the provided context, or is the agent making things up?*

| Score | Definition |
|-------|-----------|
| **Pass** | Every claim, recommendation, and specific detail is traceable to the provided context sources. Any inference or estimation is explicitly flagged. |
| **Fail** | The output contains specific claims, data points, names, or recommendations that don't appear in the context sources and aren't flagged as inferences. |

**Why this matters:** This is the most important criterion for any context-dependent agent. An agent that silently fabricates details produces output that looks authoritative but is unreliable. The user can't tell the difference between grounded and fabricated — that's the gate's job.

**What to check:**
- Are proper nouns (names, companies, places, products) from the source material?
- Are numerical claims (prices, dates, percentages, measurements) verifiable against context?
- Are quotes attributed to real sources from the provided material?
- Are recommendations grounded in context, or are they generic best practices?

#### Brief Fidelity

*Does the output deliver what was asked for?*

| Score | Definition |
|-------|-----------|
| **Pass** | The output addresses every element of the original request. If the request specified format, length, audience, tone, or other constraints, the output respects them. |
| **Fail** | The output misses a requested element, ignores a constraint, or answers a different question than the one asked. |

**What to check:**
- Does the output match the requested format (if specified)?
- Does the output address the stated audience (if specified)?
- Is the output within the requested length range (if specified)?
- Does the output cover all topics or components requested?
- Are explicit constraints (e.g., "no jargon," "include pricing," "focus on X") followed?

#### Completeness

*Is the output usable as-is, or does it have gaps that require additional work?*

| Score | Definition |
|-------|-----------|
| **Pass** | The output is self-contained and usable without further work. No placeholder text, no missing sections, no "TBD" markers, no "insert X here" gaps. |
| **Fail** | The output contains placeholders, incomplete sections, missing data, or gaps that require the user to do additional work before the output is usable. |

**What to check:**
- No `[TBD]`, `[INSERT]`, `[PLACEHOLDER]`, `[TODO]`, or similar markers
- All sections that are started are completed
- All lists and tables are fully populated (no empty rows or columns)
- The output has a beginning, middle, and end (doesn't trail off)

#### Internal Consistency

*Does the output contradict itself?*

| Score | Definition |
|-------|-----------|
| **Pass** | Facts, recommendations, and framing are consistent throughout the output. A claim made in section 1 doesn't get contradicted in section 3. |
| **Fail** | The output contains contradictions — different numbers for the same metric, conflicting recommendations, or framing shifts that confuse the reader. |

**What to check:**
- Numbers cited in multiple places match
- Recommendations in one section don't conflict with another
- Tone and framing are consistent throughout
- If the output references "earlier" analysis, it matches what was actually said earlier

#### Specificity

*Is the output specific enough to be actionable, or is it generic?*

| Score | Definition |
|-------|-----------|
| **Pass** | The output contains specific names, numbers, dates, examples, and recommendations that are unique to this request and this context. A reader could act on it without needing to fill in details. |
| **Fail** | The output reads like a template or textbook. Replace the brand name with any other brand and the content would still work. Recommendations are generic best practices rather than context-specific guidance. |

**Why this matters:** Generic output is the most common failure mode of AI agents. The output looks professional and well-structured but contains no information the user didn't already know. The specificity criterion catches this.

**What to check:**
- Does the output reference specific entities from the context (real competitor names, real product names, real channel details)?
- Are recommendations tied to specific context (not "increase social media presence" but "increase Instagram Reels cadence from 2x to 4x/week based on the 3.2% engagement rate on last month's Reels vs. 1.1% on static posts")?
- Could this output have been produced without the context sources? If yes, it's too generic.

### Domain-Specific Criteria (Add for your use case)

*Add criteria specific to your domain. Examples below — adapt or replace entirely.*

#### For Content / Editorial

| Criterion | What It Checks | Pass Condition |
|-----------|---------------|----------------|
| Voice compliance | Does it sound like this brand? | Matches voice guide: vocabulary rules followed, tone scale respected, anti-patterns avoided |
| Structural quality | Is it well-constructed for its format? | Follows format conventions (feature has narrative arc, blog is scannable, email has clear CTA) |
| Factual integrity | Are claims verifiable? | Every factual claim is sourced or flagged. No invented quotes, statistics, or details. |
| Originality | Is it derivative or does it add value? | The output offers perspective, framing, or synthesis — not just rephrased source material |

#### For Strategy / Analysis

| Criterion | What It Checks | Pass Condition |
|-----------|---------------|----------------|
| Competitive grounding | Does it address the actual competitive landscape? | References specific competitors by name with specific strengths/weaknesses, not generic "competitors in the space" |
| Actionability | Can someone execute from this? | Contains specific actions with owners, timelines, and success metrics — not just "consider doing X" |
| Assumption transparency | Are assumptions stated? | Key assumptions are called out explicitly, not embedded as facts |
| Risk awareness | Are risks acknowledged? | Identifies what could go wrong and what depends on factors outside the user's control |

#### For Technical / Code

| Criterion | What It Checks | Pass Condition |
|-----------|---------------|----------------|
| Correctness | Does it work? | Code compiles/runs, logic is sound, edge cases are handled |
| Security | Are there vulnerabilities? | No hardcoded secrets, input validation present, auth checks in place |
| Maintainability | Can someone else work with this? | Clear naming, comments where needed, consistent patterns |
| Specification compliance | Does it match requirements? | Implements all specified features, respects constraints |

#### For Customer-Facing / Communication

| Criterion | What It Checks | Pass Condition |
|-----------|---------------|----------------|
| Appropriateness | Is the tone right for the audience? | Formal for formal contexts, casual for casual, never tone-deaf |
| Clarity | Can the reader understand it on first read? | No ambiguity, no jargon without definition, logical flow |
| Sensitivity | Could anything be offensive or problematic? | No cultural missteps, no assumptions about the reader, no exclusionary language |

---

## 3. Scoring Methods

Choose one scoring method. Don't mix methods within the same gate.

### Method A: Pass/Fail (Simplest)

Each criterion is binary: pass or fail. The output is approved only if all criteria pass.

**Best for:** Quality gates where every criterion is equally important and non-negotiable. High-stakes outputs where any single failure is a blocker.

```
All criteria pass → APPROVED
Any criterion fails and is fixable → REVISE
Any criterion fails and is not fixable without new input → BLOCKED
```

### Method B: Numeric Scoring (Most Flexible)

Each criterion is scored on a 1-5 or 1-10 scale with defined anchors. The overall score is a weighted average.

**Best for:** Quality gates where criteria have different importance levels, and you want to track quality trends over time.

**1-5 Scale Anchors:**

| Score | Meaning |
|-------|---------|
| 5 | Excellent. Meets or exceeds professional standards. |
| 4 | Good. Minor issues that don't affect usability. |
| 3 | Acceptable. Noticeable issues but output is still usable. |
| 2 | Below standard. Issues affect usability. Needs revision. |
| 1 | Unacceptable. Fundamental problems. Needs major rework or additional input. |

**Verdict thresholds (configure these):**

```
All criteria ≥ 4 → APPROVED
All criteria ≥ 3, no criterion at 1 → APPROVED WITH NOTES (deliver with flagged improvements)
Any criterion at 2 → REVISE (fixable issues)
Any criterion at 1 → BLOCKED (needs additional input or fundamental rethink)
```

**Weighting (example):**

| Criterion | Weight |
|-----------|--------|
| Context grounding | 30% |
| Brief fidelity | 25% |
| Specificity | 20% |
| Completeness | 15% |
| Internal consistency | 10% |

### Method C: Rubric-Based (Most Structured)

Each criterion has a defined rubric with specific descriptions at each level. No ambiguity about what a score means.

**Best for:** Gates where consistency across different reviewers (human or AI) matters, or where you need to explain the verdict to the end user.

**Example rubric for "Specificity":**

| Score | Description | Example |
|-------|------------|---------|
| 5 | Every recommendation is unique to this context with specific names, numbers, and actionable details | "Increase Instagram Reels from 2x to 4x/week — your Reels averaged 3.2% engagement vs 1.1% on static posts in April" |
| 4 | Most recommendations are context-specific with minor generic elements | "Increase Reels cadence — your engagement data shows they outperform static posts" |
| 3 | Mix of specific and generic. Some recommendations could apply to any brand. | "Increase video content — short-form video performs well on Instagram" |
| 2 | Mostly generic. Replace the brand name and the output still works. | "Focus on creating engaging content for your target audience across key channels" |
| 1 | Entirely generic. No evidence the context was used. | "Build a strong social media presence with consistent posting and audience engagement" |

---

## 4. Verdicts

### APPROVED

The output meets all criteria at the required threshold. Deliver it.

**Action:** Send to the user or proceed to the next step in the pipeline.

**Metadata to include:** Overall confidence score, any minor notes for the record (not shown to user unless configured to do so).

### APPROVED WITH NOTES

The output is deliverable but has minor issues worth flagging.

**Action:** Deliver the output. Include the notes either as:
- Internal annotations (logged but not shown to user) — for autonomous agents
- Visible notes (appended to output) — for human-reviewed pipelines
- Separate notes (in a companion file or message) — for collaborative workflows

**When to use:** When revising for minor issues would take more time than the improvement is worth, and the output is fully usable as-is.

### REVISE

The output has issues that can be fixed by re-running the agent with specific feedback.

**Action:** Do NOT deliver to the user. Send the output back to the producing agent with:
1. Which criteria failed and why
2. Specific, line-level revision instructions (not "make it better" — "the competitive analysis in section 2 references 'industry competitors' instead of naming Yonex and Babolat specifically, which are in the context sources")
3. What to preserve (explicitly state what's good so the agent doesn't over-revise)

**Revision instruction format:**

```
--- REVISION FEEDBACK ---

PRESERVE (do not change):
- {What's working — e.g., "The campaign story map structure and audience segmentation are strong"}

FIX (specific changes needed):
1. {Specific issue + specific fix — e.g., "Section 2, paragraph 3: 'competitive landscape' is generic. Replace with specific analysis of Yonex VCORE and Babolat Pure Aero from the competitive context provided."}
2. {Issue + fix}
3. {Issue + fix}

--- END FEEDBACK ---
```

### BLOCKED

The output cannot be fixed by revision alone. It needs additional input, context, or a fundamentally different approach.

**Action:** Do NOT deliver. Do NOT revise. Instead:
1. Explain to the user (or operator) exactly what's missing
2. Specify where the missing input should come from
3. Specify what the output would look like once the input is provided

**When to use:**
- The context sources were insufficient for this task (the pre-flight gate should have caught this, but if it didn't, the review gate is the backup)
- The request is fundamentally ambiguous and the output guessed wrong about what was wanted
- The output requires information the agent cannot access or infer

---

## 5. Revision Loop

### How Revision Works

```
Agent produces output
  → Gate evaluates → REVISE
    → Gate builds revision instructions
      → Agent receives original task + its prior output + revision instructions
        → Agent produces revised output
          → Gate evaluates again → APPROVED or REVISE or BLOCKED
```

### Revision Rules

**Maximum revision attempts:** {Configure — recommended: 2}

After the maximum revision attempts:
- {Choose one:}
  - Deliver the best version with a note explaining unresolved issues
  - Escalate to a human reviewer
  - Block delivery and notify the operator

**Revision instructions must be:**
- **Specific** — "Fix the pricing comparison in section 3" not "improve quality"
- **Actionable** — the agent must be able to fix the issue with the available context
- **Scoped** — tell the agent what to preserve, not just what to fix. Preventing over-revision is as important as fixing problems.

**Second revision vs first revision:**
- If the second revision attempt fails on the **same criteria** that failed the first time, the revision instructions weren't specific enough. Escalate rather than attempting a third revision.
- If the second revision attempt fails on **different criteria**, the revision may have introduced new issues. Escalate rather than chasing a moving target.

### Progressive Strictness

On the first evaluation, the gate applies standard criteria.
On a revision evaluation, the gate checks:
1. Were the specific revision instructions followed? (Primary check)
2. Did the revision preserve what was good? (Secondary check)
3. Did the revision introduce new problems? (Regression check)

---

## 6. Integration Patterns

### Pattern A: Self-Review (Single Agent)

The agent evaluates its own output before delivering. The gate criteria are included in the agent's system prompt.

```
Agent system prompt includes:
  - Production instructions (how to do the work)
  - Gate criteria (how to evaluate the work)
  - Instruction: "Before delivering, evaluate your output against the gate criteria.
    If any criterion fails, revise and re-evaluate. Deliver only when all criteria pass."
```

**Pros:** Simple, no additional infrastructure. Works for any single-agent setup.
**Cons:** The agent may be biased toward approving its own work. Self-review is less rigorous than independent review.

### Pattern B: Independent Reviewer (Multi-Agent)

A separate agent or model evaluates the producing agent's output. The reviewer has no stake in the output passing.

```
Producing Agent → output → Review Agent → verdict
                                │
                                ├── APPROVED → deliver
                                └── REVISE → feedback → Producing Agent → revised output → Review Agent
```

**Pros:** More rigorous. The reviewer can be a different model, a different prompt, or even a different architecture.
**Cons:** Adds latency and cost (one additional LLM call per review, plus one per revision).

### Pattern C: Orchestrator-Managed (Pipeline)

A conductor or runtime manages the gate as a step in the pipeline. The gate runs automatically after every agent return.

```
Conductor dispatches task to Agent
  → Agent returns output
    → Conductor runs review gate
      → APPROVED: mark task complete, proceed to next task
      → REVISE: re-dispatch to Agent with feedback
      → BLOCKED: halt pipeline, notify operator
```

**Pros:** Gate enforcement is guaranteed — no agent can skip it. Revision is automatic. State is tracked.
**Cons:** Requires an orchestration layer.

### Pattern D: Human-in-the-Loop

The gate produces a structured assessment, but a human makes the final verdict.

```
Agent → output → Gate produces assessment → Human reviews assessment + output → Verdict
```

**Pros:** Highest quality. Catches things AI reviewers miss. Builds calibration data for future automation.
**Cons:** Slowest. Not suitable for autonomous or real-time systems.

---

## 7. Calibration Guide

### The Two Failure Modes

**Too strict:** The gate blocks good output. Every deliverable gets REVISE. The revision loop churns without improving quality. The user never receives work.

**Too loose:** The gate approves bad output. Generic content, fabricated details, and off-brief deliverables reach the user. Trust erodes.

### How to Calibrate

1. **Run 10 representative tasks** through your pipeline with the gate active
2. **For each verdict, ask:**
   - If APPROVED: would a domain expert agree this is good enough to deliver?
   - If REVISE: is the feedback specific enough that the revision will actually improve the output?
   - If BLOCKED: is the output truly unfixable without additional input, or is the gate being overly cautious?
3. **Adjust:**
   - If more than 50% of outputs get REVISE on first pass, the gate is probably too strict — raise pass thresholds or relax non-critical criteria
   - If more than 80% pass on first try, the gate may be too loose — lower pass thresholds or add criteria
   - A well-calibrated gate approves 50-70% of outputs on first pass and resolves most revisions in one attempt

### Calibration by Domain

| Domain | Typical Strictness | Why |
|--------|-------------------|-----|
| Customer-facing content | High | Errors reach the end customer and affect brand trust |
| Internal analysis / strategy | Medium | Users are sophisticated enough to catch minor issues; speed matters |
| Draft / work-in-progress | Low | The output will be reviewed and refined by humans anyway |
| Automated pipelines (no human review) | Highest | No human catches errors downstream — the gate is the last line of defense |
| Creative / brainstorming | Lowest | Premature criticism kills creative output; gate checks only for factual errors and off-brand content |

### Tracking Quality Over Time

Log every gate verdict with:
- Task type
- Criteria scores
- Verdict (APPROVED / REVISE / BLOCKED)
- If REVISE: what was flagged, whether revision resolved it
- If the user provided feedback on delivered output: did the gate's assessment match the user's assessment?

Over time, this data tells you:
- Which criteria fail most often (signals a systemic weakness in the producing agent)
- Whether revisions actually improve output (if not, the feedback format needs work)
- Whether the gate correlates with user satisfaction (if approved outputs still get negative feedback, the criteria are wrong)

---

## 8. Implementation Checklist

- [ ] Gate criteria selected (Section 2) — at minimum: context grounding, brief fidelity, completeness, specificity
- [ ] Scoring method chosen (Section 3) — pass/fail, numeric, or rubric-based
- [ ] Verdict thresholds configured (Section 4) — what score triggers APPROVED vs REVISE vs BLOCKED
- [ ] Revision loop configured (Section 5) — max attempts, feedback format, escalation path
- [ ] Integration pattern chosen (Section 6) — self-review, independent reviewer, orchestrator-managed, or human-in-the-loop
- [ ] Calibrated with 10+ representative tasks (Section 7) — approval rate between 50-70% on first pass
- [ ] Domain-specific criteria added if applicable
- [ ] Revision instructions tested — do agents actually improve when they receive the feedback?
- [ ] Escalation path defined — what happens when max revisions are exhausted?
- [ ] Logging configured — every verdict is recorded for future calibration
