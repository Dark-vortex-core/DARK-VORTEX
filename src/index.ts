import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";

import {
  clearWhatsAppAuth,
} from "./services/auth-recovery.js";

import makeWASocket, {
  type WAMessage,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
} from "@whiskeysockets/baileys";

import { Boom } from "@hapi/boom";
import pino from "pino";
import qrcode from "qrcode-terminal";
import {
  setSessionStatus,
  markSessionConnected,
  markSessionDisconnected,
  setSessionAccount,
  setSessionPairingMode,
  getSessionStartedAt,
} from "./services/session-state.js";
import {
  startPairingApi,
  stopPairingApi,
  updatePairingApiState,
  setPairingQr,
  setPairingCode,
  setPairingConnecting,
  setPairingConnected,
  setPairingDisconnected,
  setPairingArtifactVisibility,
} from "./services/pairing-api.js";

import {
  setActiveSocket,
  clearLifecycleAction,
  getLifecycleAction,
  isLifecycleInProgress,
  isReconnectEnabled,
  disableReconnect,
  enableReconnect,
  closeActiveSocket,
} from "./services/lifecycle.js";

import {
  startAutomaticMemoryCleanup,
  stopAutomaticMemoryCleanup,
} from "./services/memory-cleaner.js";

import { config } from "./config.js";

import {
  processAway,
  markOwnerActivity,
  markOwnerResponse,
} from "./services/away.js";

import { processTrigger } from "./services/triggers.js";

import {
  configureRestMode,
  updateRestSocket,
  isResting,
  getRestMode,
} from "./services/rest-mode.js";

import {
  log,
  incomingMessage,
  startupBox,
  startupLine,
  endStartupBox,
  divider,
} from "./services/logger.js";
import {
  markPersonalAssistantOwnerResponse,
  processPersonalAssistant,
} from "./services/personal-assistant.js";
import {
  processProtection,
} from "./commands/protection.js";

import {
  registerGroup,
} from "./services/groupRegistry.js";

import {
  handleCommand,
} from "./commands/handler.js";

import {
  enforceBan,
} from "./commands/moderation.js";

import {
  trackOutgoingMessage,
  isTrackedOutgoingMessage,
} from "./utils/outgoing-message-tracker.js";
import {
  rememberMessage,
  processAntiEditUpdate,
} from "./services/anti-edit.js";
import {
  processSlowmode,
} from "./services/slowmode.js";

import {
  sendWelcome,
  sendGoodbye,
} from "./services/automation.js";

import {
  processDarkVortexAI,
} from "./services/dark-vortex-ai.js";

import {
  getPrefix,
} from "./services/prefix.js";

import {
  handleVortexConfirmation,
  consumeConfirmedSecurityExecution,
} from "./commands/vortex-tools.js";

// ============================================================
// VX SECURITY
// ============================================================

import {
  detectVxMessage,
} from "./security/vx-detector.js";

import {
  correlateVxGroupActivity,
} from "./security/vx-correlator.js";

import {
  analyzeVxBot,
} from "./security/vx-bot.js";

import {
  stopAllVxMonitors,
} from "./security/vx-monitor.js";

// ============================================================
// 🌑 DARK VORTEX TERMINAL DASHBOARD
// ============================================================

import {
  startTerminalDashboard,
  shutdownTerminalDashboard,
  addDashboardEvent,
  setDashboardConnection,
  setDashboardLatency,
  setDashboardGroups,
  setDashboardSecurity,
  setDashboardMemoryCleanup,
  setDashboardSignalCleanup,
  incrementDashboardMessages,
  incrementDashboardCommands,
} from "./services/terminal-dashboard.js";

// ============================================================
// 🌑 DARK VORTEX
// ============================================================

const BOT_NAME = "🌑 DARK VORTEX";
const POWERED_BY = "╰─── ⚡ VORTEX TECH ───╯";

const OWNER_NUMBER = config.ownerNumber
  .replace(/@.*$/, "")
  .replace(/\D/g, "");

const AUTH_DIR = path.resolve(
  process.cwd(),
  "auth",
);

const AUTH_BACKUP_DIR = path.resolve(
  process.cwd(),
  "auth-backups",
);

// ============================================================
// AUTOMATIC SIGNAL SESSION CLEANUP
// ============================================================

const SIGNAL_CLEANUP_THRESHOLD = 3;
const SIGNAL_CLEANUP_WINDOW = 30_000;

let signalErrorTimes: number[] = [];

let automaticSignalCleanupInProgress =
  false;

let signalCleanupTimer:
  NodeJS.Timeout | null = null;

function isSignalSessionError(
  value: unknown,
): boolean {
  const text =
    value instanceof Error
      ? value.stack ||
        value.message ||
        ""
      : String(value ?? "");

  const normalized =
    text.toLowerCase();

  return (
    normalized.includes("bad mac") ||
    normalized.includes(
      "verify mac",
    ) ||
    normalized.includes(
      "session error",
    ) ||
    normalized.includes(
      "decryptwhispermessage",
    ) ||
    normalized.includes(
      "dodecryptwhispermessage",
    )
  );
}

function registerSignalSessionError(): boolean {
  const now = Date.now();

  signalErrorTimes =
    signalErrorTimes.filter(
      (timestamp) =>
        now - timestamp <=
        SIGNAL_CLEANUP_WINDOW,
    );

  signalErrorTimes.push(now);

  return (
    signalErrorTimes.length >=
    SIGNAL_CLEANUP_THRESHOLD
  );
}

function resetSignalSessionErrors(): void {
  signalErrorTimes = [];
}

async function backupAuthSession(): Promise<
  string | null
> {
  try {
    await fs.mkdir(
      AUTH_BACKUP_DIR,
      {
        recursive: true,
      },
    );

    const timestamp =
      new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

    const backupPath =
      path.join(
        AUTH_BACKUP_DIR,
        `auth-${timestamp}`,
      );

    try {
      await fs.rename(
        AUTH_DIR,
        backupPath,
      );

      return backupPath;
    } catch (error) {
      const code =
        (
          error as NodeJS.ErrnoException
        )?.code;

      if (code === "ENOENT") {
        return null;
      }

      throw error;
    }
  } catch (error) {
    log.error(
      "Failed to backup old WhatsApp authentication session.",
      error,
    );

    return null;
  }
}

async function performAutomaticSignalCleanup(): Promise<void> {
  if (
    automaticSignalCleanupInProgress ||
    shuttingDown
  ) {
    return;
  }

  automaticSignalCleanupInProgress =
    true;

  setDashboardSignalCleanup(
    "RUNNING",
  );

  addDashboardEvent(
    "SIGNAL",
    "RECOVERY",
    "Automatic Signal session recovery started.",
  );

  if (signalCleanupTimer) {
    clearTimeout(
      signalCleanupTimer,
    );

    signalCleanupTimer = null;
  }

  resetSignalSessionErrors();

  log.security(
    "⚠️ Repeated WhatsApp Signal-session errors detected.",
  );

  log.security(
    "🧹 Automatic Signal session cleanup starting...",
  );

  try {
    disableReconnect();

    clearConnectionTimers();

    try {
      await stopAllVxMonitors();

      log.security(
        "VX live monitoring sessions stopped before session cleanup.",
      );
    } catch (error) {
      log.error(
        "Failed to stop VX monitors during Signal cleanup.",
        error,
      );
    }

    try {
      if (currentSocket) {
        await closeActiveSocket();
      }
    } catch (error) {
      log.error(
        "Failed to close WhatsApp socket during Signal cleanup.",
        error,
      );
    }

    currentSocket = null;
    setActiveSocket(null);
    updateRestSocket(null);

    await new Promise(
      (resolve) =>
        setTimeout(resolve, 1000),
    );

    const backupPath =
      await backupAuthSession();

    if (backupPath) {
      log.security(
        `🧹 Old Signal session backed up safely: ${path.basename(
          backupPath,
        )}`,
      );
    } else {
      log.warn(
        "No existing auth folder was available to backup.",
      );
    }

    log.security(
      "♻️ Fresh WhatsApp authentication session will be created.",
    );

    enableReconnect();

    await new Promise(
      (resolve) =>
        setTimeout(resolve, 1500),
    );

    if (
      shuttingDown ||
      currentSocket
    ) {
      return;
    }

    await startBot();

    setDashboardSignalCleanup(
      "COMPLETE",
    );

    addDashboardEvent(
      "SIGNAL",
      "RECOVERY",
      "Fresh authentication session created.",
    );

    log.success(
      "✅ Automatic Signal session cleanup completed.",
    );
  } catch (error) {
    setDashboardSignalCleanup(
      "FAILED",
    );

    addDashboardEvent(
      "SIGNAL",
      "RECOVERY",
      "Automatic Signal session recovery failed.",
    );

    log.fatal(
      "Automatic Signal session cleanup failed.",
      error,
    );

    enableReconnect();

    if (
      !shuttingDown &&
      !currentSocket &&
      !reconnectTimer
    ) {
      reconnectTimer =
        setTimeout(
          () => {
            reconnectTimer = null;

            if (
              shuttingDown ||
              currentSocket
            ) {
              return;
            }

            void startBot().catch(
              (retryError) => {
                log.error(
                  "Retry after Signal cleanup failed.",
                  retryError,
                );
              },
            );
          },
          5000,
        );
    }
  } finally {
    automaticSignalCleanupInProgress =
      false;
  }
}

function handleSignalSessionLog(
  value: unknown,
): void {
  if (
    automaticSignalCleanupInProgress ||
    shuttingDown
  ) {
    return;
  }

  // Never process or display structured Signal session objects.
  // They may contain cryptographic session material.
  if (typeof value !== "string") {
    return;
  }

  const text = value.trim();

  if (!text) {
    return;
  }

  // Never expose Signal cryptographic/session internals.
  const sensitiveSignalLog =
    /Closing session|SessionEntry|currentRatchet|ephemeralKeyPair|remoteIdentityKey|pendingPreKey|chainKey|messageKeys|registrationId/i;

  if (sensitiveSignalLog.test(text)) {
    return;
  }

  if (
    !isSignalSessionError(text)
  ) {
    return;
  }

  const thresholdReached =
    registerSignalSessionError();

  if (!thresholdReached) {
    log.warn(
      `Signal session error detected • automatic cleanup threshold: ${signalErrorTimes.length}/${SIGNAL_CLEANUP_THRESHOLD}`,
    );

    return;
  }

  if (signalCleanupTimer) {
    return;
  }

  log.security(
    "🚨 Signal-session error threshold reached • automatic cleanup armed.",
  );

  signalCleanupTimer =
    setTimeout(
      () => {
        signalCleanupTimer = null;

        void performAutomaticSignalCleanup();
      },
      250,
    );
}

// ============================================================
// BAILEYS LOGGER
// ============================================================

