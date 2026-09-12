/* =========================================================
   🌑 DARK VORTEX — VX AUDIT LOGGER
   ⚡ Powered by Vortex Tech

   Responsibilities:
   - Persist VX security events as JSONL
   - Read recent audit events
   - Calculate security statistics
   - Integrate active monitor telemetry
   - Safely tolerate malformed log entries
   - Serialize concurrent writes
   - Normalize legacy events
   - Sanitize sensitive audit data
   - Provide bounded audit-log maintenance

   Storage:
   src/data/vx/audit.jsonl
========================================================= */

import {
  appendFile,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";

import path from "node:path";

import type {
  VxEvent,
  VxEventType,
  VxRiskFactor,
  VxSecurityStats,
  VxSeverity,
} from "./vx-types.js";

import {
  getVxMonitorStats,
} from "./vx-monitor.js";

/* =========================================================
   STORAGE
========================================================= */

const DATA_DIR = path.resolve(
  process.cwd(),
  "src",
  "data",
  "vx",
);

const AUDIT_FILE = path.join(
  DATA_DIR,
  "audit.jsonl",
);

const AUDIT_TEMP_FILE =
  `${AUDIT_FILE}.tmp`;

/* =========================================================
   LIMITS
========================================================= */

const DEFAULT_READ_LIMIT = 100;
const MAX_READ_LIMIT = 10_000;

const MAX_EVENT_TEXT_LENGTH = 4_000;
const MAX_COMMAND_LENGTH = 500;
const MAX_REASON_LENGTH = 2_000;
const MAX_ID_LENGTH = 500;

const MAX_INDICATORS = 100;
const MAX_EVENT_IDS = 500;
const MAX_RISK_FACTORS = 100;

const MAX_METADATA_KEYS = 100;
const MAX_METADATA_DEPTH = 4;
const MAX_METADATA_STRING_LENGTH = 1_000;

/* =========================================================
   WRITE QUEUE
========================================================= */

let writeQueue: Promise<void> = Promise.resolve();

/* =========================================================
   STORAGE INITIALIZATION
========================================================= */

let storageReady: Promise<void> | undefined;

async function ensureStorage(): Promise<void> {
  if (storageReady) {
    await storageReady;
    return;
  }

  storageReady = mkdir(
    DATA_DIR,
    {
      recursive: true,
    },
  ).then(() => undefined);

  try {
    await storageReady;
  } finally {
    storageReady = undefined;
  }
}

/* =========================================================
   ERROR HELPERS
========================================================= */

function getErrorCode(
  error: unknown,
): string | undefined {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error)
  ) {
    return undefined;
  }

  const code =
    (error as { code?: unknown }).code;

  return typeof code === "string"
    ? code
    : undefined;
}

/* =========================================================
   VALUE HELPERS
========================================================= */

function safeNumber(
  value: unknown,
  fallback = 0,
): number {
  const number =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function clamp(
  value: unknown,
  minimum: number,
  maximum: number,
): number {
  const number = safeNumber(
    value,
    minimum,
  );

  return Math.max(
    minimum,
    Math.min(
      maximum,
      number,
    ),
  );
}

function safeString(
  value: unknown,
  fallback = "",
  maxLength = MAX_REASON_LENGTH,
): string {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  let text = String(value)
    .replace(/\r/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return fallback;
  }

  if (text.length > maxLength) {
    text =
      `${text.slice(
        0,
        Math.max(
          1,
          maxLength - 1,
        ),
      )}…`;
  }

  return text;
}

function safeLimit(
  limit: number,
): number {
  const value = Number(limit);

  if (!Number.isFinite(value)) {
    return DEFAULT_READ_LIMIT;
  }

  return Math.max(
    1,
    Math.min(
      MAX_READ_LIMIT,
      Math.floor(value),
    ),
  );
}

/* =========================================================
   SECRET PROTECTION
========================================================= */

function isSensitiveKey(
  key: string,
): boolean {
  return (
    /finalkey/i.test(key) ||
    /password/i.test(key) ||
    /passwd/i.test(key) ||
    /secret/i.test(key) ||
    /api[_-]?key/i.test(key) ||
    /access[_-]?token/i.test(key) ||
    /auth[_-]?token/i.test(key) ||
    /private[_-]?key/i.test(key) ||
    /client[_-]?secret/i.test(key) ||
    /authorization/i.test(key) ||
    /cookie/i.test(key) ||
    /session[_-]?token/i.test(key) ||
    /refresh[_-]?token/i.test(key) ||
    /bearer/i.test(key)
  );
}

function containsSensitiveMaterial(
  value: string,
): boolean {
  return (
    /finalkey/i.test(value) ||
    /password\s*[:=]/i.test(value) ||
    /passwd\s*[:=]/i.test(value) ||
    /secret\s*[:=]/i.test(value) ||
    /api[_-]?key\s*[:=]/i.test(value) ||
    /access[_-]?token\s*[:=]/i.test(value) ||
    /auth[_-]?token\s*[:=]/i.test(value) ||
    /private[_-]?key/i.test(value) ||
    /client[_-]?secret\s*[:=]/i.test(value) ||
    /authorization\s*[:=]/i.test(value) ||
    /cookie\s*[:=]/i.test(value) ||
    /bearer\s+[a-z0-9._~+/=-]+/i.test(value)
  );
}

/* =========================================================
   UNIQUE STRINGS
========================================================= */

function uniqueStrings(
  values: unknown,
  limit: number,
): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const normalized =
      safeString(
        value,
        "",
        MAX_REASON_LENGTH,
      );

    if (
      !normalized ||
      normalized === "[REDACTED]"
    ) {
      continue;
    }

    const key =
      normalized.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);

    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

