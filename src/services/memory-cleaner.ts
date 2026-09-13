import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import v8 from "node:v8";

import type { WASocket } from "@whiskeysockets/baileys";

/* =========================================================
   🌑 DARK VORTEX — RESOURCE / MEMORY MANAGER

   REAL FEATURES
   • Continuous memory monitoring
   • Automatic cleanup under memory pressure
   • Temporary/cache cleanup
   • Old log cleanup / rotation
   • JSON history retention
   • Security-report retention
   • Audit-history retention
   • V8 garbage collection when available
   • Cleanup history
   • Atomic JSON writes
   • Protected authentication/session paths
   • Protected configuration/security state
   • Manual cleanup command
   • Progress callback compatibility
   • No overlapping cleanup jobs
   • Automatic cleanup cooldown
   • Safe failure isolation

   IMPORTANT
   This service NEVER deletes:
   • Baileys authentication
   • Signal credentials
   • session files
   • configuration
   • security state
   • group registry
========================================================= */

/* =========================================================
   CONFIGURATION
========================================================= */

const CHECK_INTERVAL_MS =
  30 * 1000;

const WARNING_THRESHOLD =
  0.70;

const CLEANUP_THRESHOLD =
  0.80;

const AGGRESSIVE_THRESHOLD =
  0.90;

const RECOVERY_TARGET =
  0.65;

const MIN_CLEANUP_INTERVAL_MS =
  5 * 60 * 1000;

/*
 * Routine maintenance runs independently of
 * emergency memory cleanup.
 */
const ROUTINE_MAINTENANCE_INTERVAL_MS =
  60 * 60 * 1000;

/*
 * Disposable files older than these ages
 * are eligible for deletion.
 */
const NORMAL_DISPOSABLE_MAX_AGE_MS =
  24 * 60 * 60 * 1000;

const AGGRESSIVE_DISPOSABLE_MAX_AGE_MS =
  2 * 60 * 60 * 1000;

/*
 * Logs are retained longer than temporary files.
 */
const NORMAL_LOG_MAX_AGE_MS =
  7 * 24 * 60 * 60 * 1000;

const AGGRESSIVE_LOG_MAX_AGE_MS =
  24 * 60 * 60 * 1000;

/*
 * Maximum historical JSON records.
 */
const NORMAL_HISTORY_LIMIT =
  1000;

const AGGRESSIVE_HISTORY_LIMIT =
  300;

/*
 * Cleanup history is intentionally small.
 */
const CLEANUP_HISTORY_LIMIT =
  100;

/*
 * Maximum size before the main Dark Vortex
 * log is rotated.
 */
const LOG_ROTATION_BYTES =
  10 * 1024 * 1024;

/*
 * Number of rotated logs to retain.
 */
const MAX_ROTATED_LOGS =
  5;

/* =========================================================
   PATHS
========================================================= */

const ROOT_DIR =
  path.resolve(
    process.cwd(),
  );

const DATA_DIR =
  path.join(
    ROOT_DIR,
    "src",
    "data",
  );

const VORTEX_DATA_DIR =
  path.join(
    DATA_DIR,
    "vortex",
  );

const LOG_DATA_DIR =
  path.join(
    DATA_DIR,
    "logs",
  );

const CLEANUP_HISTORY_FILE =
  path.join(
    VORTEX_DATA_DIR,
    "cleanup-history.json",
  );

const MAIN_LOG_FILE =
  path.join(
    LOG_DATA_DIR,
    "dark-vortex.log",
  );

/*
 * Only these locations are disposable.
 */
const DISPOSABLE_DIRECTORIES = [
  path.join(
    ROOT_DIR,
    "tmp",
  ),

  path.join(
    ROOT_DIR,
    "temp",
  ),

  path.join(
    ROOT_DIR,
    "cache",
  ),

  path.join(
    DATA_DIR,
    "tmp",
  ),

  path.join(
    DATA_DIR,
    "cache",
  ),
];

/*
 * Historical JSON files that can safely
 * be compacted.
 */
const RETENTION_FILES = new Set([
  "diagnostic-history.json",
  "security-reports.json",
  "cleanup-history.json",
  "audit-records.json",
]);

/*
 * Files that must NEVER be compacted.
 */
const PROTECTED_FILES = new Set([
  "security-state.json",
  "group-registry.json",
  "config.json",
]);

/*
 * Directory names that must NEVER be traversed
 * by disposable cleanup.
 */
const PROTECTED_DIRECTORY_NAMES = new Set([
  "auth",
  "auth_info",
  "auth_info_baileys",
  "creds",
  "credentials",
  "sessions",
  "session",
  "signal",
  "signal_sessions",
  "whatsapp-auth",
]);

/* =========================================================
   TYPES
========================================================= */

export interface CleanupProgress {
  (
    stage: string,
    percent: number,
  ): Promise<void>;
}

