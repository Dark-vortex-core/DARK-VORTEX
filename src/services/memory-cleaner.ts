/* =========================================================
   🌑 DARK VORTEX — MEMORY CLEANER
   ⚡ Powered by Vortex Tech
========================================================= */

import {
  command,
  success,
  system,
} from "../utils/message.js";


/* =========================================================
   TYPES
========================================================= */

type CacheCleaner =
  () => void | Promise<void>;

export type CleanupProgress =
  (
    stage: string,
    percent: number
  ) => void | Promise<void>;

interface CacheEntry {
  name: string;
  cleaner: CacheCleaner;
}

interface MemorySnapshot {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}


/* =========================================================
   CONFIGURATION
========================================================= */

const AUTOMATIC_CLEANUP_INTERVAL_MS =
  30 * 60 * 1000;


/* =========================================================
   STATE
========================================================= */

let automaticCleanupTimer:
  NodeJS.Timeout | null = null;

let automaticCleanupEnabled =
  true;

let cleanupRunning =
  false;

let lastCleanupAt:
  number | null = null;

let lastAutomaticCleanupAt:
  number | null = null;

let totalCleanups =
  0;

let registeredCaches:
  CacheEntry[] = [];


/* =========================================================
   NODE GC
========================================================= */

function runGarbageCollection():
  boolean {

  const globalWithGc =
    globalThis as typeof globalThis & {
      gc?: () => void;
    };

  if (
    typeof globalWithGc.gc !==
    "function"
  ) {
    return false;
  }

  try {
    globalWithGc.gc();

    return true;
  } catch {
    return false;
  }
}


/* =========================================================
   MEMORY SNAPSHOT
========================================================= */

function getMemorySnapshot():
  MemorySnapshot {

  const memory =
    process.memoryUsage();

  return {
    rss: memory.rss,
    heapTotal:
      memory.heapTotal,
    heapUsed:
      memory.heapUsed,
    external:
      memory.external,
    arrayBuffers:
      memory.arrayBuffers,
  };
}


/* =========================================================
   FORMAT MEMORY
========================================================= */

function formatMemory(
  bytes: number
): string {

  if (
    !Number.isFinite(bytes) ||
    bytes < 0
  ) {
    return "0 MB";
  }

  const mb =
    bytes /
    1024 /
    1024;

  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }

  return `${(
    mb / 1024
  ).toFixed(2)} GB`;
}


/* =========================================================
   MEMORY PERCENTAGE
========================================================= */

function getHeapUsagePercent(
  snapshot: MemorySnapshot
): number {

  if (
    snapshot.heapTotal <= 0
  ) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(
      0,
      Math.round(
        (
          snapshot.heapUsed /
          snapshot.heapTotal
        ) * 100
      )
    )
  );
}


/* =========================================================
   MEMORY BAR
========================================================= */

function memoryBar(
  percent: number
): string {

  const totalBlocks =
    10;

  const filled =
    Math.round(
      (
        percent /
        100
      ) * totalBlocks
    );

  const empty =
    totalBlocks -
    filled;

  return (
    "█".repeat(
      Math.max(
        0,
        filled
      )
    ) +
    "░".repeat(
      Math.max(
        0,
        empty
      )
    )
  );
}


/* =========================================================
   PROGRESS MESSAGE
========================================================= */