/* =========================================================
   SAFE METADATA
========================================================= */

function sanitizeMetadataValue(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > MAX_METADATA_DEPTH) {
    return "[TRUNCATED]";
  }

  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (typeof value === "string") {
    if (containsSensitiveMaterial(value)) {
      return "[REDACTED]";
    }

    return safeString(
      value,
      "",
      MAX_METADATA_STRING_LENGTH,
    );
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : 0;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return "[REDACTED]";
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_METADATA_KEYS)
      .map(item =>
        sanitizeMetadataValue(
          item,
          depth + 1,
        ),
      );
  }

  if (typeof value === "object") {
    const output:
      Record<string, unknown> = {};

    let entries: Array<
      [string, unknown]
    > = [];

    try {
      entries = Object.entries(
        value as Record<string, unknown>,
      );
    } catch {
      return "[UNREADABLE]";
    }

    for (
      const [key, child]
      of entries.slice(
        0,
        MAX_METADATA_KEYS,
      )
    ) {
      const safeKey =
        safeString(
          key,
          "",
          200,
        );

      if (!safeKey) {
        continue;
      }

      if (isSensitiveKey(safeKey)) {
        output[safeKey] =
          "[REDACTED]";
        continue;
      }

      output[safeKey] =
        sanitizeMetadataValue(
          child,
          depth + 1,
        );
    }

    return output;
  }

  return safeString(
    value,
    "[UNSUPPORTED]",
    MAX_METADATA_STRING_LENGTH,
  );
}

function sanitizeMetadata(
  metadata:
    | Record<string, unknown>
    | undefined,
):
  | Record<string, unknown>
  | undefined {
  if (
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    return undefined;
  }

  const result =
    sanitizeMetadataValue(
      metadata,
    );

  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result)
  ) {
    return undefined;
  }

  return result as Record<
    string,
    unknown
  >;
}

/* =========================================================
   EVENT TYPE
========================================================= */

const VALID_EVENT_TYPES =
  new Set<VxEventType>([
    "MESSAGE",
    "COMMAND",
    "PARTICIPANT_JOIN",
    "PARTICIPANT_LEAVE",
    "PARTICIPANT_PROMOTE",
    "PARTICIPANT_DEMOTE",
    "LINK",
    "SPAM",
    "FLOOD",
    "BOT",
    "RAID",
    "MENTION",
    "THREAT",
    "SECURITY",
    "SCAN",
    "MONITOR",
    "INCIDENT",
    "SYSTEM",
  ]);

function normalizeEventType(
  value: unknown,
): VxEventType {
  const raw =
    safeString(
      value,
      "",
      100,
    ).toUpperCase();

  return VALID_EVENT_TYPES.has(
    raw as VxEventType,
  )
    ? raw as VxEventType
    : "SYSTEM";
}

/* =========================================================
   SEVERITY
========================================================= */

function normalizeSeverity(
  value: unknown,
  risk = 0,
): VxSeverity {
  const raw =
    safeString(
      value,
      "",
      50,
    ).toUpperCase();

  if (
    raw === "LOW" ||
    raw === "MEDIUM" ||
    raw === "HIGH" ||
    raw === "CRITICAL"
  ) {
    return raw;
  }

  if (risk >= 80) {
    return "CRITICAL";
  }

  if (risk >= 60) {
    return "HIGH";
  }

  if (risk >= 30) {
    return "MEDIUM";
  }

  return "LOW";
}