export interface MemorySnapshot {
  rssMB: number;
  heapUsedMB: number;
  heapTotalMB: number;
  heapLimitMB: number;
  externalMB: number;
  arrayBuffersMB: number;
  heapPercent: number;
  rssPercent: number;
  systemPercent: number;
}

export interface CleanupResult {
  success: boolean;
  automatic: boolean;
  memoryBefore: MemorySnapshot;
  memoryAfter: MemorySnapshot;
  filesRemoved: number;
  recordsRemoved: number;
  bytesFreed: number;
  gcExecuted: boolean;
  logsRotated: number;
  durationMs: number;
  reason: string;
  error?: string;
}

interface GenericRecord {
  timestamp?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  created_at?: unknown;
  date?: unknown;
  time?: unknown;
  [key: string]: unknown;
}

interface CleanupHistoryRecord {
  timestamp: number;
  automatic: boolean;
  reason: string;
  success: boolean;
  filesRemoved: number;
  recordsRemoved: number;
  bytesFreed: number;
  gcExecuted: boolean;
  logsRotated: number;
  memoryBeforePercent: number;
  memoryAfterPercent: number;
  durationMs: number;
}

/* =========================================================
   STATE
========================================================= */

let cleanupTimer:
  NodeJS.Timeout | null = null;

let routineMaintenanceTimer:
  NodeJS.Timeout | null = null;

let cleanupRunning =
  false;

let routineMaintenanceRunning =
  false;

let lastCleanupAt =
  0;

let lastRoutineMaintenanceAt =
  0;

let cleanupSocket:
  WASocket | null = null;

let lastMemoryLevel:
  | "NORMAL"
  | "WARNING"
  | "HIGH"
  | "CRITICAL" =
  "NORMAL";

/* =========================================================
   BASIC HELPERS
========================================================= */

function bytesToMB(
  bytes: number,
): number {
  return (
    bytes /
    1024 /
    1024
  );
}

function formatMB(
  bytes: number,
): string {
  return `${bytesToMB(bytes).toFixed(1)} MB`;
}

function clamp(
  value: number,
): number {
  return Math.max(
    0,
    Math.min(
      1,
      value,
    ),
  );
}

function isProtectedDirectory(
  directoryName: string,
): boolean {
  return PROTECTED_DIRECTORY_NAMES.has(
    directoryName.toLowerCase(),
  );
}

function isProtectedFile(
  fileName: string,
): boolean {
  const lower =
    fileName.toLowerCase();

  if (
    PROTECTED_FILES.has(
      fileName,
    )
  ) {
    return true;
  }

  /*
   * Never delete files that look like
   * authentication/session material.
   */
  return (
    lower.includes("auth") ||
    lower.includes("credential") ||
    lower.includes("secret") ||
    lower.includes("session") ||
    lower.includes("signal") ||
    lower.includes("key")
  );
}

/* =========================================================
   MEMORY SNAPSHOT
========================================================= */

export function getMemorySnapshot():
  MemorySnapshot {
  const memory =
    process.memoryUsage();

  const heapStats =
    v8.getHeapStatistics();

  const heapLimit =
    heapStats.heap_size_limit;

  const systemTotal =
    os.totalmem();

  const systemUsed =
    Math.max(
      0,
      systemTotal -
        os.freemem(),
    );

  const heapPercent =
    heapLimit > 0
      ? clamp(
          memory.heapUsed /
            heapLimit,
        )
      : 0;

  const rssPercent =
    systemTotal > 0
      ? clamp(
          memory.rss /
            systemTotal,
        )
      : 0;

  const systemPercent =
    systemTotal > 0
      ? clamp(
          systemUsed /
            systemTotal,
        )
      : 0;

  return {
    rssMB:
      bytesToMB(
        memory.rss,
      ),

    heapUsedMB:
      bytesToMB(
        memory.heapUsed,
      ),

    heapTotalMB:
      bytesToMB(
        memory.heapTotal,
      ),

    heapLimitMB:
      bytesToMB(
        heapLimit,
      ),

    externalMB:
      bytesToMB(
        memory.external,
      ),

    arrayBuffersMB:
      bytesToMB(
        memory.arrayBuffers,
      ),

    heapPercent:
      Math.round(
        heapPercent *
          100,
      ),

    rssPercent:
      Math.round(
        rssPercent *
          100,
      ),

    systemPercent:
      Math.round(
        systemPercent *
          100,
      ),
  };
}

/* =========================================================
   MEMORY LEVEL
========================================================= */

function getMemoryLevel(
  snapshot: MemorySnapshot,
):
  | "NORMAL"
  | "WARNING"
  | "HIGH"
  | "CRITICAL" {
  const ratio =
    snapshot.heapPercent /
    100;

  if (
    ratio >=
    AGGRESSIVE_THRESHOLD
  ) {
    return "CRITICAL";
  }

  if (
    ratio >=
    CLEANUP_THRESHOLD
  ) {
    return "HIGH";
  }

  if (
    ratio >=
    WARNING_THRESHOLD
  ) {
    return "WARNING";
  }

  return "NORMAL";
}

