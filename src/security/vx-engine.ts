/* =========================================================
   🌑 DARK VORTEX — VX SECURITY ENGINE

   Central security pipeline:

   Detector / Scanner / Bot Intelligence
                    ↓
              VX Engine
                    ↓
               VX Risk
                    ↓
             VX Incident
                    ↓
              VX Logger
                    ↓
           Owner Notification

   ⚡ Powered by Vortex Tech
========================================================= */

import { randomUUID } from "node:crypto";

import type {
  VxAction,
  VxEvent,
  VxEventType,
  VxRiskFactor,
  VxSeverity,
} from "./vx-types.js";

import {
  calculateRisk,
} from "./vx-risk.js";

import {
  logVxEvent,
} from "./vx-logger.js";

import {
  createVxIncident,
  findRecentDuplicateVxIncident,
} from "./vx-incidents.js";


/* =========================================================
   CONSTANTS
========================================================= */

const ENGINE_VERSION =
  "VX-ENGINE-4";

const MAX_INDICATORS =
  100;

const MAX_FACTORS =
  50;

const MAX_METADATA_KEYS =
  100;

const MAX_METADATA_DEPTH =
  4;

const MAX_ARRAY_ITEMS =
  50;

const MAX_STRING_LENGTH =
  4000;


/* =========================================================
   TYPES
========================================================= */

export interface VxAnalyzeInput {
  type: VxEventType;

  group?: VxEvent["group"];

  actor?: VxEvent["actor"];

  text?: string;

  command?: string;

  reason?: string;

  indicators?: string[];

  factors?: VxRiskFactor[];

  confidence?: number;

  action?: VxAction;

  metadata?: Record<
    string,
    unknown
  >;

  /**
   * Optional scan identifier used to correlate
   * historical scan activity without exposing
   * sensitive infrastructure data.
   */
  scanId?: string;

  /**
   * When true, the engine may create or correlate
   * a persistent security incident.
   *
   * When false or undefined, incident creation is
   * disabled. HIGH/CRITICAL owner notification
   * remains independent of this flag.
   */
  createIncident?: boolean;
}


/* =========================================================
   OWNER NOTIFIER
========================================================= */

export interface VxOwnerNotifier {
  (
    event: VxEvent,
  ): Promise<void>;
}

let ownerNotifier:
  | VxOwnerNotifier
  | undefined;


/**
 * Allows the WhatsApp layer to register the owner
 * notification implementation without coupling the
 * security engine directly to Baileys.
 */
export function setVxOwnerNotifier(
  notifier?: VxOwnerNotifier,
): void {
  ownerNotifier =
    notifier;
}


/* =========================================================
   STRING HELPERS
========================================================= */

function uniqueStrings(
  values: string[] = [],
  max = MAX_INDICATORS,
): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen =
    new Set<string>();

  const result: string[] = [];

  for (const value of values) {
    const normalized =
      String(value)
        .trim();

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
      normalized.slice(
        0,
        MAX_STRING_LENGTH,
      ),
    );

    if (
      result.length >= max
    ) {
      break;
    }
  }

  return result;
}


function clamp(
  value: number,
  min = 0,
  max = 100,
): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(
    min,
    Math.min(
      max,
      value,
    ),
  );
}


function sanitizeText(
  value:
    string |
    undefined,
  maxLength = MAX_STRING_LENGTH,
): string | undefined {
  if (
    value ===
    undefined ||
    value === null
  ) {
    return undefined;
  }

  const text =
    String(value)
      .trim();

  if (!text) {
    return undefined;
  }

  return text.slice(
    0,
    maxLength,
  );
}


/* =========================================================
   CONFIDENCE
========================================================= */

function normalizeConfidence(
  confidence:
    number |
    undefined,
): number {
  if (
    confidence ===
      undefined ||
    !Number.isFinite(
      confidence,
    )
  ) {
    return 50;
  }

  return Math.round(
    clamp(
      confidence,
    ),
  );
}


/**
 * Confidence should not become artificially strong
 * simply because many correlated factors were supplied.
 *
 * Factors are grouped into broad evidence families.
 */