/* =========================================================
   RISK FACTORS
========================================================= */

function normalizeRiskFactors(
  factors: unknown,
): VxRiskFactor[] {
  if (!Array.isArray(factors)) {
    return [];
  }

  const result: VxRiskFactor[] = [];
  const seen = new Set<string>();

  for (
    const factor of factors.slice(
      0,
      MAX_RISK_FACTORS,
    )
  ) {
    if (
      !factor ||
      typeof factor !== "object"
    ) {
      continue;
    }

    const item =
      factor as Record<
        string,
        unknown
      >;

    const name =
      safeString(
        item.name,
        "Unknown factor",
        200,
      );

    const reason =
      safeString(
        item.reason,
        "",
        MAX_REASON_LENGTH,
      );

    const key =
      `${name.toLowerCase()}::${reason.toLowerCase()}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    result.push({
      name:
        name ||
        "Unknown factor",

      score:
        Math.round(
          clamp(
            item.score,
            0,
            100,
          ),
        ),

      reason,
    });
  }

  return result;
}

/* =========================================================
   EVENT NORMALIZATION
========================================================= */

function normalizeVxEvent(
  event: VxEvent,
): VxEvent {
  const riskScore =
    Math.round(
      clamp(
        event.risk?.score,
        0,
        100,
      ),
    );

  const eventId =
    safeString(
      event.id,
      "",
      MAX_ID_LENGTH,
    );

  const normalized:
    VxEvent = {
    ...event,

    id:
      eventId ||
      `event-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,

    timestamp:
      Math.max(
        0,
        safeNumber(
          event.timestamp,
          Date.now(),
        ),
      ),

    type:
      normalizeEventType(
        event.type,
      ),
  };

  /* =======================================================
     ACTOR
  ======================================================= */

  if (
    event.actor &&
    typeof event.actor ===
      "object"
  ) {
    normalized.actor = {
      ...event.actor,

      jid:
        event.actor.jid
          ? safeString(
              event.actor.jid,
              "",
              MAX_ID_LENGTH,
            )
          : undefined,

      phoneNumber:
        event.actor.phoneNumber
          ? safeString(
              event.actor.phoneNumber,
              "",
              100,
            )
          : undefined,

      name:
        event.actor.name
          ? safeString(
              event.actor.name,
              "",
              200,
            )
          : undefined,
    };
  }

  /* =======================================================
     GROUP
  ======================================================= */

  if (
    event.group &&
    typeof event.group ===
      "object"
  ) {
    normalized.group = {
      ...event.group,

      jid:
        safeString(
          event.group.jid,
          "",
          MAX_ID_LENGTH,
        ),

      name:
        event.group.name
          ? safeString(
              event.group.name,
              "",
              200,
            )
          : undefined,

      participantCount:
        event.group.participantCount !==
          undefined
          ? Math.round(
              clamp(
                event.group
                  .participantCount,
                0,
                1_000_000,
              ),
            )
          : undefined,
    };
  }

  /* =======================================================
     TEXT
  ======================================================= */

  if (event.text !== undefined) {
    const text =
      safeString(
        event.text,
        "",
        MAX_EVENT_TEXT_LENGTH,
      );

    normalized.text =
      containsSensitiveMaterial(text)
        ? "[REDACTED]"
        : text;
  }

  /* =======================================================
     COMMAND
  ======================================================= */

  if (
    event.command !==
    undefined
  ) {
    const command =
      safeString(
        event.command,
        "",
        MAX_COMMAND_LENGTH,
      );

    normalized.command =
      containsSensitiveMaterial(
        command,
      )
        ? "[REDACTED]"
        : command;
  }

  /* =======================================================
     REASON
  ======================================================= */

  if (
    event.reason !==
    undefined
  ) {
    const reason =
      safeString(
        event.reason,
        "",
        MAX_REASON_LENGTH,
      );

    normalized.reason =
      containsSensitiveMaterial(
        reason,
      )
        ? "[REDACTED]"
        : reason;
  }

  /* =======================================================
     INDICATORS
  ======================================================= */

  normalized.indicators =
    uniqueStrings(
      event.indicators,
      MAX_INDICATORS,
    );

  /* =======================================================
     IDS
  ======================================================= */

  if (
    event.incidentId !==
    undefined
  ) {
    normalized.incidentId =
      safeString(
        event.incidentId,
        "",
        MAX_ID_LENGTH,
      );
  }

  if (
    event.scanId !==
    undefined
  ) {
    normalized.scanId =
      safeString(
        event.scanId,
        "",
        MAX_ID_LENGTH,
      );
  }

  if (
    event.monitorId !==
    undefined
  ) {
    normalized.monitorId =
      safeString(
        event.monitorId,
        "",
        MAX_ID_LENGTH,
      );
  }

  /* =======================================================
     RISK
  ======================================================= */

  if (event.risk) {
    normalized.risk = {
      score: riskScore,

      severity:
        normalizeSeverity(
          event.risk.severity,
          riskScore,
        ),

      confidence:
        Math.round(
          clamp(
            event.risk.confidence,
            0,
            100,
          ),
        ),

      factors:
        normalizeRiskFactors(
          event.risk.factors,
        ),
    };
  }

  /* =======================================================
     ACTION
  ======================================================= */

  if (
    event.action !==
    undefined
  ) {
    normalized.action =
      event.action;
  }

  if (
    event.actionResult !==
    undefined
  ) {
    const actionResult =
      safeString(
        event.actionResult,
        "",
        1_000,
      );

    normalized.actionResult =
      containsSensitiveMaterial(
        actionResult,
      )
        ? "[REDACTED]"
        : actionResult;
  }

  /* =======================================================
     METADATA
  ======================================================= */

  let metadata =
    sanitizeMetadata(
      normalized.metadata,
    );

  if (
    Array.isArray(
      metadata?.eventIds,
    )
  ) {
    metadata = {
      ...metadata,
      eventIds:
        uniqueStrings(
          metadata.eventIds,
          MAX_EVENT_IDS,
        ),
    };
  }

  if (
    metadata &&
    Object.keys(metadata).length > 0
  ) {
    normalized.metadata =
      metadata;
  } else {
    delete normalized.metadata;
  }

  return normalized;
}