export function formatCleanupProgress(
  stage: string,
  percent: number
): string {

  const safePercent =
    Math.min(
      100,
      Math.max(
        0,
        Math.round(percent)
      )
    );

  const bar =
    memoryBar(
      safePercent
    );

  return (
    `╭━━〔 🧹 MEMORY CLEANUP 〕━━╮\n` +
    `┃\n` +
    `┃ ⚡ ${stage}\n` +
    `┃\n` +
    `┃ ${bar} ${safePercent}%\n` +
    `┃\n` +
    `┃ 🌑 DARK VORTEX BOT\n` +
    `┃ ⚡ Powered by Vortex Tech\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
  );
}


/* =========================================================
   CACHE REGISTRATION
========================================================= */

export function registerCache(
  name: string,
  cleaner: CacheCleaner
): void {

  const existing =
    registeredCaches.find(
      (entry) =>
        entry.name === name
    );

  if (existing) {
    existing.cleaner =
      cleaner;

    return;
  }

  registeredCaches.push({
    name,
    cleaner,
  });
}


/* =========================================================
   CACHE UNREGISTRATION
========================================================= */

export function unregisterCache(
  name: string
): void {

  registeredCaches =
    registeredCaches.filter(
      (entry) =>
        entry.name !== name
    );
}


/* =========================================================
   RUN CACHE CLEANERS
========================================================= */

async function cleanRegisteredCaches():
  Promise<number> {

  let cleaned =
    0;

  for (
    const entry
    of registeredCaches
  ) {
    try {
      await entry.cleaner();

      cleaned++;
    } catch {
      /*
       * One cache failure must not
       * stop the remaining cleaners.
       */
    }
  }

  return cleaned;
}


/* =========================================================
   MAIN CLEANUP
========================================================= */

export async function cleanupMemory(
  automatic = false,
  onProgress?: CleanupProgress
): Promise<{
  before: MemorySnapshot;
  after: MemorySnapshot;
  freedHeap: number;
  freedRss: number;
  gcExecuted: boolean;
  cachesCleaned: number;
}> {

  if (cleanupRunning) {

    const snapshot =
      getMemorySnapshot();

    return {
      before: snapshot,
      after: snapshot,
      freedHeap: 0,
      freedRss: 0,
      gcExecuted: false,
      cachesCleaned: 0,
    };
  }

  cleanupRunning =
    true;

  const before =
    getMemorySnapshot();

  try {

    /* =====================================================
       STAGE 1
    ===================================================== */

    await onProgress?.(
      "INITIALIZING CLEANUP...",
      5
    );


    /* =====================================================
       STAGE 2
    ===================================================== */

    await onProgress?.(
      "SCANNING APPLICATION MEMORY...",
      20
    );


    /* =====================================================
       STAGE 3
    ===================================================== */

    await onProgress?.(
      "CLEANING REGISTERED CACHES...",
      45
    );

    const cachesCleaned =
      await cleanRegisteredCaches();


    /* =====================================================
       STAGE 4
    ===================================================== */

    await onProgress?.(
      "PREPARING GARBAGE COLLECTION...",
      60
    );

    await new Promise<void>(
      (resolve) => {
        setImmediate(resolve);
      }
    );


    /* =====================================================
       STAGE 5
    ===================================================== */

    await onProgress?.(
      "RUNNING V8 GARBAGE COLLECTION...",
      75
    );

    const gcExecuted =
      runGarbageCollection();


    /* =====================================================
       STAGE 6
    ===================================================== */

    await onProgress?.(
      "RELEASING UNUSED OBJECTS...",
      85
    );

    await new Promise<void>(
      (resolve) => {
        setImmediate(resolve);
      }
    );


    /* =====================================================
       STAGE 7
    ===================================================== */

    await onProgress?.(
      "MEASURING MEMORY RESULTS...",
      95
    );

    const after =
      getMemorySnapshot();

    const freedHeap =
      Math.max(
        0,
        before.heapUsed -
        after.heapUsed
      );

    const freedRss =
      Math.max(
        0,
        before.rss -
        after.rss
      );


    /* =====================================================
       COMPLETE
    ===================================================== */

    lastCleanupAt =
      Date.now();

    if (automatic) {
      lastAutomaticCleanupAt =
        Date.now();
    }

    totalCleanups++;


    await onProgress?.(
      "CLEANUP COMPLETE",
      100
    );


    return {
      before,
      after,
      freedHeap,
      freedRss,
      gcExecuted,
      cachesCleaned,
    };

  } finally {
    cleanupRunning =
      false;
  }
}


/* =========================================================
   CLEANUP COMMAND
========================================================= */

export async function handleMemoryCleanupCommand(
commandName: string, args: string[], cleanupProgress: CleanupProgress): Promise<{
  handled: boolean;
  response?: string;
}> {

  const normalizedCommand =
    commandName
      .trim()
      .toLowerCase();

  if (
    normalizedCommand !==
    "cleanup"
  ) {
    return {
      handled: false,
    };
  }


  /* =======================================================
     STATUS
  ======================================================= */

  if (
    args[0]?.toLowerCase() ===
    "status"
  ) {
    return {
      handled: true,
      response:
        formatCleanupStatus(),
    };
  }


  /* =======================================================
     AUTO ON
  ======================================================= */

  if (
    args[0]?.toLowerCase() ===
    "on"
  ) {
    enableAutomaticCleanup();

    return {
      handled: true,
      response: success(
        "MEMORY CLEANER ENABLED",
        [
          "🧹 Automatic Cleanup: 🟢 ON",
          "⏱️ Interval: 30 minutes",
          "",
          "🟢 Automatic memory maintenance",
          "is now active.",
        ]
      ),
    };
  }


  /* =======================================================
     AUTO OFF
  ======================================================= */

  if (
    args[0]?.toLowerCase() ===
    "off"
  ) {
    disableAutomaticCleanup();

    return {
      handled: true,
      response: success(
        "MEMORY CLEANER PAUSED",
        [
          "🧹 Automatic Cleanup: 🔴 OFF",
          "",
          "💡 Manual /cleanup remains available.",
          "",
          "⚡ Use /cleanup on to resume.",
        ]
      ),
    };
  }


  /* =======================================================
     MANUAL CLEANUP
  ======================================================= */

  const result =
    await cleanupMemory(
      false
    );

  const heapPercent =
    getHeapUsagePercent(
      result.after
    );

  return {
    handled: true,
    response:
      command(
        "MEMORY CLEANUP COMPLETE",
        [
          `🧹 Heap Before: ${formatMemory(
            result.before.heapUsed
          )}`,
          `🧹 Heap After: ${formatMemory(
            result.after.heapUsed
          )}`,
          `♻️ Heap Freed: ${formatMemory(
            result.freedHeap
          )}`,
          "",
          `💾 RAM: ${formatMemory(
            result.after.rss
          )}`,
          `📊 Heap Usage: ${heapPercent}%`,
          memoryBar(
            heapPercent
          ),
          "",
          `🗑️ Caches Cleaned: ${
            result.cachesCleaned
          }`,
          `⚙️ Garbage Collection: ${
            result.gcExecuted
              ? "🟢 EXECUTED"
              : "🟡 UNAVAILABLE"
          }`,
          "",
          "🟢 Memory cleanup completed.",
        ]
      ),
  };
}


/* =========================================================
   AUTOMATIC CLEANUP
========================================================= */

async function automaticCleanup():
  Promise<void> {

  if (
    !automaticCleanupEnabled
  ) {
    return;
  }

  if (
    cleanupRunning
  ) {
    return;
  }

  try {
    await cleanupMemory(
      true
    );
  } catch {
    /*
     * Automatic cleanup must
     * never crash the bot.
     */
  }
}


/* =========================================================
   START AUTOMATIC CLEANER
========================================================= */

export function startAutomaticMemoryCleanup():
  void {

  if (
    automaticCleanupTimer
  ) {
    clearInterval(
      automaticCleanupTimer
    );
  }

  automaticCleanupEnabled =
    true;

  automaticCleanupTimer =
    setInterval(
      () => {
        void automaticCleanup();
      },
      AUTOMATIC_CLEANUP_INTERVAL_MS
    );

  automaticCleanupTimer.unref?.();
}


/* =========================================================
   STOP AUTOMATIC CLEANER
========================================================= */

export function stopAutomaticMemoryCleanup():
  void {

  if (
    automaticCleanupTimer
  ) {
    clearInterval(
      automaticCleanupTimer
    );

    automaticCleanupTimer =
      null;
  }
}


/* =========================================================
   ENABLE AUTOMATIC CLEANUP
========================================================= */

export function enableAutomaticCleanup():
  void {

  automaticCleanupEnabled =
    true;

  startAutomaticMemoryCleanup();
}


/* =========================================================
   DISABLE AUTOMATIC CLEANUP
========================================================= */

export function disableAutomaticCleanup():
  void {

  automaticCleanupEnabled =
    false;

  stopAutomaticMemoryCleanup();
}


/* =========================================================
   STATUS
========================================================= */

export function getMemoryCleanerStatus() {

  const memory =
    getMemorySnapshot();

  return {
    enabled:
      automaticCleanupEnabled,

    running:
      cleanupRunning,

    intervalMs:
      AUTOMATIC_CLEANUP_INTERVAL_MS,

    lastCleanupAt,

    lastAutomaticCleanupAt,

    totalCleanups,

    registeredCaches:
      registeredCaches.length,

    memory,
  };
}


/* =========================================================
   STATUS MESSAGE
========================================================= */

export function formatCleanupStatus():
  string {

  const status =
    getMemoryCleanerStatus();

  const percent =
    getHeapUsagePercent(
      status.memory
    );

  const intervalMinutes =
    Math.round(
      status.intervalMs /
      60000
    );

  const lastCleanup =
    status.lastCleanupAt
      ? new Date(
          status.lastCleanupAt
        ).toLocaleString(
          "en-NG",
          {
            timeZone:
              "Africa/Lagos",
          }
        )
      : "Not yet";

  return system(
    "MEMORY CLEANER",
    [
      `🧹 Automatic Cleanup: ${
        status.enabled
          ? "🟢 ON"
          : "🔴 OFF"
      }`,
      `⏱️ Interval: ${
        intervalMinutes
      } minutes`,
      "",
      `💾 Process RAM: ${
        formatMemory(
          status.memory.rss
        )
      }`,
      `🧠 Heap Used: ${
        formatMemory(
          status.memory.heapUsed
        )
      }`,
      `📦 Heap Total: ${
        formatMemory(
          status.memory.heapTotal
        )
      }`,
      `📊 Heap Usage: ${
        percent
      }%`,
      memoryBar(percent),
      "",
      `🗑️ Registered Caches: ${
        status.registeredCaches
      }`,
      `♻️ Total Cleanups: ${
        status.totalCleanups
      }`,
      "",
      `🕒 Last Cleanup: ${
        lastCleanup
      }`,
      "",
      "⚡ /cleanup — Clean now",
      "⚡ /cleanup status — View status",
      "⚡ /cleanup on — Enable automatic cleanup",
      "⚡ /cleanup off — Disable automatic cleanup",
    ]
  );
}


/* =========================================================
   STARTUP
========================================================= */

startAutomaticMemoryCleanup();