import { Router, type IRouter } from "express";
import { requireGateAuth } from "../../middlewares/gate-auth.js";
import { logger } from "../../lib/logger.js";
import { db, gateReviewsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router: IRouter = Router();

const VALID_VERDICTS = ["APPROVED", "APPROVED_WITH_NOTES", "REVISE", "BLOCKED"] as const;

function parseListQuery(query: Record<string, unknown>): {
  limit: number;
  offset: number;
  verdict: string | undefined;
  error: string | null;
} {
  const rawLimit = query["limit"];
  const rawOffset = query["offset"];
  const rawVerdict = query["verdict"];

  const limit = rawLimit !== undefined ? Math.min(Math.max(parseInt(String(rawLimit), 10) || 20, 1), 100) : 20;
  const offset = rawOffset !== undefined ? Math.max(parseInt(String(rawOffset), 10) || 0, 0) : 0;

  let verdict: string | undefined;
  if (rawVerdict !== undefined) {
    if (!VALID_VERDICTS.includes(rawVerdict as any)) {
      return {
        limit,
        offset,
        verdict: undefined,
        error: `Invalid verdict filter. Must be one of: ${VALID_VERDICTS.join(", ")}`,
      };
    }
    verdict = String(rawVerdict);
  }

  return { limit, offset, verdict, error: null };
}

function formatReview(r: typeof gateReviewsTable.$inferSelect) {
  return {
    id: r.id,
    verdict: r.verdict,
    confidence: parseFloat(String(r.confidence)),
    weighted_score: (r.metadata as Record<string, unknown>)?.weighted_score ?? null,
    scorecard: r.scorecard,
    strengths: r.strengths,
    gaps: r.gaps,
    revision_instructions: r.revisionInstructions ?? null,
    missing_context: r.missingContext ?? null,
    draft_hash: r.draftHash,
    meta: {
      mode: (r.metadata as Record<string, unknown>)?.mode ?? null,
      has_voice_guide: (r.metadata as Record<string, unknown>)?.has_voice_guide ?? null,
    },
    created_at: r.createdAt,
  };
}

router.get("/", requireGateAuth, async (req, res): Promise<void> => {
  const { limit, offset, verdict, error } = parseListQuery(req.query as Record<string, unknown>);

  if (error) {
    res.status(400).json({ error: "validation_error", message: error });
    return;
  }

  const gate = res.locals.gate!;

  try {
    const conditions: ReturnType<typeof eq>[] = [
      eq(gateReviewsTable.apiKeyPrefix, gate.apiKeyPrefix),
    ];
    if (verdict) {
      conditions.push(eq(gateReviewsTable.verdict, verdict));
    }

    const reviews = await db
      .select()
      .from(gateReviewsTable)
      .where(and(...conditions))
      .orderBy(desc(gateReviewsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.status(200).json({
      data: reviews.map(formatReview),
      pagination: { limit, offset, count: reviews.length },
    });
  } catch (err) {
    logger.error({ err }, "Failed to list gate reviews");
    res.status(500).json({ error: "internal_error", message: "Failed to retrieve reviews." });
  }
});

router.get("/:id", requireGateAuth, async (req, res): Promise<void> => {
  const { id } = req.params;
  const gate = res.locals.gate!;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!id || !uuidRegex.test(id)) {
    res.status(400).json({ error: "validation_error", message: "Invalid review ID format." });
    return;
  }

  try {
    const [review] = await db
      .select()
      .from(gateReviewsTable)
      .where(
        and(
          eq(gateReviewsTable.id, id),
          eq(gateReviewsTable.apiKeyPrefix, gate.apiKeyPrefix),
        ),
      )
      .limit(1);

    if (!review) {
      res.status(404).json({ error: "not_found", message: `Review ${id} not found.` });
      return;
    }

    res.status(200).json(formatReview(review));
  } catch (err) {
    logger.error({ err, id }, "Failed to get gate review");
    res.status(500).json({ error: "internal_error", message: "Failed to retrieve review." });
  }
});

export default router;
