/* =========================================================
   🌑 DARK VORTEX — VX INCIDENT MANAGER
   ⚡ Powered by Vortex Tech

   Responsibilities:
   - Persist security incidents
   - Generate stable incident IDs
   - Correlate duplicate detections
   - Track incident lifecycle safely
   - Protect incident identity fields
   - Keep detection separate from enforcement
   - Maintain bounded persistent storage
   - Survive malformed/legacy incident records
   - Serialize all disk writes

   Storage:
   src/data/vx/incidents.json

   Architecture:

        VX Engine
            ↓
      VX Incident Manager
            ↓
       incidents.json

========================================================= */

import {
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
  VxIncident,
} from "./vx-types.js";

/* =========================================================
   STORAGE
========================================================= */

const DATA_DIR = path.resolve(
  process.cwd(),
  "src",
  "data",
  "vx",
);

const INCIDENT_FILE = path.join(
  DATA_DIR,
  "incidents.json",
);

const TEMP_FILE =
  `${INCIDENT_FILE}.tmp`;


/* =========================================================
   CONFIGURATION
========================================================= */

const DUPLICATE_WINDOW_MS =
  5 * 60 * 1000;

const MAX_INCIDENTS =
  10_000;

const MAX_LIST_LIMIT =
  1_000;

const MAX_EVENT_IDS =
  500;

const MAX_INDICATORS =
  100;

const MAX_ACTIONS =
  100;

const MAX_METADATA_KEYS =
  100;

const MAX_STRING_LENGTH =
  2_000;


/* =========================================================
   TYPES
========================================================= */

type IncidentStatus =
  VxIncident["status"];


/* =========================================================
   MEMORY
========================================================= */

let incidents: VxIncident[] = [];

let loaded = false;

let initialization:
  Promise<void> | undefined;


/* =========================================================
   PERSISTENCE QUEUE
========================================================= */

let persistenceQueue:
  Promise<void> =
  Promise.resolve();


/* =========================================================
   STORAGE INITIALIZATION
========================================================= */

async function ensureStorage(): Promise<void> {
  if (loaded) {
    return;
  }

  if (initialization) {
    await initialization;
    return;
  }

  initialization =
    initializeStorage();

  try {
    await initialization;
  } finally {
    initialization =
      undefined;
  }
}


async function initializeStorage(): Promise<void> {
  await mkdir(
    DATA_DIR,
    {
      recursive: true,
    },
  );

  try {
    const raw =
      await readFile(
        INCIDENT_FILE,
        "utf8",
      );

    const parsed: unknown =
      JSON.parse(raw);

    if (Array.isArray(parsed)) {
      incidents =
        parsed
          .filter(isValidIncident)
          .map(normalizeIncident);
    } else {
      incidents = [];
    }
  } catch (error: unknown) {
    const code =
      getErrorCode(error);

    /*
     * Missing storage is normal on first startup.
     */
    if (code !== "ENOENT") {
      console.error(
        "[VX] Failed to load incidents:",
        error,
      );
    }

    incidents = [];
  }

  enforceRetention();

  loaded = true;
}


/* =========================================================
   ERROR HELPERS
========================================================= */

function getErrorCode(
  error: unknown,
): string | undefined {
  if (
    typeof error !== "object" ||
    error === null
  ) {
    return undefined;
  }

  if (!("code" in error)) {
    return undefined;
  }

  const code =
    (error as {
      code?: unknown;
    }).code;

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
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : fallback;
}


