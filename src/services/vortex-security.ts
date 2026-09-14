
/* =========================================================
   🌑 DARK VORTEX — VORTEX SECURITY
   ⚡ Powered by Vortex Tech

   Local security intelligence/state layer.

   IMPORTANT:
   • Owner confirmation is handled by the command layer.
   • No credential extraction.
   • No session extraction.
   • No takeover/hijacking.
   • No private-IP tracing.
   • No evasion/bypass functionality.
   • All audit/evidence data is local.
========================================================= */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  getPrefix,
} from "./prefix.js";

/* =========================================================
   PATHS
========================================================= */

const DATA_DIR = path.resolve(
  process.cwd(),
  "src/data/vortex",
);

const SECURITY_FILE = path.join(
  DATA_DIR,
  "security-state.json",
);

/* =========================================================
   CONSTANTS
========================================================= */

const MAX_EVENTS = 1000;
const MAX_EVIDENCE = 500;
const MAX_SNAPSHOTS = 100;

const DEFAULT_LIMIT = 20;
const MAX_QUERY_LIMIT = 200;

/* =========================================================
   TYPES
========================================================= */

export type SecurityMode =
  | "normal"
  | "lockdown"
  | "failsafe"
  | "maintenance";

export type SecurityEventStatus =
  | "success"
  | "failed"
  | "cancelled"
  | "blocked"
  | "info";

export interface SecurityEvent {
  id: string;
  timestamp: string;
  type: string;
  command: string;
  sender?: string;
  jid?: string;
  target?: string;
  status: SecurityEventStatus;
  details: string[];
}

export interface SecurityEvidence {
  id: string;
  timestamp: string;
  type: string;
  source: string;
  details: string[];
}

export interface SecuritySnapshot {
  id: string;
  timestamp: string;
  mode: SecurityMode;
  quiet: boolean;
  securityPaused: boolean;
  lockdown: boolean;
  failsafe: boolean;
  maintenance: boolean;
  uptimeSeconds: number;
  memoryRssMB: number;
  heapUsedMB: number;
  platform: string;
  node: string;
  eventCount: number;
  evidenceCount: number;
}

export interface SecuritySummary {
  mode: SecurityMode;
  quiet: boolean;
  securityPaused: boolean;

  totalEvents: number;
  successfulEvents: number;
  failedEvents: number;
  cancelledEvents: number;
  blockedEvents: number;
  informationalEvents: number;

  totalEvidence: number;
  totalSnapshots: number;

  latestEvent: SecurityEvent | null;
  latestEvidence: SecurityEvidence | null;
  latestSnapshot: SecuritySnapshot | null;
}

export interface SecurityPosture {
  mode: SecurityMode;
  level:
    | "NORMAL"
    | "ELEVATED"
    | "RESTRICTED"
    | "CRITICAL";

  quiet: boolean;
  securityPaused: boolean;

  eventCount: number;
  failedEvents: number;
  blockedEvents: number;

  description: string;
}

export interface SecurityCommandGate {
  allowed: boolean;
  reason?: string;
}

interface SecurityState {
  mode: SecurityMode;
  quiet: boolean;
  securityPaused: boolean;
  events: SecurityEvent[];
  evidence: SecurityEvidence[];
  snapshots: SecuritySnapshot[];
}

/* =========================================================
   PROGRESS
========================================================= */

export type SecurityProgress = (
  stage: string,
  percent: number,
  message?: string,
) => void | Promise<void>;

/* =========================================================
   DEFAULT STATE
========================================================= */

const DEFAULT_STATE: SecurityState = {
  mode: "normal",
  quiet: false,
  securityPaused: false,
  events: [],
  evidence: [],
  snapshots: [],
};

/* =========================================================
   ID HELPERS
========================================================= */

function createId(
  prefix: string,
): string {
  return (
    `${prefix}-${Date.now()
      .toString(36)
      .toUpperCase()}-${crypto
      .randomBytes(3)
      .toString("hex")
      .toUpperCase()}`
  );
}