/* =========================================================
   EVENT VALIDATION
========================================================= */

function isValidVxEvent(
  value: unknown,
): value is VxEvent {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const event =
    value as Record<
      string,
      unknown
    >;

  if (
    typeof event.id !== "string" ||
    event.id.trim().length === 0
  ) {
    return false;
  }

  if (
    typeof event.type !== "string" ||
    event.type.trim().length === 0
  ) {
    return false;
  }

  if (
    typeof event.timestamp ===
      "number"
  ) {
    return Number.isFinite(
      event.timestamp,
    );
  }

  if (
    typeof event.timestamp ===
      "string"
  ) {
    return Number.isFinite(
      Number(
        event.timestamp,
      ),
    );
  }

  return false;
}

/* =========================================================
   LOG EVENT
========================================================= */

export async function logVxEvent(
  event: VxEvent,
): Promise<void> {
  await ensureStorage();

  const normalized =
    normalizeVxEvent(
      event,
    );

  let line: string;

  try {
    line =
      `${JSON.stringify(
        normalized,
      )}\n`;
  } catch (error) {
    console.error(
      "[VX] Failed to serialize audit event:",
      error,
    );

    throw error;
  }

  const currentWrite =
    writeQueue.then(
      async () => {
        await appendFile(
          AUDIT_FILE,
          line,
          "utf8",
        );
      },
    );

  writeQueue =
    currentWrite.catch(
      () => undefined,
    );

  try {
    await currentWrite;
  } catch (error) {
    console.error(
      "[VX] Failed to write audit event:",
      error,
    );

    throw error;
  }
}

/* =========================================================
   READ ALL EVENTS
========================================================= */

async function readAllVxEvents(): Promise<VxEvent[]> {
  await ensureStorage();

  let raw: string;

  try {
    raw =
      await readFile(
        AUDIT_FILE,
        "utf8",
      );
  } catch (error: unknown) {
    if (
      getErrorCode(error) ===
      "ENOENT"
    ) {
      return [];
    }

    throw error;
  }

  if (!raw.trim()) {
    return [];
  }

  const events: VxEvent[] = [];

  for (
    const line of
      raw.split(/\r?\n/)
  ) {
    const trimmed =
      line.trim();

    if (!trimmed) {
      continue;
    }

    try {
      const parsed:
        unknown =
        JSON.parse(
          trimmed,
        );

      if (
        isValidVxEvent(
          parsed,
        )
      ) {
        events.push(
          normalizeVxEvent(
            parsed,
          ),
        );
      }
    } catch {
      /*
       * One malformed record must
       * never destroy the history.
       */
      continue;
    }
  }

  return events;
}

