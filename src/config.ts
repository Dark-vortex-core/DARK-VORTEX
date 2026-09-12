/* =========================================================
   🌑 DARK VORTEX — CONFIGURATION CORE

   Central runtime configuration.
   ⚡ Powered by Vortex Tech

   Responsibilities:
   - Bot identity
   - Owner identity
   - Command prefix
   - Response mode
   - Runtime limits
   - Memory protection
   - Security configuration
   - Storage locations
   - Optional Finalkey configuration

   IMPORTANT:
   - Secrets are never logged.
   - .env remains the source of sensitive values.
   - Existing environment variable names are preserved.
========================================================= */

import "dotenv/config";

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */

export type BotMode =
  | "public"
  | "silent"
  | "group"
  | "dm";

export interface RuntimeConfig {
  reconnectDelayMs: number;
  connectionTimeoutMs: number;
  keepAliveIntervalMs: number;
  commandTimeoutMs: number;
  maxConcurrentOperations: number;
}

export interface MemoryConfig {
  cleanupTriggerMb: number;
  warningMb: number;
  criticalMb: number;
}

export interface SecurityConfig {
  enabled: boolean;
  auditEnabled: boolean;
  monitoringEnabled: boolean;
  incidentLoggingEnabled: boolean;
  evidenceLoggingEnabled: boolean;
}

export interface StorageConfig {
  dataDir: string;
  reportsDir: string;
  incidentsDir: string;
  evidenceDir: string;
  snapshotsDir: string;
  logsDir: string;
  tempDir: string;
  vcfDir: string;
  vxDir: string;
}

/* ─────────────────────────────────────────────
   NORMALIZATION
───────────────────────────────────────────── */

function normalizeOwnerNumber(
  value: string,
): string {
  return String(value || "").trim();
}

function toOwnerJid(
  value: string,
): string {
  const owner = value.trim();

  if (!owner) {
    return "";
  }

  if (owner.includes("@")) {
    return owner;
  }

  const digits = owner.replace(/[^\d]/g, "");

  if (!digits) {
    return "";
  }

  return `${digits}@s.whatsapp.net`;
}

function normalizePrefix(
  value: string,
): string {
  const prefix = String(value || "").trim();

  if (!prefix) {
    return "/";
  }

  /*
   * Keep the existing maximum length.
   * This prevents accidentally creating very long
   * command prefixes from environment variables.
   */
  return prefix.slice(0, 3);
}

function normalizeMode(
  value: string,
): BotMode {
  const mode = String(value || "")
    .trim()
    .toLowerCase();

  switch (mode) {
    case "silent":
      return "silent";

    case "group":
      return "group";

    case "dm":
      return "dm";

    case "public":
    default:
      return "public";
  }
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  minimum = 1,
): number {
  const parsed = Number(value);

  if (
    !Number.isFinite(parsed) ||
    !Number.isInteger(parsed) ||
    parsed < minimum
  ) {
    return fallback;
  }

  return parsed;
}

function parseBoolean(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value
    .trim()
    .toLowerCase();

  if (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "on"
  ) {
    return true;
  }

  if (
    normalized === "false" ||
    normalized === "0" ||
    normalized === "no" ||
    normalized === "off"
  ) {
    return false;
  }

  return fallback;
}

function normalizePath(
  value: string | undefined,
  fallback: string,
): string {
  const path = String(value || "").trim();

  return path || fallback;
}

/* ─────────────────────────────────────────────
   OWNER
───────────────────────────────────────────── */

const ownerNumber = normalizeOwnerNumber(
  process.env.BOT_OWNER_NUMBER || "",
);

if (!ownerNumber) {
  throw new Error(
    "BOT_OWNER_NUMBER is missing from .env",
  );
}

const ownerJid = toOwnerJid(
  ownerNumber,
);

if (!ownerJid) {
  throw new Error(
    "BOT_OWNER_NUMBER is invalid. Use a WhatsApp number or JID.",
  );
}

/* ─────────────────────────────────────────────
   BOT IDENTITY
───────────────────────────────────────────── */

const botName =
  process.env.BOT_NAME?.trim() ||
  "🌑 DARK VORTEX";

const prefix = normalizePrefix(
  process.env.BOT_PREFIX || "/",
);

const mode = normalizeMode(
  process.env.BOT_MODE || "public",
);

const timezone =
  process.env.BOT_TIMEZONE?.trim() ||
  "Africa/Lagos";

/* ─────────────────────────────────────────────
   RUNTIME
───────────────────────────────────────────── */

const runtime: RuntimeConfig = {
  reconnectDelayMs: parsePositiveInteger(
    process.env.BOT_RECONNECT_DELAY_MS,
    5000,
  ),

  connectionTimeoutMs: parsePositiveInteger(
    process.env.BOT_CONNECTION_TIMEOUT_MS,
    120000,
  ),

  keepAliveIntervalMs: parsePositiveInteger(
    process.env.BOT_KEEPALIVE_INTERVAL_MS,
    10000,
  ),

  commandTimeoutMs: parsePositiveInteger(
    process.env.BOT_COMMAND_TIMEOUT_MS,
    120000,
  ),

  maxConcurrentOperations: parsePositiveInteger(
    process.env.BOT_MAX_CONCURRENT_OPERATIONS,
    4,
  ),
};

