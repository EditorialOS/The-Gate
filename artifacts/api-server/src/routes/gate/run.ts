import { Router, type IRouter } from "express";
import { requireGateAuth } from "../../middlewares/gate-auth.js";
import { checkRateLimit } from "../../lib/rate-limit.js";
import { buildGateSystemPrompt, buildGateUserMessage } from "../../lib/gate-prompt.js";
import { hashDraft } from "../../lib/crypto.js";
import { logger } from "../../lib/logger.js";
import { db, gateReviewsTable, GateRunBodySchema, type GateMode } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

router.post("/", requireGateAuth, async (req, res): Promise<void> => {
  const gate = res.locals.gate!;

  const parseResult = GateRunBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: "validation_error",
      message: "Invalid request body.",
      details: parseResult.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
    return;
  }

  const { draft, brief, voice_guide, mode } = parseResult.data;

  const rateLimit = await checkRateLimit(gate.apiKeyPrefix, gate.rateLimitPerHour);
  if (!rateLimit.allowed) {
    res.status(429).json({
      error: "rate_limit_exceeded",
      message: `Rate limit of ${rateLimit.limit} reviews per hour exceeded. Resets at ${rateLimit.resetAt.toISOString()}.`,
      rate_limit: {
        used: rateLimit.used,
        limit: rateLimit.limit,
        reset_at: rateLimit.resetAt.toISOString(),
      },
    });
    return;
  }

  const systemPrompt = buildGateSystemPrompt(mode as GateMode);
  const userMessage = buildGateUserMessage(draft, brief, voice_guide);

  let rawContent: string;
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const block = message.content[0];
    if (!block || block.type !== "text") {
      throw new Error("Unexpected response format from LLM");
    }
    rawContent = block.text;
  } catch (err) {
    logger.error({ err }, "Gate LLM call failed");
    res.status(502).json({
      error: "llm_error",
      message: "The gate evaluation service is temporarily unavailable. Please try again.",
    });
    return;
  }

  let verdict: Record<string, unknown>;
  try {
    const cleaned = rawContent
      .replace(/^```(?:json)?\s*/m, "")
      .replace(/\s*```$/m, "")
      .trim();
    verdict = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    logger.error({ rawContent }, "Gate LLM returned invalid JSON");
    res.status(502).json({
      error: "parse_error",
      message: "The gate evaluation returned an unexpected format. Please try again.",
    });
    return;
  }

  const required = ["verdict", "confidence", "criteria_results", "strengths", "gaps"];
  const missing = required.filter((k) => !(k in verdict));
  if (missing.length > 0) {
    logger.error({ verdict, missing }, "Gate verdict missing required fields");
    res.status(502).json({
      error: "incomplete_verdict",
      message: "The gate evaluation returned an incomplete response. Please try again.",
    });
    return;
  }

  const draftHash = hashDraft(draft);

  let reviewId: string;
  try {
    const [inserted] = await db
      .insert(gateReviewsTable)
      .values({
        apiKeyPrefix: gate.apiKeyPrefix,
        draftHash,
        verdict: String(verdict.verdict),
        confidence: String(verdict.confidence ?? 0),
        scorecard: (verdict.criteria_results ?? {}) as Record<string, any>,
        strengths: (verdict.strengths ?? []) as string[],
        gaps: (verdict.gaps ?? []) as string[],
        revisionInstructions:
          typeof verdict.revision_instructions === "string"
            ? verdict.revision_instructions
            : null,
        missingContext:
          typeof verdict.missing_context === "string" ? verdict.missing_context : null,
        metadata: {
          mode,
          weighted_score: verdict.weighted_score,
          has_voice_guide: Boolean(voice_guide?.trim()),
        },
      })
      .returning({ id: gateReviewsTable.id });

    reviewId = inserted!.id;
  } catch (err) {
    logger.error({ err }, "Failed to persist gate review");
    res.status(500).json({
      error: "persistence_error",
      message: "Review was evaluated but could not be saved. Please try again.",
    });
    return;
  }

  res.status(200).json({
    id: reviewId,
    verdict: verdict.verdict,
    confidence: verdict.confidence,
    weighted_score: verdict.weighted_score,
    criteria_results: verdict.criteria_results,
    strengths: verdict.strengths,
    gaps: verdict.gaps,
    revision_instructions: verdict.revision_instructions ?? null,
    missing_context: verdict.missing_context ?? null,
    meta: {
      mode,
      draft_hash: draftHash,
      has_voice_guide: Boolean(voice_guide?.trim()),
      rate_limit: {
        used: rateLimit.used + 1,
        limit: rateLimit.limit,
        reset_at: rateLimit.resetAt.toISOString(),
      },
    },
  });
});

export default router;
