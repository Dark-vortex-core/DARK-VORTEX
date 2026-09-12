import os from "node:os";

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
} from "@whiskeysockets/baileys";

import { Boom } from "@hapi/boom";
import pino from "pino";

import qrcode from "qrcode-terminal";

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
  startupBox,
  startupLine,
  endStartupBox,
  divider,
} from "./services/logger.js";

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
  processSlowmode,
} from "./services/slowmode.js";

import {
  sendWelcome,
  sendGoodbye,
} from "./services/automation.js";

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
// 🌑 DARK VORTEX
// ============================================================

const BOT_NAME = "🌑 DARK VORTEX";
const POWERED_BY = "╰─── ⚡ VORTEX TECH ───╯";

const OWNER_NUMBER = config.ownerNumber
  .replace(/@.*$/, "")
  .replace(/\D/g, "");

const logger = pino({
  level: "silent",
});

let botStarted = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let botStarting = false;

let dailyReportTimer: NodeJS.Timeout | null = null;
let systemReadyTimer: NodeJS.Timeout | null = null;
let timeGreetingTimer: NodeJS.Timeout | null = null;

let lastTimeGreetingKey: string | null = null;

let shuttingDown = false;
let currentSocket: any = null;

let socketCreationInProgress = false;
let socketGeneration = 0;

/**
 * Identifies the currently active WhatsApp connection.
 *
 * Any timer belonging to an older socket is ignored.
 */
let connectionGeneration = 0;

function clearConnectionTimers(): void {
  if (dailyReportTimer) {
    clearInterval(dailyReportTimer);
    dailyReportTimer = null;
  }

  if (systemReadyTimer) {
    clearTimeout(systemReadyTimer);
    systemReadyTimer = null;
  }

  if (timeGreetingTimer) {
    clearTimeout(timeGreetingTimer);
    timeGreetingTimer = null;
  }
}

function isCurrentSocket(sock: any): boolean {
  return sock === currentSocket;
}

// ============================================================
// VX AUTOMATIC INTELLIGENCE STATE
// ============================================================

/*
 * Prevents VX bot-profile persistence from being executed
 * excessively for every single incoming message.
 *
 * VX message detection still runs automatically on messages.
 * Bot-profile persistence is throttled per participant.
 */
const vxBotAnalysisTimes =
  new Map<string, number>();

const VX_BOT_ANALYSIS_INTERVAL =
  15_000;

// ============================================================
// HELPERS
// ============================================================

function formatUptime(delay: number): string {
  const totalSeconds = Math.floor(delay / 1000);

  const days = Math.floor(
    totalSeconds / 86400,
  );

  const hours = Math.floor(
    (totalSeconds % 86400) / 3600,
  );

  const minutes = Math.floor(
    (totalSeconds % 3600) / 60,
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
        timeZone: "Africa/Lagos",
        hour: "numeric",
        hour12: false,
      },
    ).format(new Date()),
  );

  if (hour >= 5 && hour < 12) {
    return "morning";
  }

  if (hour >= 12 && hour < 18) {
    return "afternoon";
  }

  return "evening";
}

function getLagosDateKey(): string {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Africa/Lagos",
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
        timeZone: "Africa/Lagos",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: false,
      },
    ).formatToParts(now);

  const values: Record<string, number> = {};

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
    5 * 60 * 60,   // 05:00
    12 * 60 * 60,  // 12:00
    18 * 60 * 60,  // 18:00
  ];

  const nextTime =
    greetingTimes.find(
      (time) =>
        time > currentSeconds,
    );

  if (nextTime !== undefined) {
    return (
      (nextTime - currentSeconds) *
        1000
    );
  }

  // Next greeting is tomorrow at 05:00.
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
  if (shuttingDown || isResting()) {
    return;
  }

  if (sock !== currentSocket) {
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

  /*
   * Safety check:
   * Never send a morning greeting during
   * afternoon/evening, etc.
   */
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
  } catch (error) {
    log.error(
      `Failed to send automatic ${period} greeting.`,
      error,
    );
  }
}