function clamp(
  value: unknown,
  minimum: number,
  maximum: number,
): number {
  const number =
    safeNumber(
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
): string {
  if (
    typeof value !== "string"
  ) {
    return fallback;
  }

  return value
    .trim()
    .slice(
      0,
      MAX_STRING_LENGTH,
    );
}


function normalize(
  value?: string,
): string {
  return String(
    value ?? "",
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}


function unique<T extends string>(
  values: Array<T | undefined | null> = [],
  limit = MAX_INDICATORS,
): T[] {
  const result: T[] = [];

  const seen =
    new Set<string>();

  for (const value of values) {
    const normalized =
      safeString(value);

    if (!normalized) {
      continue;
    }

    const key =
      normalized.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(
      normalized as T,
    );

    if (
      result.length >= limit
    ) {
      break;
    }
  }

  return result;
}


function normalizeJid(
  value?: string,
): string {
  return safeString(value);
}


function normalizePhone(
  value?: string,
): string | undefined {
  const raw =
    safeString(value);

  if (!raw) {
    return undefined;
  }

  const digits =
    raw.replace(
      /[^\d+]/g,
      "",
    );

  return digits || undefined;
}


/* =========================================================
   INCIDENT VALIDATION
========================================================= */

function isValidIncident(
  value: unknown,
): value is VxIncident {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const incident =
    value as Partial<VxIncident>;

  return (
    typeof incident.id === "string" &&
    incident.id.trim().length > 0 &&

    typeof incident.createdAt === "number" &&
    Number.isFinite(
      incident.createdAt,
    ) &&

    typeof incident.updatedAt === "number" &&
    Number.isFinite(
      incident.updatedAt,
    ) &&

    typeof incident.status === "string" &&

    typeof incident.severity === "string" &&

    typeof incident.riskScore === "number" &&
    Number.isFinite(
      incident.riskScore,
    ) &&

    typeof incident.confidence === "number" &&
    Number.isFinite(
      incident.confidence,
    ) &&

    typeof incident.type === "string" &&

    typeof incident.title === "string" &&

    typeof incident.reason === "string" &&

    Array.isArray(
      incident.indicators,
    ) &&

    Array.isArray(
      incident.actions,
    ) &&

    Array.isArray(
      incident.eventIds,
    )
  );
}

function normalizeEventType(
  value: unknown,
  fallback: VxEventType = "SYSTEM",
): VxEventType {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();

  const validTypes: VxEventType[] = [
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
  ];

  return validTypes.includes(
    raw as VxEventType,
  )
    ? (raw as VxEventType)
    : fallback;
}


/* =========================================================
   INCIDENT NORMALIZATION
========================================================= */

function normalizeIncident(
  incident: VxIncident,
): VxIncident {
  const normalized =
    incident as VxIncident;

  normalized.id =
    safeString(
      normalized.id,
    );

  normalized.createdAt =
    safeNumber(
      normalized.createdAt,
      Date.now(),
    );

  normalized.updatedAt =
    safeNumber(
      normalized.updatedAt,
      normalized.createdAt,
    );

  normalized.riskScore =
    clamp(
      normalized.riskScore,
      0,
      100,
    );

  normalized.confidence =
    clamp(
      normalized.confidence,
      0,
      100,
    );

  normalized.type =
    normalizeEventType(
      normalized.type,
      "SYSTEM",
    );

  normalized.title =
    safeString(
      normalized.title,
      "VX SECURITY INCIDENT",
    );

  normalized.reason =
    safeString(
      normalized.reason,
      "Dark Vortex detected suspicious security activity.",
    );

  normalized.indicators =
    unique(
      normalized.indicators,
      MAX_INDICATORS,
    );

  normalized.actions =
    unique(
      normalized.actions,
      MAX_ACTIONS,
    );

  normalized.eventIds =
    unique(
      normalized.eventIds,
      MAX_EVENT_IDS,
    );

  if (
    normalized.metadata &&
    typeof normalized.metadata ===
      "object"
  ) {
    const entries =
      Object.entries(
        normalized.metadata,
      )
      .slice(
        0,
        MAX_METADATA_KEYS,
      );

    normalized.metadata =
      Object.fromEntries(entries);
  }

  return normalized;
}


/* =========================================================
   PERSISTENCE
========================================================= */

async function persist(): Promise<void> {
  const snapshot =
    JSON.stringify(
      incidents,
      null,
      2,
    );

  const currentWrite =
    persistenceQueue.then(
      async () => {
        await mkdir(
          DATA_DIR,
          {
            recursive: true,
          },
        );

        /*
         * Remove a stale temporary file if one
         * remained after a previous interrupted write.
         */
        try {
          await unlink(
            TEMP_FILE,
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
          TEMP_FILE,
          snapshot,
          "utf8",
        );

        await rename(
          TEMP_FILE,
          INCIDENT_FILE,
        );
      },
    );

  /*
   * Never allow one failed write to poison
   * every future persistence operation.
   */
  persistenceQueue =
    currentWrite.catch(
      () => undefined,
    );

  await currentWrite;
}


/* =========================================================
   EVENT IDENTITY
========================================================= */

function getGroupIdentity(
  event: VxEvent,
): string {
  return (
    normalizeJid(
      event.group?.jid,
    ) ||
    "unknown-group"
  );
}


function getActorIdentity(
  event: VxEvent,
): string {
  return (
    normalizeJid(
      event.actor?.jid,
    ) ||
    normalizePhone(
      event.actor?.phoneNumber,
    ) ||
    "unknown-actor"
  );
}


/* =========================================================
   INCIDENT FINGERPRINT
========================================================= */

function createIncidentFingerprint(
  event: VxEvent,
): string {
  const group =
    normalize(
      getGroupIdentity(event),
    );

  const actor =
    normalize(
      getActorIdentity(event),
    );

  const type =
    normalize(
      event.type,
    );

  const indicators =
    unique(
      event.indicators,
      MAX_INDICATORS,
    )
      .map(normalize)
      .sort();

  return [
    type,
    group,
    actor,
    indicators.join(","),
  ].join("|");
}


/* =========================================================
   INCIDENT ID
========================================================= */

function generateIncidentId(): string {
  const year =
    new Date().getFullYear();

  const prefix =
    `VX-INC-${year}-`;

  let highest =
    0;

  for (const incident of incidents) {
    if (
      !incident.id.startsWith(
        prefix,
      )
    ) {
      continue;
    }

    const sequenceText =
      incident.id.slice(
        prefix.length,
      );

    /*
     * Strict numeric sequence validation.
     */
    if (
      !/^\d+$/.test(
        sequenceText,
      )
    ) {
      continue;
    }

    const sequence =
      Number(
        sequenceText,
      );

    if (
      Number.isSafeInteger(
        sequence,
      ) &&
      sequence >= 0
    ) {
      highest =
        Math.max(
          highest,
          sequence,
        );
    }
  }

  return (
    `${prefix}${String(
      highest + 1,
    ).padStart(6, "0")}`
  );
}


/* =========================================================
   EVENT → INCIDENT DATA
========================================================= */

function createIncidentTitle(
  event: VxEvent,
): string {
  const severity =
    safeString(
      event.risk?.severity,
      "LOW",
    );

  return `VX ${severity} SECURITY INCIDENT`;
}


function createIncidentReason(
  event: VxEvent,
): string {
  const reason =
    safeString(
      event.reason,
    );

  if (reason) {
    return reason;
  }

  return (
    "Dark Vortex detected suspicious security activity."
  );
}


/* =========================================================
   RETENTION
========================================================= */

function enforceRetention(): void {
  if (
    incidents.length <=
    MAX_INCIDENTS
  ) {
    return;
  }

  incidents =
    incidents
      .sort(
        (a, b) =>
          safeNumber(
            b.updatedAt,
          ) -
          safeNumber(
            a.updatedAt,
          ),
      )
      .slice(
        0,
        MAX_INCIDENTS,
      );
}


/* =========================================================
   DUPLICATE MATCHING
========================================================= */

function matchesRecentIncident(
  incident: VxIncident,
  event: VxEvent,
  fingerprint: string,
): boolean {
  const metadata =
    incident.metadata;

  const existingFingerprint =
    metadata &&
    typeof metadata === "object" &&
    typeof metadata.vxFingerprint ===
      "string"
      ? metadata.vxFingerprint
      : undefined;

  if (
    existingFingerprint !==
    fingerprint
  ) {
    return false;
  }

  /*
   * Completed incidents must not absorb
   * new detections.
   */
  if (
    incident.status ===
      "ABORTED" ||
    incident.status ===
      "RESOLVED"
  ) {
    return false;
  }

  if (
    incident.type !==
    event.type
  ) {
    return false;
  }

  const now =
    Date.now();

  const updatedAt =
    safeNumber(
      incident.updatedAt,
      now,
    );

  const age =
    now -
    updatedAt;

  /*
   * Future timestamps are tolerated because
   * system clocks can be slightly skewed.
   */
  if (age < 0) {
    return true;
  }

  return (
    age <=
    DUPLICATE_WINDOW_MS
  );
}


/* =========================================================
   FIND DUPLICATE
========================================================= */

export async function findRecentDuplicateVxIncident(
  event: VxEvent,
): Promise<VxIncident | undefined> {
  await ensureStorage();

  const fingerprint =
    createIncidentFingerprint(
      event,
    );

  const now =
    Date.now();

  const sorted =
    [...incidents].sort(
      (a, b) =>
        b.updatedAt -
        a.updatedAt,
    );

  for (const incident of sorted) {
    const age =
      now -
      incident.updatedAt;

    /*
     * Future timestamps remain eligible.
     */
    if (
      age >
      DUPLICATE_WINDOW_MS
    ) {
      break;
    }

    if (
      matchesRecentIncident(
        incident,
        event,
        fingerprint,
      )
    ) {
      return incident;
    }
  }

  return undefined;
}


/* =========================================================
   CREATE / CORRELATE INCIDENT
========================================================= */

export async function createVxIncident(
  event: VxEvent,
): Promise<VxIncident> {
  await ensureStorage();

  /*
   * A malformed event should never create a
   * completely unusable incident.
   */
  const eventId =
    safeString(
      event.id,
      `event-${Date.now()}`,
    );

  const existing =
    await findRecentDuplicateVxIncident(
      event,
    );

  if (existing) {
    /*
     * Prevent duplicate event IDs.
     */
    if (
      !existing.eventIds.includes(
        eventId,
      )
    ) {
      existing.eventIds.push(
        eventId,
      );

      if (
        existing.eventIds.length >
        MAX_EVENT_IDS
      ) {
        existing.eventIds =
          existing.eventIds.slice(
            -MAX_EVENT_IDS,
          );
      }
    }

    const now =
      Date.now();

    existing.updatedAt =
      now;

    /*
     * Preserve the strongest observed risk.
     */
    existing.riskScore =
      Math.max(
        existing.riskScore,
        clamp(
          event.risk?.score,
          0,
          100,
        ),
      );

    existing.confidence =
      Math.max(
        existing.confidence,
        clamp(
          event.risk?.confidence,
          0,
          100,
        ),
      );

    existing.indicators =
      unique(
        [
          ...existing.indicators,
          ...(event.indicators ?? []),
        ],
        MAX_INDICATORS,
      );

    existing.metadata = {
      ...(existing.metadata ?? {}),

      lastDetectionAt:
        now,

      correlatedDetections:
        existing.eventIds.length,
    };

    await persist();

    return existing;
  }


  /* =======================================================
     NEW INCIDENT
  ======================================================= */

  const now =
    Date.now();

  const fingerprint =
    createIncidentFingerprint(
      event,
    );

  const indicators =
    unique(
      event.indicators,
      MAX_INDICATORS,
    );

  const incident =
    {
      id:
        generateIncidentId(),

      createdAt:
        now,

      updatedAt:
        now,

      status:
        "DETECTED",

      severity:
        event.risk?.severity ??
        "LOW",

      riskScore:
        clamp(
          event.risk?.score,
          0,
          100,
        ),

      confidence:
        clamp(
          event.risk?.confidence,
          0,
          100,
        ),

      type:
        safeString(
          event.type,
          "UNKNOWN",
        ),

      group:
        event.group,

      actor:
        event.actor,

      title:
        createIncidentTitle(
          event,
        ),

      reason:
        createIncidentReason(
          event,
        ),

      indicators,

      /*
       * Detection is intentionally separated
       * from enforcement.
       */
      actions:
        ["NONE"],

      eventIds:
        [eventId],

      metadata: {
        vxFingerprint:
          fingerprint,

        detectionEventId:
          eventId,

        detectionTimestamp:
          safeNumber(
            event.timestamp,
            now,
          ),

        correlationEvidence:
          indicators,

        alertSeverity:
          event.risk?.severity,

        alertRiskScore:
          event.risk?.score,

        alertConfidence:
          event.risk?.confidence,

        enforcement:
          "DISABLED",

        correlatedDetections:
          1,
      },
    } as VxIncident;

  incidents.push(
    incident,
  );

  enforceRetention();

  await persist();

  return incident;
}


/* =========================================================
   GET INCIDENT
========================================================= */

export async function getVxIncident(
  id: string,
): Promise<VxIncident | undefined> {
  await ensureStorage();

  const normalizedId =
    safeString(id);

  if (!normalizedId) {
    return undefined;
  }

  return incidents.find(
    incident =>
      incident.id ===
      normalizedId,
  );
}


/* =========================================================
   LIST INCIDENTS
========================================================= */

export async function getVxIncidents(
  limit = 100,
): Promise<VxIncident[]> {
  await ensureStorage();

  const safeLimit =
    Number.isFinite(limit)
      ? Math.max(
          1,
          Math.min(
            MAX_LIST_LIMIT,
            Math.floor(limit),
          ),
        )
      : 100;

  return [...incidents]
    .sort(
      (a, b) =>
        b.updatedAt -
        a.updatedAt,
    )
    .slice(
      0,
      safeLimit,
    );
}


/* =========================================================
   UPDATE INCIDENT
========================================================= */

export async function updateVxIncident(
  id: string,
  updates: Partial<VxIncident>,
): Promise<VxIncident | undefined> {
  await ensureStorage();

  const normalizedId =
    safeString(id);

  if (!normalizedId) {
    return undefined;
  }

  const incident =
    incidents.find(
      item =>
        item.id ===
        normalizedId,
    );

  if (!incident) {
    return undefined;
  }

  /*
   * Incident identity fields cannot be changed.
   */
  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    eventIds: _eventIds,
    ...safeUpdates
  } = updates;

  /*
   * Prevent accidental undefined/null replacement
   * of important fields.
   */
  for (
    const [key, value] of
    Object.entries(
      safeUpdates,
    )
  ) {
    if (
      value === undefined
    ) {
      continue;
    }

    (incident as unknown as Record<
      string,
      unknown
    >)[key] = value;
  }

  /*
   * Normalize bounded fields after update.
   */
  incident.riskScore =
    clamp(
      incident.riskScore,
      0,
      100,
    );

  incident.confidence =
    clamp(
      incident.confidence,
      0,
      100,
    );

  incident.indicators =
    unique(
      incident.indicators,
      MAX_INDICATORS,
    );

  incident.actions =
    unique(
      incident.actions,
      MAX_ACTIONS,
    );

  incident.updatedAt =
    Date.now();

  enforceRetention();

  await persist();

  return incident;
}


/* =========================================================
   RESOLVE INCIDENT
========================================================= */

export async function resolveVxIncident(
  id: string,
): Promise<VxIncident | undefined> {
  await ensureStorage();

  const normalizedId =
    safeString(id);

  const incident =
    incidents.find(
      item =>
        item.id ===
        normalizedId,
    );

  if (!incident) {
    return undefined;
  }

  /*
   * Already resolved is idempotent.
   */
  if (
    incident.status ===
    "RESOLVED"
  ) {
    return incident;
  }

  /*
   * Aborted incidents remain aborted unless
   * explicitly reopened through a separate operation.
   */
  if (
    incident.status ===
    "ABORTED"
  ) {
    return incident;
  }

  const now =
    Date.now();

  incident.status =
    "RESOLVED";

  incident.resolvedAt =
    now;

  incident.updatedAt =
    now;

  await persist();

  return incident;
}


/* =========================================================
   ABORT INCIDENT
========================================================= */

export async function abortVxIncident(
  id: string,
  abortedBy?: string,
): Promise<VxIncident | undefined> {
  await ensureStorage();

  const normalizedId =
    safeString(id);

  const incident =
    incidents.find(
      item =>
        item.id ===
        normalizedId,
    );

  if (!incident) {
    return undefined;
  }

  /*
   * Already aborted is idempotent.
   */
  if (
    incident.status ===
    "ABORTED"
  ) {
    return incident;
  }

  /*
   * Resolved incidents are completed cases.
   */
  if (
    incident.status ===
    "RESOLVED"
  ) {
    return incident;
  }

  incident.status =
    "ABORTED";

  const actor =
    safeString(
      abortedBy,
    );

  if (actor) {
    incident.abortedBy =
      actor;
  }

  incident.updatedAt =
    Date.now();

  await persist();

  return incident;
}


/* =========================================================
   SET INCIDENT ACTIVE
========================================================= */

export async function activateVxIncident(
  id: string,
): Promise<VxIncident | undefined> {
  await ensureStorage();

  const normalizedId =
    safeString(id);

  const incident =
    incidents.find(
      item =>
        item.id ===
        normalizedId,
    );

  if (!incident) {
    return undefined;
  }

  /*
   * A resolved/aborted incident should not silently
   * become active again.
   */
  if (
    incident.status ===
      "RESOLVED" ||
    incident.status ===
      "ABORTED"
  ) {
    return incident;
  }

  incident.status =
    "ACTIVE";

  incident.updatedAt =
    Date.now();

  await persist();

  return incident;
}


/* =========================================================
   SET INCIDENT ANALYZING
========================================================= */

export async function analyzeVxIncident(
  id: string,
): Promise<VxIncident | undefined> {
  await ensureStorage();

  const normalizedId =
    safeString(id);

  const incident =
    incidents.find(
      item =>
        item.id ===
        normalizedId,
    );

  if (!incident) {
    return undefined;
  }

  if (
    incident.status ===
      "RESOLVED" ||
    incident.status ===
      "ABORTED"
  ) {
    return incident;
  }

  incident.status =
    "ANALYZING";

  incident.updatedAt =
    Date.now();

  await persist();

  return incident;
}


/* =========================================================
   INCIDENT COUNTS
========================================================= */

export async function getVxIncidentStats(): Promise<{
  total: number;
  detected: number;
  analyzing: number;
  active: number;
  resolved: number;
  aborted: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}> {
  await ensureStorage();

  const stats = {
    total:
      incidents.length,

    detected:
      0,

    analyzing:
      0,

    active:
      0,

    resolved:
      0,

    aborted:
      0,

    critical:
      0,

    high:
      0,

    medium:
      0,

    low:
      0,
  };

  for (
    const incident of incidents
  ) {
    switch (
      incident.status
    ) {
      case "DETECTED":
        stats.detected++;
        break;

      case "ANALYZING":
        stats.analyzing++;
        break;

      case "ACTIVE":
        stats.active++;
        break;

      case "RESOLVED":
        stats.resolved++;
        break;

      case "ABORTED":
        stats.aborted++;
        break;
    }

    switch (
      incident.severity
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
  }

  return stats;
}


/* =========================================================
   STATUS FILTER
========================================================= */

export async function getVxIncidentsByStatus(
  status: IncidentStatus,
  limit = 100,
): Promise<VxIncident[]> {
  await ensureStorage();

  const safeLimit =
    Number.isFinite(limit)
      ? Math.max(
          1,
          Math.min(
            MAX_LIST_LIMIT,
            Math.floor(limit),
          ),
        )
      : 100;

  return incidents
    .filter(
      incident =>
        incident.status ===
        status,
    )
    .sort(
      (a, b) =>
        b.updatedAt -
        a.updatedAt,
    )
    .slice(
      0,
      safeLimit,
    );
}


/* =========================================================
   SEVERITY FILTER
========================================================= */

export async function getVxIncidentsBySeverity(
  severity: VxIncident["severity"],
  limit = 100,
): Promise<VxIncident[]> {
  await ensureStorage();

  const safeLimit =
    Number.isFinite(limit)
      ? Math.max(
          1,
          Math.min(
            MAX_LIST_LIMIT,
            Math.floor(limit),
          ),
        )
      : 100;

  return incidents
    .filter(
      incident =>
        incident.severity ===
        severity,
    )
    .sort(
      (a, b) =>
        b.updatedAt -
        a.updatedAt,
    )
    .slice(
      0,
      safeLimit,
    );
}


/* =========================================================
   GROUP FILTER
========================================================= */

export async function getVxIncidentsByGroup(
  groupJid: string,
  limit = 100,
): Promise<VxIncident[]> {
  await ensureStorage();

  const normalizedGroup =
    normalize(
      groupJid,
    );

  if (!normalizedGroup) {
    return [];
  }

  const safeLimit =
    Number.isFinite(limit)
      ? Math.max(
          1,
          Math.min(
            MAX_LIST_LIMIT,
            Math.floor(limit),
          ),
        )
      : 100;

  return incidents
    .filter(
      incident =>
        normalize(
          incident.group?.jid,
        ) === normalizedGroup,
    )
    .sort(
      (a, b) =>
        b.updatedAt -
        a.updatedAt,
    )
    .slice(
      0,
      safeLimit,
    );
}


/* =========================================================
   ACTOR FILTER
========================================================= */

export async function getVxIncidentsByActor(
  actorJid: string,
  limit = 100,
): Promise<VxIncident[]> {
  await ensureStorage();

  const normalizedActor =
    normalize(
      actorJid,
    );

  if (!normalizedActor) {
    return [];
  }

  const safeLimit =
    Number.isFinite(limit)
      ? Math.max(
          1,
          Math.min(
            MAX_LIST_LIMIT,
            Math.floor(limit),
          ),
        )
      : 100;

  return incidents
    .filter(
      incident =>
        normalize(
          incident.actor?.jid,
        ) === normalizedActor,
    )
    .sort(
      (a, b) =>
        b.updatedAt -
        a.updatedAt,
    )
    .slice(
      0,
      safeLimit,
    );
}


/* =========================================================
   CLEANUP
========================================================= */

export async function cleanupVxIncidents(): Promise<void> {
  await ensureStorage();

  /*
   * Normalize legacy records before retention.
   */
  incidents =
    incidents
      .filter(
        isValidIncident,
      )
      .map(
        normalizeIncident,
      );

  enforceRetention();

  await persist();
}


/* =========================================================
   RESET — DEVELOPMENT ONLY
========================================================= */

/**
 * Clears all stored incidents.
 *
 * This function is never called automatically.
 */
export async function clearVxIncidents(): Promise<void> {
  await ensureStorage();

  incidents = [];

  await persist();
}