/* =========================================================
   LIMIT HELPERS
========================================================= */

function normalizeLimit(
  value: number,
  fallback = DEFAULT_LIMIT,
): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(
    MAX_QUERY_LIMIT,
    Math.max(
      1,
      Math.floor(value),
    ),
  );
}

/* =========================================================
   STATE NORMALIZATION
========================================================= */

function isSecurityMode(
  value: unknown,
): value is SecurityMode {
  return (
    value === "normal" ||
    value === "lockdown" ||
    value === "failsafe" ||
    value === "maintenance"
  );
}

function normalizeState(
  input: Partial<SecurityState> | null | undefined,
): SecurityState {
  return {
    mode:
      isSecurityMode(input?.mode)
        ? input.mode
        : "normal",

    quiet:
      typeof input?.quiet === "boolean"
        ? input.quiet
        : false,

    securityPaused:
      typeof input?.securityPaused === "boolean"
        ? input.securityPaused
        : false,

    events:
      Array.isArray(input?.events)
        ? input.events.filter(
            (event): event is SecurityEvent =>
              Boolean(
                event &&
                typeof event === "object" &&
                typeof event.id === "string" &&
                typeof event.timestamp === "string" &&
                typeof event.type === "string" &&
                typeof event.command === "string" &&
                typeof event.status === "string" &&
                Array.isArray(event.details),
              ),
          )
        : [],

    evidence:
      Array.isArray(input?.evidence)
        ? input.evidence.filter(
            (item): item is SecurityEvidence =>
              Boolean(
                item &&
                typeof item === "object" &&
                typeof item.id === "string" &&
                typeof item.timestamp === "string" &&
                typeof item.type === "string" &&
                typeof item.source === "string" &&
                Array.isArray(item.details),
              ),
          )
        : [],

    snapshots:
      Array.isArray(input?.snapshots)
        ? input.snapshots.filter(
            (snapshot): snapshot is SecuritySnapshot =>
              Boolean(
                snapshot &&
                typeof snapshot === "object" &&
                typeof snapshot.id === "string" &&
                typeof snapshot.timestamp === "string" &&
                isSecurityMode(snapshot.mode),
              ),
          )
        : [],
  };
}

/* =========================================================
   FILE HELPERS
========================================================= */

async function ensureStorage(): Promise<void> {
  await fs.mkdir(
    DATA_DIR,
    {
      recursive: true,
    },
  );

  try {
    await fs.access(
      SECURITY_FILE,
    );
  } catch {
    await fs.writeFile(
      SECURITY_FILE,
      JSON.stringify(
        DEFAULT_STATE,
        null,
        2,
      ),
      "utf8",
    );
  }
}

async function readState(): Promise<SecurityState> {
  await ensureStorage();

  try {
    const raw =
      await fs.readFile(
        SECURITY_FILE,
        "utf8",
      );

    const parsed =
      JSON.parse(
        raw,
      ) as Partial<SecurityState>;

    return normalizeState(
      parsed,
    );
  } catch {
    return {
      ...DEFAULT_STATE,
      events: [],
      evidence: [],
      snapshots: [],
    };
  }
}

async function writeState(
  state: SecurityState,
): Promise<void> {
  await ensureStorage();

  const normalized =
    normalizeState(
      state,
    );

  await fs.writeFile(
    SECURITY_FILE,
    JSON.stringify(
      normalized,
      null,
      2,
    ),
    "utf8",
  );
}

/* =========================================================
   LIMIT STORAGE
========================================================= */

function trimState(
  state: SecurityState,
): SecurityState {
  if (
    state.events.length >
    MAX_EVENTS
  ) {
    state.events =
      state.events.slice(
        -MAX_EVENTS,
      );
  }

  if (
    state.evidence.length >
    MAX_EVIDENCE
  ) {
    state.evidence =
      state.evidence.slice(
        -MAX_EVIDENCE,
      );
  }

  if (
    state.snapshots.length >
    MAX_SNAPSHOTS
  ) {
    state.snapshots =
      state.snapshots.slice(
        -MAX_SNAPSHOTS,
      );
  }

  return state;
}