const loggerStream = {
  write(chunk: string): boolean {
    try {
      const text = String(chunk).trim();

      // Never forward raw Signal/session objects to the terminal.
      // These logs can contain cryptographic session material.
      if (
        text.includes("Closing session") ||
        text.includes("SessionEntry") ||
        text.includes("ephemeralKeyPair") ||
        text.includes("remoteIdentityKey") ||
        text.includes("currentRatchet") ||
        text.includes("pendingPreKey") ||
        text.includes("chainKey") ||
        text.includes("messageKeys")
      ) {
        return true;
      }

      // Only pass safe Signal/session status messages onward.
      handleSignalSessionLog(text);
    } catch {
      // Never allow logger failures to affect the bot.
    }

    return true;
  },
};

const logger = pino(
  {
    // Keep Baileys from flooding the dashboard/terminal.
    level: "silent",

    // Prevent object inspection/debug output.
    serializers: {
      err: pino.stdSerializers.err,
    },
  },
  loggerStream,
);

// ============================================================
// RUNTIME STATE
// ============================================================

let botStarted = false;

let reconnectTimer:
  NodeJS.Timeout | null = null;

let botStarting = false;

let dailyReportTimer:
  NodeJS.Timeout | null = null;

let systemReadyTimer:
  NodeJS.Timeout | null = null;

let timeGreetingTimer:
  NodeJS.Timeout | null = null;

let lastTimeGreetingKey:
  string | null = null;

let shuttingDown = false;

let currentSocket: any = null;

let authRecoveryInProgress = false;

let socketCreationInProgress = false;

let socketGeneration = 0;
;
let connectionGeneration = 0

// ============================================================
// MESSAGE DUPLICATION PROTECTION
// ============================================================
//
// Prevent the same WhatsApp message from being processed more
// than once. This protects commands, VX operations, triggers,
// moderation and other handlers from duplicate event delivery.
//

const processedMessageIds =
  new Map<string, number>();

const MESSAGE_DEDUP_WINDOW =
  10 * 60 * 1000; // 10 minutes

function hasProcessedMessage(
  messageId?: string | null,
): boolean {
  if (!messageId) {
    return false;
  }

  const now = Date.now();

  // Remove expired entries.
  for (
    const [
      id,
      timestamp,
    ] of processedMessageIds
  ) {
    if (
      now - timestamp >
      MESSAGE_DEDUP_WINDOW
    ) {
      processedMessageIds.delete(id);
    }
  }

  if (
    processedMessageIds.has(
      messageId,
    )
  ) {
    return true;
  }

  processedMessageIds.set(
    messageId,
    now,
  );

  return false;
}

// ============================================================
// WHATSAPP PHONE-NUMBER PAIRING
// ============================================================

const PAIRING_MODE =
  (process.env.PAIRING_MODE || "qr").trim().toLowerCase();

const PAIRING_NUMBER =
  (process.env.PAIRING_NUMBER || "").replace(/\D/g, "");

// Runtime pairing settings.
// These must be initialized directly from .env before the helper functions use them.
let runtimePairingMode: "qr" | "pairing" =
  PAIRING_MODE === "pairing" ? "pairing" : "qr";

let runtimePairingNumber = PAIRING_NUMBER;

let pairingCodeRequested = false;

let apiSessionRequested = false;

let websitePairingRequested = false;

function isPairingMode(): boolean {
  return runtimePairingMode === "pairing";
}

function getPairingNumber(): string {
  return runtimePairingNumber;
}

function maskPhoneNumber(
  number: string,
): string {
  if (number.length <= 6) {
    return "***";
  }

  return (
    number.slice(0, 3) +
    "*".repeat(
      Math.max(
        1,
        number.length - 6,
      ),
    ) +
    number.slice(-3)
  );
}

// ============================================================
// HELPERS
// ============================================================

function clearConnectionTimers(): void {
  if (dailyReportTimer) {
    clearInterval(
      dailyReportTimer,
    );

    dailyReportTimer = null;
  }

  if (systemReadyTimer) {
    clearTimeout(
      systemReadyTimer,
    );

    systemReadyTimer = null;
  }

  if (timeGreetingTimer) {
    clearTimeout(
      timeGreetingTimer,
    );

    timeGreetingTimer = null;
  }
}

function isCurrentSocket(
  sock: any,
): boolean {
  return sock === currentSocket;
}

// ============================================================
// VX AUTOMATIC INTELLIGENCE STATE
// ============================================================

const vxBotAnalysisTimes =
  new Map<string, number>();

const VX_BOT_ANALYSIS_INTERVAL =
  15_000;

// ============================================================
// GENERAL HELPERS
// ============================================================

function formatUptime(
  delay: number,
): string {
  const totalSeconds =
    Math.floor(
      delay / 1000,
    );

  const days = Math.floor(
    totalSeconds / 86400,
  );

  const hours = Math.floor(
    (totalSeconds % 86400) /
      3600,
  );

  const minutes = Math.floor(
    (totalSeconds % 3600) /
      60,
  );

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }

  if (parts.length === 0) {
    parts.push("less than 1m");
  }

  return parts.join(" ");
}

function formatBytes(
  bytes: number,
): string {
  if (
    !Number.isFinite(bytes) ||
    bytes < 0
  ) {
    return "0 MB";
  }

  const mb =
    bytes / 1024 / 1024;

  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }

  return `${(
    mb / 1024
  ).toFixed(2)} GB`;
}

function getCpuHealth(): string {
  const cpus = os.cpus();

  if (cpus.length === 0) {
    return "⚪ UNKNOWN";
  }

  const load =
    os.loadavg()[0];

  const perCore =
    load / cpus.length;

  if (perCore >= 0.9) {
    return "🔴 HIGH";
  }

  if (perCore >= 0.7) {
    return "🟡 MODERATE";
  }

  return "🟢 NORMAL";
}

function getTimeGreeting(): {
  greeting: string;
  emoji: string;
} {
  const hour = Number(
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Africa/Lagos",
        hour: "numeric",
        hour12: false,
      },
    ).format(new Date()),
  );

  if (
    hour >= 5 &&
    hour < 12
  ) {
    return {
      greeting:
        "GOOD MORNING, OWNER",
      emoji: "🌅",
    };
  }

  if (
    hour >= 12 &&
    hour < 18
  ) {
    return {
      greeting:
        "GOOD AFTERNOON, OWNER",
      emoji: "☀️",
    };
  }

  return {
    greeting:
      "GOOD EVENING, OWNER",
    emoji: "🌙",
  };
}

function formatDuration(
  delay: number,
): string {
  return formatUptime(delay);
}

function getSessionUptime(): string {
  const sessionStartedAt = getSessionStartedAt();

  if (!sessionStartedAt) {
    return "0s";
  }

  return formatDuration(
    Date.now() - sessionStartedAt,
  );
}

function getSessionStatus(): string {
  if (
    currentSocket &&
    botStarted
  ) {
    return "CONNECTED";
  }

  if (botStarting) {
    return "CONNECTING";
  }

  if (isResting()) {
    return "RESTING";
  }

  if (reconnectTimer) {
    return "RECONNECTING";
  }

  return "OFFLINE";
}

function getSessionAuthStatus(): string {
  if (
    currentSocket &&
    botStarted
  ) {
    return "AUTHENTICATED";
  }

  return "NOT AUTHENTICATED";
}
// ============================================================
// AUTOMATIC TIME GREETING SCHEDULER
// ============================================================

type TimeGreetingPeriod =
  | "morning"
  | "afternoon"
  | "evening";

function getCurrentGreetingPeriod():
  TimeGreetingPeriod {
  const hour = Number(
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Africa/Lagos",
        hour: "numeric",
        hour12: false,
      },
    ).format(new Date()),
  );

  if (
    hour >= 5 &&
    hour < 12
  ) {
    return "morning";
  }

  if (
    hour >= 12 &&
    hour < 18
  ) {
    return "afternoon";
  }

  return "evening";
}

function getLagosDateKey(): string {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone:
        "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    },
  ).format(new Date());
}

function getGreetingPeriodKey(): string {
  return `${getLagosDateKey()}-${getCurrentGreetingPeriod()}`;
}

function getMillisecondsUntilNextGreeting(): number {
  const now = new Date();

  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Africa/Lagos",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: false,
      },
    ).formatToParts(now);

  const values: Record<
    string,
    number
  > = {};

  for (const part of parts) {
    if (
      part.type === "hour" ||
      part.type === "minute" ||
      part.type === "second"
    ) {
      values[part.type] =
        Number(part.value);
    }
  }

  const hour =
    values.hour ?? 0;

  const minute =
    values.minute ?? 0;

  const second =
    values.second ?? 0;

  const currentSeconds =
    hour * 60 * 60 +
    minute * 60 +
    second;

  const greetingTimes = [
    5 * 60 * 60,
    12 * 60 * 60,
    18 * 60 * 60,
  ];

  const nextTime =
    greetingTimes.find(
      (time) =>
        time >
        currentSeconds,
    );

  if (
    nextTime !== undefined
  ) {
    return (
      (nextTime -
        currentSeconds) *
      1000
    );
  }

  return (
    (24 * 60 * 60 -
      currentSeconds +
      5 * 60 * 60) *
    1000
  );
}

async function sendAutomaticTimeGreeting(
  sock: any,
  period: TimeGreetingPeriod,
): Promise<void> {
  if (
    shuttingDown ||
    isResting()
  ) {
    return;
  }

  if (
    sock !== currentSocket
  ) {
    return;
  }

  const ownerJid =
    `${OWNER_NUMBER}@s.whatsapp.net`;

  const {
    greeting,
    emoji,
  } = getTimeGreeting();

  const currentPeriod =
    getCurrentGreetingPeriod();

  if (
    currentPeriod !== period
  ) {
    return;
  }

  try {
    await sock.sendMessage(
      ownerJid,
      {
        text:
          `╭━━━〔 ${BOT_NAME} 〕━━━╮\n` +
          `┃\n` +
          `┃ ${emoji} *${greeting}*\n` +
          `┃\n` +
          `┃ ⚡ DARK VORTEX TIME UPDATE\n` +
          `┃\n` +
          `┃ 🟢 Bot: ONLINE\n` +
          `┃ 🔐 Owner Access: ACTIVE\n` +
          `┃ 🌍 Timezone: Africa/Lagos\n` +
          `┃\n` +
          `┃ ⚡ Have a great ${period}.\n` +
          `┃\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━╯\n` +
          `      ${POWERED_BY}`,
      },
    );

    log.success(
      `Automatic ${period} greeting sent.`,
    );

    addDashboardEvent(
      "SYSTEM",
      "GREETING",
      `Automatic ${period} owner greeting sent.`,
    );
  } catch (error) {
    log.error(
      `Failed to send automatic ${period} greeting.`,
      error,
    );
  }
}

