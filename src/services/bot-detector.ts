/* =========================================================
   🌑 DARK VORTEX BOT — AUTOMATIC BOT DETECTOR
   ⚡ Powered by Vortex Tech

   PURPOSE:
   - Passive behavioral bot detection
   - Observable message analysis only
   - Persistent sender profiles
   - Confidence-based detection
   - Automatic security alerts

   IMPORTANT:
   - Does NOT inspect credentials
   - Does NOT inspect private IP addresses
   - Does NOT bypass WhatsApp security
   - Does NOT attempt account takeover
   - Detection is probabilistic, not absolute
========================================================= */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  WAMessage,
} from "@whiskeysockets/baileys";

/* =========================================================
   CONFIGURATION
========================================================= */

const DATA_DIR = path.resolve(
  process.cwd(),
  "src/data/vortex",
);

const PROFILES_FILE = path.join(
  DATA_DIR,
  "bot-profiles.json",
);

const MAX_PROFILES = 1000;
const MAX_HISTORY = 40;

const ALERT_THRESHOLD = 75;
const HIGH_RISK_THRESHOLD = 90;

const ALERT_COOLDOWN_MS =
  10 * 60 * 1000;

/* =========================================================
   TYPES
========================================================= */

export interface BotProfile {
  jid: string;

  firstSeen: string;
  lastSeen: string;

  totalMessages: number;

  repeatedMessages: number;
  burstEvents: number;
  automationSignals: number;
  commandLikeMessages: number;
  interactiveMessages: number;

  averageIntervalMs: number;

  confidence: number;

  lastAlertAt: number;

  recentMessages: MessageObservation[];
  recentIntervals: number[];
}

export interface MessageObservation {
  timestamp: number;
  hash: string;
  textLength: number;
  isCommandLike: boolean;
  isInteractive: boolean;
}

export interface BotDetectionResult {
  jid: string;

  confidence: number;

  risk:
    | "LOW"
    | "MEDIUM"
    | "HIGH";

  suspicious: boolean;

  signals: string[];

  profile: BotProfile;
}

/* =========================================================
   FILE HELPERS
========================================================= */

async function ensureDataFile(): Promise<void> {
  await fs.mkdir(
    DATA_DIR,
    {
      recursive: true,
    },
  );

  try {
    await fs.access(
      PROFILES_FILE,
    );
  } catch {
    await fs.writeFile(
      PROFILES_FILE,
      JSON.stringify(
        {},
        null,
        2,
      ),
      "utf8",
    );
  }
}

async function readProfiles(): Promise<
  Record<string, BotProfile>
> {
  await ensureDataFile();

  try {
    const raw =
      await fs.readFile(
        PROFILES_FILE,
        "utf8",
      );

    return JSON.parse(
      raw,
    ) as Record<string, BotProfile>;
  } catch {
    return {};
  }
}

async function writeProfiles(
  profiles: Record<string, BotProfile>,
): Promise<void> {
  await ensureDataFile();

  await fs.writeFile(
    PROFILES_FILE,
    JSON.stringify(
      profiles,
      null,
      2,
    ),
    "utf8",
  );
}

/* =========================================================
   HASHING
========================================================= */

function normalizeText(
  text: string,
): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hashText(
  text: string,
): string {
  return crypto
    .createHash("sha256")
    .update(
      normalizeText(text),
    )
    .digest("hex");
}

/* =========================================================
   MESSAGE EXTRACTION
========================================================= */

function getMessageText(
  message: WAMessage,
): string {
  const content =
    message.message;

  if (!content) {
    return "";
  }

  if (
    content.conversation
  ) {
    return content.conversation;
  }

  if (
    content.extendedTextMessage?.text
  ) {
    return content.extendedTextMessage.text;
  }

  if (
    content.imageMessage?.caption
  ) {
    return content.imageMessage.caption;
  }

  if (
    content.videoMessage?.caption
  ) {
    return content.videoMessage.caption;
  }

  if (
    content.documentMessage?.caption
  ) {
    return content.documentMessage.caption;
  }

  return "";
}