/* =========================================================
   RECORD TIMESTAMP
========================================================= */

function getRecordTimestamp(
  record: GenericRecord,
): number {
  const values = [
    record.timestamp,
    record.createdAt,
    record.updatedAt,
    record.created_at,
    record.date,
    record.time,
  ];

  for (
    const value of values
  ) {
    if (
      typeof value ===
      "number" &&
      Number.isFinite(value)
    ) {
      /*
       * Convert seconds to milliseconds
       * when necessary.
       */
      if (
        value > 0 &&
        value < 10_000_000_000
      ) {
        return value * 1000;
      }

      return value;
    }

    if (
      typeof value ===
      "string"
    ) {
      const parsed =
        Date.parse(value);

      if (
        Number.isFinite(
          parsed,
        )
      ) {
        return parsed;
      }
    }
  }

  return 0;
}

/* =========================================================
   ATOMIC FILE WRITE
========================================================= */

async function atomicWrite(
  filePath: string,
  content: string,
): Promise<void> {
  const directory =
    path.dirname(
      filePath,
    );

  await fs.mkdir(
    directory,
    {
      recursive: true,
    },
  );

  const temporary =
    `${filePath}.cleanup-${process.pid}-${Date.now()}.tmp`;

  try {
    await fs.writeFile(
      temporary,
      content,
      "utf8",
    );

    await fs.rename(
      temporary,
      filePath,
    );
  } catch (error) {
    try {
      await fs.rm(
        temporary,
        {
          force: true,
        },
      );
    } catch {
      // Ignore temporary cleanup failure.
    }

    throw error;
  }
}

/* =========================================================
   JSON RETENTION
========================================================= */

async function compactJsonFile(
  filePath: string,
  aggressive: boolean,
): Promise<{
  recordsRemoved: number;
  bytesFreed: number;
}> {
  const fileName =
    path.basename(
      filePath,
    );

  if (
    isProtectedFile(
      fileName,
    )
  ) {
    return {
      recordsRemoved: 0,
      bytesFreed: 0,
    };
  }

  if (
    !RETENTION_FILES.has(
      fileName,
    )
  ) {
    return {
      recordsRemoved: 0,
      bytesFreed: 0,
    };
  }

  let original: string;

  try {
    original =
      await fs.readFile(
        filePath,
        "utf8",
      );
  } catch {
    return {
      recordsRemoved: 0,
      bytesFreed: 0,
    };
  }

  if (
    !original.trim()
  ) {
    return {
      recordsRemoved: 0,
      bytesFreed: 0,
    };
  }

  let parsed: unknown;

  try {
    parsed =
      JSON.parse(
        original,
      );
  } catch {
    /*
     * Never destroy malformed JSON.
     */
    return {
      recordsRemoved: 0,
      bytesFreed: 0,
    };
  }

  if (
    !Array.isArray(
      parsed,
    )
  ) {
    return {
      recordsRemoved: 0,
      bytesFreed: 0,
    };
  }

  const maxRecords =
    fileName ===
    "cleanup-history.json"
      ? CLEANUP_HISTORY_LIMIT
      : aggressive
        ? AGGRESSIVE_HISTORY_LIMIT
        : NORMAL_HISTORY_LIMIT;

  if (
    parsed.length <=
    maxRecords
  ) {
    return {
      recordsRemoved: 0,
      bytesFreed: 0,
    };
  }

  const sorted =
    [...parsed].sort(
      (a, b) =>
        getRecordTimestamp(
          (b ?? {}) as GenericRecord,
        ) -
        getRecordTimestamp(
          (a ?? {}) as GenericRecord,
        ),
    );

  const kept =
    sorted.slice(
      0,
      maxRecords,
    );

  const removed =
    parsed.length -
    kept.length;

  const next =
    JSON.stringify(
      kept,
      null,
      2,
    );

  const oldBytes =
    Buffer.byteLength(
      original,
      "utf8",
    );

  const newBytes =
    Buffer.byteLength(
      next,
      "utf8",
    );

  try {
    await atomicWrite(
      filePath,
      next,
    );
  } catch {
    return {
      recordsRemoved: 0,
      bytesFreed: 0,
    };
  }

  return {
    recordsRemoved:
      removed,

    bytesFreed:
      Math.max(
        0,
        oldBytes -
          newBytes,
      ),
  };
}

/* =========================================================
   VORTEX JSON CLEANUP
========================================================= */