function scheduleNextTimeGreeting(
  sock: any,
  generation: number =
    connectionGeneration,
): void {
  if (shuttingDown) {
    return;
  }

  if (
    generation !==
    connectionGeneration
  ) {
    return;
  }

  if (timeGreetingTimer) {
    clearTimeout(
      timeGreetingTimer,
    );

    timeGreetingTimer = null;
  }

  const delay =
    getMillisecondsUntilNextGreeting();

  timeGreetingTimer =
    setTimeout(
      async () => {
        timeGreetingTimer =
          null;

        if (shuttingDown) {
          return;
        }

        if (
          generation !==
          connectionGeneration
        ) {
          return;
        }

        if (
          currentSocket !== sock
        ) {
          return;
        }

        if (isResting()) {
          scheduleNextTimeGreeting(
            sock,
            generation,
          );

          return;
        }

        const period =
          getCurrentGreetingPeriod();

        const greetingKey =
          getGreetingPeriodKey();

        if (
          lastTimeGreetingKey !==
          greetingKey
        ) {
          await sendAutomaticTimeGreeting(
            sock,
            period,
          );

          lastTimeGreetingKey =
            greetingKey;
        }

        scheduleNextTimeGreeting(
          sock,
          generation,
        );
      },
      Math.max(
        delay,
        1000,
      ),
    );

  log.system(
    `Time greeting scheduler • NEXT UPDATE IN ${formatUptime(
      delay,
    )}`,
  );
}

// ============================================================
// PHONE NUMBER HELPERS
// ============================================================

function normalizePhoneNumber(
  jid?: string,
): string | undefined {
  if (!jid) {
    return undefined;
  }

  const number =
    jid
      .replace(/:\d+/g, "")
      .replace(/@.*$/, "")
      .replace(/\D/g, "");

  return (
    number || undefined
  );
}

function getActorPhoneNumber(
  sender: string,
  senderAlt?: string,
): string | undefined {
  if (
    senderAlt &&
    senderAlt.endsWith(
      "@s.whatsapp.net",
    )
  ) {
    return normalizePhoneNumber(
      senderAlt,
    );
  }

  if (
    sender.endsWith(
      "@s.whatsapp.net",
    )
  ) {
    return normalizePhoneNumber(
      sender,
    );
  }

  return normalizePhoneNumber(
    sender,
  );
}

// ============================================================
// VX GROUP CONTEXT
// ============================================================

function createVxGroupContext(
  jid: string,
  name?: string,
  participantCount?: number,
) {
  return {
    jid,
    name:
      name ||
      "Unknown Group",
    participantCount,
  };
}

// ============================================================
// VX AUTOMATIC MESSAGE INTELLIGENCE
// ============================================================

async function processVxMessage(
  sock: any,
  jid: string,
  sender: string,
  senderAlt: string,
  text: string,
  command?: string,
  hasMedia = false,
  groupName?: string,
  participantCount?: number,
): Promise<void> {
  if (
    !jid.endsWith("@g.us")
  ) {
    return;
  }

  if (
    sender ===
      sock.user?.id ||
    senderAlt ===
      sock.user?.id
  ) {
    return;
  }

  const actor = {
    jid: sender,
    phoneNumber:
      getActorPhoneNumber(
        sender,
        senderAlt,
      ),
    name: undefined,
    isAdmin: undefined,
    isBot: undefined,
  };

  const group =
    createVxGroupContext(
      jid,
      groupName,
      participantCount,
    );

  const hasLink =
    /https?:\/\/\S+/i.test(
      text,
    ) ||
    /www\.\S+/i.test(
      text,
    );

  let detection;

  try {
    detection =
      await detectVxMessage({
        group,
        actor,
        text:
          text || undefined,
        command,
        hasLink,
      });
  } catch (error) {
    log.error(
      "VX message detection failed.",
      error,
    );

    return;
  }

  const correlation =
    correlateVxGroupActivity(
      group,
      {
        actorJid:
          actor.jid,
        text,
        command,
        suspicious:
          Boolean(
            detection,
          ),
      },
    );

  if (
    correlation.coordinated
  ) {
    console.log(
      `[VX] Coordinated activity detected in ${
        group.name || group.jid
      }: ` +
        `${correlation.actors.length} actors, ` +
        `risk=${correlation.score}, ` +
        `confidence=${correlation.confidence}`,
    );

    addDashboardEvent(
      "VX",
      "CORRELATOR",
      `Coordinated activity • ${correlation.actors.length} actors • risk ${correlation.score}`,
    );
  }

  if (!detection) {
    return;
  }

  addDashboardEvent(
    "VX",
    "DETECTOR",
    "Suspicious activity detected and analyzed.",
  );

  const metadata =
    detection.event?.metadata;

  const messagesPerMinute =
    Number(
      metadata?.messagesPerMinute ||
        0,
    );

  const commands =
    Number(
      metadata?.commands ||
        0,
    );

  const links =
    Number(
      metadata?.links ||
        0,
    );

  const similarity =
    Number(
      metadata?.messageSimilarity ||
        0,
    );

  const actorKey =
    `${jid}:${sender}`;

  const now = Date.now();

  const lastAnalysis =
    vxBotAnalysisTimes.get(
      actorKey,
    ) || 0;

  const shouldAnalyzeBot =
    now -
      lastAnalysis >=
    VX_BOT_ANALYSIS_INTERVAL;

  if (
    !shouldAnalyzeBot
  ) {
    return;
  }

  vxBotAnalysisTimes.set(
    actorKey,
    now,
  );

  try {
    const result =
      await analyzeVxBot({
        group,
        actor,
        messages: 1,
        commands:
          command
            ? 1
            : 0,
        links:
          hasLink
            ? 1
            : 0,
        repeatedMessages:
          similarity >= 0.5
            ? 1
            : 0,
        messagesPerMinute,
        reason:
          "VX automatic behavioral intelligence analysis.",
        createIncident: true,
      });

    if (
      result.suspectedBot
    ) {
      setDashboardSecurity({
        vxActive: true,
        threats: 1,
      });

      addDashboardEvent(
        "VX",
        "BOT INTEL",
        `Suspected bot detected • risk ${result.riskScore}/100`,
      );

      log.security(
        `VX suspected bot • ${
          actor.phoneNumber ||
          sender
        } • risk ${
          result.riskScore
        }/100 • confidence ${
          result.confidence
        }%`,
      );
    }
  } catch (error) {
    log.error(
      "VX bot intelligence analysis failed.",
      error,
    );
  }
}

// ============================================================
// DAILY OWNER REPORT
// ============================================================

async function sendDailyOwnerReport(
  sock: any,
): Promise<void> {
  const ownerJid =
    `${OWNER_NUMBER}@s.whatsapp.net`;

  try {
    let groupCount = 0;

    try {
      const groups =
        await sock.groupFetchAllParticipating();

      groupCount =
        Object.keys(
          groups,
        ).length;

      setDashboardGroups(
        groupCount,
      );
    } catch {
      groupCount = 0;
    }

    const memory =
      process.memoryUsage();

    const totalMemory =
      os.totalmem();

    const freeMemory =
      os.freemem();

    const usedMemory =
      totalMemory -
      freeMemory;

    const report =
      `╭━━━〔 ${BOT_NAME} 〕━━━╮\n` +
      `┃\n` +
      `┃ 📊 *DAILY OWNER REPORT*\n` +
      `┃\n` +
      `┃ 🟢 Bot: ACTIVE\n` +
      `┃ ⚡ Vortex Core: ONLINE\n` +
      `┃ 🛡️ Protection: ACTIVE\n` +
      `┃ 🚫 Ban System: ACTIVE\n` +
      `┃ 👋 Automation: ACTIVE\n` +
      `┃ 🤖 Trigger System: ACTIVE\n` +
      `┃ 🛡️ VX Security: ACTIVE\n` +
      `┃ 📢 Broadcast: READY\n` +
      `┃\n` +
      `┃ 👥 Groups: ${groupCount}\n` +
      `┃ ⏱️ Uptime: ${formatUptime(
        process.uptime() *
          1000,
      )}\n` +
      `┃\n` +
      `┃ 🧠 MEMORY\n` +
      `┃ • System Used: ${formatBytes(
        usedMemory,
      )}\n` +
      `┃ • System Free: ${formatBytes(
        freeMemory,
      )}\n` +
      `┃ • Process RSS: ${formatBytes(
        memory.rss,
      )}\n` +
      `┃\n` +
      `┃ ⚡ CPU: ${getCpuHealth()}\n` +
      `┃ 🟦 Node.js: ${process.version}\n` +
      `┃ 🖥️ Platform: ${process.platform}\n` +
      `┃\n` +
      `┃ 🔐 Owner Control: ACTIVE\n` +
      `┃\n` +
      `┃ ✅ ALL SYSTEMS OPERATIONAL\n` +
      `┃\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━╯\n` +
      `      ${POWERED_BY}`;

    await sock.sendMessage(
      ownerJid,
      {
        text: report,
      },
    );

    addDashboardEvent(
      "SYSTEM",
      "REPORT",
      "Daily owner report sent.",
    );

    log.success(
      "Daily owner report sent.",
    );
  } catch (error) {
    log.error(
      "Failed to send daily owner report.",
      error,
    );
  }
}

// ============================================================
// OWNER STARTUP GREETING
// ============================================================

async function sendOwnerStartupGreeting(
  sock: any,
  generation: number =
    connectionGeneration,
): Promise<void> {
  const ownerJid =
    `${OWNER_NUMBER}@s.whatsapp.net`;

  const {
    greeting,
    emoji,
  } = getTimeGreeting();

  try {
    await sock.sendMessage(
      ownerJid,
      {
        text:
          `╭━━━〔 ${BOT_NAME} 〕━━━╮\n` +
          `┃\n` +
          `┃ ${emoji} *${greeting}*\n` +
          `┃\n` +
          `┃ ⚡ Welcome back.\n` +
          `┃ Dark Vortex is online and\n` +
          `┃ initializing your command system.\n` +
          `┃\n` +
          `┃ 🔐 Owner Access: ACTIVE\n` +
          `┃ 🟢 Connection: ONLINE\n` +
          `┃ 🛡️ VX Security: INITIALIZING\n` +
          `┃ ⚙️ Core: INITIALIZING\n` +
          `┃\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━╯\n` +
          `      ${POWERED_BY}`,
      },
    );

    log.success(
      "Owner startup greeting sent.",
    );

    addDashboardEvent(
      "SYSTEM",
      "OWNER",
      "Owner startup greeting sent.",
    );

    if (systemReadyTimer) {
      clearTimeout(
        systemReadyTimer,
      );
    }

    systemReadyTimer =
      setTimeout(
        async () => {
          systemReadyTimer =
            null;

          if (shuttingDown) {
            return;
          }

          if (
            generation !==
            connectionGeneration
          ) {
            return;
          }

          if (
            sock !== currentSocket
          ) {
            return;
          }

          if (isResting()) {
            return;
          }

          try {
            let groupCount = 0;

            try {
              const groups =
                await sock.groupFetchAllParticipating();

              groupCount =
                Object.keys(
                  groups,
                ).length;

              setDashboardGroups(
                groupCount,
              );
            } catch {
              groupCount = 0;
            }

            await sock.sendMessage(
              ownerJid,
              {
                text:
                  `╭━━━〔 ${BOT_NAME} 〕━━━╮\n` +
                  `┃\n` +
                  `┃ 🤖 *SYSTEM READY*\n` +
                  `┃\n` +
                  `┃ 🟢 Bot: ACTIVE\n` +
                  `┃ ⚡ Vortex Core: ONLINE\n` +
                  `┃ 🔐 Owner Control: ACTIVE\n` +
                  `┃ 🛡️ Protection: READY\n` +
                  `┃ 🚫 Ban System: READY\n` +
                  `┃ 👋 Automation: READY\n` +
                  `┃ 🤖 Trigger System: READY\n` +
                  `┃ 🛡️ VX Security: ONLINE\n` +
                  `┃ 🔎 VX Detection: ACTIVE\n` +
                  `┃ 📜 VX Audit Logging: ACTIVE\n` +
                  `┃ 📢 Broadcast: READY\n` +
                  `┃ ⚙️ Commands: READY\n` +
                  `┃\n` +
                  `┃ 👥 Connected Groups: ${groupCount}\n` +
                  `┃ 🌍 Timezone: Africa/Lagos\n` +
                  `┃\n` +
                  `┃ 🚀 ALL SYSTEMS OPERATIONAL\n` +
                  `┃\n` +
                  `┃ Dark Vortex is ready\n` +
                  `┃ for your commands.\n` +
                  `┃\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━╯\n` +
                  `      ${POWERED_BY}`,
              },
            );

            addDashboardEvent(
              "SYSTEM",
              "CORE",
              `System ready • ${groupCount} connected groups.`,
            );

            log.success(
              "Owner system-ready message sent.",
            );
          } catch (error) {
            log.error(
              "Failed to send delayed owner system message.",
              error,
            );
          }
        },
        5 * 60 * 1000,
      );
  } catch (error) {
    log.error(
      "Failed to send owner startup greeting.",
      error,
    );
  }
}