function calculateEvidenceQuality(
  factors:
    VxRiskFactor[],
): number {
  if (
    factors.length === 0
  ) {
    return 0;
  }

  const categories =
    new Set<string>();

  for (
    const factor of factors
  ) {
    const name =
      String(
        factor.name ||
          "",
      )
        .trim()
        .toLowerCase();

    if (
      name.includes("message") ||
      name.includes("frequency") ||
      name.includes("burst") ||
      name.includes("flood") ||
      name.includes("activity")
    ) {
      categories.add(
        "behavior",
      );

      continue;
    }

    if (
      name.includes("link") ||
      name.includes("url") ||
      name.includes("content") ||
      name.includes("repetition") ||
      name.includes("spam")
    ) {
      categories.add(
        "content",
      );

      continue;
    }

    if (
      name.includes("command")
    ) {
      categories.add(
        "command",
      );

      continue;
    }

    if (
      name.includes("participant") ||
      name.includes("membership") ||
      name.includes("join") ||
      name.includes("leave") ||
      name.includes("promotion") ||
      name.includes("demotion")
    ) {
      categories.add(
        "membership",
      );

      continue;
    }

    if (
      name.includes("bot") ||
      name.includes("automation") ||
      name.includes("device")
    ) {
      categories.add(
        "automation",
      );

      continue;
    }

    categories.add(
      "other",
    );
  }

  return categories.size;
}


function adjustConfidence(
  suppliedConfidence:
    number |
    undefined,
  factors:
    VxRiskFactor[],
): number {
  let confidence =
    normalizeConfidence(
      suppliedConfidence,
    );

  const evidenceQuality =
    calculateEvidenceQuality(
      factors,
    );

  /*
   * One evidence family:
   * confidence capped to avoid overclaiming.
   */
  if (
    evidenceQuality <= 1
  ) {
    confidence =
      Math.min(
        confidence,
        78,
      );
  }

  /*
   * Two independent evidence families:
   * moderate confidence ceiling.
   */
  else if (
    evidenceQuality === 2
  ) {
    confidence =
      Math.min(
        confidence,
        90,
      );
  }

  /*
   * Three or more evidence families:
   * modest confidence bonus only.
   */
  else {
    confidence =
      Math.min(
        100,
        confidence + 3,
      );
  }

  return Math.round(
    clamp(
      confidence,
    ),
  );
}


/* =========================================================
   FACTOR NORMALIZATION
========================================================= */

function normalizeFactors(
  factors:
    VxRiskFactor[] |
    undefined,
): VxRiskFactor[] {
  if (
    !Array.isArray(
      factors,
    )
  ) {
    return [];
  }

  const normalized:
    VxRiskFactor[] = [];

  const seen =
    new Set<string>();

  for (
    const factor of factors
  ) {
    if (
      !factor ||
      typeof factor !==
        "object"
    ) {
      continue;
    }

    const name =
      String(
        factor.name ||
          "",
      )
        .trim();

    if (!name) {
      continue;
    }

    const numericScore =
      Number(
        factor.score,
      );

    if (
      !Number.isFinite(
        numericScore,
      ) ||
      numericScore <= 0
    ) {
      continue;
    }

    const reason =
      String(
        factor.reason ||
          "",
      )
        .trim()
        .slice(
          0,
          1000,
        );

    const safeName =
      name.slice(
        0,
        200,
      );

    const key =
      `${safeName.toLowerCase()}::${reason.toLowerCase()}`;

    if (
      seen.has(
        key,
      )
    ) {
      continue;
    }

    seen.add(
      key,
    );

    normalized.push({
      name:
        safeName,

      score:
        Math.round(
          clamp(
            numericScore,
          ),
        ),

      reason,
    });

    if (
      normalized.length >=
      MAX_FACTORS
    ) {
      break;
    }
  }

  return normalized;
}


/* =========================================================
   SECRET DETECTION
========================================================= */

function isSecretKey(
  key: string,
): boolean {
  const normalized =
    key
      .trim()
      .toLowerCase()
      .replace(
        /[\s-]/g,
        "_",
      );

  const secretPatterns = [
    "finalkey",
    "final_key",
    "password",
    "passwd",
    "passcode",
    "secret",
    "token",
    "apikey",
    "api_key",
    "access_token",
    "refresh_token",
    "auth_token",
    "authorization",
    "private_key",
    "privatekey",
    "client_secret",
    "session_token",
    "bearer",
    "cookie",
    "credential",
    "credentials",
  ];

  return secretPatterns.some(
    pattern =>
      normalized.includes(
        pattern,
      ),
  );
}