async function cleanupDatabaseRecords(
  aggressive: boolean,
): Promise<{
  recordsRemoved: number;
  bytesFreed: number;
}> {
  let recordsRemoved =
    0;

  let bytesFreed =
    0;

  let entries;

  try {
    entries =
      await fs.readdir(
        VORTEX_DATA_DIR,
        {
          withFileTypes:
            true,
        },
      );
  } catch {
    return {
      recordsRemoved: 0,
      bytesFreed: 0,
    };
  }

  for (
    const entry of entries
  ) {
    if (
      !entry.isFile()
    ) {
      continue;
    }

    if (
      !entry.name
        .toLowerCase()
        .endsWith(".json")
    ) {
      continue;
    }

    if (
      isProtectedFile(
        entry.name,
      )
    ) {
      continue;
    }

    const result =
      await compactJsonFile(
        path.join(
          VORTEX_DATA_DIR,
          entry.name,
        ),
        aggressive,
      );

    recordsRemoved +=
      result.recordsRemoved;

    bytesFreed +=
      result.bytesFreed;
  }

  return {
    recordsRemoved,
    bytesFreed,
  };
}

/* =========================================================
   DISPOSABLE DIRECTORY CLEANUP
========================================================= */

async function removeOldDisposableFiles(
  aggressive: boolean,
): Promise<{
  filesRemoved: number;
  bytesFreed: number;
}> {
  let filesRemoved =
    0;

  let bytesFreed =
    0;

  const now =
    Date.now();

  const maxAge =
    aggressive
      ? AGGRESSIVE_DISPOSABLE_MAX_AGE_MS
      : NORMAL_DISPOSABLE_MAX_AGE_MS;

  async function scan(
    directory: string,
  ): Promise<void> {
    let entries;

    try {
      entries =
        await fs.readdir(
          directory,
          {
            withFileTypes:
              true,
          },
        );
    } catch {
      return;
    }

    for (
      const entry of entries
    ) {
      /*
       * Never enter protected directories.
       */
      if (
        entry.isDirectory() &&
        isProtectedDirectory(
          entry.name,
        )
      ) {
        continue;
      }

      const fullPath =
        path.join(
          directory,
          entry.name,
        );

      try {
        if (
          entry.isDirectory()
        ) {
          await scan(
            fullPath,
          );

          /*
           * Remove empty disposable
           * directories only.
           */
          try {
            const remaining =
              await fs.readdir(
                fullPath,
              );

            if (
              remaining.length ===
              0
            ) {
              await fs.rmdir(
                fullPath,
              );
            }
          } catch {
            // Ignore directory removal failure.
          }

          continue;
        }

        const lower =
          entry.name.toLowerCase();

        if (
          isProtectedFile(
            entry.name,
          )
        ) {
          continue;
        }

        /*
         * Do not touch arbitrary source,
         * executable or package files.
         */
        if (
          lower.endsWith(".ts") ||
          lower.endsWith(".js") ||
          lower.endsWith(".mjs") ||
          lower.endsWith(".cjs") ||
          lower.endsWith(".json") ||
          lower.endsWith(".env") ||
          lower.endsWith(".env.local")
        ) {
          continue;
        }

        const stat =
          await fs.stat(
            fullPath,
          );

        const age =
          now -
          stat.mtimeMs;

        if (
          age <
          maxAge
        ) {
          continue;
        }

        bytesFreed +=
          stat.size;

        await fs.rm(
          fullPath,
          {
            force: true,
          },
        );

        filesRemoved++;
      } catch {
        /*
         * One bad file never stops
         * the entire cleanup.
         */
      }
    }
  }

  for (
    const directory of
      DISPOSABLE_DIRECTORIES
  ) {
    await scan(
      directory,
    );
  }

  return {
    filesRemoved,
    bytesFreed,
  };
}

/* =========================================================
   LOG CLEANUP
========================================================= */