// ============================================================
// DAILY REPORT SCHEDULER
// ============================================================

function startDailyOwnerReport(
  sock: any,
  generation: number =
    connectionGeneration,
): void {
  const ONE_DAY =
    24 * 60 * 60 * 1000;

  if (dailyReportTimer) {
    clearInterval(
      dailyReportTimer,
    );
  }

  dailyReportTimer =
    setInterval(
      async () => {
        if (shuttingDown) {
          return;
        }

        if (
          generation !==
          connectionGeneration
        ) {
          return;
        }

        if (
          sock !== currentSocket
        ) {
          return;
        }

        if (isResting()) {
          return;
        }

        await sendDailyOwnerReport(
          sock,
        );
      },
      ONE_DAY,
    );

  log.system(
    "Daily owner report scheduler • ACTIVE",
  );
}

// ============================================================
// SPECIAL MESSAGE DETECTION
// ============================================================

function getMessageTypeNames(
  message: any,
): string[] {
  if (
    !message ||
    typeof message !== "object"
  ) {
    return [];
  }

  return Object.keys(
    message,
  );
}

function isPotentialStatusShare(
  message: any,
): boolean {
  if (
    !message ||
    typeof message !== "object"
  ) {
    return false;
  }

  const keys =
    getMessageTypeNames(
      message,
    ).map((key) =>
      key.toLowerCase(),
    );

  const directStatusKeys = [
    "statusmentionmessage",
    "statusmessage",
    "groupstatusmessage",
    "statussharemessage",
    "statusshare",
    "statusmention",
  ];

  if (
    keys.some((key) =>
      directStatusKeys.includes(
        key,
      ),
    )
  ) {
    return true;
  }

  const visited =
    new Set<object>();

  function scan(
    value: any,
    depth: number,
  ): boolean {
    if (
      depth > 8 ||
      value === null ||
      typeof value !== "object"
    ) {
      return false;
    }

    if (
      visited.has(value)
    ) {
      return false;
    }

    visited.add(value);

    for (
      const [key, child] of Object.entries(
        value,
      )
    ) {
      const normalizedKey =
        key.toLowerCase();

      if (
        normalizedKey.includes(
          "statusmention",
        ) ||
        normalizedKey.includes(
          "statusshare",
        ) ||
        normalizedKey ===
          "groupstatusmessage"
      ) {
        return true;
      }

      if (
        normalizedKey ===
          "statussource" ||
        normalizedKey ===
          "statussourcetype"
      ) {
        if (
          typeof child ===
            "string" &&
          child
            .toLowerCase()
            .includes(
              "status",
            )
        ) {
          return true;
        }
      }

      if (
        scan(
          child,
          depth + 1,
        )
      ) {
        return true;
      }
    }

    return false;
  }

  return scan(
    message,
    0,
  );
}

// ============================================================
// GROUP REGISTRY SYNC
// ============================================================

async function syncGroupRegistry(
  sock: any,
): Promise<void> {
  try {
    const groups =
      await sock.groupFetchAllParticipating();

    const groupList =
      Object.values(
        groups || {},
      );

    log.group(
      `Group registry • found ${groupList.length} group(s)`,
    );

    setDashboardGroups(
      groupList.length,
    );

    addDashboardEvent(
      "GROUPS",
      "REGISTRY",
      `${groupList.length} group(s) synchronized.`,
    );

    for (
      const group of groupList as any[]
    ) {
      if (
        !group?.id ||
        !group.id.endsWith(
          "@g.us",
        )
      ) {
        continue;
      }

      try {
        await registerGroup(
          group.id,
          group.subject ||
            "Unknown Group",
        );
      } catch (err) {
        log.error(
          `Failed to register group ${group.id}`,
          err,
        );
      }
    }

    log.success(
      "Group registry synchronization complete.",
    );
  } catch (err) {
    log.error(
      "Group registry synchronization failed.",
      err,
    );
  }
}
// ============================================================
// DARK VORTEX — TERMINAL MESSAGE DETAILS
// ============================================================

function getTerminalMessageType(
  msg: WAMessage,
): string {
  const content = msg.message;

  if (!content) {
    return "Unknown";
  }

  if (content.conversation || content.extendedTextMessage) {
    return "Text";
  }

  if (content.imageMessage) {
    return "Image";
  }

  if (content.videoMessage) {
    return "Video";
  }

  if (content.audioMessage) {
    return "Audio";
  }

  if (content.documentMessage) {
    return "Document";
  }

  if (content.stickerMessage) {
    return "Sticker";
  }

  if (content.locationMessage || content.liveLocationMessage) {
    return "Location";
  }

  if (content.contactMessage || content.contactsArrayMessage) {
    return "Contact";
  }

  if (content.pollCreationMessage || content.pollCreationMessageV3) {
    return "Poll";
  }

  if (content.reactionMessage) {
    return "Reaction";
  }

  return "Other";
}


function getTerminalSource(
  jid: string,
): string {
  if (jid.endsWith("@g.us")) {
    return "Group";
  }

  if (jid.endsWith("@broadcast")) {
    return "Broadcast";
  }

  if (jid === "status@broadcast") {
    return "Status";
  }

  return "Private";
}


function getTerminalSenderType(
  owner: boolean,
  fromMe: boolean,
): string {
  if (fromMe) {
    return "Self";
  }

  if (owner) {
    return "Owner";
  }

  return "User";
}