/* =========================================================
   OBSERVABLE STRUCTURE CHECKS
========================================================= */

function isInteractiveMessage(
  message: WAMessage,
): boolean {
  const content =
    message.message;

  if (!content) {
    return false;
  }

  return Boolean(
    content.interactiveMessage ||
    content.buttonsMessage ||
    content.listMessage ||
    content.templateMessage ||
    content.botInvokeMessage,
  );
}

function isCommandLike(
  text: string,
): boolean {
  const normalized =
    text.trim();

  if (!normalized) {
    return false;
  }

  return (
    normalized.startsWith(".") ||
    normalized.startsWith("!") ||
    normalized.startsWith("/") ||
    normalized.startsWith("#")
  );
}

/* =========================================================
   PROFILE
========================================================= */

function createProfile(
  jid: string,
  now: number,
): BotProfile {
  const timestamp =
    new Date(
      now,
    ).toISOString();

  return {
    jid,

    firstSeen:
      timestamp,

    lastSeen:
      timestamp,

    totalMessages: 0,

    repeatedMessages: 0,
    burstEvents: 0,
    automationSignals: 0,
    commandLikeMessages: 0,
    interactiveMessages: 0,

    averageIntervalMs: 0,

    confidence: 0,

    lastAlertAt: 0,

    recentMessages: [],
    recentIntervals: [],
  };
}

/* =========================================================
   SIGNAL ANALYSIS
========================================================= */

function analyzeProfile(
  profile: BotProfile,
  text: string,
  isInteractive: boolean,
  now: number,
): {
  confidence: number;
  signals: string[];
} {
  const signals: string[] = [];

  let score = 0;

  /* -------------------------------------------------------
     Minimum activity requirement

     We intentionally do not classify accounts after
     only one or two messages.
  ------------------------------------------------------- */

  if (
    profile.totalMessages < 5
  ) {
    return {
      confidence: 0,
      signals: [
        "Insufficient behavioral history.",
      ],
    };
  }

  /* -------------------------------------------------------
     Repetition
  ------------------------------------------------------- */

  if (
    profile.repeatedMessages >= 3
  ) {
    score += 22;

    signals.push(
      "Repeated message pattern detected.",
    );
  }

  if (
    profile.repeatedMessages >= 8
  ) {
    score += 8;

    signals.push(
      "High-frequency repeated content observed.",
    );
  }

  /* -------------------------------------------------------
     Burst activity
  ------------------------------------------------------- */

  if (
    profile.burstEvents >= 2
  ) {
    score += 20;

    signals.push(
      "Message burst behavior detected.",
    );
  }

  if (
    profile.burstEvents >= 5
  ) {
    score += 8;

    signals.push(
      "Repeated activity bursts observed.",
    );
  }

  /* -------------------------------------------------------
     Command-like activity
  ------------------------------------------------------- */

  if (
    profile.commandLikeMessages >= 4
  ) {
    score += 12;

    signals.push(
      "Repeated command-like messages observed.",
    );
  }

  /* -------------------------------------------------------
     Interactive automation structures
  ------------------------------------------------------- */

  if (
    profile.interactiveMessages >= 3
  ) {
    score += 16;

    signals.push(
      "Repeated interactive automation-style structures observed.",
    );
  }

  /* -------------------------------------------------------
     Automation signals
  ------------------------------------------------------- */

  if (
    profile.automationSignals >= 4
  ) {
    score += 15;

    signals.push(
      "Multiple observable automation indicators detected.",
    );
  }

  /* -------------------------------------------------------
     Timing consistency

     Extremely regular intervals can be suspicious,
     but timing alone is never enough.
  ------------------------------------------------------- */

  if (
    profile.recentIntervals.length >= 5
  ) {
    const intervals =
      profile.recentIntervals;

    const average =
      intervals.reduce(
        (sum, value) =>
          sum + value,
        0,
      ) / intervals.length;

    const variance =
      intervals.reduce(
        (sum, value) =>
          sum +
          Math.pow(
            value - average,
            2,
          ),
        0,
      ) /
      intervals.length;

    const deviation =
      Math.sqrt(
        variance,
      );

    const coefficient =
      average > 0
        ? deviation / average
        : 1;

    if (
      average < 5000 &&
      coefficient < 0.25
    ) {
      score += 10;

      signals.push(
        "Highly regular rapid-response timing observed.",
      );
    }
  }

  /* -------------------------------------------------------
     Current interactive message
  ------------------------------------------------------- */

  if (
    isInteractive &&
    profile.automationSignals >= 2
  ) {
    score += 5;

    signals.push(
      "Current message contains an observable automation-style structure.",
    );
  }

  /* -------------------------------------------------------
     Long-running activity
  ------------------------------------------------------- */

  if (
    profile.totalMessages >= 25 &&
    profile.burstEvents >= 4
  ) {
    score += 8;

    signals.push(
      "Sustained high-frequency activity observed.",
    );
  }

  return {
    confidence:
      Math.min(
        100,
        Math.round(score),
      ),

    signals,
  };
}

