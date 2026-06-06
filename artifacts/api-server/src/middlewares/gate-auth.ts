import type { Request, Response, NextFunction } from "express";
import { db, gateApiKeysTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";
import { hashKey, extractPrefixFromKey } from "../lib/crypto.js";
import { logger } from "../lib/logger.js";

export interface GateAuthLocals {
  apiKeyPrefix: string;
  rateLimitPerHour: number;
}

declare global {
  namespace Express {
    interface Locals {
      gate?: GateAuthLocals;
    }
  }
}

export async function requireGateAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: "unauthorized",
      message: "Authorization header with Bearer token is required.",
    });
    return;
  }

  const token = authHeader.slice(7).trim();
  const prefix = extractPrefixFromKey(token);

  if (!prefix) {
    res.status(401).json({
      error: "unauthorized",
      message: "Invalid API key format. Expected: gate_sk_<prefix>_<secret>",
    });
    return;
  }

  try {
    const [key] = await db
      .select()
      .from(gateApiKeysTable)
      .where(eq(gateApiKeysTable.prefix, prefix))
      .limit(1);

    if (!key) {
      res.status(401).json({
        error: "unauthorized",
        message: "API key not found.",
      });
      return;
    }

    if (key.revokedAt !== null) {
      res.status(401).json({
        error: "unauthorized",
        message: "This API key has been revoked.",
      });
      return;
    }

    const providedHash = hashKey(token);
    if (providedHash !== key.keyHash) {
      res.status(401).json({
        error: "unauthorized",
        message: "Invalid API key.",
      });
      return;
    }

    res.locals.gate = {
      apiKeyPrefix: key.prefix,
      rateLimitPerHour: key.rateLimitPerHour,
    };

    next();
  } catch (err) {
    logger.error({ err }, "Gate auth middleware error");
    res.status(500).json({
      error: "internal_error",
      message: "Authentication check failed. Please try again.",
    });
  }
}

export function requireAdminSecret(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const adminSecret = process.env["GATE_ADMIN_SECRET"];

  if (!adminSecret) {
    logger.error("GATE_ADMIN_SECRET is not configured");
    res.status(503).json({
      error: "service_unavailable",
      message: "Admin functionality is not configured.",
    });
    return;
  }

  const providedSecret = req.headers["x-admin-secret"] as string | undefined;

  if (!providedSecret || providedSecret !== adminSecret) {
    res.status(403).json({
      error: "forbidden",
      message: "Invalid or missing admin secret. Provide X-Admin-Secret header.",
    });
    return;
  }

  next();
}