/* =========================================================
   SAFE METADATA SERIALIZATION
========================================================= */

function sanitizeMetadataValue(
  value: unknown,
  depth = 0,
): unknown {
  if (
    depth >
    MAX_METADATA_DEPTH
  ) {
    return "[TRUNCATED]";
  }

  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (
    typeof value ===
    "string"
  ) {
    return sanitizeText(
      value,
      2000,
    ) ?? "";
  }

  if (
    typeof value ===
      "number" ||
    typeof value ===
      "boolean"
  ) {
    return value;
  }

  if (
    typeof value ===
    "bigint"
  ) {
    return String(
      value,
    );
  }

  if (
    value instanceof Date
  ) {
    return value.toISOString();
  }

  if (
    Array.isArray(value)
  ) {
    return value
      .slice(
        0,
        MAX_ARRAY_ITEMS,
      )
      .map(
        item =>
          sanitizeMetadataValue(
            item,
            depth + 1,
          ),
      );
  }

  if (
    typeof value ===
    "object"
  ) {
    const source =
      value as Record<
        string,
        unknown
      >;

    const output:
      Record<
        string,
        unknown
      > = {};

    let count = 0;

    for (
      const [
        rawKey,
        rawValue,
      ] of Object.entries(
        source,
      )
    ) {
      if (
        count >=
        MAX_METADATA_KEYS
      ) {
        break;
      }

      const key =
        String(
          rawKey,
        ).trim();

      if (!key) {
        continue;
      }

      if (
        isSecretKey(
          key,
        )
      ) {
        continue;
      }

      output[
        key.slice(
          0,
          200,
        )
      ] =
        sanitizeMetadataValue(
          rawValue,
          depth + 1,
        );

      count++;
    }

    return output;
  }

  /*
   * Functions, symbols and other unsupported values
   * are never persisted.
   */
  return String(
    value,
  ).slice(
    0,
    500,
  );
}


function sanitizeMetadata(
  metadata:
    Record<
      string,
      unknown
    > |
    undefined,
): Record<
  string,
  unknown
> {
  if (
    !metadata ||
    typeof metadata !==
      "object"
  ) {
    return {};
  }

  const output:
    Record<
      string,
      unknown
    > = {};

  let count = 0;

  for (
    const [
      rawKey,
      rawValue,
    ] of Object.entries(
      metadata,
    )
  ) {
    if (
      count >=
      MAX_METADATA_KEYS
    ) {
      break;
    }

    const key =
      String(
        rawKey,
      ).trim();

    if (!key) {
      continue;
    }

    /*
     * Secret-bearing fields are omitted entirely.
     */
    if (
      isSecretKey(
        key,
      )
    ) {
      continue;
    }

    output[
      key.slice(
        0,
        200,
      )
    ] =
      sanitizeMetadataValue(
        rawValue,
        0,
      );

    count++;
  }

  return output;
}


/* =========================================================
   RISK NORMALIZATION
========================================================= */

function normalizeRisk(
  risk: ReturnType<
    typeof calculateRisk
  >,
): ReturnType<
  typeof calculateRisk
> {
  const factors =
    normalizeFactors(
      Array.isArray(
        risk.factors,
      )
        ? risk.factors
        : [],
    );

  const score =
    Math.round(
      clamp(
        Number(
          risk.score,
        ),
      ),
    );

  const confidence =
    Math.round(
      clamp(
        Number(
          risk.confidence,
        ),
      ),
    );

  return {
    ...risk,

    score,

    confidence,

    factors,
  };
}


/* =========================================================
   SEVERITY NOTIFICATION
========================================================= */

function shouldNotifyOwner(
  severity: VxSeverity,
): boolean {
  return (
    severity ===
      "HIGH" ||
    severity ===
      "CRITICAL"
  );
}


/* =========================================================
   INCIDENT RELATIONSHIP LOG
========================================================= */