/* =========================================================
   EVENT CLASSIFICATION
========================================================= */

const THREAT_EVENT_TYPES =
  new Set<VxEventType>([
    "THREAT",
    "BOT",
    "RAID",
    "SPAM",
    "FLOOD",
  ]);

const THREAT_INDICATOR_PATTERN =
  /threat|bot|raid|spam|flood|suspicious|malicious/i;

function isHighRiskSeverity(
  severity: unknown,
): boolean {
  return (
    severity === "HIGH" ||
    severity === "CRITICAL"
  );
}

function isThreatEvent(
  event: VxEvent,
): boolean {
  if (
    THREAT_EVENT_TYPES.has(
      event.type,
    )
  ) {
    return true;
  }

  if (
    isHighRiskSeverity(
      event.risk?.severity,
    )
  ) {
    return true;
  }

  if (
    Array.isArray(
      event.indicators,
    ) &&
    event.indicators.some(
      indicator =>
        THREAT_INDICATOR_PATTERN.test(
          String(
            indicator,
          ),
        ),
    )
  ) {
    return true;
  }

  return false;
}

/* =========================================================
   READ RECENT EVENTS
========================================================= */

export async function readVxEvents(
  limit = DEFAULT_READ_LIMIT,
): Promise<VxEvent[]> {
  const safe =
    safeLimit(
      limit,
    );

  const events =
    await readAllVxEvents();

  return events
    .slice(-safe)
    .reverse();
}

/* =========================================================
   EVENT COUNT
========================================================= */

export async function getVxEventCount(): Promise<number> {
  const events =
    await readAllVxEvents();

  return events.length;
}

/* =========================================================
   SECURITY STATISTICS
========================================================= */

export async function getVxStats(): Promise<VxSecurityStats> {
  const events =
    await readAllVxEvents();

  const stats:
    VxSecurityStats = {
    totalEvents:
      events.length,

    totalThreats:
      0,

    totalIncidents:
      0,

    critical:
      0,

    high:
      0,

    medium:
      0,

    low:
      0,

    activeMonitors:
      0,

    lastEventAt:
      undefined,

    lastThreatAt:
      undefined,
  };

  const incidentIds =
    new Set<string>();

  for (
    const event of events
  ) {
    const timestamp =
      safeNumber(
        event.timestamp,
      );

    /* =====================================================
       LAST EVENT
    ===================================================== */

    if (
      stats.lastEventAt ===
        undefined ||
      timestamp >
        stats.lastEventAt
    ) {
      stats.lastEventAt =
        timestamp;
    }

    /* =====================================================
       SEVERITY
    ===================================================== */

    switch (
      event.risk?.severity
    ) {
      case "CRITICAL":
        stats.critical++;
        break;

      case "HIGH":
        stats.high++;
        break;

      case "MEDIUM":
        stats.medium++;
        break;

      case "LOW":
        stats.low++;
        break;
    }

    /* =====================================================
       INCIDENTS
    ===================================================== */

    if (event.incidentId) {
      incidentIds.add(
        event.incidentId,
      );
    } else if (
      event.type === "INCIDENT"
    ) {
      incidentIds.add(
        `event:${event.id}`,
      );
    }

    /* =====================================================
       THREATS
    ===================================================== */

    if (
      isThreatEvent(
        event,
      )
    ) {
      stats.totalThreats++;

      if (
        stats.lastThreatAt ===
          undefined ||
        timestamp >
          stats.lastThreatAt
      ) {
        stats.lastThreatAt =
          timestamp;
      }
    }
  }

  stats.totalIncidents =
    incidentIds.size;

  /* =======================================================
     ACTIVE MONITORS
  ======================================================= */

  try {
    const monitorStats =
      getVxMonitorStats();

    const activeSessions =
      monitorStats &&
      typeof monitorStats.activeSessions ===
        "number"
        ? monitorStats.activeSessions
        : 0;

    stats.activeMonitors =
      Number.isFinite(
        activeSessions,
      )
        ? Math.max(
            0,
            Math.floor(
              activeSessions,
            ),
          )
        : 0;
  } catch (error) {
    console.error(
      "[VX] Failed to read monitor statistics:",
      error,
    );

    stats.activeMonitors = 0;
  }

  return stats;
}

/* =========================================================
   RECENT THREATS
========================================================= */