async function cleanupLogs(
  aggressive: boolean,
): Promise<{
  filesRemoved: number;
  bytesFreed: number;
  logsRotated: number;
}> {
  let filesRemoved =
    0;

  let bytesFreed =
    0;

  let logsRotated =
    0;

  const maxAge =
    aggressive
      ? AGGRESSIVE_LOG_MAX_AGE_MS
      : NORMAL_LOG_MAX_AGE_MS;

  /*
   * Ensure log directory exists.
   */
  try {
    await fs.mkdir(
      LOG_DATA_DIR,
      {
        recursive: true,
      },
    );
  } catch {
    return {
      filesRemoved: 0,
      bytesFreed: 0,
      logsRotated: 0,
    };
  }

  /*
   * Rotate the active log if it becomes too large.
   */
  try {
    const stat =
      await fs.stat(
        MAIN_LOG_FILE,
      );

    if (
      stat.size >=
      LOG_ROTATION_BYTES
    ) {
      const rotated =
        path.join(
          LOG_DATA_DIR,
          `dark-vortex-${Date.now()}.log`,
        );

      await fs.rename(
        MAIN_LOG_FILE,
        rotated,
      );

      logsRotated++;

      /*
       * Create a fresh active log.
       */
      await fs.writeFile(
        MAIN_LOG_FILE,
        "",
        "utf8",
      );
    }
  } catch {
    // Active log may not exist yet.
  }

  let entries;

  try {
    entries =
      await fs.readdir(
        LOG_DATA_DIR,
        {
          withFileTypes:
            true,
        },
      );
  } catch {
    return {
      filesRemoved,
      bytesFreed,
      logsRotated,
    };
  }

  const now =
    Date.now();

  const rotatedLogs =
    entries
      .filter(
        entry =>
          entry.isFile() &&
          entry.name.endsWith(
            ".log",
          ) &&
          entry.name !==
            path.basename(
              MAIN_LOG_FILE,
            ),
      );

  /*
   * Remove logs older than retention period.
   */
  for (
    const entry of
      rotatedLogs
  ) {
    const fullPath =
      path.join(
        LOG_DATA_DIR,
        entry.name,
      );

    try {
      const stat =
        await fs.stat(
          fullPath,
        );

      if (
        now -
          stat.mtimeMs <
        maxAge
      ) {
        continue;
      }

      bytesFreed +=
        stat.size;

      await fs.rm(
        fullPath,
        {
          force: true,
        },
      );

      filesRemoved++;
    } catch {
      // Continue.
    }
  }

  /*
   * Keep the newest rotated logs
   * even if they are not old enough.
   */
  let remaining: string[] = [];

  try {
    const latest =
      await fs.readdir(
        LOG_DATA_DIR,
      );

    remaining =
      latest
        .filter(
          name =>
            name.endsWith(
              ".log",
            ) &&
            name !==
              path.basename(
                MAIN_LOG_FILE,
              ),
        )
        .sort()
        .reverse();
  } catch {
    remaining = [];
  }

  if (
    remaining.length >
    MAX_ROTATED_LOGS
  ) {
    const excess =
      remaining.slice(
        MAX_ROTATED_LOGS,
      );

    for (
      const fileName of
        excess
    ) {
      const fullPath =
        path.join(
          LOG_DATA_DIR,
          fileName,
        );

      try {
        const stat =
          await fs.stat(
            fullPath,
          );

        bytesFreed +=
          stat.size;

        await fs.rm(
          fullPath,
          {
            force: true,
          },
        );

        filesRemoved++;
      } catch {
        // Continue.
      }
    }
  }

  return {
    filesRemoved,
    bytesFreed,
    logsRotated,
  };
}

/* =========================================================
   GARBAGE COLLECTION
========================================================= */

