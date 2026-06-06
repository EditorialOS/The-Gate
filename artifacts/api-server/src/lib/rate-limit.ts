import { db, gateReviewsTable } from "@workspace/db";
import { eq, gte, and, count } from "drizzle-orm";

export interface RateLimitResult {
  allowed: boolean;
  used: number;
  limit: number;
  resetAt: Date;
}

export async function checkRateLimit(
  apiKeyPrefix: string,
  limitPerHour: number,
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - 60 * 60 * 1000);
  const resetAt = new Date(windowStart.getTime() + 60 * 60 * 1000);

  const [row] = await db
    .select({ count: count() })
    .from(gateReviewsTable)
    .where(
      and(
        eq(gateReviewsTable.apiKeyPrefix, apiKeyPrefix),
        gte(gateReviewsTable.createdAt, windowStart),
      ),
    );

  const used = row?.count ?? 0;

  return {
    allowed: used < limitPerHour,
    used,
    limit: limitPerHour,
    resetAt,
  };
}
