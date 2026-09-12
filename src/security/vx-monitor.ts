/* =========================================================
   🌑 DARK VORTEX — VX MONITOR
   ⚡ Live Security Monitoring & Telemetry
   ⚡ Powered by Vortex Tech

   Responsibilities:
   - Maintain live VX monitoring sessions
   - One active monitor per group
   - Preserve accurate progress reporting
   - Track processed events
   - Track detected threats
   - Track created incidents
   - Track latest detection telemetry
   - Provide monitor telemetry to the VX system
   - Safely handle lifecycle/shutdown
   - Bound historical monitor memory

   Monitor architecture:

   Start Monitor
        ↓
   INITIALIZING
        ↓
      10%
        ↓
   CONFIGURING
        ↓
      30%
        ↓
   BEHAVIOR_MONITORING
        ↓
      50%
        ↓
   THREAT_ANALYSIS
        ↓
      70%
        ↓
   FINALIZING
        ↓
      90%
        ↓
      ACTIVE
       100%

========================================================= */

import { randomUUID } from "node:crypto";

import type {
  VxGroupContext,
  VxMonitorSession,
} from "./vx-types.js";

import {
  logVxEvent,
} from "./vx-logger.js";

/* =========================================================
   TYPES
========================================================= */

export interface VxMonitorProgress {
  progress: number;
  stage: string;
  message: string;
}

export type VxMonitorProgressCallback = (
  progress: VxMonitorProgress,
) => void | Promise<void>;

export interface VxMonitorDetectionOptions {
  threat?: boolean;
  incident?: boolean;
  eventId?: string;
  severity?: string;
  riskScore?: number;
  actorJid?: string;
  reason?: string;
}

export interface VxMonitorTelemetry {
  monitorId: string;
  groupId: string;
  groupName: string;

  active: boolean;

  startedAt: number;
  stoppedAt?: number;

  eventsProcessed: number;
  threatsDetected: number;
  incidentsCreated: number;

  lastEventAt?: number;
  lastDetectionAt?: number;
  lastEventId?: string;

  lastSeverity?: string;
  lastRiskScore?: number;
  lastActorJid?: string;
  lastReason?: string;

  durationMs: number;
}

/* =========================================================
   INTERNAL STATE
========================================================= */

const monitors =
  new Map<
    string,
    VxMonitorSession
  >();

const monitorByGroup =
  new Map<
    string,
    string
  >();

/*
 * Prevent concurrent start operations from creating
 * duplicate active monitors for the same group.
 */
const startingGroups =
  new Set<string>();

/* =========================================================
   CONFIGURATION
========================================================= */

const MAX_MONITOR_HISTORY =
  500;

/* =========================================================
   HELPERS
========================================================= */

function clampProgress(
  value: number,
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(value),
    ),
  );
}

function clampCounter(
  value: unknown,
): number {
  const parsed =
    Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed < 0
  ) {
    return 0;
  }

  return Math.floor(parsed);
}

function clampRiskScore(
  value: unknown,
): number | undefined {
  const parsed =
    Number(value);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(parsed),
    ),
  );
}