/* ─────────────────────────────────────────────
   MEMORY GUARD
───────────────────────────────────────────── */

const memory: MemoryConfig = {
  cleanupTriggerMb: parsePositiveInteger(
    process.env.BOT_MEMORY_CLEANUP_MB,
    500,
  ),

  warningMb: parsePositiveInteger(
    process.env.BOT_MEMORY_WARNING_MB,
    400,
  ),

  criticalMb: parsePositiveInteger(
    process.env.BOT_MEMORY_CRITICAL_MB,
    700,
  ),
};

/*
 * Ensure thresholds remain logically ordered.
 */
if (memory.warningMb >= memory.cleanupTriggerMb) {
  memory.warningMb =
    Math.max(
      1,
      memory.cleanupTriggerMb - 50,
    );
}

if (memory.criticalMb <= memory.cleanupTriggerMb) {
  memory.criticalMb =
    memory.cleanupTriggerMb + 200;
}

/* ─────────────────────────────────────────────
   SECURITY
───────────────────────────────────────────── */

const security: SecurityConfig = {
  enabled: parseBoolean(
    process.env.VX_SECURITY_ENABLED,
    true,
  ),

  auditEnabled: parseBoolean(
    process.env.VX_AUDIT_ENABLED,
    true,
  ),

  monitoringEnabled: parseBoolean(
    process.env.VX_MONITORING_ENABLED,
    true,
  ),

  incidentLoggingEnabled: parseBoolean(
    process.env.VX_INCIDENT_LOGGING_ENABLED,
    true,
  ),

  evidenceLoggingEnabled: parseBoolean(
    process.env.VX_EVIDENCE_LOGGING_ENABLED,
    true,
  ),
};

/* ─────────────────────────────────────────────
   STORAGE
───────────────────────────────────────────── */

const storage: StorageConfig = {
  dataDir: normalizePath(
    process.env.BOT_DATA_DIR,
    "src/data",
  ),

  reportsDir: normalizePath(
    process.env.BOT_REPORTS_DIR,
    "src/data/reports",
  ),

  incidentsDir: normalizePath(
    process.env.BOT_INCIDENTS_DIR,
    "src/data/incidents",
  ),

  evidenceDir: normalizePath(
    process.env.BOT_EVIDENCE_DIR,
    "src/data/evidence",
  ),

  snapshotsDir: normalizePath(
    process.env.BOT_SNAPSHOTS_DIR,
    "src/data/snapshots",
  ),

  logsDir: normalizePath(
    process.env.BOT_LOGS_DIR,
    "src/data/logs",
  ),

  tempDir: normalizePath(
    process.env.BOT_TEMP_DIR,
    "src/data/tmp",
  ),

  vcfDir: normalizePath(
    process.env.BOT_VCF_DIR,
    "src/data/vcf",
  ),

  vxDir: normalizePath(
    process.env.BOT_VX_DIR,
    "src/data/vx",
  ),
};

/* ─────────────────────────────────────────────
   OPTIONAL FINALKEY
───────────────────────────────────────────── */

/*
 * The actual secret remains in .env.
 *
 * We expose only whether it exists.
 * Other modules must never log or send the
 * actual value.
 */
const finalkeyConfigured =
  Boolean(
    process.env.VX_FINALKEY?.trim(),
  );

/* ─────────────────────────────────────────────
   CONFIG EXPORT
───────────────────────────────────────────── */

export const config = {
  // Identity
  ownerNumber,
  ownerJid,
  botName,
  prefix,

  // Response mode
  mode,

  // Timezone
  timezone,

  // Runtime
  runtime,

  // Memory
  memory,

  // Security
  security,

  // Storage
  storage,

  // Finalkey
  finalkey: {
    configured: finalkeyConfigured,
  },
} as const;

/* ─────────────────────────────────────────────
   SAFE CONFIG HELPERS
───────────────────────────────────────────── */

/**
 * Returns true when the supplied JID belongs
 * to the configured owner.
 */
export function isOwnerJid(
  jid: string | undefined,
): boolean {
  if (!jid) {
    return false;
  }

  const normalized = jid
    .trim()
    .toLowerCase();

  return normalized ===
    ownerJid.toLowerCase();
}

/**
 * Returns the current configured response mode.
 */
export function getBotMode(): BotMode {
  return mode;
}

/**
 * Returns whether VX security is enabled.
 */
export function isVxSecurityEnabled(): boolean {
  return security.enabled;
}

/**
 * Returns whether audit logging is enabled.
 */
export function isVxAuditEnabled(): boolean {
  return (
    security.enabled &&
    security.auditEnabled
  );
}

/**
 * Returns whether VX monitoring is enabled.
 */
export function isVxMonitoringEnabled(): boolean {
  return (
    security.enabled &&
    security.monitoringEnabled
  );
}

/**
 * Returns whether incident logging is enabled.
 */
export function isVxIncidentLoggingEnabled(): boolean {
  return (
    security.enabled &&
    security.incidentLoggingEnabled
  );
}

/**
 * Returns whether evidence logging is enabled.
 */
export function isVxEvidenceLoggingEnabled(): boolean {
  return (
    security.enabled &&
    security.evidenceLoggingEnabled
  );
}