/* =========================================================
   MAIN DETECTOR
========================================================= */

export async function analyzeIncomingMessage(
  jid: string,
  message: WAMessage,
): Promise<BotDetectionResult> {
  const now =
    Date.now();

  const profiles =
    await readProfiles();

  let profile =
    profiles[jid];

  if (!profile) {
    profile =
      createProfile(
        jid,
        now,
      );
  }

  const text =
    getMessageText(
      message,
    );

  const normalized =
    normalizeText(
      text,
    );

  const hash =
    hashText(
      text,
    );

  const interactive =
    isInteractiveMessage(
      message,
    );

  const commandLike =
    isCommandLike(
      text,
    );

  /* -------------------------------------------------------
     Interval tracking
  ------------------------------------------------------- */

  const previous =
    profile.recentMessages.at(-1);

  if (previous) {
    const interval =
      Math.max(
        0,
        now -
          previous.timestamp,
      );

    if (
      interval > 0 &&
      interval < 10 * 60 * 1000
    ) {
      profile.recentIntervals.push(
        interval,
      );

      if (
        profile.recentIntervals.length >
        MAX_HISTORY
      ) {
        profile.recentIntervals.shift();
      }

      if (
        interval < 3000
      ) {
        profile.burstEvents++;
      }
    }
  }

  /* -------------------------------------------------------
     Repetition tracking
  ------------------------------------------------------- */

  const repeated =
    profile.recentMessages.some(
      (item) =>
        item.hash === hash &&
        now - item.timestamp <
          5 * 60 * 1000,
    );

  if (
    normalized &&
    repeated
  ) {
    profile.repeatedMessages++;
  }

  /* -------------------------------------------------------
     Observable automation signals
  ------------------------------------------------------- */

  if (
    interactive
  ) {
    profile.interactiveMessages++;
    profile.automationSignals++;
  }

  if (
    commandLike
  ) {
    profile.commandLikeMessages++;
  }

  if (
    commandLike &&
    profile.commandLikeMessages >= 3
  ) {
    profile.automationSignals++;
  }

  /* -------------------------------------------------------
     Store observation
  ------------------------------------------------------- */

  profile.recentMessages.push({
    timestamp: now,
    hash,
    textLength:
      text.length,
    isCommandLike:
      commandLike,
    isInteractive:
      interactive,
  });

  if (
    profile.recentMessages.length >
    MAX_HISTORY
  ) {
    profile.recentMessages.shift();
  }

  profile.totalMessages++;
  profile.lastSeen =
    new Date(
      now,
    ).toISOString();

  if (
    profile.recentIntervals.length
  ) {
    profile.averageIntervalMs =
      Math.round(
        profile.recentIntervals.reduce(
          (sum, value) =>
            sum + value,
          0,
        ) /
          profile.recentIntervals.length,
      );
  }

  const analysis =
    analyzeProfile(
      profile,
      text,
      interactive,
      now,
    );

  profile.confidence =
    analysis.confidence;

  /* -------------------------------------------------------
     Persist
  ------------------------------------------------------- */

  profiles[jid] =
    profile;

  const keys =
    Object.keys(
      profiles,
    );

  if (
    keys.length >
    MAX_PROFILES
  ) {
    const oldest =
      keys.sort(
        (a, b) =>
          new Date(
            profiles[a]!.lastSeen,
          ).getTime() -
          new Date(
            profiles[b]!.lastSeen,
          ).getTime(),
      )[0];

    if (oldest) {
      delete profiles[
        oldest
      ];
    }
  }

  await writeProfiles(
    profiles,
  );

  /* -------------------------------------------------------
     Risk
  ------------------------------------------------------- */

  const confidence =
    analysis.confidence;

  let risk:
    | "LOW"
    | "MEDIUM"
    | "HIGH";

  if (
    confidence >=
    HIGH_RISK_THRESHOLD
  ) {
    risk = "HIGH";
  } else if (
    confidence >=
    50
  ) {
    risk = "MEDIUM";
  } else {
    risk = "LOW";
  }

  return {
    jid,
    confidence,
    risk,

    suspicious:
      confidence >=
      ALERT_THRESHOLD,

    signals:
      analysis.signals,

    profile,
  };
}

