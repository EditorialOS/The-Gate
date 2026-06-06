import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  numeric,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const gateApiKeysTable = pgTable("gate_api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  prefix: varchar("prefix", { length: 20 }).notNull().unique(),
  keyHash: text("key_hash").notNull(),
  name: text("name").notNull(),
  rateLimitPerHour: integer("rate_limit_per_hour").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const gateReviewsTable = pgTable("gate_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  apiKeyPrefix: varchar("api_key_prefix", { length: 20 }).notNull(),
  draftHash: text("draft_hash").notNull(),
  verdict: varchar("verdict", { length: 30 }).notNull(),
  confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
  scorecard: jsonb("scorecard").$type<Record<string, CriterionResult>>().notNull(),
  strengths: jsonb("strengths").$type<string[]>().notNull(),
  gaps: jsonb("gaps").$type<string[]>().notNull(),
  revisionInstructions: text("revision_instructions"),
  missingContext: text("missing_context"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export interface CriterionResult {
  pass: boolean;
  score: number;
  assessment: string;
  evidence: string;
}

export const insertGateApiKeySchema = createInsertSchema(gateApiKeysTable).omit({
  id: true,
  createdAt: true,
  revokedAt: true,
});

export const selectGateApiKeySchema = createSelectSchema(gateApiKeysTable);

export const insertGateReviewSchema = createInsertSchema(gateReviewsTable).omit({
  id: true,
  createdAt: true,
});

export const selectGateReviewSchema = createSelectSchema(gateReviewsTable);

export type GateApiKey = typeof gateApiKeysTable.$inferSelect;
export type InsertGateApiKey = typeof gateApiKeysTable.$inferInsert;
export type GateReview = typeof gateReviewsTable.$inferSelect;
export type InsertGateReview = typeof gateReviewsTable.$inferInsert;

export const GateModeSchema = z.enum(["content", "strategy", "technical", "communication"]);
export type GateMode = z.infer<typeof GateModeSchema>;

export const GateRunBodySchema = z.object({
  draft: z.string().min(1, "Draft is required").max(50000, "Draft exceeds 50,000 character limit"),
  brief: z.string().min(1, "Brief is required").max(5000, "Brief exceeds 5,000 character limit"),
  voice_guide: z.string().max(10000, "Voice guide exceeds 10,000 character limit").optional(),
  mode: GateModeSchema.optional().default("content"),
});

export const CreateGateKeyBodySchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name exceeds 100 characters"),
  rate_limit_per_hour: z
    .number()
    .int()
    .min(1, "Rate limit must be at least 1")
    .max(1000, "Rate limit cannot exceed 1000")
    .optional()
    .default(100),
});

export type GateRunBody = z.infer<typeof GateRunBodySchema>;
export type CreateGateKeyBody = z.infer<typeof CreateGateKeyBodySchema>;