/* =========================================================
   EVENT LOGGING
========================================================= */

export async function recordSecurityEvent(
  type: string,
  command: string,
  details: string[] = [],
  options?: {
    sender?: string;
    jid?: string;
    target?: string;
    status?: SecurityEventStatus;
  },
): Promise<SecurityEvent> {
  const state =
    await readState();

  const event: SecurityEvent = {
    id:
      createId("SEC"),

    timestamp:
      new Date().toISOString(),

    type:
      type.trim() ||
      "SECURITY",

    command:
      command.trim() ||
      "unknown",

    sender:
      options?.sender,

    jid:
      options?.jid,

    target:
      options?.target,

    status:
      options?.status ??
      "info",

    details:
      Array.isArray(details)
        ? details.map(
            (item) =>
              String(item),
          )
        : [],
  };

  state.events.push(
    event,
  );

  await writeState(
    trimState(state),
  );

  return event;
}

/* =========================================================
   EVIDENCE
========================================================= */

export async function recordEvidence(
  type: string,
  source: string,
  details: string[],
): Promise<SecurityEvidence> {
  const state =
    await readState();

  const evidence: SecurityEvidence = {
    id:
      createId("EVD"),

    timestamp:
      new Date().toISOString(),

    type:
      type.trim() ||
      "SECURITY",

    source:
      source.trim() ||
      "local",

    details:
      Array.isArray(details)
        ? details.map(
            (item) =>
              String(item),
          )
        : [],
  };

  state.evidence.push(
    evidence,
  );

  await writeState(
    trimState(state),
  );

  return evidence;
}

/* =========================================================
   STATE ACCESS
========================================================= */

export async function getSecurityState(): Promise<SecurityState> {
  return readState();
}

export async function getSecurityMode(): Promise<SecurityMode> {
  const state =
    await readState();

  return state.mode;
}

/* =========================================================
   MODE
========================================================= */

export async function setSecurityMode(
  mode: SecurityMode,
): Promise<void> {
  const state =
    await readState();

  const previousMode =
    state.mode;

  state.mode =
    mode;

  await writeState(
    trimState(state),
  );

  if (
    previousMode !==
    mode
  ) {
    await recordSecurityEvent(
      "MODE_CHANGE",
      "security-mode",
      [
        `Security mode changed from ${previousMode} to ${mode}.`,
      ],
      {
        status: "success",
      },
    );
  }
}

export async function isLockdown(): Promise<boolean> {
  return (
    await getSecurityMode()
  ) === "lockdown";
}

export async function isFailsafe(): Promise<boolean> {
  return (
    await getSecurityMode()
  ) === "failsafe";
}

export async function isMaintenance(): Promise<boolean> {
  return (
    await getSecurityMode()
  ) === "maintenance";
}

/* =========================================================
   QUIET
========================================================= */

export async function isQuiet(): Promise<boolean> {
  const state =
    await readState();

  return state.quiet;
}

export async function setQuiet(
  enabled: boolean,
): Promise<void> {
  const state =
    await readState();

  const previous =
    state.quiet;

  state.quiet =
    enabled;

  await writeState(
    trimState(state),
  );

  if (
    previous !==
    enabled
  ) {
    await recordSecurityEvent(
      "QUIET_MODE",
      "quiet",
      [
        enabled
          ? "Non-critical security notifications suppressed."
          : "Security notifications restored.",
      ],
      {
        status: "success",
      },
    );
  }
}

/* =========================================================
   SECURITY PAUSE
========================================================= */

export async function isSecurityPaused(): Promise<boolean> {
  const state =
    await readState();

  return state.securityPaused;
}