/* =========================================================
   ALERT COOLDOWN
========================================================= */

export async function shouldAlert(
  jid: string,
): Promise<boolean> {
  const profiles =
    await readProfiles();

  const profile =
    profiles[jid];

  if (!profile) {
    return false;
  }

  const now =
    Date.now();

  if (
    now -
      profile.lastAlertAt <
    ALERT_COOLDOWN_MS
  ) {
    return false;
  }

  profile.lastAlertAt =
    now;

  profiles[jid] =
    profile;

  await writeProfiles(
    profiles,
  );

  return true;
}

/* =========================================================
   ALERT FORMATTER
========================================================= */

export function formatBotDetectionAlert(
  result: BotDetectionResult,
  mention: string,
): string {
  const signalLines =
    result.signals.length
      ? result.signals
          .slice(0, 6)
          .map(
            (signal) =>
              `• ${signal}`,
          )
      : [
          "• No strong signal available.",
        ];

  return [
    "╭━━〔 🛡️ BOT ALERT 〕━━╮",
    "┃",
    `┃ 👤 Target: ${mention}`,
    `┃ 🤖 Bot probability: ${result.confidence}%`,
    `┃ ⚠️ Risk: ${result.risk}`,
    "┃",
    "┃ 🔍 Signals:",
    ...signalLines.map(
      (line) =>
        `┃ ${line}`,
    ),
    "┃",
    "┃ 📊 Detection engine:",
    "┃ DARK VORTEX APEX",
    "┃",
    "┃ ⚠️ Assessment is based only",
    "┃ on observable behavior.",
    "┃",
    "╰━━━━━━━━━━━━━━━━━━━━━━╯",
    "⚡ Powered by Vortex Tech",
  ].join("\n");
}

/* =========================================================
   PROFILE ACCESS
========================================================= */

export async function getBotProfile(
  jid: string,
): Promise<BotProfile | null> {
  const profiles =
    await readProfiles();

  return (
    profiles[jid] ||
    null
  );
}

export async function clearBotProfile(
  jid: string,
): Promise<void> {
  const profiles =
    await readProfiles();

  delete profiles[jid];

  await writeProfiles(
    profiles,
  );
}

/* =========================================================
   CONFIG ACCESS
========================================================= */

export function getBotDetectorConfig(): {
  alertThreshold: number;
  highRiskThreshold: number;
  alertCooldownMs: number;
} {
  return {
    alertThreshold:
      ALERT_THRESHOLD,

    highRiskThreshold:
      HIGH_RISK_THRESHOLD,

    alertCooldownMs:
      ALERT_COOLDOWN_MS,
  };
}