function scheduleNextTimeGreeting(
  sock: any,
  generation: number = connectionGeneration,
): void {
  if (shuttingDown) {
    return;
  }

  // Ignore schedulers belonging to an old socket.
  if (generation !== connectionGeneration) {
    return;
  }

  if (timeGreetingTimer) {
    clearTimeout(timeGreetingTimer);
    timeGreetingTimer = null;
  }

  const delay = getMillisecondsUntilNextGreeting();

  timeGreetingTimer = setTimeout(
    async () => {
      timeGreetingTimer = null;

      if (shuttingDown) {
        return;
      }

      // Old socket/timer — do nothing.
      if (generation !== connectionGeneration) {
        return;
      }

      // Socket is no longer the active socket.
      if (currentSocket !== sock) {
        return;
      }

      // Never generate automatic greetings during rest.
      if (isResting()) {
        scheduleNextTimeGreeting(sock, generation);
        return;
      }

      const period = getCurrentGreetingPeriod();
      const greetingKey = getGreetingPeriodKey();

      if (lastTimeGreetingKey !== greetingKey) {
        await sendAutomaticTimeGreeting(
          sock,
          period,
        );

        lastTimeGreetingKey = greetingKey;
      }

      scheduleNextTimeGreeting(
        sock,
        generation,
      );
    },
    Math.max(delay, 1000),
  );

  log.system(
    `Time greeting scheduler • NEXT UPDATE IN ${formatUptime(delay)}`,
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

  return number || undefined;
}

function getActorPhoneNumber(
  sender: string,
  senderAlt?: string,
): string | undefined {
  /*
   * Prefer the real WhatsApp number when a LID is involved.
   */
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
  /*
   * VX currently focuses its behavioral sensor on groups.
   */
  if (
    !jid.endsWith("@g.us")
  ) {
    return;
  }

  /*
   * Ignore the bot's own messages.
   */
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

    name:
      undefined,

    isAdmin:
      undefined,

    isBot:
      undefined,
  };

  const group =
    createVxGroupContext(
      jid,
      groupName,
      participantCount,
    );

  /*
   * URL/link detection.
   */
  const hasLink =
    /https?:\/\/\S+/i.test(
      text,
    ) ||
    /www\.\S+/i.test(
      text,
    );

  /*
   * Feed the message into the VX
   * behavioral detection engine.
   *
   * detectVxMessage() itself performs
   * risk analysis and event logging.
   */
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
          Boolean(detection),
      },
    );


  if (
    correlation.coordinated
  ) {
    console.log(
      `[VX] Coordinated activity detected in ${group.name || group.jid}: ` +
      `${correlation.actors.length} actors, ` +
      `risk=${correlation.score}, ` +
      `confidence=${correlation.confidence}`,
    );
  }

  /*
   * No meaningful behavioral signal yet.
   */
  if (!detection) {
    return;
  }

  /*
   * VX event analysis has already happened
   * inside detectVxMessage().
   *
   * Do not call analyzeVxEvent() again here,
   * otherwise the same detection could be
   * logged twice.
   */

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

  /*
   * Only persist the more expensive bot
   * intelligence profile periodically.
   */
  const actorKey =
    `${jid}:${sender}`;

  const now =
    Date.now();

  const lastAnalysis =
    vxBotAnalysisTimes.get(
      actorKey,
    ) || 0;

  const shouldAnalyzeBot =
    now - lastAnalysis >=
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

        /*
         * The detector already created an
         * incident for strong individual
         * behavioral indicators.
         *
         * Allow the persistent bot profile
         * to create its own incident when
         * cumulative intelligence crosses
         * the suspected-bot threshold.
         */
        createIncident: true,
      });

    /*
     * Only log high-confidence bot
     * intelligence to the normal console.
     * The persistent VX system has already
     * handled its audit records.
     */
    if (
      result.suspectedBot
    ) {
      log.security(
        `VX suspected bot • ${actor.phoneNumber || sender} • risk ${result.riskScore}/100 • confidence ${result.confidence}%`,
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
        Object.keys(groups).length;
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
        process.uptime() * 1000,
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
  generation: number = connectionGeneration
): Promise<void> {
  const ownerJid =
    `${OWNER_NUMBER}@s.whatsapp.net`;

  const {
    greeting,
    emoji,
  } =
    getTimeGreeting();

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

    if (systemReadyTimer) {
      clearTimeout(
        systemReadyTimer,
      );
    }

    systemReadyTimer =
      setTimeout(
        async () => {
          systemReadyTimer = null;

          if (shuttingDown) {
            return;
          }

          if (generation !== connectionGeneration) {
            return;
          }


          if (sock !== currentSocket) {
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
                Object.keys(groups).length;
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
  generation: number = connectionGeneration,
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

        if (generation !== connectionGeneration) {
          return;
        }

        if (sock !== currentSocket) {
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

  return Object.keys(message);
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
    getMessageTypeNames(message)
      .map((key) =>
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

    for (
      const group of groupList as any[]
    ) {
      if (
        !group?.id ||
        !group.id.endsWith("@g.us")
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
// START BOT
// ============================================================

async function startBot(): Promise<void> {
  if (
    botStarting ||
    socketCreationInProgress ||
    shuttingDown
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
  socketCreationInProgress = true;

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
        "./auth",
      );

    let version:
      | [number, number, number]
      | undefined;

    try {
      const latest =
        await fetchLatestBaileysVersion();

      version =
        latest.version;

      log.connect(
        `WhatsApp Web ${version.join(".")} ${
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
        ? `${OWNER_NUMBER.slice(0, 3)}${"*".repeat(
            Math.max(
              0,
              OWNER_NUMBER.length - 6,
            ),
          )}${OWNER_NUMBER.slice(-3)}`
        : "***";

    log.system(
      `Owner account: ${maskedOwner}`,
    );

    if (
      !state.creds.registered
    ) {
      log.connect(
        "Authentication required • QR pairing",
      );
      log.info(
        "Scan the QR code displayed in this terminal with WhatsApp.",
      );
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

    divider();

    const sock = makeWASocket({
      auth: state,
      ...(version ? { version } : {}),
      logger,
      browser: Browsers.windows("Chrome"),
      connectTimeoutMs: 120_000,
      defaultQueryTimeoutMs: 60_000,
      keepAliveIntervalMs: 10_000,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: true,
    });

    currentSocket = sock;

    updateRestSocket(sock);
    setActiveSocket(sock);
    enableReconnect();
    socketCreationInProgress = false;

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
          log.connect(
            "Connecting to WhatsApp...",
          );
        }

        // ----------------------------------------------------
        // QR AUTHENTICATION
       // ----------------------------------------------------

        if (qr) {
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

          qrcode.generate(qr, {
            small: true,
          });

          console.log("");
            log.connect(
              "QR code displayed • waiting for WhatsApp scan...",
            );
          }
        // ----------------------------------------------------
        // OPEN
        // ----------------------------------------------------

        if (connection === "open") {
          if (shuttingDown) {
            return;
          }

          if (!isCurrentSocket(sock)) {
            log.warn(
              "Ignoring open event from stale WhatsApp socket.",
            );

            try {
              sock.ws?.close();
            } catch {}

            return;
          }

          currentSocket = sock;
          updateRestSocket(sock);

          botStarting = false;

          connectionGeneration += 1;

          const generation = connectionGeneration

          clearConnectionTimers();

          console.log("");

          console.log(
            "╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮",
          );

          console.log(
            `┃ ${BOT_NAME}`,
          );

          console.log("┃");

          console.log(
            "┃ 🟢 WHATSAPP CONNECTED",
          );

          console.log("┃");

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

          console.log("┃");

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

            startAutomaticMemoryCleanup();
          }

          return;
        }

        // ----------------------------------------------------
        // CLOSED
        // ----------------------------------------------------

        if (
          connection === "close"
        ) {
          const socketIsCurrent = isCurrentSocket(sock);

          if (!socketIsCurrent) {
            log.warn(
              "Ignoring close event from stale WhatsApp socket.",
            );

            return;
          }

          botStarted = false;
          botStarting = false;

          clearConnectionTimers();

          connectionGeneration += 1;

          lastTimeGreetingKey = null;

          const disconnectError =
            lastDisconnect?.error as
              | Boom
              | undefined;

          const statusCode =
            disconnectError
              ?.output
              ?.statusCode;

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
              disconnectError
                ?.message ??
              "unknown"
            }`,
          );

          setActiveSocket(null);

          // --------------------------------------------------
          // STOP VX MONITORING FOR THIS CONNECTION
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
          // Do not let the normal reconnect loop immediately undo
          // an intentional connection-rest disconnect.
          if (
            isResting() &&
            getRestMode() === "connection"
          ) {
            log.system(
              "Connection rest active • automatic reconnect paused until rest ends.",
            );
            return;
          }

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

            stopAutomaticMemoryCleanup();

            clearLifecycleAction();

            shuttingDown = true;

            disableReconnect();

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
                  reconnectTimer = null;

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
            statusCode ===
            DisconnectReason.loggedOut
          ) {
            disableReconnect();

            console.log("");

            console.log(
              "🚫 WhatsApp session was logged out.",
            );

            console.log(
              "🛑 Automatic reconnection disabled.",
            );

            return;
          }

          // --------------------------------------------------
          // NORMAL UNEXPECTED DISCONNECT
          // --------------------------------------------------

          if (
            !isReconnectEnabled() ||
            shuttingDown ||
            isLifecycleInProgress()
          ) {
            return;
          }

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
                reconnectTimer = null;

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
            metadata?.participants
              ?.length;

          // --------------------------------------------------
          // MEMBER ADDED
          // --------------------------------------------------

          if (
            action === "add"
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

              /*
               * Register the participant with
               * VX bot intelligence immediately.
               *
               * This is observation only.
               * No automatic enforcement happens
               * from this event alone.
               */
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
            action === "remove"
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
            action === "promote"
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
            action === "demote"
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
          type !== "notify"
        ) {
          return;
        }

        for (
          const msg of messages
        ) {
          try {
            // ------------------------------------------------
            // BASIC VALIDATION
            // ------------------------------------------------

            if (
              !msg.message
            ) {
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
              jid.endsWith("@g.us")
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
              jid.endsWith("@g.us") &&
              isPotentialStatusShare(
                message,
              );

            // ------------------------------------------------
            // AWAY SYSTEM
            // ------------------------------------------------

            if (
              msg.key.fromMe
            ) {
              markOwnerActivity();
            } else {
              await processAway(
                sock,
                msg,
                OWNER_NUMBER,
              );
            }

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
              !jid.endsWith("@g.us") &&
              jid.endsWith("@lid") &&
              senderAlt.endsWith(
                "@s.whatsapp.net",
              )
                ? senderAlt
                : jid;

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

            // ============================================================
            // 💤 DARK VORTEX REST MODE
            // ============================================================
            // During soft rest, keep the Node process and socket alive,
            // but ignore normal bot activity. Rest-control commands are
            // allowed through so the owner can check status or cancel.
            const normalizedText = text.trim();
            const isRestControlCommand =
              /^[/!#.]rest(?:auto)?\b/i.test(
                normalizedText,
              );

            if (isResting() && !isRestControlCommand) {
              continue;
            }

            // ------------------------------------------------
            // VX AUTOMATIC SECURITY SENSOR
            // ------------------------------------------------

            /*
             * VX observes group traffic automatically.
             *
             * This happens before trigger/protection
             * handling so suspicious behavioral activity
             * is still recorded even when another subsystem
             * later handles the message.
             */
            if (
              jid.endsWith("@g.us") &&
              !msg.key.fromMe &&
              !specialStatusShare
            ) {
              let detectedCommand:
                | string
                | undefined;

              /*
               * Commands are identified conservatively
               * from the first token. VX does not need
               * to know every registered command to track
               * command-heavy behavior.
               */
              if (
                text.trim()
              ) {
                const commandMatch =
                  text
                    .trim()
                    .match(
                      /^[./!#]([^\s]+)/,
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
              jid.endsWith("@g.us") &&
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
              jid.endsWith("@g.us") &&
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

            if (
              text.trim()
            ) {
              const commandJid =
                jid.endsWith("@g.us")
                  ? jid
                  : deliveryJid;

              log.command(
                `Command received: ${text.trim()} | from: ${sender} | delivery: ${commandJid}`,
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
            }
          } catch (error) {
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
      () => {
        // Message status updates intentionally kept silent.
      },
    );

    // ========================================================
    // SYSTEM STATUS
    // ========================================================

    log.system(
      `Owner: ${maskedOwner}`,
    );

    log.connect(
      "QR pairing: ENABLED • Phone-number pairing: DISABLED",
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
    socketCreationInProgress = false;

    log.fatal(
      "Fatal startup error.",
      error,
    );

    if (
      shuttingDown
    ) {
      return;
    }

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

  disableReconnect();

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

  /*
   * Stop live VX monitor sessions before
   * closing the WhatsApp connection.
   */
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

  /*
   * Clear in-memory VX bot analysis
   * throttling state.
   */
  vxBotAnalysisTimes.clear();

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
  getSocket: () => currentSocket,
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
  },
);

process.on(
  "uncaughtException",
  (error) => {
    log.fatal(
      "Uncaught exception.",
      error,
    );
  },
);

process.on(
  "unhandledRejection",
  (error) => {
    log.error(
      "Unhandled rejection.",
      error,
    );
  },
);

// ============================================================
// START
// ============================================================

void startBot().catch(
  (error) => {
    log.fatal(
      "Fatal bot error.",
      error,
    );

    process.exit(1);
  },
);