function runGarbageCollection():
  boolean {
  const gc =
    (
      globalThis as typeof globalThis & {
        gc?: () => void;
      }
    ).gc;

  if (
    typeof gc !==
    "function"
  ) {
    return false;
  }

  try {
    gc();
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   CLEANUP HISTORY
========================================================= */

async function recordCleanupHistory(
  record: CleanupHistoryRecord,
): Promise<void> {
  try {
    await fs.mkdir(
      VORTEX_DATA_DIR,
      {
        recursive: true,
      },
    );

    let history: unknown =
      [];

    try {
      const raw =
        await fs.readFile(
          CLEANUP_HISTORY_FILE,
          "utf8",
        );

      history =
        JSON.parse(
          raw,
        );
    } catch {
      history = [];
    }

    if (
      !Array.isArray(
        history,
      )
    ) {
      history = [];
    }

    const next =
      [
        record,
        ...(history as unknown[]),
      ].slice(
        0,
        CLEANUP_HISTORY_LIMIT,
      );

    await atomicWrite(
      CLEANUP_HISTORY_FILE,
      JSON.stringify(
        next,
        null,
        2,
      ),
    );
  } catch {
    /*
     * Cleanup history must never
     * interfere with cleanup itself.
     */
  }
}

/* =========================================================
   CORE CLEANUP
========================================================= */

export async function runMemoryCleanup(
  options: {
    automatic?: boolean;
    reason?: string;
    aggressive?: boolean;
    onProgress?: CleanupProgress;
  } = {},
): Promise<CleanupResult> {
  if (
    cleanupRunning
  ) {
    const memory =
      getMemorySnapshot();

    return {
      success: false,
      automatic:
        Boolean(
          options.automatic,
        ),
      memoryBefore:
        memory,
      memoryAfter:
        memory,
      filesRemoved: 0,
      recordsRemoved: 0,
      bytesFreed: 0,
      gcExecuted: false,
      logsRotated: 0,
      durationMs: 0,
      reason:
        "Cleanup already running.",
    };
  }

  const now =
    Date.now();

  if (
    options.automatic &&
    now -
      lastCleanupAt <
      MIN_CLEANUP_INTERVAL_MS
  ) {
    const memory =
      getMemorySnapshot();

    return {
      success: false,
      automatic: true,
      memoryBefore:
        memory,
      memoryAfter:
        memory,
      filesRemoved: 0,
      recordsRemoved: 0,
      bytesFreed: 0,
      gcExecuted: false,
      logsRotated: 0,
      durationMs: 0,
      reason:
        "Automatic cleanup cooldown is active.",
    };
  }

  cleanupRunning =
    true;

  lastCleanupAt =
    now;

  const startedAt =
    Date.now();

  const memoryBefore =
    getMemorySnapshot();

  const aggressive =
    Boolean(
      options.aggressive,
    ) ||
    memoryBefore.heapPercent >=
      Math.round(
        AGGRESSIVE_THRESHOLD *
          100,
      );

  const progress =
    options.onProgress;

  let filesRemoved =
    0;

  let recordsRemoved =
    0;

  let bytesFreed =
    0;

  let logsRotated =
    0;

  let gcExecuted =
    false;

  try {
    if (progress) {
      await progress(
        "Analyzing memory usage",
        5,
      );
    }

    /*
     * 1. Temporary/cache cleanup
     */
    if (progress) {
      await progress(
        "Scanning temporary and cache data",
        20,
      );
    }

    const disposable =
      await removeOldDisposableFiles(
        aggressive,
      );

    filesRemoved +=
      disposable.filesRemoved;

    bytesFreed +=
      disposable.bytesFreed;

    /*
     * 2. Log maintenance
     */
    if (progress) {
      await progress(
        "Rotating and cleaning old logs",
        35,
      );
    }

    const logs =
      await cleanupLogs(
        aggressive,
      );

    filesRemoved +=
      logs.filesRemoved;

    bytesFreed +=
      logs.bytesFreed;

    logsRotated =
      logs.logsRotated;

    /*
     * 3. Historical database cleanup
     */
    if (progress) {
      await progress(
        "Compacting historical database records",
        55,
      );
    }

    const database =
      await cleanupDatabaseRecords(
        aggressive,
      );

    recordsRemoved +=
      database.recordsRemoved;

    bytesFreed +=
      database.bytesFreed;

    /*
     * 4. Garbage collection
     */
    if (progress) {
      await progress(
        "Releasing unused runtime memory",
        75,
      );
    }

    gcExecuted =
      runGarbageCollection();

    /*
     * Give V8 time to update
     * memory statistics.
     */
    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          100,
        ),
    );

    const memoryAfter =
      getMemorySnapshot();

    if (progress) {
      await progress(
        "Finalizing cleanup report",
        90,
      );
    }

    const result: CleanupResult =
      {
        success: true,
        automatic:
          Boolean(
            options.automatic,
          ),
        memoryBefore,
        memoryAfter,
        filesRemoved,
        recordsRemoved,
        bytesFreed,
        gcExecuted,
        logsRotated,
        durationMs:
          Date.now() -
          startedAt,
        reason:
          options.reason ||
          "Manual memory cleanup.",
      };

    await recordCleanupHistory({
      timestamp:
        Date.now(),
      automatic:
        Boolean(
          options.automatic,
        ),
      reason:
        result.reason,
      success:
        true,
      filesRemoved,
      recordsRemoved,
      bytesFreed,
      gcExecuted,
      logsRotated,
      memoryBeforePercent:
        memoryBefore.heapPercent,
      memoryAfterPercent:
        memoryAfter.heapPercent,
      durationMs:
        result.durationMs,
    });

    if (progress) {
      await progress(
        "Cleanup complete",
        100,
      );
    }

    return result;
  } catch (error) {
    const memoryAfter =
      getMemorySnapshot();

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    await recordCleanupHistory({
      timestamp:
        Date.now(),
      automatic:
        Boolean(
          options.automatic,
        ),
      reason:
        options.reason ||
        "Memory cleanup failed.",
      success:
        false,
      filesRemoved,
      recordsRemoved,
      bytesFreed,
      gcExecuted,
      logsRotated,
      memoryBeforePercent:
        memoryBefore.heapPercent,
      memoryAfterPercent:
        memoryAfter.heapPercent,
      durationMs:
        Date.now() -
        startedAt,
    });

    return {
      success: false,
      automatic:
        Boolean(
          options.automatic,
        ),
      memoryBefore,
      memoryAfter,
      filesRemoved,
      recordsRemoved,
      bytesFreed,
      gcExecuted,
      logsRotated,
      durationMs:
        Date.now() -
        startedAt,
      reason:
        options.reason ||
        "Memory cleanup failed.",
      error: message,
    };
  } finally {
    cleanupRunning =
      false;
  }
}

/* =========================================================
   ROUTINE MAINTENANCE
========================================================= */

async function runRoutineMaintenance():
  Promise<void> {
  if (
    routineMaintenanceRunning ||
    cleanupRunning
  ) {
    return;
  }

  const now =
    Date.now();

  if (
    now -
      lastRoutineMaintenanceAt <
    ROUTINE_MAINTENANCE_INTERVAL_MS
  ) {
    return;
  }

  routineMaintenanceRunning =
    true;

  lastRoutineMaintenanceAt =
    now;

  try {
    /*
     * Routine maintenance is deliberately
     * non-aggressive.
     *
     * It keeps the system healthy without
     * deleting recent operational data.
     */
    const result =
      await runMemoryCleanup({
        automatic: true,
        aggressive: false,
        reason:
          "Scheduled routine maintenance.",
      });

    console.log(
      `[MEMORY] Routine maintenance — ` +
      `${result.filesRemoved} files, ` +
      `${result.recordsRemoved} records, ` +
      `${formatMB(result.bytesFreed)} freed.`,
    );
  } catch (error) {
    console.warn(
      "[MEMORY] Routine maintenance failed:",
      error instanceof Error
        ? error.message
        : String(error),
    );
  } finally {
    routineMaintenanceRunning =
      false;
  }
}