function formatTerminalContent(
  text: string,
): string {
  const clean =
    text
      .replace(/\s+/g, " ")
      .trim();

  if (!clean) {
    return "none";
  }

  const maxLength = 80;

  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, maxLength - 3)}...`;
}


function logIncomingTerminalMessage(
  msg: WAMessage,
  jid: string,
  text: string,
  owner: boolean,
  fromMe: boolean,
  isCommand: boolean,
  commandName?: string,
  args?: string[],
): void {
  const type =
    getTerminalMessageType(msg);

  const source =
    getTerminalSource(jid);

  const senderType =
    getTerminalSenderType(
      owner,
      fromMe,
    );

  if (isCommand) {
    const argumentText =
      args && args.length > 0
        ? args.join(" ")
        : "none";

    log.command(
      [
        "➜ COMMAND RECEIVED",
        `   ├─ Type     : ${type}`,
        `   ├─ Source   : ${source}`,
        `   ├─ Sender   : ${senderType}`,
        "   ├─ Command  : YES",
        `   ├─ Name     : ${commandName || "unknown"}`,
        `   └─ Arguments: ${formatTerminalContent(argumentText)}`,
      ].join("\n"),
    );

    return;
  }

  log.info(
    [
      "➜ INCOMING MESSAGE",
      `   ├─ Type     : ${type}`,
      `   ├─ Source   : ${source}`,
      `   ├─ Sender   : ${senderType}`,
      "   ├─ Command  : NO",
      `   └─ Content  : ${formatTerminalContent(text)}`,
    ].join("\n"),
  );
}


// ============================================================
// 🌐 DARK VORTEX PAIRING API SESSION CONTROL
// ============================================================

async function startApiSession(
  mode: "qr" | "pairing",
  phoneNumber?: string,
): Promise<void> {
  if (shuttingDown) {
    throw new Error(
      "Dark Vortex is shutting down.",
    );
  }

  if (
    mode === "pairing" &&
    !phoneNumber
  ) {
    throw new Error(
      "Phone number is required for pairing mode.",
    );
  }

  apiSessionRequested = true;
  setPairingArtifactVisibility(true);

  runtimePairingMode =
    mode;

  runtimePairingNumber =
    phoneNumber || "";

  pairingCodeRequested =
    false;

  updatePairingApiState({
    status: "STARTING",
    mode,
    qr: null,
    pairingCode: null,
    phoneNumber:
      phoneNumber || null,
    connectedNumber: null,
    message:
      mode === "qr"
        ? "Preparing QR authentication..."
        : "Preparing phone-number pairing...",
  });

  // ----------------------------------------------------------
  // If an old socket exists, close it first.
  // ----------------------------------------------------------

  if (currentSocket) {
    try {
      await closeActiveSocket();
    } catch (error) {
      log.error(
        "Failed to close existing socket for API session.",
        error,
      );
    }

    currentSocket = null;

    setActiveSocket(null);

    updateRestSocket(null);

    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          750,
        ),
    );
  }

  if (reconnectTimer) {
    clearTimeout(
      reconnectTimer,
    );

    reconnectTimer = null;
  }

  enableReconnect();

  await startBot();
}

async function stopApiSession(): Promise<void> {
  websitePairingRequested = false;
  setPairingArtifactVisibility(false);
  apiSessionRequested =
    true;

  if (reconnectTimer) {
    clearTimeout(
      reconnectTimer,
    );

    reconnectTimer = null;
  }

  disableReconnect();

  try {
    await stopAllVxMonitors();
  } catch (error) {
    log.error(
      "Failed to stop VX monitoring before API session stop.",
      error,
    );
  }

  if (currentSocket) {
    try {
      await closeActiveSocket();
    } catch (error) {
      log.error(
        "Failed to close WhatsApp socket from API.",
        error,
      );
    }
  }

  currentSocket = null;

  setActiveSocket(null);

  updateRestSocket(null);

  botStarted = false;
  botStarting = false;
  socketCreationInProgress =
    false;

  clearConnectionTimers();

  updatePairingApiState({
    status: "DISCONNECTED",
    qr: null,
    pairingCode: null,
    connectedNumber: null,
    message:
      "WhatsApp session stopped.",
  });
}

async function recoverFromAuthenticationFailure(): Promise<void> {
  if (authRecoveryInProgress) {
    return;
  }

  authRecoveryInProgress = true;

  try {
    log.warn(
      "[AUTH RECOVERY] Authentication failure detected. Clearing WhatsApp session.",
    );

    setSessionStatus("OFFLINE");

    setPairingArtifactVisibility(false)

    await clearWhatsAppAuth();

    log.info(
      "[AUTH RECOVERY] Auth state cleared. A fresh QR/pairing session is now required.",
    );
  } catch (error) {
    log.error(
      "[AUTH RECOVERY] Failed to recover authentication state.",
      error,
    );
  } finally {
    authRecoveryInProgress = false;
  }
}

// ============================================================
// START BOT
// ============================================================

async function startBot(): Promise<void> {
  if (
    botStarting ||
    socketCreationInProgress ||
    shuttingDown ||
    automaticSignalCleanupInProgress
  ) {
    return;
  }

  if (currentSocket) {
    log.warn(
      "Socket creation skipped • an active WhatsApp socket already exists.",
    );

    return;
  }

  botStarting = true;
  socketCreationInProgress =
    true;

  pairingCodeRequested = false;

  try {
    startupBox(
      BOT_NAME,
      POWERED_BY,
    );

    startupLine(
      "STATUS",
      "Initializing Dark Vortex",
    );

    startupLine(
      "ENGINE",
      "WhatsApp / Baileys",
    );

    startupLine(
      "RUNTIME",
      `Node.js ${process.version}`,
    );

    startupLine(
      "PLATFORM",
      `${process.platform} ${process.arch}`,
    );

    startupLine(
      "PROCESS",
      `${process.pid}`,
    );

    endStartupBox();

    log.system(
      "Starting WhatsApp bot...",
    );

    const {
      state,
      saveCreds,
    } =
      await useMultiFileAuthState(
        process.env.WHATSAPP_AUTH_DIR?.trim() || "./auth",
      )

    // ========================================================
// FRESH AUTHENTICATION WAIT
// ========================================================
//
// Do not create a WhatsApp socket until the website
// explicitly selects QR or phone-number pairing.
//

if (
  !state.creds.registered &&
  !apiSessionRequested
) {
  log.connect(
    "Fresh authentication detected • waiting for website to select QR or Pairing Code.",
  );

  log.info(
    "No authentication method will be requested automatically.",
  );

  disableReconnect();

  socketCreationInProgress =
    false;

  botStarting = false;

  return;
}
    let version:
      | [number, number, number]
      | undefined;

    try {
      const latest =
        await fetchLatestBaileysVersion();

      version =
        latest.version;

      log.connect(
        `WhatsApp Web ${version.join(
          ".",
        )} ${
          latest.isLatest
            ? "• latest"
            : "• update available"
        }`,
      );
    } catch {
      log.warn(
        "Could not fetch latest WhatsApp Web version.",
      );
    }

    const maskedOwner =
      OWNER_NUMBER.length > 6
        ? `${OWNER_NUMBER.slice(
            0,
            3,
          )}${"*".repeat(
            Math.max(
              0,
              OWNER_NUMBER.length -
                6,
            ),
          )}${OWNER_NUMBER.slice(
            -3,
          )}`
        : "***";

    log.system(
      `Owner account: ${maskedOwner}`,
    );

    if (!state.creds.registered) {
  // ========================================================
  // DETERMINE AUTHENTICATION MODE
  // ========================================================
  //
  // Website/API selection takes priority when an API
  // session has been requested.
  //
  // Otherwise fall back to the .env configuration.
  //

  const activePairingMode =
    apiSessionRequested
      ? runtimePairingMode
      : isPairingMode()
        ? "pairing"
        : "qr";

  const activePairingNumber =
    apiSessionRequested
      ? runtimePairingNumber
      : getPairingNumber();

  if (activePairingMode === "pairing") {
    if (!activePairingNumber) {
      log.error(
        "Phone-number pairing was selected but no phone number was provided.",
      );

      log.info(
        "Provide the phone number in international format without +, spaces, or dashes.",
      );

      throw new Error(
        "A phone number is required for pairing mode.",
      );
    }

    log.connect(
      "Authentication required • phone-number pairing",
    );

    log.info(
      `Pairing account: ${maskPhoneNumber(
        activePairingNumber,
      )}`,
    );

    log.info(
      "A real WhatsApp pairing code will be requested from Baileys.",
    );
  } else {
    log.connect(
      "Authentication required • QR pairing",
    );

    log.info(
      "A QR code will be generated for WhatsApp authentication.",
    );
  }
} else {
  log.success(
    "Existing authentication detected • saved session",
  );
}

    log.security(
      "Protection system • ACTIVE",
    );

    log.security(
      "Permanent ban system • ACTIVE",
    );

    log.security(
      "VX Security Intelligence • ACTIVE",
    );

    log.security(
      "VX Behavioral Detection • ACTIVE",
    );

    log.security(
      "VX Bot Intelligence • ACTIVE",
    );

    log.security(
      "VX Audit Logging • ACTIVE",
    );

    log.system(
      "Welcome/Goodbye automation • ACTIVE",
    );

    log.system(
      "Trigger system • ACTIVE",
    );

    log.system(
      "Broadcast system • ACTIVE",
    );

    log.system(
      "Automatic maintenance • ACTIVE",
    );

    log.security(
      "Automatic Signal session cleanup • ACTIVE",
    );

    divider();
// ============================================================
// LIBSIGNAL OUTPUT PROTECTION
// ============================================================
//
// libsignal can directly print sensitive Signal session objects
// with console.info()/console.warn(). Suppress only those specific
// internal messages. All normal Dark Vortex terminal output remains
// untouched.
//

const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;

function isSensitiveSignalOutput(
  args: unknown[],
): boolean {
  const first =
    typeof args[0] === "string"
      ? args[0]
      : "";

  return (
    /^Closing session:?$/i.test(first.trim()) ||
    /^Opening session:?$/i.test(first.trim()) ||
    /^Session already closed/i.test(first.trim()) ||
    /^Decrypted message with closed session\.?$/i.test(
      first.trim(),
    )
  );
}

console.info = (...args: unknown[]) => {
  if (isSensitiveSignalOutput(args)) {
    return;
  }

  originalConsoleInfo(...args);
};

console.warn = (...args: unknown[]) => {
  if (isSensitiveSignalOutput(args)) {
    return;
  }

  originalConsoleWarn(...args);
};

    const sock =
      makeWASocket({
        auth: state,
        ...(version
          ? { version }
          : {}),
        logger,
        browser:
          Browsers.windows(
            "Chrome",
          ),
        connectTimeoutMs:
          120_000,
        defaultQueryTimeoutMs:
          60_000,
        keepAliveIntervalMs:
          10_000,
        markOnlineOnConnect:
          false,
        generateHighQualityLinkPreview:
          true,
      });
    // ========================================================
// 🌑 DARK VORTEX — OUTGOING MESSAGE TRACKING
// ========================================================

const originalSendMessage =
  sock.sendMessage.bind(sock);

sock.sendMessage = async (
  jid,
  content,
  options,
) => {

  const sentMessage =
    await originalSendMessage(
      jid,
      content,
      options,
    );

  trackOutgoingMessage(
    sentMessage,
  );

  return sentMessage;
};

    currentSocket = sock;

    updateRestSocket(sock);

    setActiveSocket(sock);

    enableReconnect();

    socketCreationInProgress =
      false;

    // ========================================================
    // CREDENTIALS
    // ========================================================

    sock.ev.on(
      "creds.update",
      saveCreds,
    );

    // ========================================================
    // CONNECTION
    // ========================================================

    sock.ev.on(
      "connection.update",
      async (update) => {
        const {
          connection,
          lastDisconnect,
          qr,
        } = update;

        if (
          connection ===
          "connecting"
        ) {
          setSessionStatus("CONNECTING");
          setPairingConnecting();
        }
  // ─────────────────────────────────────────────────────────────
// PHONE-NUMBER PAIRING
// Website/API selection takes priority over .env configuration.
// ─────────────────────────────────────────────────────────────
const activePairingMode =
  apiSessionRequested
    ? runtimePairingMode
    : isPairingMode()
      ? "pairing"
      : "qr";

const activePairingNumber =
  apiSessionRequested
    ? runtimePairingNumber
    : getPairingNumber();

if (
  qr &&
  !state.creds.registered &&
  activePairingMode === "pairing" &&
  !pairingCodeRequested
) {
  const pairingNumber =
    activePairingNumber;

  if (!pairingNumber) {
    pairingCodeRequested = false;

    log.error(
      "Phone-number pairing selected but no phone number was provided.",
    );
  } else if (
    pairingNumber.length < 8
  ) {
    pairingCodeRequested = false;

    log.error(
      `Invalid pairing number: ${maskPhoneNumber(
        pairingNumber,
      )}`,
    );
  } else {
    pairingCodeRequested = true;

    log.connect(
      `Phone-number pairing ready • requesting code for ${maskPhoneNumber(
        pairingNumber,
      )}`,
    );

    try {
      const pairingCode =
        await sock.requestPairingCode(
          pairingNumber,
        );

      const formattedPairingCode =
        pairingCode.length === 8
          ? `${pairingCode.slice(
              0,
              4,
            )}-${pairingCode.slice(4)}`
          : pairingCode;

      setPairingCode(
        formattedPairingCode,
      );

      log.connect(
        `🔑 PAIRING CODE: ${formattedPairingCode}`,
      );

      log.info(
        "Open WhatsApp → Linked Devices → Link with phone number and enter the displayed code.",
      );
    } catch (error) {
      pairingCodeRequested = false;

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      log.error(
        `Phone-number pairing request failed: ${message}`,
      );
    }
  }
}
        if (
          connection ===
          "connecting"
        ) {
          log.connect(
            "Connecting to WhatsApp...",
          );

          setDashboardConnection(
            "CONNECTING",
            false,
          );

          addDashboardEvent(
            "CONNECTION",
            "WHATSAPP",
            "Connecting to WhatsApp...",
          );
        }

        // ----------------------------------------------------
// QR AUTHENTICATION
// ----------------------------------------------------

if (
  qr &&
  !state.creds.registered &&
  activePairingMode === "qr"
) {
  setPairingQr(qr);

  console.log("");

  console.log(
    "╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮",
  );

  console.log(
    "┃ 🌑 DARK VORTEX — QR PAIRING",
  );

  console.log(
    "┃",
  );

  console.log(
    "┃ Scan this QR with WhatsApp:",
  );

  console.log(
    "┃ WhatsApp → Linked Devices → Link a Device",
  );

  console.log(
    "╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
  );

  console.log("");

  qrcode.generate(
    qr,
    {
      small: true,
    },
  );

  console.log("");

  log.connect(
    "QR code displayed • waiting for WhatsApp scan...",
  );

  addDashboardEvent(
    "AUTH",
    "WHATSAPP",
    "QR authentication code displayed.",
  );
}

        // ----------------------------------------------------
        // OPEN
        // ----------------------------------------------------

        if (
          connection ===
          "open"
        ) {

        const connectedNumber =
          sock.user?.id
            ?.replace(/:\d+/g, "")
            ?.replace(/@.*$/, "");

        markSessionConnected(
  connectedNumber,
);

setSessionAccount(
  connectedNumber || null,
);

        setPairingConnected(
          connectedNumber,
        );
          if (shuttingDown) {
            return;
          }

          if (
            !isCurrentSocket(
              sock,
            )
          ) {
            log.warn(
              "Ignoring open event from stale WhatsApp socket.",
            );

            try {
              sock.ws?.close();
            } catch {}

            return;
          }

          currentSocket = sock;

          apiSessionRequested = false;

          updateRestSocket(sock);

          setActiveSocket(sock);

          botStarting = false;

          socketGeneration += 1;

          connectionGeneration +=
            1;



          const generation =
            connectionGeneration;

          clearConnectionTimers();

          resetSignalSessionErrors();

          setDashboardConnection(
            "ONLINE",
            true,
          );

          setDashboardSecurity({
            vxActive: true,
          });

          addDashboardEvent(
            "CONNECTION",
            "WHATSAPP",
            "WhatsApp connection established.",
          );

          console.log("");

          console.log(
            "╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮",
          );

          console.log(
            `┃ ${BOT_NAME}`,
          );

          console.log(
            "┃",
          );

          console.log(
            "┃ 🟢 WHATSAPP CONNECTED",
          );

          console.log(
            "┃",
          );

          console.log(
            "┃ 🔐 Authentication: SAVED",
          );

          console.log(
            "┃ 🛡️ Protection System: READY",
          );

          console.log(
            "┃ 🚫 Permanent Ban System: READY",
          );

          console.log(
            "┃ 👋 Automation System: READY",
          );

          console.log(
            "┃ 🤖 Trigger System: READY",
          );

          console.log(
            "┃ 🛡️ VX Security: ONLINE",
          );

          console.log(
            "┃ 🔎 VX Detection: ACTIVE",
          );

          console.log(
            "┃ 🤖 VX Bot Intelligence: ACTIVE",
          );

          console.log(
            "┃ 📜 VX Audit Logging: ACTIVE",
          );

          console.log(
            "┃ 📢 Broadcast System: READY",
          );

          console.log(
            "┃",
          );

          console.log(
            `┃ ${POWERED_BY}`,
          );

          console.log(
            "╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
          );

          console.log("");

          await syncGroupRegistry(
            sock,
          );

          if (!botStarted) {
            botStarted = true;

            await sendOwnerStartupGreeting(
              sock,
            );

            lastTimeGreetingKey =
              getGreetingPeriodKey();

            scheduleNextTimeGreeting(
              sock,
              generation,
            );

            startDailyOwnerReport(
              sock,
            );

            setDashboardMemoryCleanup(
              "ACTIVE",
            );

            addDashboardEvent(
              "MEMORY",
              "CLEANER",
              "Automatic memory monitoring active.",
            );

            startAutomaticMemoryCleanup(sock);
          }

          return;
        }

        // ----------------------------------------------------
        // CLOSED
        // ----------------------------------------------------

        if (
          connection ===
          "close"
        ) {
          const socketIsCurrent =
            isCurrentSocket(
              sock,
            );

            markSessionDisconnected();

          if (!socketIsCurrent) {
            log.warn(
              "Ignoring close event from stale WhatsApp socket.",
            );

            return;
          }

          setPairingDisconnected(
            "WhatsApp session disconnected.",
          );

          botStarted = false;
          botStarting = false;

          setDashboardConnection(
            "OFFLINE",
            false,
          );

          addDashboardEvent(
            "CONNECTION",
            "WHATSAPP",
            "WhatsApp connection closed.",
          );

          clearConnectionTimers();

          connectionGeneration +=
            1;

          lastTimeGreetingKey =
            null;

          const disconnectError =
            lastDisconnect?.error as
              | Boom
              | undefined;

          const statusCode =
            disconnectError
              ?.output
              ?.statusCode;

          const disconnectMessage =
            disconnectError?.message ||
            "";

          const lifecycleAction =
            getLifecycleAction();

          console.log("");

          console.log(
            "❌ WhatsApp connection closed.",
          );

          console.log(
            `⚠️ Disconnect code: ${
              statusCode ??
              "unknown"
            }`,
          );

          console.log(
            `⚠️ Reason: ${
              disconnectMessage ||
              "unknown"
            }`,
          );

          setActiveSocket(null);

          // --------------------------------------------------
          // AUTOMATIC SIGNAL CLEANUP
          // --------------------------------------------------

          if (
            automaticSignalCleanupInProgress
          ) {
            currentSocket =
              null;

            log.security(
              "🧹 Connection closed as part of automatic Signal session cleanup.",
            );

            return;
          }

          // --------------------------------------------------
          // STOP VX MONITORING
          // --------------------------------------------------

          try {
            await stopAllVxMonitors();

            log.security(
              "VX live monitoring sessions stopped.",
            );
          } catch (error) {
            log.error(
              "Failed to stop VX monitoring sessions.",
              error,
            );
          }

          currentSocket = null;

          // --------------------------------------------------
          // CONNECTION REST
          // --------------------------------------------------

          if (
            isResting() &&
            getRestMode() ===
              "connection"
          ) {
            log.system(
              "Connection rest active • automatic reconnect paused until rest ends.",
            );

            addDashboardEvent(
              "REST",
              "LIFECYCLE",
              "Connection rest active • reconnect paused.",
            );

            return;
          }

          // --------------------------------------------------
          // SHUTDOWN
          // --------------------------------------------------

          if (
            lifecycleAction ===
            "shutdown"
          ) {
            console.log("");

            console.log(
              "🛑 Dark Vortex shutdown requested.",
            );

            if (reconnectTimer) {
              clearTimeout(
                reconnectTimer,
              );

              reconnectTimer = null;
            }

            if (dailyReportTimer) {
              clearInterval(
                dailyReportTimer,
              );

              dailyReportTimer = null;
            }

            if (systemReadyTimer) {
              clearTimeout(
                systemReadyTimer,
              );

              systemReadyTimer = null;
            }

            if (timeGreetingTimer) {
              clearTimeout(
                timeGreetingTimer,
              );

              timeGreetingTimer = null;
            }

            stopAutomaticMemoryCleanup(sock);

            clearLifecycleAction();

            shuttingDown = true;

            disableReconnect();

            addDashboardEvent(
              "SYSTEM",
              "SHUTDOWN",
              "Dark Vortex shutdown requested.",
            );

            shutdownTerminalDashboard();

            console.log(
              "🛑 Automatic reconnection disabled.",
            );

            console.log(
              "🛑 Dark Vortex stopped.",
            );

            process.exit(0);
          }

          // --------------------------------------------------
          // MANUAL RESTART
          // --------------------------------------------------

          if (
            lifecycleAction ===
            "restart"
          ) {
            console.log("");

            console.log(
              "♻️ Dark Vortex restart requested.",
            );

            addDashboardEvent(
              "SYSTEM",
              "RESTART",
              "Manual restart requested.",
            );

            if (reconnectTimer) {
              clearTimeout(
                reconnectTimer,
              );

              reconnectTimer = null;
            }

            clearLifecycleAction();

            console.log(
              "♻️ Starting a fresh WhatsApp connection...",
            );

            reconnectTimer =
              setTimeout(
                () => {
                  reconnectTimer =
                    null;

                  if (
                    shuttingDown ||
                    isLifecycleInProgress() ||
                    currentSocket
                  ) {
                    return;
                  }

                  void startBot().catch(
                    (error) => {
                      console.error(
                        "❌ Restart failed:",
                        error,
                      );
                    },
                  );
                },
                1500,
              );

            return;
          }

          // --------------------------------------------------
// LOGGED OUT
// --------------------------------------------------

if (
  statusCode === DisconnectReason.loggedOut
) {
  log.warn(
    "[AUTH RECOVERY] WhatsApp session was logged out.",
  );

  await recoverFromAuthenticationFailure();

  currentSocket = null;

  setSessionStatus("OFFLINE");

  setPairingDisconnected();

  return;
}

          // --------------------------------------------------
          // WEBSITE/API SESSION REQUEST
          // --------------------------------------------------
          //
          // The website may intentionally close the existing
          // socket before requesting a new QR/pairing session.
          //
          // This is NOT a WhatsApp logout.
          // NEVER delete auth files here.
          // --------------------------------------------------

          if (apiSessionRequested) {
            log.warn(
              "WhatsApp socket closed during an API pairing session request. Preparing a fresh authentication session.",
            );

            currentSocket = null;

            setDashboardConnection(
              "CONNECTING",
              false,
            );

            addDashboardEvent(
              "AUTH",
              "WHATSAPP",
              "Previous socket closed for a new website pairing session.",
            );

            return;
          }

          // --------------------------------------------------
          // AUTHENTICATION FAILURE / REAL WHATSAPP LOGOUT
          // --------------------------------------------------
          //
          // Only a genuine authentication failure should
          // destroy the saved WhatsApp session.
          //
          // Normal network disconnects NEVER reach this block.
          // --------------------------------------------------

          const isAuthenticationFailure =
            statusCode === 401 ||
            statusCode ===
              DisconnectReason.loggedOut;

          if (
            isAuthenticationFailure
          ) {
            log.warn(
              "[AUTH RECOVERY] WhatsApp authentication failure detected.",
            );

            try {
              await recoverFromAuthenticationFailure();

              log.warn(
                "[AUTH RECOVERY] Saved WhatsApp authentication removed.",
              );
            } catch (error) {
              log.error(
                "[AUTH RECOVERY] Failed to remove saved WhatsApp authentication.",
                error,
              );
            }

            currentSocket = null;

            setSessionStatus(
              "OFFLINE",
            );

            setPairingDisconnected(
              "WhatsApp session expired or was logged out. A new QR code or pairing code is required.",
            );

            setDashboardConnection(
              "OFFLINE",
              false,
            );

            addDashboardEvent(
              "AUTH",
              "WHATSAPP",
              "WhatsApp authentication invalidated • saved auth cleared • fresh pairing required.",
            );

            console.log("");

            console.log(
              "🚫 WhatsApp authentication is no longer valid.",
            );

            console.log(
              "🧹 Saved authentication has been cleared.",
            );

            console.log(
              "🔐 A new QR code or pairing code is required.",
            );

            return;
          }

          // --------------------------------------------------
          // NORMAL UNEXPECTED DISCONNECT
          // --------------------------------------------------
          //
          // IMPORTANT:
          // Auth files are intentionally preserved here.
          //
          // This covers:
          // • network interruption
          // • temporary WhatsApp connection loss
          // • server/network timeout
          // • temporary socket failure
          // • Railway restart/reconnect situations
          //
          // Dark Vortex will attempt to restore the existing
          // WhatsApp session instead of forcing re-pairing.
          // --------------------------------------------------

          if (
            !isReconnectEnabled() ||
            shuttingDown ||
            isLifecycleInProgress() ||
            (!apiSessionRequested &&
              !state.creds.registered)
          ) {
            return;
          }

          setDashboardConnection(
            "RECONNECTING",
            false,
          );

          addDashboardEvent(
            "CONNECTION",
            "RECONNECT",
            "Automatic reconnect scheduled in 5 seconds. Saved authentication will be preserved.",
          );

          console.log(
            "♻️ Reconnecting Dark Vortex in 5 seconds...",
          );

          console.log(
            "🔐 Saved WhatsApp authentication will be preserved.",
          );

          if (reconnectTimer) {
            clearTimeout(
              reconnectTimer,
            );
          }

          reconnectTimer =
            setTimeout(
              () => {
                reconnectTimer =
                  null;

                if (
                  shuttingDown ||
                  isLifecycleInProgress() ||
                  currentSocket
                ) {
                  return;
                }

                void startBot().catch(
                  (error) => {
                    console.error(
                      "❌ Reconnect failed:",
                      error,
                    );
                  },
                );
              },
              5000,
            );

          // --------------------------------------------------
          // NORMAL UNEXPECTED DISCONNECT
          // --------------------------------------------------

          if (
            !isReconnectEnabled() ||
            shuttingDown ||
            isLifecycleInProgress() ||
            (!apiSessionRequested &&
              !state.creds.registered)
          ) {
            return;
          }

          setDashboardConnection(
            "RECONNECTING",
            false,
          );

          addDashboardEvent(
            "CONNECTION",
            "RECONNECT",
            "Automatic reconnect scheduled in 5 seconds.",
          );

          console.log(
            "♻️ Reconnecting Dark Vortex in 5 seconds...",
          );

          if (reconnectTimer) {
            clearTimeout(
              reconnectTimer,
            );
          }

          reconnectTimer =
            setTimeout(
              () => {
                reconnectTimer =
                  null;

                if (
                  shuttingDown ||
                  isLifecycleInProgress() ||
                  currentSocket
                ) {
                  return;
                }

                void startBot().catch(
                  (error) => {
                    console.error(
                      "❌ Reconnect failed:",
                      error,
                    );
                  },
                );
              },
              5000,
            );
        }
      },
    );

    // ========================================================
    // GROUP PARTICIPANTS
    // ========================================================

    sock.ev.on(
      "group-participants.update",
      async ({
        id,
        participants,
        action,
      }) => {
        try {
          let metadata;

          try {
            metadata =
              await sock.groupMetadata(
                id,
              );
          } catch {
            metadata =
              undefined;
          }

          const groupName =
            metadata?.subject ||
            "this group";

          const participantCount =
            metadata
              ?.participants
              ?.length;

          addDashboardEvent(
            "GROUP",
            "PARTICIPANTS",
            `${action.toUpperCase()} • ${participants.length} participant(s) • ${groupName}`,
          );

          // --------------------------------------------------
          // MEMBER ADDED
          // --------------------------------------------------

          if (
            action ===
            "add"
          ) {
            for (
              const participant of participants
            ) {
              const participantJid =
                participant.id;

              if (
                !participantJid
              ) {
                continue;
              }

              try {
                await analyzeVxBot({
                  group:
                    createVxGroupContext(
                      id,
                      groupName,
                      participantCount,
                    ),
                  actor: {
                    jid:
                      participantJid,
                    phoneNumber:
                      normalizePhoneNumber(
                        participantJid,
                      ),
                    name:
                      undefined,
                    isBot:
                      undefined,
                  },
                  messages: 0,
                  commands: 0,
                  links: 0,
                  repeatedMessages: 0,
                  messagesPerMinute: 0,
                  reason:
                    "Participant joined group and was registered for VX behavioral observation.",
                  createIncident:
                    false,
                });
              } catch (error) {
                log.error(
                  "VX participant registration failed.",
                  error,
                );
              }

              const wasBanned =
                await enforceBan(
                  sock,
                  id,
                  participantJid,
                );

              if (
                wasBanned
              ) {
                continue;
              }

              await sendWelcome(
                sock,
                id,
                participantJid,
                groupName,
              );
            }
          }

          // --------------------------------------------------
          // MEMBER REMOVED
          // --------------------------------------------------

          if (
            action ===
            "remove"
          ) {
            for (
              const participant of participants
            ) {
              const participantJid =
                participant.id;

              if (
                !participantJid
              ) {
                continue;
              }

              await sendGoodbye(
                sock,
                id,
                participantJid,
                groupName,
              );
            }
          }

          // --------------------------------------------------
          // PROMOTED
          // --------------------------------------------------

          if (
            action ===
            "promote"
          ) {
            for (
              const participant of participants
            ) {
              log.action(
                `Member promoted: ${participant.id}`,
              );
            }
          }

          // --------------------------------------------------
          // DEMOTED
          // --------------------------------------------------

          if (
            action ===
            "demote"
          ) {
            for (
              const participant of participants
            ) {
              log.action(
                `Member demoted: ${participant.id}`,
              );
            }
          }
        } catch (error) {
          log.error(
            "Group participant event error.",
            error,
          );
        }
      },
    );

    // ========================================================
    // MESSAGE ENGINE
    // ========================================================

    sock.ev.on(
      "messages.upsert",
      async ({
        messages,
        type,
      }) => {
        if (
          type !==
          "notify"
        ) {
          return;
        }

        for (
  const msg of messages
) {
  try {
    incrementDashboardMessages();

    // ------------------------------------------------
    // BASIC VALIDATION
    // ------------------------------------------------

    if (
      !msg.message
    ) {
      continue;
    }

    rememberMessage(msg);

    // ------------------------------------------------
    // DUPLICATE MESSAGE PROTECTION
    // ------------------------------------------------
    //
    // WhatsApp/Baileys can occasionally surface the same
    // message more than once. Never execute a command,
    // VX operation, trigger or moderation action twice
    // for the same WhatsApp message.
    //

    const messageId =
      msg.key.id;

    if (
      hasProcessedMessage(
        messageId,
      )
    ) {
      log.warn(
        `Duplicate message ignored • ${messageId}`,
      );

      continue;
    }
            const jid =
              msg.key.remoteJid;

            if (!jid) {
              continue;
            }

            let groupMetadata:
              | any
              | undefined;

            if (
              jid.endsWith(
                "@g.us",
              )
            ) {
              try {
                groupMetadata =
                  await sock.groupMetadata(
                    jid,
                  );

                await registerGroup(
                  jid,
                  groupMetadata.subject ||
                    "Unknown Group",
                );
              } catch (err) {
                log.error(
                  "Failed to register group.",
                  err,
                );
              }
            }

            // ------------------------------------------------
            // ACTUAL WHATSAPP STATUS
            // ------------------------------------------------

            if (
              jid ===
              "status@broadcast"
            ) {
              continue;
            }

            // ------------------------------------------------
            // RAW MESSAGE OBJECT
            // ------------------------------------------------

            const message =
              msg.message as any;

            // ------------------------------------------------
            // DETECT SPECIAL STATUS SHARE
            // ------------------------------------------------

            const specialStatusShare =
              jid.endsWith(
                "@g.us",
              ) &&
              isPotentialStatusShare(
                message,
              );

            // ------------------------------------------------
            // SENDER
            // ------------------------------------------------

            const sender =
              msg.key.participant ||
              (
                msg.key as {
                  participantAlt?: string;
                }
              ).participantAlt ||
              msg.key.remoteJid ||
              "";

            const senderAlt =
              (
                msg.key as {
                  participantAlt?: string;
                  remoteJidAlt?: string;
                }
              ).participantAlt ||
              (
                msg.key as {
                  participantAlt?: string;
                  remoteJidAlt?: string;
                }
              ).remoteJidAlt ||
              "";

            // ------------------------------------------------
// DELIVERY JID / LID SUPPORT
// ------------------------------------------------

const deliveryJid =
  !jid.endsWith(
    "@g.us",
  ) &&
  jid.endsWith(
    "@lid",
  ) &&
  senderAlt.endsWith(
    "@s.whatsapp.net",
  )
    ? senderAlt
    : jid;


// ------------------------------------------------
// 🌑 DARK VORTEX — OWNER AVAILABILITY SYSTEM
// ------------------------------------------------

// ------------------------------------------------
// 🌑 DARK VORTEX — OWNER AVAILABILITY SYSTEM
// ------------------------------------------------

if (msg.key.fromMe) {
  const botGenerated =
    isTrackedOutgoingMessage(
      msg.key.id,
    );

  if (!botGenerated) {
    markOwnerActivity();

    markOwnerResponse(
      jid,
      msg,
    );

    markPersonalAssistantOwnerResponse(
      jid,
      msg,
    );
  }
}
            // ------------------------------------------------
            // TEXT EXTRACTION
            // ------------------------------------------------

            let text = "";

            if (
              message.conversation
            ) {
              text =
                message.conversation;
            } else if (
              message
                .extendedTextMessage
                ?.text
            ) {
              text =
                message
                  .extendedTextMessage
                  .text;
            } else if (
              message
                .imageMessage
                ?.caption
            ) {
              text =
                message
                  .imageMessage
                  .caption;
            } else if (
              message
                .videoMessage
                ?.caption
            ) {
              text =
                message
                  .videoMessage
                  .caption;
            } else if (
              message
                .documentMessage
                ?.caption
            ) {
              text =
                message
                  .documentMessage
                  .caption;
            }

            // ------------------------------------------------
            // MEDIA
            // ------------------------------------------------

            const hasMedia =
              Boolean(
                message.imageMessage ||
                  message.videoMessage ||
                  message.documentMessage,
              );

            // =================================================
            // 💤 DARK VORTEX REST MODE
            // =================================================

            const normalizedText =
              text.trim();

            const isRestControlCommand =
              /^[/!#.]rest(?::auto)?\b/i.test(
                normalizedText,
              );

            if (
              isResting() &&
              !isRestControlCommand
            ) {
              continue;
            }

            // ------------------------------------------------
            // VX AUTOMATIC SECURITY SENSOR
            // ------------------------------------------------

            if (
              jid.endsWith(
                "@g.us",
              ) &&
              !msg.key.fromMe &&
              !specialStatusShare
            ) {
              let detectedCommand:
                | string
                | undefined;

              if (
                text.trim()
              ) {
                const commandMatch =
                  text
                    .trim()
                    .match(
                      /^[./!#](\S+)/,
                    );

                if (
                  commandMatch?.[1]
                ) {
                  detectedCommand =
                    commandMatch[1]
                      .toLowerCase();
                }
              }

              await processVxMessage(
                sock,
                jid,
                sender,
                senderAlt,
                text,
                detectedCommand,
                hasMedia,
                groupMetadata?.subject ||
                  "Unknown Group",
                groupMetadata
                  ?.participants
                  ?.length,
              );
            }

            // ------------------------------------------------
            // SPECIAL STATUS SHARE
            // ------------------------------------------------

            if (
              specialStatusShare &&
              jid.endsWith(
                "@g.us",
              ) &&
              !msg.key.fromMe
            ) {
              await processProtection(
                sock,
                jid,
                msg,
                sender,
              );

              continue;
            }

            // ------------------------------------------------
            // NORMAL EMPTY MESSAGE FILTER
            // ------------------------------------------------

            if (
              !text.trim() &&
              !hasMedia
            ) {
              continue;
            }

            // ------------------------------------------------
            // AUTOMATIC TRIGGERS
            // ------------------------------------------------

            const triggerHandled =
              await processTrigger(
                sock,
                deliveryJid,
                msg,
              );

            if (
              triggerHandled
            ) {
              continue;
            }

            // ------------------------------------------------
            // GROUP PROTECTION
            // ------------------------------------------------

            if (
              jid.endsWith(
                "@g.us",
              ) &&
              !msg.key.fromMe
            ) {
              await processProtection(
                sock,
                jid,
                msg,
                sender,
              );
            }

            // ------------------------------------------------
            // SLOWMODE
            // ------------------------------------------------

            const slowmodeBlocked =
              await processSlowmode(
                sock,
                jid,
                msg,
              );

            if (
              slowmodeBlocked
            ) {
              continue;
            }

            // ------------------------------------------------
            // COMMAND HANDLER
            // ------------------------------------------------

// =====================================================
// 🌑 DARK VORTEX — COMMAND + AI ROUTER
// =====================================================

if (text.trim()) {
  const commandJid =
    jid.endsWith("@g.us")
      ? jid
      : deliveryJid;

  const commandText =
    text.trim();

  // ---------------------------------------------------
  // ACTIVE COMMAND PREFIX
  // ---------------------------------------------------

  const activePrefix =
    getPrefix();

  const isLatencyCommand =
    commandText
      .toLowerCase()
      .trim() === ";latency";

  const isCommand =
    commandText.startsWith(
      activePrefix,
    ) ||
    isLatencyCommand;
    // ===================================================
  // 🛡️ VORTEX SECURITY CONFIRMATION ROUTE
  // ===================================================

  if (!msg.key.fromMe && commandText.trim()) {
    const confirmationHandled =
      await handleVortexConfirmation(
        sock,
        commandJid,
        sender,
        commandText,
        msg,
      );

    if (confirmationHandled) {
      const confirmedExecution =
        consumeConfirmedSecurityExecution();

      if (confirmedExecution) {
        await handleCommand(
          sock,
          confirmedExecution.chatJid,
          confirmedExecution.ownerJid,
          `${getPrefix()}${confirmedExecution.command}${
            confirmedExecution.args.length
              ? ` ${confirmedExecution.args.join(" ")}`
              : ""
          }`,
          msg,
          senderAlt,
          false,
        );
      }

      continue;
    }
  }

  // ===================================================
  // COMMAND ROUTE
  // ===================================================

  if (isCommand) {
    incomingMessage({
      type: "COMMAND",
      message: commandText,
      from: sender,
      delivery: commandJid,
      chat: jid.endsWith("@g.us")
        ? "GROUP"
        : "PRIVATE",
      messageId:
        msg.key.id ?? undefined,
      fromMe: !!msg.key.fromMe,
    });

    incrementDashboardCommands();

    addDashboardEvent(
      "COMMAND",
      "HANDLER",
      `Command: ${commandText.slice(0, 40)}`,
    );

    await handleCommand(
      sock,
      commandJid,
      sender,
      text,
      msg,
      senderAlt,
      !!msg.key.fromMe,
    );

    continue;
  }

  // ===================================================
  // 🤖 AI ROUTER
  // ===================================================

  if (!msg.key.fromMe) {
    // -------------------------------------------------
    // PERSONAL ASSISTANT
    // -------------------------------------------------

    const personalAssistantHandled =
      await processPersonalAssistant(
        sock,
        msg,
        OWNER_NUMBER,
        deliveryJid,
      );

    if (personalAssistantHandled) {
      continue;
    }

    // -------------------------------------------------
    // 🌑 DARK VORTEX AI
    // -------------------------------------------------

    await processDarkVortexAI(
      sock,
      jid,
      msg,
      commandText,
    );
  }
}

  } catch (error) {
    if (
      isSignalSessionError(
        error,
      )
    ) {
      handleSignalSessionLog(
        error,
      );

      continue;
    }

    log.error(
      "Message processing error.",
      error,
    );
  }
}
      },
    );

    // ========================================================
    // MESSAGE STATUS
    // ========================================================

    sock.ev.on(
  "messages.update",
  async (updates) => {
    for (const update of updates) {
      try {
        await processAntiEditUpdate(
          sock,
          update,
        );
      } catch (error) {
        log.error(
          {
            error,
            messageId: update.key?.id,
          },
          "Anti-Edit processing failed",
        );
      }
    }
  },
);

    // ========================================================
    // SYSTEM STATUS
    // ========================================================

    log.system(
      `Owner: ${maskedOwner}`,
    );

    log.connect(
      `QR pairing: ${
        isPairingMode()
          ? "STANDBY"
          : "ENABLED"
      } • Phone-number pairing: ${
        isPairingMode()
          ? "ENABLED"
          : "STANDBY"
      }`,
    );

    log.security(
      "Protection: ACTIVE",
    );

    log.security(
      "Permanent bans: ACTIVE",
    );

    log.security(
      "VX Security: ACTIVE",
    );

    log.security(
      "VX Behavioral Detection: ACTIVE",
    );

    log.security(
      "VX Bot Intelligence: ACTIVE",
    );

    log.security(
      "VX Audit Logging: ACTIVE",
    );

    log.security(
      "Signal session auto-cleanup: ACTIVE",
    );

    log.system(
      "Welcome/Goodbye automation: ACTIVE",
    );

    log.system(
      "Trigger system: ACTIVE",
    );

    log.system(
      "Broadcast system: ACTIVE",
    );

    log.system(
      "Automatic maintenance: ACTIVE",
    );
  } catch (error) {
    botStarting = false;
    socketCreationInProgress =
      false;

    if (
      isSignalSessionError(
        error,
      )
    ) {
      handleSignalSessionLog(
        error,
      );
    }

    log.fatal(
      "Fatal startup error.",
      error,
    );

    addDashboardEvent(
      "SYSTEM",
      "STARTUP",
      "Fatal startup error detected.",
    );

    if (shuttingDown) {
      return;
    }

    if (reconnectTimer) {
      clearTimeout(
        reconnectTimer,
      );
    }

    setDashboardConnection(
      "RECONNECTING",
      false,
    );

    addDashboardEvent(
      "CONNECTION",
      "RECONNECT",
      "Startup retry scheduled in 5 seconds.",
    );

    reconnectTimer =
      setTimeout(
        () => {
          reconnectTimer =
            null;

          if (
            shuttingDown ||
            currentSocket ||
            socketCreationInProgress
          ) {
            return;
          }

          void startBot().catch(
            (retryError) => {
              log.error(
                "Retry failed.",
                retryError,
              );
            },
          );
        },
        5000,
      );
  }
}

// ============================================================
// LIFECYCLE CLEANUP
// ============================================================

async function gracefulShutdown(
  reason: string,
): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  addDashboardEvent(
    "SYSTEM",
    "SHUTDOWN",
    `Graceful shutdown • ${reason}`,
  );

  shutdownTerminalDashboard();

  disableReconnect();

  if (signalCleanupTimer) {
    clearTimeout(
      signalCleanupTimer,
    );

    signalCleanupTimer = null;
  }

  resetSignalSessionErrors();

  log.system(
    `Graceful shutdown requested • ${reason}`,
  );

  if (reconnectTimer) {
    clearTimeout(
      reconnectTimer,
    );

    reconnectTimer = null;
  }

  if (dailyReportTimer) {
    clearInterval(
      dailyReportTimer,
    );

    dailyReportTimer = null;
  }

  if (systemReadyTimer) {
    clearTimeout(
      systemReadyTimer,
    );

    systemReadyTimer = null;
  }

  if (timeGreetingTimer) {
    clearTimeout(
      timeGreetingTimer,
    );

    timeGreetingTimer = null;
  }

  try {
    await stopAllVxMonitors();

    log.security(
      "VX live monitoring sessions stopped.",
    );
  } catch (error) {
    log.error(
      "Failed to stop VX monitoring sessions.",
      error,
    );
  }

  vxBotAnalysisTimes.clear();

  stopAutomaticMemoryCleanup(currentSocket);

  await closeActiveSocket();

  log.success(
    "Timers cleaned.",
  );

  log.system(
    "Dark Vortex stopped.",
  );

  process.exit(0);
}

// ============================================================
// 💤 REST MODE LIFECYCLE
// ============================================================

configureRestMode({
  getSocket: () =>
    currentSocket,

  closeSocket: async () => {
    await closeActiveSocket();
  },

  restartSocket: async () => {
    if (shuttingDown) {
      return;
    }

    reconnectTimer = null;

    await startBot();
  },
});

// ============================================================
// PROCESS SIGNALS
// ============================================================

process.on(
  "SIGINT",
  () => {
    void gracefulShutdown(
      "SIGINT",
    );
  },
);

process.on(
  "SIGTERM",
  () => {
    void gracefulShutdown(
      "SIGTERM",
    );
  });

process.on(
  "uncaughtException",
  (error) => {
    if (
      isSignalSessionError(
        error,
      )
    ) {
      handleSignalSessionLog(
        error,
      );
    }

    log.fatal(
      "Uncaught exception.",
      error,
    );

    addDashboardEvent(
      "SYSTEM",
      "RUNTIME",
      "Uncaught exception captured.",
    );
  },
);

process.on(
  "unhandledRejection",
  (error) => {
    if (
      isSignalSessionError(
        error,
      )
    ) {
      handleSignalSessionLog(
        error,
      );
    }

    log.error(
      "Unhandled rejection.",
      error,
    );

    addDashboardEvent(
      "SYSTEM",
      "RUNTIME",
      "Unhandled rejection captured.",
    );
  },
);

// ============================================================
// 🌑 DARK VORTEX TERMINAL DASHBOARD
// ============================================================

startTerminalDashboard();

addDashboardEvent(
  "SYSTEM",
  "CORE",
  "Dark Vortex core starting...",
);

setDashboardConnection(
  "CONNECTING",
  false,
);

// ============================================================
// 🌐 DARK VORTEX PAIRING API
// ============================================================

const PAIRING_API_PORT =
  Number(
    process.env.PORT ||
      process.env.PAIRING_API_PORT ||
      3000,
  );

const PAIRING_API_HOST =
  process.env.PAIRING_API_HOST ||
  "0.0.0.0";

const PAIRING_API_KEY =
  process.env.PAIRING_API_KEY ||
  "";

if (!PAIRING_API_KEY) {
  log.warn(
    "PAIRING_API_KEY is not configured. Pairing API requests will be rejected.",
  );
} else {
  void startPairingApi({
    port: PAIRING_API_PORT,
    host: PAIRING_API_HOST,
    apiKey: PAIRING_API_KEY,
    startSession: startApiSession,
    stopSession: stopApiSession,
  });
}

// ============================================================
// START
// ============================================================

void startBot().catch((error) => {
  log.error(
    "Failed to start bot.",
    error,
  );

  addDashboardEvent(
    "SYSTEM",
    "STARTUP",
    "Initial bot startup failed.",
  );
});