function safeNumber(
  value: unknown,
  fallback = 0,
): number {
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function normalizeGroupId(
  groupId: string,
): string {
  const normalized =
    String(
      groupId || "",
    )
      .trim()
      .toLowerCase();

  if (!normalized) {
    return "";
  }

  /*
   * WhatsApp group identifiers should remain stable.
   * Only strip device/resource suffixes when present.
   */
  return normalized
    .split(":")[0]
    .trim();
}

function safeGroupName(
  group: VxGroupContext,
): string {
  return (
    String(
      group.name || "",
    ).trim() ||
    "Unknown Group"
  );
}

function createProgress(
  progress: number,
  stage: string,
  message: string,
): VxMonitorProgress {
  return {
    progress:
      clampProgress(
        progress,
      ),

    stage:
      String(
        stage || "UNKNOWN",
      )
        .trim()
        .toUpperCase(),

    message:
      String(
        message || "",
      ).trim(),
  };
}

async function emitProgress(
  callback:
    | VxMonitorProgressCallback
    | undefined,
  progress: number,
  stage: string,
  message: string,
): Promise<void> {
  if (!callback) {
    return;
  }

  try {
    await callback(
      createProgress(
        progress,
        stage,
        message,
      ),
    );
  } catch (error) {
    /*
     * Progress UI must never stop the
     * underlying security subsystem.
     */
    console.error(
      "[VX] Monitor progress callback failed:",
      error,
    );
  }
}

/* =========================================================
   INTERNAL COUNTER NORMALIZATION
========================================================= */

function normalizeMonitorCounters(
  monitor: VxMonitorSession,
): void {
  monitor.eventsProcessed =
    clampCounter(
      monitor.eventsProcessed,
    );

  monitor.threatsDetected =
    clampCounter(
      monitor.threatsDetected,
    );

  monitor.incidentsCreated =
    clampCounter(
      monitor.incidentsCreated,
    );
}

/* =========================================================
   RETENTION
========================================================= */

function enforceMonitorRetention(): void {
  if (
    monitors.size <=
    MAX_MONITOR_HISTORY
  ) {
    return;
  }

  const inactive =
    Array.from(
      monitors.entries(),
    )
      .filter(
        ([, monitor]) =>
          !monitor.active,
      )
      .sort(
        (
          [, a],
          [, b],
        ) =>
          (
            a.stoppedAt ||
            a.startedAt
          ) -
          (
            b.stoppedAt ||
            b.startedAt
          ),
      );

  let removeCount =
    Math.max(
      0,
      monitors.size -
        MAX_MONITOR_HISTORY,
    );

  for (
    const [
      monitorId,
      monitor,
    ] of inactive
  ) {
    if (
      removeCount <=
      0
    ) {
      break;
    }

    monitors.delete(
      monitorId,
    );

    /*
     * Defensive cleanup in case a stale
     * group mapping still references this ID.
     */
    if (
      monitorByGroup.get(
        monitor.groupId,
      ) === monitorId
    ) {
      monitorByGroup.delete(
        monitor.groupId,
      );
    }

    removeCount--;
  }
}

/* =========================================================
   FIND ACTIVE MONITOR
========================================================= */

export function getVxMonitorByGroup(
  groupId: string,
): VxMonitorSession | undefined {
  const normalizedGroupId =
    normalizeGroupId(
      groupId,
    );

  if (!normalizedGroupId) {
    return undefined;
  }

  const monitorId =
    monitorByGroup.get(
      normalizedGroupId,
    );

  if (!monitorId) {
    return undefined;
  }

  const monitor =
    monitors.get(
      monitorId,
    );

  if (
    !monitor ||
    !monitor.active
  ) {
    monitorByGroup.delete(
      normalizedGroupId,
    );

    return undefined;
  }

  normalizeMonitorCounters(
    monitor,
  );

  return monitor;
}

/* =========================================================
   START MONITOR
========================================================= */

export async function startVxMonitor(
  group: VxGroupContext,
  onProgress?: VxMonitorProgressCallback,
): Promise<VxMonitorSession> {
  const groupId =
    normalizeGroupId(
      group.jid,
    );

  if (!groupId) {
    throw new Error(
      "VX monitor requires a valid group identifier.",
    );
  }

  /*
   * Existing active monitor wins immediately.
   */
  const existing =
    getVxMonitorByGroup(
      groupId,
    );

  if (existing) {
    await emitProgress(
      onProgress,
      100,
      "ALREADY_ACTIVE",
      "VX monitoring is already active for this group.",
    );

    return existing;
  }

  /*
   * Protect against concurrent start calls for
   * the same group.
   */
  if (
    startingGroups.has(
      groupId,
    )
  ) {
    /*
     * Wait only for the current start operation to
     * complete through event-loop turns. No artificial
     * timer is introduced.
     */
    for (;;) {
      const active =
        getVxMonitorByGroup(
          groupId,
        );

      if (active) {
        await emitProgress(
          onProgress,
          100,
          "ACTIVE",
          "Dark Vortex security monitoring is now active.",
        );

        return active;
      }

      if (
        !startingGroups.has(
          groupId,
        )
      ) {
        break;
      }

      await Promise.resolve();
    }

    const retry =
      getVxMonitorByGroup(
        groupId,
      );

    if (retry) {
      return retry;
    }
  }

  startingGroups.add(
    groupId,
  );

  let monitor:
    | VxMonitorSession
    | undefined;

  try {
    /* =======================================================
       INITIALIZATION
    ======================================================= */

    await emitProgress(
      onProgress,
      10,
      "INITIALIZING",
      "Initializing Dark Vortex security monitor...",
    );

    monitor =
      {
        id:
          randomUUID(),

        groupId,

        groupName:
          safeGroupName(
            group,
          ),

        startedAt:
          Date.now(),

        active:
          false,

        eventsProcessed:
          0,

        threatsDetected:
          0,

        incidentsCreated:
          0,

        metadata: {
          progress:
            10,

          stage:
            "INITIALIZING",

          groupParticipantCount:
            clampCounter(
              group.participantCount,
            ),
        },
      };

    monitors.set(
      monitor.id,
      monitor,
    );

    monitorByGroup.set(
      groupId,
      monitor.id,
    );

    /* =======================================================
       CONFIGURATION
    ======================================================= */

    await emitProgress(
      onProgress,
      30,
      "CONFIGURING",
      "Loading VX behavioral monitoring configuration...",
    );

    monitor.metadata = {
      ...(monitor.metadata || {}),

      progress:
        30,

      stage:
        "CONFIGURING",
    };

    /* =======================================================
       BEHAVIORAL MONITORING
    ======================================================= */

    await emitProgress(
      onProgress,
      50,
      "BEHAVIOR_MONITORING",
      "Activating behavioral telemetry...",
    );

    monitor.metadata = {
      ...(monitor.metadata || {}),

      progress:
        50,

      stage:
        "BEHAVIOR_MONITORING",
    };

    /* =======================================================
       THREAT ANALYSIS
    ======================================================= */

    await emitProgress(
      onProgress,
      70,
      "THREAT_ANALYSIS",
      "Activating threat and anomaly analysis...",
    );

    monitor.metadata = {
      ...(monitor.metadata || {}),

      progress:
        70,

      stage:
        "THREAT_ANALYSIS",
    };

    /* =======================================================
       FINAL VERIFICATION
    ======================================================= */

    await emitProgress(
      onProgress,
      90,
      "FINALIZING",
      "Finalizing VX monitoring subsystem...",
    );

    monitor.metadata = {
      ...(monitor.metadata || {}),

      progress:
        90,

      stage:
        "FINALIZING",
    };

    /* =======================================================
       ACTIVE
    ======================================================= */

    monitor.active =
      true;

    monitor.metadata = {
      ...(monitor.metadata || {}),

      progress:
        100,

      stage:
        "ACTIVE",

      activatedAt:
        Date.now(),
    };

    await emitProgress(
      onProgress,
      100,
      "ACTIVE",
      "Dark Vortex security monitoring is now active.",
    );

    /* =======================================================
       AUDIT EVENT
    ======================================================= */

    try {
      await logVxEvent({
        id:
          randomUUID(),

        timestamp:
          Date.now(),

        type:
          "MONITOR",

        group,

        reason:
          "VX monitoring session initialized and activated.",

        indicators: [
          "MONITOR_STARTED",
        ],

        action:
          "LOG",

        monitorId:
          monitor.id,

        metadata: {
          progress:
            100,

          stage:
            "ACTIVE",

          eventsProcessed:
            0,

          threatsDetected:
            0,

          incidentsCreated:
            0,
        },
      });
    } catch (error) {
      console.error(
        "[VX] Failed to log monitor start:",
        error,
      );
    }

    enforceMonitorRetention();

    return monitor;
  } catch (error) {
    /*
     * Never leave a half-created active monitor behind.
     */
    if (monitor) {
      monitor.active =
        false;

      monitor.stoppedAt =
        Date.now();

      monitor.metadata = {
        ...(monitor.metadata || {}),

        progress:
          100,

        stage:
          "FAILED",

        stoppedAt:
          monitor.stoppedAt,

        failure:
          true,
      };

      if (
        monitorByGroup.get(
          groupId,
        ) === monitor.id
      ) {
        monitorByGroup.delete(
          groupId,
        );
      }
    }

    throw error;
  } finally {
    startingGroups.delete(
      groupId,
    );
  }
}

/* =========================================================
   GET MONITOR
========================================================= */

export function getVxMonitor(
  monitorId: string,
): VxMonitorSession | undefined {
  const id =
    String(
      monitorId || "",
    ).trim();

  if (!id) {
    return undefined;
  }

  return monitors.get(
    id,
  );
}

/* =========================================================
   GET ACTIVE MONITORS
========================================================= */

export function getActiveVxMonitors(): VxMonitorSession[] {
  return Array.from(
    monitors.values(),
  ).filter(
    monitor =>
      monitor.active,
  );
}

/* =========================================================
   IS MONITORING
========================================================= */

export function isVxMonitoring(
  groupId: string,
): boolean {
  return Boolean(
    getVxMonitorByGroup(
      groupId,
    ),
  );
}

/* =========================================================
   RECORD EVENT
========================================================= */

export function recordVxEvent(
  groupId: string,
  threat = false,
  incident = false,
): VxMonitorSession | undefined {
  return recordVxDetection(
    groupId,
    {
      threat:
        Boolean(
          threat,
        ),

      incident:
        Boolean(
          incident,
        ),
    },
  );
}

/* =========================================================
   RECORD DETECTION RESULT
========================================================= */

export function recordVxDetection(
  groupId: string,
  options:
    VxMonitorDetectionOptions = {},
): VxMonitorSession | undefined {
  const monitor =
    getVxMonitorByGroup(
      groupId,
    );

  if (!monitor) {
    return undefined;
  }

  normalizeMonitorCounters(
    monitor,
  );

  monitor.eventsProcessed =
    clampCounter(
      monitor.eventsProcessed + 1,
    );

  const threat =
    Boolean(
      options.threat,
    );

  const incident =
    Boolean(
      options.incident,
    );

  if (threat) {
    monitor.threatsDetected =
      clampCounter(
        monitor.threatsDetected + 1,
      );
  }

  if (incident) {
    monitor.incidentsCreated =
      clampCounter(
        monitor.incidentsCreated + 1,
      );
  }

  const now =
    Date.now();

  const riskScore =
    clampRiskScore(
      options.riskScore,
    );

  /*
   * Event time always updates when an event
   * is processed.
   */
  const metadata: Record<
    string,
    unknown
  > = {
    ...(monitor.metadata || {}),

    lastEventAt:
      now,

    lastEventId:
      options.eventId,

    eventsProcessed:
      monitor.eventsProcessed,

    threatsDetected:
      monitor.threatsDetected,

    incidentsCreated:
      monitor.incidentsCreated,
  };

  /*
   * Detection time only changes when an actual
   * detection/threat/incident signal exists.
   */
  if (
    threat ||
    incident ||
    typeof options.eventId ===
      "string" ||
    typeof options.reason ===
      "string"
  ) {
    metadata.lastDetectionAt =
      now;
  }

  if (
    typeof options.severity ===
    "string" &&
    options.severity.trim()
  ) {
    metadata.lastSeverity =
      options.severity
        .trim()
        .toUpperCase();
  }

  if (
    riskScore !==
    undefined
  ) {
    metadata.lastRiskScore =
      riskScore;
  }

  if (
    typeof options.actorJid ===
    "string" &&
    options.actorJid.trim()
  ) {
    metadata.lastActorJid =
      options.actorJid.trim();
  }

  if (
    typeof options.reason ===
    "string" &&
    options.reason.trim()
  ) {
    metadata.lastReason =
      options.reason.trim();
  }

  monitor.metadata =
    metadata;

  return monitor;
}

/* =========================================================
   RECORD THREAT
========================================================= */

export function recordVxThreat(
  groupId: string,
  options:
    Omit<
      VxMonitorDetectionOptions,
      "threat"
    > = {},
): VxMonitorSession | undefined {
  return recordVxDetection(
    groupId,
    {
      ...options,

      threat:
        true,
    },
  );
}

/* =========================================================
   RECORD INCIDENT
========================================================= */

export function recordVxIncident(
  groupId: string,
  options:
    Omit<
      VxMonitorDetectionOptions,
      "incident"
    > = {},
): VxMonitorSession | undefined {
  return recordVxDetection(
    groupId,
    {
      ...options,

      incident:
        true,
    },
  );
}

/* =========================================================
   STOP MONITOR
========================================================= */

export async function stopVxMonitor(
  groupId: string,
): Promise<VxMonitorSession | undefined> {
  const normalizedGroupId =
    normalizeGroupId(
      groupId,
    );

  if (!normalizedGroupId) {
    return undefined;
  }

  const monitor =
    getVxMonitorByGroup(
      normalizedGroupId,
    );

  if (!monitor) {
    return undefined;
  }

  const stoppedAt =
    Date.now();

  monitor.active =
    false;

  monitor.stoppedAt =
    stoppedAt;

  normalizeMonitorCounters(
    monitor,
  );

  monitor.metadata = {
    ...(monitor.metadata || {}),

    progress:
      100,

    stage:
      "STOPPED",

    stoppedAt,

    durationMs:
      Math.max(
        0,
        stoppedAt -
          monitor.startedAt,
      ),
  };

  if (
    monitorByGroup.get(
      normalizedGroupId,
    ) === monitor.id
  ) {
    monitorByGroup.delete(
      normalizedGroupId,
    );
  }

  /* =======================================================
     AUDIT EVENT
  ======================================================= */

  try {
    await logVxEvent({
      id:
        randomUUID(),

      timestamp:
        stoppedAt,

      type:
        "MONITOR",

      group: {
        jid:
          monitor.groupId,

        name:
          monitor.groupName,
      },

      reason:
        "VX monitoring session stopped.",

      indicators: [
        "MONITOR_STOPPED",
      ],

      action:
        "LOG",

      monitorId:
        monitor.id,

      metadata: {
        eventsProcessed:
          monitor.eventsProcessed,

        threatsDetected:
          monitor.threatsDetected,

        incidentsCreated:
          monitor.incidentsCreated,

        durationMs:
          Math.max(
            0,
            stoppedAt -
              monitor.startedAt,
          ),
      },
    });
  } catch (error) {
    console.error(
      "[VX] Failed to log monitor stop:",
      error,
    );
  }

  enforceMonitorRetention();

  return monitor;
}

/* =========================================================
   STOP ALL MONITORS
========================================================= */

export async function stopAllVxMonitors(): Promise<number> {
  const active =
    getActiveVxMonitors();

  const stoppedAt =
    Date.now();

  for (
    const monitor of active
  ) {
    monitor.active =
      false;

    monitor.stoppedAt =
      stoppedAt;

    normalizeMonitorCounters(
      monitor,
    );

    monitor.metadata = {
      ...(monitor.metadata || {}),

      progress:
        100,

      stage:
        "STOPPED",

      stoppedAt,

      durationMs:
        Math.max(
          0,
          stoppedAt -
            monitor.startedAt,
        ),

      shutdownReason:
        "GLOBAL_STOP",
    };
  }

  monitorByGroup.clear();
  startingGroups.clear();

  /*
   * Record one shutdown audit event.
   */
  if (
    active.length > 0
  ) {
    try {
      await logVxEvent({
        id:
          randomUUID(),

        timestamp:
          stoppedAt,

        type:
          "MONITOR",

        reason:
          `Stopped ${active.length} active VX monitor(s).`,

        indicators: [
          "MONITOR_GLOBAL_STOP",
        ],

        action:
          "LOG",

        metadata: {
          monitorsStopped:
            active.length,

          stoppedAt,
        },
      });
    } catch (error) {
      console.error(
        "[VX] Failed to log global monitor stop:",
        error,
      );
    }
  }

  enforceMonitorRetention();

  return active.length;
}

/* =========================================================
   MONITOR TELEMETRY
========================================================= */

export function getVxMonitorTelemetry(
  monitorId: string,
): VxMonitorTelemetry | undefined {
  const monitor =
    getVxMonitor(
      monitorId,
    );

  if (!monitor) {
    return undefined;
  }

  normalizeMonitorCounters(
    monitor,
  );

  const now =
    Date.now();

  const endTime =
    monitor.stoppedAt ||
    now;

  const metadata =
    monitor.metadata ||
    {};

  const lastEventAt =
    typeof metadata.lastEventAt ===
    "number"
      ? metadata.lastEventAt
      : undefined;

  const lastDetectionAt =
    typeof metadata.lastDetectionAt ===
    "number"
      ? metadata.lastDetectionAt
      : undefined;

  const lastEventId =
    typeof metadata.lastEventId ===
    "string"
      ? metadata.lastEventId
      : undefined;

  const lastSeverity =
    typeof metadata.lastSeverity ===
    "string"
      ? metadata.lastSeverity
      : undefined;

  const lastRiskScore =
    typeof metadata.lastRiskScore ===
    "number"
      ? clampRiskScore(
          metadata.lastRiskScore,
        )
      : undefined;

  const lastActorJid =
    typeof metadata.lastActorJid ===
    "string"
      ? metadata.lastActorJid
      : undefined;

  const lastReason =
    typeof metadata.lastReason ===
    "string"
      ? metadata.lastReason
      : undefined;

  return {
    monitorId:
      monitor.id,

    groupId:
      monitor.groupId,

    groupName:
      monitor.groupName ||
      "Unknown Group",

    active:
      monitor.active,

    startedAt:
      monitor.startedAt,

    stoppedAt:
      monitor.stoppedAt,

    eventsProcessed:
      monitor.eventsProcessed,

    threatsDetected:
      monitor.threatsDetected,

    incidentsCreated:
      monitor.incidentsCreated,

    lastEventAt,

    lastDetectionAt,

    lastEventId,

    lastSeverity,

    lastRiskScore,

    lastActorJid,

    lastReason,

    durationMs:
      Math.max(
        0,
        endTime -
          monitor.startedAt,
      ),
  };
}

/* =========================================================
   MONITOR PROGRESS
========================================================= */

export function getVxMonitorProgress(
  monitorId: string,
): VxMonitorProgress | undefined {
  const monitor =
    getVxMonitor(
      monitorId,
    );

  if (!monitor) {
    return undefined;
  }

  const metadata =
    monitor.metadata ||
    {};

  const progress =
    typeof metadata.progress ===
    "number"
      ? metadata.progress
      : monitor.active
        ? 100
        : 0;

  const stage =
    typeof metadata.stage ===
    "string"
      ? metadata.stage
      : monitor.active
        ? "ACTIVE"
        : "UNKNOWN";

  let message =
    "Dark Vortex monitor status.";

  if (
    stage ===
    "ACTIVE"
  ) {
    message =
      "Dark Vortex security monitoring is active.";
  } else if (
    stage ===
    "STOPPED"
  ) {
    message =
      "Dark Vortex security monitoring has stopped.";
  } else if (
    stage ===
    "FAILED"
  ) {
    message =
      "Dark Vortex security monitoring failed during initialization.";
  } else if (
    stage ===
    "ALREADY_ACTIVE"
  ) {
    message =
      "Dark Vortex security monitoring is already active.";
  } else {
    message =
      `Dark Vortex monitor stage: ${stage}.`;
  }

  return {
    progress:
      clampProgress(
        progress,
      ),

    stage,

    message,
  };
}

/* =========================================================
   ACTIVE MONITOR TELEMETRY
========================================================= */

export function getActiveVxMonitorTelemetry(): VxMonitorTelemetry[] {
  return getActiveVxMonitors()
    .map(
      monitor =>
        getVxMonitorTelemetry(
          monitor.id,
        ),
    )
    .filter(
      (
        telemetry,
      ): telemetry is VxMonitorTelemetry =>
        Boolean(
          telemetry,
        ),
    );
}

/* =========================================================
   MONITOR STATISTICS
========================================================= */

export function getVxMonitorStats(): {
  totalSessions: number;
  activeSessions: number;
  stoppedSessions: number;
  eventsProcessed: number;
  threatsDetected: number;
  totalThreats: number;
  incidentsCreated: number;
} {
  let eventsProcessed =
    0;

  let threatsDetected =
    0;

  let incidentsCreated =
    0;

  let activeSessions =
    0;

  for (
    const monitor of
    monitors.values()
  ) {
    normalizeMonitorCounters(
      monitor,
    );

    eventsProcessed +=
      monitor.eventsProcessed;

    threatsDetected +=
      monitor.threatsDetected;

    incidentsCreated +=
      monitor.incidentsCreated;

    if (
      monitor.active
    ) {
      activeSessions++;
    }
  }

  return {
    totalSessions:
      monitors.size,

    activeSessions,

    stoppedSessions:
      Math.max(
        0,
        monitors.size -
          activeSessions,
      ),

    eventsProcessed,

    threatsDetected,

    /*
     * Compatibility alias.
     * Existing VX logger/stat consumers expect
     * totalThreats.
     */
    totalThreats:
      threatsDetected,

    incidentsCreated,
  };
}

/* =========================================================
   LATEST MONITOR
========================================================= */

export function getLatestVxMonitor(): VxMonitorSession | undefined {
  let latest:
    | VxMonitorSession
    | undefined;

  for (
    const monitor of
    monitors.values()
  ) {
    if (
      !latest ||
      monitor.startedAt >
        latest.startedAt
    ) {
      latest =
        monitor;
    }
  }

  return latest;
}

/* =========================================================
   LATEST ACTIVE MONITOR
========================================================= */

export function getLatestActiveVxMonitor(): VxMonitorSession | undefined {
  let latest:
    | VxMonitorSession
    | undefined;

  for (
    const monitor of
    monitors.values()
  ) {
    if (
      !monitor.active
    ) {
      continue;
    }

    if (
      !latest ||
      monitor.startedAt >
        latest.startedAt
    ) {
      latest =
        monitor;
    }
  }

  return latest;
}

/* =========================================================
   CLEANUP
========================================================= */

export function cleanupVxMonitors(): void {
  enforceMonitorRetention();

  /*
   * Remove stale group references that no longer
   * point to active monitor sessions.
   */
  for (
    const [
      groupId,
      monitorId,
    ] of monitorByGroup.entries()
  ) {
    const monitor =
      monitors.get(
        monitorId,
      );

    if (
      !monitor ||
      !monitor.active
    ) {
      monitorByGroup.delete(
        groupId,
      );
    }
  }

  /*
   * Normalize existing monitor counters so corrupted
   * numeric state cannot spread into VX statistics.
   */
  for (
    const monitor of
    monitors.values()
  ) {
    normalizeMonitorCounters(
      monitor,
    );
  }
}