async function logIncidentRelationship(
  event: VxEvent,
  reason: string,
): Promise<void> {
  try {
    /*
     * Generate a new audit-event ID so the relationship
     * record cannot collide with the original detection
     * event.
     */
    const relationshipEvent:
      VxEvent = {
      ...event,

      id:
        randomUUID(),

      timestamp:
        Date.now(),

      type:
        "INCIDENT",

      reason:
        sanitizeText(
          reason,
          2000,
        ),

      metadata: {
        ...sanitizeMetadata(
          event.metadata,
        ),

        relationship:
          true,
      },
    };

    await logVxEvent(
      relationshipEvent,
    );
  } catch (error) {
    console.error(
      "[VX] Failed to log incident relationship:",
      error,
    );
  }
}


/* =========================================================
   MAIN ANALYSIS PIPELINE
========================================================= */

export async function analyzeVxEvent(
  input: VxAnalyzeInput,
): Promise<VxEvent> {
  /* =======================================================
     1. SANITIZE INPUT
  ======================================================= */

  const factors =
    normalizeFactors(
      input.factors,
    );

  const indicators =
    uniqueStrings(
      input.indicators,
      MAX_INDICATORS,
    );

  const confidence =
    adjustConfidence(
      input.confidence,
      factors,
    );

  const metadata =
    sanitizeMetadata(
      input.metadata,
    );

  const safeScanId =
    sanitizeText(
      input.scanId,
      200,
    );


  /* =======================================================
     2. CALCULATE RISK
  ======================================================= */

  const calculatedRisk =
    calculateRisk(
      factors,
      confidence,
    );

  const risk =
    normalizeRisk(
      calculatedRisk,
    );


  /* =======================================================
     3. CREATE EVENT
  ======================================================= */

  const event:
    VxEvent = {
    id:
      randomUUID(),

    timestamp:
      Date.now(),

    type:
      input.type,

    group:
      input.group,

    actor:
      input.actor,

    text:
      sanitizeText(
        input.text,
      ),

    command:
      sanitizeText(
        input.command,
        500,
      ),

    risk,

    reason:
      sanitizeText(
        input.reason,
        2000,
      ),

    indicators,

    action:
      input.action ||
      "NONE",

    metadata: {
      ...metadata,

      ...(safeScanId
        ? {
            scanId:
              safeScanId,
          }
        : {}),

      evidenceQuality:
        calculateEvidenceQuality(
          factors,
        ),

      factorCount:
        factors.length,

      indicatorCount:
        indicators.length,

      engineVersion:
        ENGINE_VERSION,
    },
  };


  /* =======================================================
     4. WRITE EVENT TO AUDIT LOG
  ======================================================= */

  try {
    await logVxEvent(
      event,
    );
  } catch (error) {
    /*
     * Logging failure must never stop the security
     * pipeline.
     */
    console.error(
      "[VX] Failed to write event log:",
      error,
    );
  }


  /* =======================================================
     5. INCIDENT DECISION
  ======================================================= */

  /*
   * IMPORTANT:
   *
   * Incident creation is controlled ONLY by the
   * explicit createIncident flag.
   *
   * HIGH/CRITICAL severity alone does NOT create
   * an incident.
   *
   * This keeps historical scans and diagnostic
   * events from unexpectedly becoming persistent
   * incidents.
   */
  const incidentEligible =
    input.createIncident ===
    true;

  if (
    incidentEligible
  ) {
    try {

      /* =====================================================
         5A. DUPLICATE CHECK
      ===================================================== */

      const duplicate =
        await findRecentDuplicateVxIncident(
          event,
        );

      if (
        duplicate
      ) {
        /*
         * Keep the existing incident alive by recording
         * that another detection event was observed.
         */
        if (
          !Array.isArray(
            duplicate.eventIds,
          )
        ) {
          duplicate.eventIds =
            [];
        }

        if (
          !duplicate.eventIds.includes(
            event.id,
          )
        ) {
          duplicate.eventIds.push(
            event.id,
          );
        }

        /*
         * Bound relationship history.
         */
        if (
          duplicate.eventIds.length >
          200
        ) {
          duplicate.eventIds =
            duplicate.eventIds.slice(
              -200,
            );
        }

        event.incidentId =
          duplicate.id;

        event.metadata = {
          ...(event.metadata ||
            {}),

          duplicateIncident:
            true,

          duplicateIncidentId:
            duplicate.id,
        };

        await logIncidentRelationship(
          event,
          `Detection correlated with existing incident ${duplicate.id}.`,
        );
      }

      /* =====================================================
         5B. CREATE NEW INCIDENT
      ===================================================== */

      else {
        const incident =
          await createVxIncident(
            event,
          );

        if (
          incident
        ) {
          event.incidentId =
            incident.id;

          event.metadata = {
            ...(event.metadata ||
              {}),

            incidentCreated:
              true,

            incidentId:
              incident.id,
          };

          await logIncidentRelationship(
            event,
            `Security incident ${incident.id} created.`,
          );
        }
      }
    } catch (error) {
      /*
       * Incident persistence must never crash the bot.
       */
      console.error(
        "[VX] Incident processing failed:",
        error,
      );

      event.metadata = {
        ...(event.metadata ||
          {}),

        incidentProcessingError:
          true,
      };
    }
  }


  /* =======================================================
     6. OWNER ALERT
  ======================================================= */

  /*
   * Owner notification is intentionally independent
   * from incident creation.
   *
   * Therefore:
   *
   * HIGH/CRITICAL + createIncident=false
   *     → owner can still be notified
   *
   * createIncident=true + LOW/MEDIUM
   *     → incident can still be created
   */
  if (
    shouldNotifyOwner(
      risk.severity,
    ) &&
    ownerNotifier
  ) {
    try {
      await ownerNotifier(
        event,
      );
    } catch (error) {
      /*
       * Notification failure is isolated.
       *
       * The event has already been persisted.
       */
      console.error(
        "[VX] Owner notification failed:",
        error,
      );
    }
  }


  /* =======================================================
     7. RETURN COMPLETE EVENT
  ======================================================= */

  return event;
}