export async function getRecentVxThreats(
  limit = DEFAULT_READ_LIMIT,
): Promise<VxEvent[]> {
  const safe =
    safeLimit(
      limit,
    );

  const events =
    await readAllVxEvents();

  return events
    .filter(
      isThreatEvent,
    )
    .sort(
      (a, b) =>
        safeNumber(
          b.timestamp,
        ) -
        safeNumber(
          a.timestamp,
        ),
    )
    .slice(
      0,
      safe,
    );
}

/* =========================================================
   ACTOR EVENTS
========================================================= */

export async function getVxActorEvents(
  actorJid: string,
  limit = DEFAULT_READ_LIMIT,
): Promise<VxEvent[]> {
  const safe =
    safeLimit(
      limit,
    );

  const normalized =
    safeString(
      actorJid,
      "",
      MAX_ID_LENGTH,
    ).toLowerCase();

  if (!normalized) {
    return [];
  }

  const events =
    await readAllVxEvents();

  return events
    .filter(
      event =>
        event.actor?.jid
          ?.trim()
          .toLowerCase() ===
        normalized,
    )
    .sort(
      (a, b) =>
        safeNumber(
          b.timestamp,
        ) -
        safeNumber(
          a.timestamp,
        ),
    )
    .slice(
      0,
      safe,
    );
}

/* =========================================================
   GROUP EVENTS
========================================================= */

export async function getVxGroupEvents(
  groupJid: string,
  limit = DEFAULT_READ_LIMIT,
): Promise<VxEvent[]> {
  const safe =
    safeLimit(
      limit,
    );

  const normalized =
    safeString(
      groupJid,
      "",
      MAX_ID_LENGTH,
    ).toLowerCase();

  if (!normalized) {
    return [];
  }

  const events =
    await readAllVxEvents();

  return events
    .filter(
      event =>
        event.group?.jid
          ?.trim()
          .toLowerCase() ===
        normalized,
    )
    .sort(
      (a, b) =>
        safeNumber(
          b.timestamp,
        ) -
        safeNumber(
          a.timestamp,
        ),
    )
    .slice(
      0,
      safe,
    );
}

/* =========================================================
   AUDIT COMPACTION
========================================================= */

export async function compactVxAuditLog(
  maxEvents = MAX_READ_LIMIT,
): Promise<number> {
  await ensureStorage();

  const requested =
    Number(
      maxEvents,
    );

  const safe =
    Number.isFinite(
      requested,
    )
      ? Math.max(
          1,
          Math.min(
            MAX_READ_LIMIT,
            Math.floor(
              requested,
            ),
          ),
        )
      : MAX_READ_LIMIT;

  /*
   * Important:
   * Read the current file before entering
   * the write queue. Pending writes are then
   * serialized behind the snapshot operation.
   */
  const events =
    await readAllVxEvents();

  const retained =
    events.slice(-safe);

  const snapshot =
    retained.length > 0
      ? retained
          .map(
            event =>
              JSON.stringify(
                normalizeVxEvent(
                  event,
                ),
              ),
          )
          .join("\n") +
        "\n"
      : "";

  const currentWrite =
    writeQueue.then(
      async () => {
        await mkdir(
          DATA_DIR,
          {
            recursive: true,
          },
        );

        try {
          await unlink(
            AUDIT_TEMP_FILE,
          );
        } catch (error: unknown) {
          if (
            getErrorCode(error) !==
            "ENOENT"
          ) {
            throw error;
          }
        }

        await writeFile(
          AUDIT_TEMP_FILE,
          snapshot,
          "utf8",
        );

        await rename(
          AUDIT_TEMP_FILE,
          AUDIT_FILE,
        );
      },
    );

  writeQueue =
    currentWrite.catch(
      () => undefined,
    );

  try {
    await currentWrite;
  } catch (error) {
    /*
     * Best-effort cleanup of a failed
     * temporary compaction file.
     */
    try {
      await unlink(
        AUDIT_TEMP_FILE,
      );
    } catch {
      // Ignore cleanup failure.
    }

    throw error;
  }

  return retained.length;
}

/* =========================================================
   LOGGER HEALTH
========================================================= */

export async function getVxLoggerHealth(): Promise<{
  available: boolean;
  eventCount: number;
  auditFile: string;
}> {
  try {
    await ensureStorage();

    const eventCount =
      await getVxEventCount();

    return {
      available: true,
      eventCount,
      auditFile: AUDIT_FILE,
    };
  } catch (error) {
    console.error(
      "[VX] Logger health check failed:",
      error,
    );

    return {
      available: false,
      eventCount: 0,
      auditFile: AUDIT_FILE,
    };
  }
}