/* =========================================================
   AUTOMATIC MEMORY CHECK
========================================================= */

async function automaticMemoryCheck():
  Promise<void> {
  if (
    cleanupRunning
  ) {
    return;
  }

  const snapshot =
    getMemorySnapshot();

  const level =
    getMemoryLevel(
      snapshot,
    );

  if (
    level !==
    lastMemoryLevel
  ) {
    console.log(
      `[MEMORY] ${level} — ` +
      `heap ${snapshot.heapPercent}% ` +
      `(${snapshot.heapUsedMB.toFixed(1)} MB / ` +
      `${snapshot.heapLimitMB.toFixed(1)} MB)`,
    );

    lastMemoryLevel =
      level;
  }

  /*
   * Critical/high memory gets immediate
   * cleanup.
   */
  if (
    level ===
      "HIGH" ||
    level ===
      "CRITICAL"
  ) {
    const aggressive =
      level ===
      "CRITICAL";

    console.log(
      "",
    );

    console.log(
      "🧹 [MEMORY] " +
      "Automatic resource cleanup started.",
    );

    console.log(
      `[MEMORY] Before: ${snapshot.heapPercent}% heap usage.`,
    );

    const result =
      await runMemoryCleanup({
        automatic: true,
        aggressive,
        reason:
          aggressive
            ? "Critical memory pressure."
            : "High memory pressure.",
      });

    const after =
      result.memoryAfter;

    console.log(
      `[MEMORY] Cleanup finished — ` +
      `${result.recordsRemoved} records removed, ` +
      `${result.filesRemoved} files removed, ` +
      `${result.logsRotated} logs rotated, ` +
      `${formatMB(result.bytesFreed)} freed.`,
    );

    console.log(
      `[MEMORY] After: ${after.heapPercent}% heap usage.`,
    );

    if (
      after.heapPercent >
      Math.round(
        RECOVERY_TARGET *
          100,
      )
    ) {
      console.log(
        "⚠️ [MEMORY] Usage remains high after cleanup.",
      );
    } else {
      console.log(
        "✅ [MEMORY] Memory returned to a safe range.",
      );
    }

    console.log(
      "",
    );

    return;
  }

  /*
   * Normal operation receives lightweight
   * scheduled maintenance.
   */
  await runRoutineMaintenance();
}

/* =========================================================
   START AUTOMATIC CLEANUP
========================================================= */

export function startAutomaticMemoryCleanup(
  sock?: WASocket | null,
): void {
  cleanupSocket =
    sock ?? null;

  if (
    cleanupTimer
  ) {
    return;
  }

  console.log(
    "🧹 Automatic memory/resource monitor started.",
  );

  console.log(
    `🧠 Warning threshold: ${Math.round(
      WARNING_THRESHOLD * 100,
    )}% heap.`,
  );

  console.log(
    `🧹 Cleanup threshold: ${Math.round(
      CLEANUP_THRESHOLD * 100,
    )}% heap.`,
  );

  console.log(
    `🚨 Critical threshold: ${Math.round(
      AGGRESSIVE_THRESHOLD * 100,
    )}% heap.`,
  );

  console.log(
    "🛡️ Authentication/session/configuration data protected.",
  );

  cleanupTimer =
    setInterval(
      () => {
        void automaticMemoryCheck();
      },
      CHECK_INTERVAL_MS,
    );

  cleanupTimer.unref?.();

  /*
   * Initial memory check.
   */
  setTimeout(
    () => {
      void automaticMemoryCheck();
    },
    5_000,
  ).unref?.();
}

/* =========================================================
   STOP AUTOMATIC CLEANUP
========================================================= */

export function stopAutomaticMemoryCleanup(
  sock?: unknown,
): void {
  /*
   * Optional socket argument retained for
   * compatibility with existing callers.
   */
  void sock;

  if (
    cleanupTimer
  ) {
    clearInterval(
      cleanupTimer,
    );

    cleanupTimer =
      null;
  }

  if (
    routineMaintenanceTimer
  ) {
    clearInterval(
      routineMaintenanceTimer,
    );

    routineMaintenanceTimer =
      null;
  }

  cleanupSocket =
    null;

  console.log(
    "🛑 Automatic memory/resource monitor stopped.",
  );
}

/* =========================================================
   MANUAL COMMAND
========================================================= */