export async function setSecurityPaused(
  paused: boolean,
): Promise<void> {
  const state =
    await readState();

  const previous =
    state.securityPaused;

  state.securityPaused =
    paused;

  await writeState(
    trimState(state),
  );

  if (
    previous !==
    paused
  ) {
    await recordSecurityEvent(
      "SECURITY_PAUSE",
      "securitypause",
      [
        paused
          ? "Security intelligence automation paused."
          : "Security intelligence automation resumed.",
      ],
      {
        status: "success",
      },
    );
  }
}

/* =========================================================
   SUMMARY
========================================================= */

export async function getSecuritySummary(): Promise<SecuritySummary> {
  const state =
    await readState();

  let successfulEvents = 0;
  let failedEvents = 0;
  let cancelledEvents = 0;
  let blockedEvents = 0;
  let informationalEvents = 0;

  for (
    const event of state.events
  ) {
    switch (
      event.status
    ) {
      case "success":
        successfulEvents++;
        break;

      case "failed":
        failedEvents++;
        break;

      case "cancelled":
        cancelledEvents++;
        break;

      case "blocked":
        blockedEvents++;
        break;

      case "info":
      default:
        informationalEvents++;
        break;
    }
  }

  return {
    mode:
      state.mode,

    quiet:
      state.quiet,

    securityPaused:
      state.securityPaused,

    totalEvents:
      state.events.length,

    successfulEvents,

    failedEvents,

    cancelledEvents,

    blockedEvents,

    informationalEvents,

    totalEvidence:
      state.evidence.length,

    totalSnapshots:
      state.snapshots.length,

    latestEvent:
      state.events.length > 0
        ? state.events[
            state.events.length - 1
          ]
        : null,

    latestEvidence:
      state.evidence.length > 0
        ? state.evidence[
            state.evidence.length - 1
          ]
        : null,

    latestSnapshot:
      state.snapshots.length > 0
        ? state.snapshots[
            state.snapshots.length - 1
          ]
        : null,
  };
}

/* =========================================================
   SECURITY POSTURE
========================================================= */

export async function getSecurityPosture(): Promise<SecurityPosture> {
  const summary =
    await getSecuritySummary();

  let level:
    SecurityPosture["level"] =
      "NORMAL";

  let description =
    "Security systems are operating normally.";

  if (
    summary.mode ===
    "lockdown"
  ) {
    level =
      "RESTRICTED";

    description =
      "Non-essential operations are restricted by security lockdown.";
  } else if (
    summary.mode ===
    "failsafe"
  ) {
    level =
      "ELEVATED";

    description =
      "Conservative failsafe operating mode is active.";
  } else if (
    summary.mode ===
    "maintenance"
  ) {
    level =
      "RESTRICTED";

    description =
      "Bot maintenance mode is active.";
  } else if (
    summary.securityPaused
  ) {
    level =
      "ELEVATED";

    description =
      "Security intelligence automation is temporarily paused.";
  } else if (
    summary.failedEvents >=
    5
  ) {
    level =
      "ELEVATED";

    description =
      "Recent security operations contain multiple failures.";
  } else if (
    summary.blockedEvents >=
    5
  ) {
    level =
      "ELEVATED";

    description =
      "Multiple security operations have been blocked.";
  }

  return {
    mode:
      summary.mode,

    level,

    quiet:
      summary.quiet,

    securityPaused:
      summary.securityPaused,

    eventCount:
      summary.totalEvents,

    failedEvents:
      summary.failedEvents,

    blockedEvents:
      summary.blockedEvents,

    description,
  };
}

/* =========================================================
   COMMAND GATE
========================================================= */

const ALWAYS_ALLOWED_SECURITY_COMMANDS =
  new Set<string>([
    "normal",
    "recovery",
    "securitytest",
    "snapshot",
    "audit",
    "audituser",
    "auditgroup",
    "timeline",
    "event",
    "evidence",
    "snapshots",
    "securitypause",
    "quiet",
    "failsafe",
    "lockdown",
    "maintenance",
  ]);

