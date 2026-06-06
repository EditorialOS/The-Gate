import { createHash, randomBytes } from "crypto";

const KEY_PREFIX_LENGTH = 8;
const KEY_SECRET_LENGTH = 32;
const KEY_SCHEME = "gate_sk";

export interface GeneratedKey {
  fullKey: string;
  prefix: string;
  keyHash: string;
}

export function generateApiKey(): GeneratedKey {
  const prefix = randomBytes(KEY_PREFIX_LENGTH / 2).toString("hex");
  const secret = randomBytes(KEY_SECRET_LENGTH / 2).toString("hex");
  const fullKey = `${KEY_SCHEME}_${prefix}_${secret}`;
  const keyHash = hashKey(fullKey);
  return { fullKey, prefix, keyHash };
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function hashDraft(draft: string): string {
  return createHash("sha256").update(draft).digest("hex").slice(0, 16);
}

export function extractPrefixFromKey(key: string): string | null {
  const parts = key.split("_");
  if (parts.length !== 4 || parts[0] !== "gate" || parts[1] !== "sk") {
    return null;
  }
  return parts[2];
}