export async function handleMemoryCleanupCommand(
  command: string,
  _args: string[],
  onProgress?: CleanupProgress,
): Promise<{
  handled: boolean;
  response?: string;
}> {
  const normalized =
    command
      .toLowerCase()
      .replace(
        /^[./!#]+/,
        "",
      );

  const cleanupCommands =
    new Set([
      "cleanup",
      "memorycleanup",
      "memcleanup",
      "dbcleanup",
      "memory",
    ]);

  if (
    !cleanupCommands.has(
      normalized,
    )
  ) {
    return {
      handled: false,
    };
  }

  const result =
    await runMemoryCleanup({
      automatic: false,
      reason:
        "Owner requested full resource cleanup.",
      aggressive: true,
      onProgress,
    });

  const before =
    result.memoryBefore;

  const after =
    result.memoryAfter;

  const freed =
    formatMB(
      result.bytesFreed,
    );

  const status =
    result.success
      ? "✅ CLEANUP COMPLETE"
      : "⚠️ CLEANUP FINISHED WITH WARNINGS";

  return {
    handled: true,
    response: [
      "╭────────────────────────────╮",
      "│   🌑 DARK VORTEX RESOURCE  │",
      "│        MANAGER             │",
      "├────────────────────────────┤",
      `│ ${status}`,
      "│",
      `│ 🧠 Before: ${before.heapPercent}%`,
      `│ 🧠 After:  ${after.heapPercent}%`,
      `│ 🗃️ Records: ${result.recordsRemoved}`,
      `│ 📁 Files: ${result.filesRemoved}`,
      `│ 📜 Logs: ${result.logsRotated}`,
      `│ 💾 Freed: ${freed}`,
      `│ ♻️ GC: ${
        result.gcExecuted
          ? "EXECUTED"
          : "UNAVAILABLE"
      }`,
      `│ ⏱️ Time: ${result.durationMs}ms`,
      "│",
      result.error
        ? `│ ⚠️ ${result.error}`
        : "│ 🛡️ Protected data untouched",
      "│",
      "╰────────────────────────────╯",
      "",
      "╰─── ⚡ VORTEX TECH ───╯",
    ].join("\n"),
  };
}

/* =========================================================
   PROGRESS FORMAT
========================================================= */

export function formatCleanupProgress(
  stage: string,
  percent: number,
): string {
  const safePercent =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(
          percent,
        ),
      ),
    );

  const totalBlocks =
    20;

  const filled =
    Math.round(
      (safePercent /
        100) *
        totalBlocks,
    );

  const bar =
    "█".repeat(
      filled,
    ) +
    "░".repeat(
      totalBlocks -
        filled,
    );

  const memory =
    getMemorySnapshot();

  return [
    "╭────────────────────────────╮",
    "│ 🌑 DARK VORTEX RESOURCE   │",
    "│        MANAGER            │",
    "├────────────────────────────┤",
    `│ ${bar} ${safePercent}%`,
    "│",
    `│ ⚙️ ${stage}`,
    "│",
    `│ 🧠 Heap: ${memory.heapPercent}%`,
    `│ 📡 RSS: ${memory.rssPercent}%`,
    `│ 💻 System: ${memory.systemPercent}%`,
    "│",
    "╰────────────────────────────╯",
    "",
    "╰─── ⚡ VORTEX TECH ───╯",
  ].join("\n");
}

/* =========================================================
   STATUS ACCESS
========================================================= */

export function isMemoryCleanupRunning():
  boolean {
  return cleanupRunning;
}

export function getMemoryCleanupStatus(): {
  running: boolean;
  level:
    | "NORMAL"
    | "WARNING"
    | "HIGH"
    | "CRITICAL";
  memory: MemorySnapshot;
  lastCleanupAt: number;
  routineMaintenanceRunning: boolean;
  lastRoutineMaintenanceAt: number;
} {
  const memory =
    getMemorySnapshot();

  return {
    running:
      cleanupRunning,

    level:
      getMemoryLevel(
        memory,
      ),

    memory,

    lastCleanupAt,

    routineMaintenanceRunning:
      routineMaintenanceRunning,

    lastRoutineMaintenanceAt,
  };
}

/* =========================================================
   CLEANUP HISTORY ACCESS
========================================================= */

export async function getCleanupHistory():
  Promise<CleanupHistoryRecord[]> {
  try {
    const raw =
      await fs.readFile(
        CLEANUP_HISTORY_FILE,
        "utf8",
      );

    const parsed =
      JSON.parse(
        raw,
      );

    if (
      !Array.isArray(
        parsed,
      )
    ) {
      return [];
    }

    return parsed as CleanupHistoryRecord[];
  } catch {
    return [];
  }
}

/* =========================================================
   RESOURCE SUMMARY
========================================================= */

export function getResourceSummary(): {
  memory: MemorySnapshot;
  level:
    | "NORMAL"
    | "WARNING"
    | "HIGH"
    | "CRITICAL";
  cleanupRunning: boolean;
  routineMaintenanceRunning: boolean;
} {
  const memory =
    getMemorySnapshot();

  return {
    memory,

    level:
      getMemoryLevel(
        memory,
      ),

    cleanupRunning:
      cleanupRunning,

    routineMaintenanceRunning:
      routineMaintenanceRunning,
  };
}