export async function isSecurityCommandAllowed(
  command: string,
): Promise<SecurityCommandGate> {
  const normalized =
    command
      .trim()
      .toLowerCase();

  const state =
    await readState();

  if (
    ALWAYS_ALLOWED_SECURITY_COMMANDS.has(
      normalized,
    )
  ) {
    return {
      allowed: true,
    };
  }

  if (
    state.mode ===
    "lockdown"
  ) {
    return {
      allowed: false,
      reason:
        "Security lockdown is active. This command is currently restricted.",
    };
  }

  if (
    state.mode ===
    "failsafe"
  ) {
    return {
      allowed: false,
      reason:
        "Failsafe mode is active. Non-essential security-sensitive operations are restricted.",
    };
  }

  if (
    state.mode ===
    "maintenance"
  ) {
    return {
      allowed: false,
      reason:
        "Maintenance mode is active. Non-essential operations are restricted.",
    };
  }

  return {
    allowed: true,
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

export async function createSecuritySnapshot(): Promise<SecuritySnapshot> {
  const state =
    await readState();

  const memory =
    process.memoryUsage();

  const snapshot: SecuritySnapshot = {
    id:
      createId("SNP"),

    timestamp:
      new Date().toISOString(),

    mode:
      state.mode,

    quiet:
      state.quiet,

    securityPaused:
      state.securityPaused,

    lockdown:
      state.mode ===
      "lockdown",

    failsafe:
      state.mode ===
      "failsafe",

    maintenance:
      state.mode ===
      "maintenance",

    uptimeSeconds:
      Math.floor(
        process.uptime(),
      ),

    memoryRssMB:
      Number(
        (
          memory.rss /
          1024 /
          1024
        ).toFixed(1),
      ),

    heapUsedMB:
      Number(
        (
          memory.heapUsed /
          1024 /
          1024
        ).toFixed(1),
      ),

    platform:
      process.platform,

    node:
      process.version,

    eventCount:
      state.events.length,

    evidenceCount:
      state.evidence.length,
  };

  state.snapshots.push(
    snapshot,
  );

  await writeState(
    trimState(state),
  );

  return snapshot;
}

/* =========================================================
   SNAPSHOTS
========================================================= */

export async function getSnapshots(
  limit = DEFAULT_LIMIT,
): Promise<SecuritySnapshot[]> {
  const state =
    await readState();

  const safeLimit =
    normalizeLimit(
      limit,
    );

  return state.snapshots
    .slice(
      -safeLimit,
    )
    .reverse();
}

/* =========================================================
   EVENTS
========================================================= */

export async function getSecurityEvents(
  limit = DEFAULT_LIMIT,
): Promise<SecurityEvent[]> {
  const state =
    await readState();

  const safeLimit =
    normalizeLimit(
      limit,
    );

  return state.events
    .slice(
      -safeLimit,
    )
    .reverse();
}

export async function getSecurityEvent(
  id: string,
): Promise<SecurityEvent | null> {
  const state =
    await readState();

  const normalized =
    id.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return (
    state.events.find(
      (event) =>
        event.id
          .toLowerCase() ===
        normalized,
    ) ??
    null
  );
}

/* =========================================================
   LATEST EVENT
========================================================= */

export async function getLatestSecurityEvent(): Promise<SecurityEvent | null> {
  const state =
    await readState();

  if (
    state.events.length ===
    0
  ) {
    return null;
  }

  return state.events[
    state.events.length - 1
  ];
}

/* =========================================================
   EVIDENCE
========================================================= */

export async function getSecurityEvidence(
  limit = DEFAULT_LIMIT,
): Promise<SecurityEvidence[]> {
  const state =
    await readState();

  const safeLimit =
    normalizeLimit(
      limit,
    );

  return state.evidence
    .slice(
      -safeLimit,
    )
    .reverse();
}

/* =========================================================
   EVIDENCE LOOKUP
========================================================= */

export async function getSecurityEvidenceItem(
  id: string,
): Promise<SecurityEvidence | null> {
  const state =
    await readState();

  const normalized =
    id.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return (
    state.evidence.find(
      (item) =>
        item.id
          .toLowerCase() ===
        normalized,
    ) ??
    null
  );
}

/* =========================================================
   USER AUDIT
========================================================= */

export async function auditUser(
  target: string,
  limit = 50,
): Promise<SecurityEvent[]> {
  const state =
    await readState();

  const normalized =
    target
      .trim()
      .toLowerCase();

  if (!normalized) {
    return [];
  }

  const safeLimit =
    normalizeLimit(
      limit,
      50,
    );

  return state.events
    .filter(
      (event) =>
        event.sender
          ?.toLowerCase() ===
          normalized ||
        event.target
          ?.toLowerCase() ===
          normalized,
    )
    .slice(
      -safeLimit,
    )
    .reverse();
}

/* =========================================================
   GROUP AUDIT
========================================================= */

export async function auditGroup(
  jid: string,
  limit = 50,
): Promise<SecurityEvent[]> {
  const state =
    await readState();

  const normalized =
    jid.trim().toLowerCase();

  if (!normalized) {
    return [];
  }

  const safeLimit =
    normalizeLimit(
      limit,
      50,
    );

  return state.events
    .filter(
      (event) =>
        event.jid
          ?.toLowerCase() ===
        normalized,
    )
    .slice(
      -safeLimit,
    )
    .reverse();
}

/* =========================================================
   TIMELINE
========================================================= */

export async function getSecurityTimeline(
  limit = DEFAULT_LIMIT,
): Promise<SecurityEvent[]> {
  return getSecurityEvents(
    limit,
  );
}

/* =========================================================
   EVENT TYPE FILTER
========================================================= */

export async function getSecurityEventsByType(
  type: string,
  limit = DEFAULT_LIMIT,
): Promise<SecurityEvent[]> {
  const state =
    await readState();

  const normalized =
    type.trim().toLowerCase();

  if (!normalized) {
    return [];
  }

  const safeLimit =
    normalizeLimit(
      limit,
    );

  return state.events
    .filter(
      (event) =>
        event.type
          .toLowerCase() ===
        normalized,
    )
    .slice(
      -safeLimit,
    )
    .reverse();
}

/* =========================================================
   COMMAND FILTER
========================================================= */

export async function getSecurityEventsByCommand(
  command: string,
  limit = DEFAULT_LIMIT,
): Promise<SecurityEvent[]> {
  const state =
    await readState();

  const normalized =
    command
      .trim()
      .toLowerCase();

  if (!normalized) {
    return [];
  }

  const safeLimit =
    normalizeLimit(
      limit,
    );

  return state.events
    .filter(
      (event) =>
        event.command
          .toLowerCase() ===
        normalized,
    )
    .slice(
      -safeLimit,
    )
    .reverse();
}

/* =========================================================
   AUDIT RANGE
========================================================= */

export async function getSecurityEventsSince(
  timestamp: string,
  limit = MAX_QUERY_LIMIT,
): Promise<SecurityEvent[]> {
  const state =
    await readState();

  const date =
    new Date(
      timestamp,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return [];
  }

  const safeLimit =
    normalizeLimit(
      limit,
      MAX_QUERY_LIMIT,
    );

  return state.events
    .filter(
      (event) =>
        new Date(
          event.timestamp,
        ).getTime() >=
        date.getTime(),
    )
    .slice(
      -safeLimit,
    )
    .reverse();
}

/* =========================================================
   SECURITY TESTS
========================================================= */

export async function runSecurityTests(): Promise<{
  passed: number;
  failed: number;
  checks: Array<{
    name: string;
    status: "PASS" | "FAIL";
    details: string;
  }>;
}> {
  const checks: Array<{
    name: string;
    status: "PASS" | "FAIL";
    details: string;
  }> = [];

  let passed = 0;
  let failed = 0;

  /* -------------------------------------------------------
     STORAGE
  ------------------------------------------------------- */

  try {
    await ensureStorage();

    const state =
      await readState();

    if (
      !Array.isArray(
        state.events,
      ) ||
      !Array.isArray(
        state.evidence,
      ) ||
      !Array.isArray(
        state.snapshots,
      )
    ) {
      throw new Error(
        "Security state structure invalid.",
      );
    }

    checks.push({
      name:
        "Security storage",

      status:
        "PASS",

      details:
        "Persistent security storage is readable.",
    });

    passed++;
  } catch (err) {
    checks.push({
      name:
        "Security storage",

      status:
        "FAIL",

      details:
        err instanceof Error
          ? err.message
          : "Storage test failed.",
    });

    failed++;
  }

  /* -------------------------------------------------------
     RUNTIME
  ------------------------------------------------------- */

  try {
    const uptime =
      process.uptime();

    if (
      !Number.isFinite(
        uptime,
      ) ||
      uptime < 0
    ) {
      throw new Error(
        "Invalid process uptime.",
      );
    }

    checks.push({
      name:
        "Runtime",

      status:
        "PASS",

      details:
        "Node.js runtime is responding normally.",
    });

    passed++;
  } catch (err) {
    checks.push({
      name:
        "Runtime",

      status:
        "FAIL",

      details:
        err instanceof Error
          ? err.message
          : "Runtime test failed.",
    });

    failed++;
  }

  /* -------------------------------------------------------
     MEMORY
  ------------------------------------------------------- */

  try {
    const memory =
      process.memoryUsage();

    if (
      memory.rss <= 0 ||
      memory.heapUsed < 0
    ) {
      throw new Error(
        "Invalid memory metrics.",
      );
    }

    checks.push({
      name:
        "Memory telemetry",

      status:
        "PASS",

      details:
        `${(
          memory.rss /
          1024 /
          1024
        ).toFixed(1)} MB RSS.`,
    });

    passed++;
  } catch (err) {
    checks.push({
      name:
        "Memory telemetry",

      status:
        "FAIL",

      details:
        err instanceof Error
          ? err.message
          : "Memory test failed.",
    });

    failed++;
  }

  /* -------------------------------------------------------
     HOST
  ------------------------------------------------------- */

  try {
    const hostname =
      os.hostname();

    if (!hostname) {
      throw new Error(
        "Hostname unavailable.",
      );
    }

    checks.push({
      name:
        "Host runtime",

      status:
        "PASS",

      details:
        "Host runtime is available.",
    });

    passed++;
  } catch (err) {
    checks.push({
      name:
        "Host runtime",

      status:
        "FAIL",

      details:
        err instanceof Error
          ? err.message
          : "Host runtime check failed.",
    });

    failed++;
  }

  /* -------------------------------------------------------
     PREFIX
  ------------------------------------------------------- */

  try {
    const prefix =
      getPrefix();

    if (
      typeof prefix !==
        "string" ||
      prefix.length ===
        0
    ) {
      throw new Error(
        "Command prefix unavailable.",
      );
    }

    checks.push({
      name:
        "Command prefix",

      status:
        "PASS",

      details:
        `Active prefix: ${prefix}`,
    });

    passed++;
  } catch (err) {
    checks.push({
      name:
        "Command prefix",

      status:
        "FAIL",

      details:
        err instanceof Error
          ? err.message
          : "Command prefix test failed.",
    });

    failed++;
  }

  /* -------------------------------------------------------
     SECURITY MODE
  ------------------------------------------------------- */

  try {
    const mode =
      await getSecurityMode();

    if (
      !isSecurityMode(
        mode,
      )
    ) {
      throw new Error(
        "Invalid security mode.",
      );
    }

    checks.push({
      name:
        "Security mode",

      status:
        "PASS",

      details:
        `Current mode: ${mode}.`,
    });

    passed++;
  } catch (err) {
    checks.push({
      name:
        "Security mode",

      status:
        "FAIL",

      details:
        err instanceof Error
          ? err.message
          : "Security mode test failed.",
    });

    failed++;
  }

  /* -------------------------------------------------------
     POSTURE
  ------------------------------------------------------- */

  try {
    const posture =
      await getSecurityPosture();

    if (
      !posture.level ||
      !posture.description
    ) {
      throw new Error(
        "Security posture unavailable.",
      );
    }

    checks.push({
      name:
        "Security posture",

      status:
        "PASS",

      details:
        `Posture: ${posture.level}.`,
    });

    passed++;
  } catch (err) {
    checks.push({
      name:
        "Security posture",

      status:
        "FAIL",

      details:
        err instanceof Error
          ? err.message
          : "Security posture test failed.",
    });

    failed++;
  }

  /* -------------------------------------------------------
     EVENT INTEGRITY
  ------------------------------------------------------- */

  try {
    const state =
      await readState();

    const invalid =
      state.events.filter(
        (event) =>
          !event.id ||
          !event.timestamp ||
          !event.command ||
          !event.type,
      );

    if (
      invalid.length >
      0
    ) {
      throw new Error(
        `${invalid.length} malformed security event(s).`,
      );
    }

    checks.push({
      name:
        "Event integrity",

      status:
        "PASS",

      details:
        `${state.events.length} stored event(s) validated.`,
    });

    passed++;
  } catch (err) {
    checks.push({
      name:
        "Event integrity",

      status:
        "FAIL",

      details:
        err instanceof Error
          ? err.message
          : "Event integrity test failed.",
    });

    failed++;
  }

  /* -------------------------------------------------------
     SNAPSHOT INTEGRITY
  ------------------------------------------------------- */

  try {
    const state =
      await readState();

    const invalid =
      state.snapshots.filter(
        (snapshot) =>
          !snapshot.id ||
          !snapshot.timestamp ||
          !isSecurityMode(
            snapshot.mode,
          ),
      );

    if (
      invalid.length >
      0
    ) {
      throw new Error(
        `${invalid.length} malformed snapshot(s).`,
      );
    }

    checks.push({
      name:
        "Snapshot integrity",

      status:
        "PASS",

      details:
        `${state.snapshots.length} stored snapshot(s) validated.`,
    });

    passed++;
  } catch (err) {
    checks.push({
      name:
        "Snapshot integrity",

      status:
        "FAIL",

      details:
        err instanceof Error
          ? err.message
          : "Snapshot integrity test failed.",
    });

    failed++;
  }

  return {
    passed,
    failed,
    checks,
  };
}

/* =========================================================
   RESTORE NORMAL
========================================================= */

export async function restoreNormalMode(): Promise<void> {
  const state =
    await readState();

  const previousMode =
    state.mode;

  const wasQuiet =
    state.quiet;

  const wasSecurityPaused =
    state.securityPaused;

  state.mode =
    "normal";

  state.quiet =
    false;

  state.securityPaused =
    false;

  await writeState(
    trimState(state),
  );

  if (
    previousMode !== "normal" ||
    wasQuiet ||
    wasSecurityPaused
  ) {
    await recordSecurityEvent(
      "NORMAL_MODE",
      "normal",
      [
        `Security mode restored from ${previousMode} to normal.`,
      ],
      {
        status: "success",
      },
    );
  }
}

/* =========================================================
   RESET SECURITY STATE
========================================================= */

export async function resetSecurityState(): Promise<void> {
  await writeState({
    ...DEFAULT_STATE,
    events: [],
    evidence: [],
    snapshots: [],
  });
}

/* =========================================================
   DATABASE COUNTS
========================================================= */

export async function getSecurityCounts(): Promise<{
  events: number;
  evidence: number;
  snapshots: number;
}> {
  const state =
    await readState();

  return {
    events:
      state.events.length,

    evidence:
      state.evidence.length,

    snapshots:
      state.snapshots.length,
  };
}

/* =========================================================
   COMMAND DESCRIPTION
========================================================= */

export function securityUsage(
  command: string,
): string {
  return `${getPrefix()}${command}`;
}

/* =========================================================
   EXPORTS
========================================================= */

export {
  SECURITY_FILE,
  DATA_DIR,
};

