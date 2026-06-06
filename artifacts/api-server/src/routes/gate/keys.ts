import { Router, type IRouter } from "express";
import { requireAdminSecret } from "../../middlewares/gate-auth.js";
import { generateApiKey } from "../../lib/crypto.js";
import { logger } from "../../lib/logger.js";
import { db, gateApiKeysTable, CreateGateKeyBodySchema } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";

const router: IRouter = Router();

router.post("/", requireAdminSecret, async (req, res): Promise<void> => {
  const parseResult = CreateGateKeyBodySchema.safeParse(req.body);
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

  const { name, rate_limit_per_hour } = parseResult.data;
  const { fullKey, prefix, keyHash } = generateApiKey();

  try {
    const [inserted] = await db
      .insert(gateApiKeysTable)
      .values({ prefix, keyHash, name, rateLimitPerHour: rate_limit_per_hour })
      .returning({
        id: gateApiKeysTable.id,
        prefix: gateApiKeysTable.prefix,
        name: gateApiKeysTable.name,
        rateLimitPerHour: gateApiKeysTable.rateLimitPerHour,
        createdAt: gateApiKeysTable.createdAt,
      });

    res.status(201).json({
      id: inserted!.id,
      key: fullKey,
      prefix: inserted!.prefix,
      name: inserted!.name,
      rate_limit_per_hour: inserted!.rateLimitPerHour,
      created_at: inserted!.createdAt,
      note: "Store this key securely. It will not be shown again.",
    });
  } catch (err) {
    logger.error({ err }, "Failed to create gate API key");
    res.status(500).json({
      error: "internal_error",
      message: "Failed to create API key. Please try again.",
    });
  }
});

router.get("/", requireAdminSecret, async (_req, res): Promise<void> => {
  try {
    const keys = await db
      .select({
        id: gateApiKeysTable.id,
        prefix: gateApiKeysTable.prefix,
        name: gateApiKeysTable.name,
        rateLimitPerHour: gateApiKeysTable.rateLimitPerHour,
        createdAt: gateApiKeysTable.createdAt,
        revokedAt: gateApiKeysTable.revokedAt,
      })
      .from(gateApiKeysTable)
      .orderBy(gateApiKeysTable.createdAt);

    res.status(200).json(
      keys.map((k) => ({
        id: k.id,
        prefix: k.prefix,
        name: k.name,
        rate_limit_per_hour: k.rateLimitPerHour,
        created_at: k.createdAt,
        revoked_at: k.revokedAt ?? null,
        status: k.revokedAt ? "revoked" : "active",
      })),
    );
  } catch (err) {
    logger.error({ err }, "Failed to list gate API keys");
    res.status(500).json({
      error: "internal_error",
      message: "Failed to retrieve API keys.",
    });
  }
});

router.delete("/:prefix", requireAdminSecret, async (req, res): Promise<void> => {
  const { prefix } = req.params;

  if (!prefix || typeof prefix !== "string") {
    res.status(400).json({
      error: "validation_error",
      message: "Key prefix is required.",
    });
    return;
  }

  try {
    const [existing] = await db
      .select({ id: gateApiKeysTable.id, revokedAt: gateApiKeysTable.revokedAt })
      .from(gateApiKeysTable)
      .where(eq(gateApiKeysTable.prefix, prefix))
      .limit(1);

    if (!existing) {
      res.status(404).json({
        error: "not_found",
        message: `No API key found with prefix "${prefix}".`,
      });
      return;
    }

    if (existing.revokedAt !== null) {
      res.status(409).json({
        error: "already_revoked",
        message: `API key with prefix "${prefix}" is already revoked.`,
      });
      return;
    }

    await db
      .update(gateApiKeysTable)
      .set({ revokedAt: new Date() })
      .where(eq(gateApiKeysTable.prefix, prefix));

    res.status(200).json({
      prefix,
      status: "revoked",
      revoked_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err, prefix }, "Failed to revoke gate API key");
    res.status(500).json({
      error: "internal_error",
      message: "Failed to revoke API key. Please try again.",
    });
  }
});

export default router;