/* =========================================================
   SIMPLE EVENT HELPER
========================================================= */

export async function recordVxEvent(
  type: VxEventType,
  options:
    Omit<
      VxAnalyzeInput,
      "type"
    > = {},
): Promise<VxEvent> {
  return analyzeVxEvent({
    ...options,

    type,
  });
}


/* =========================================================
   SECURITY ALERT HELPER
========================================================= */

export async function createVxSecurityEvent(
  options: {
    group?: VxEvent["group"];

    actor?: VxEvent["actor"];

    reason: string;

    indicators?: string[];

    factors?: VxRiskFactor[];

    confidence?: number;

    scanId?: string;

    metadata?: Record<
      string,
      unknown
    >;

    createIncident?: boolean;
  },
): Promise<VxEvent> {
  return analyzeVxEvent({
    type:
      "SECURITY",

    group:
      options.group,

    actor:
      options.actor,

    reason:
      options.reason,

    indicators:
      options.indicators,

    factors:
      options.factors,

    confidence:
      options.confidence,

    scanId:
      options.scanId,

    metadata:
      options.metadata,

    createIncident:
      options.createIncident ??
      true,
  });
}


/* =========================================================
   DIAGNOSTIC EVENT HELPER
========================================================= */

export async function createVxDiagnosticEvent(
  options: {
    group?: VxEvent["group"];

    actor?: VxEvent["actor"];

    reason: string;

    factors?: VxRiskFactor[];

    confidence?: number;

    metadata?: Record<
      string,
      unknown
    >;
  },
): Promise<VxEvent> {
  return analyzeVxEvent({
    type:
      "SYSTEM",

    group:
      options.group,

    actor:
      options.actor,

    reason:
      options.reason,

    factors:
      options.factors,

    confidence:
      options.confidence,

    metadata:
      options.metadata,

    createIncident:
      false,
  });
}


/* =========================================================
   SCAN EVENT HELPER
========================================================= */

export async function createVxScanEvent(
  options: {
    group?: VxEvent["group"];

    actor?: VxEvent["actor"];

    reason?: string;

    indicators?: string[];

    factors?: VxRiskFactor[];

    confidence?: number;

    scanId?: string;

    metadata?: Record<
      string,
      unknown
    >;
  },
): Promise<VxEvent> {
  return analyzeVxEvent({
    type:
      "SCAN",

    group:
      options.group,

    actor:
      options.actor,

    reason:
      options.reason ||
      "VX security scan completed.",

    indicators:
      options.indicators,

    factors:
      options.factors,

    confidence:
      options.confidence,

    scanId:
      options.scanId,

    metadata:
      options.metadata,

    /*
     * Historical scan events do not automatically
     * generate persistent incidents.
     *
     * Individual live detections can explicitly
     * request incident creation through analyzeVxEvent.
     */
    createIncident:
      false,
  });
}