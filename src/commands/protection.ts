import fs from "node:fs";
import path from "node:path";
import pino from "pino";

import {
  downloadMediaMessage,
} from "@whiskeysockets/baileys";

import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import {
  error,
  commandUsage,
  protectionStatus,
} from "../utils/message.js";

import {
  sendVortexReply,
} from "../utils/vortex-reply.js";

import {
  resolveIdentity,
} from "../utils/identity.js";

import type {
  BotDetectionResult,
} from "../services/bot-detector.js";

import {
  detectNsfw,
} from "../services/nsfw.js";

// ============================================================
// 🌑 DARK VORTEX — CENTRAL PROTECTION ENGINE
// ⚡ Powered by Vortex Tech
// ============================================================
//
// Detection
//    ↓
// Delete offending message
//    ↓
// Real WhatsApp @mention
//    ↓
// Concise contextual response
//    ↓
// Configured punishment
//    ↓
// Persistent record
//
// WARN MODE:
// 1/3 → warning
// 2/3 → warning
// 3/3 → automatic kick
//
// ============================================================

const DATA_DIR = path.join(
  process.cwd(),
  "src",
  "data",
);

const GROUPS_FILE = path.join(
  DATA_DIR,
  "groups.json",
);

const PROTECTION_WARNINGS_FILE =
  path.join(
    DATA_DIR,
    "protection-warnings.json",
  );

const PROTECTION_RECORDS_FILE =
  path.join(
    DATA_DIR,
    "protection-records.json",
  );

const PROTECTION_BANS_FILE =
  path.join(
    DATA_DIR,
    "protection-bans.json",
  );

const mediaLogger = pino({
  level: "silent",
});

// ============================================================
// TYPES
// ============================================================

type ProtectionName =
  | "antilink"
  | "antigrouplink"
  | "antistatus"
  | "antispam"
  | "antibot"
  | "antimention"
  | "antiflood"
  | "antifake"
  | "antinsfw";

type ProtectionAction =
  | "delete"
  | "warn"
  | "kick"
  | "ban";

interface ProtectionSettings {
  enabled: boolean;
  action: ProtectionAction;
}

interface GroupProtectionSettings {
  antilink: ProtectionSettings;
  antigrouplink: ProtectionSettings;
  antistatus: ProtectionSettings;
  antispam: ProtectionSettings;
  antibot: ProtectionSettings;
  antimention: ProtectionSettings;
  antiflood: ProtectionSettings;
  antifake: ProtectionSettings;
  antinsfw: ProtectionSettings;
  warnLimit: number;
  spamMessages: number;
  spamWindowSeconds: number;
  floodMessages: number;
  floodWindowSeconds: number;
  protectAdmins: boolean;
}

type GroupsStore =
  Record<
    string,
    Partial<GroupProtectionSettings>
  >;

interface WarningEntry {
  count: number;
  updatedAt: number;
}

type WarningStore =
  Record<
    string,
    Record<string, WarningEntry>
  >;

interface ProtectionRecord {
  id: string;
  group: string;
  user: string;
  protection: ProtectionName;
  action:
    | ProtectionAction
    | "automatic-kick";
  reason: string;
  warningCount: number;
  timestamp: number;
}

type ProtectionRecordStore =
  Record<string, ProtectionRecord[]>;

interface BanEntry {
  group: string;
  user: string;
  reason: string;
  protection: ProtectionName;
  timestamp: number;
}

type ProtectionBanStore =
  Record<
    string,
    Record<string, BanEntry>
  >;

// ============================================================
// DEFAULT SETTINGS
// ============================================================

const DEFAULT_SETTINGS:
  GroupProtectionSettings = {
    antilink: {
      enabled: false,
      action: "delete",
    },

    antigrouplink: {
      enabled: false,
      action: "delete",
    },

    antistatus: {
      enabled: false,
      action: "delete",
    },

    antispam: {
      enabled: false,
      action: "delete",
    },

    antibot: {
      enabled: false,
      action: "delete",
    },

    antimention: {
      enabled: false,
      action: "delete",
    },

    antiflood: {
      enabled: false,
      action: "delete",
    },

    antifake: {
      enabled: false,
      action: "delete",
    },

    antinsfw: {
      enabled: false,
      action: "delete",
    },

    warnLimit: 3,
    spamMessages: 5,
    spamWindowSeconds: 8,
    floodMessages: 8,
    floodWindowSeconds: 5,
    protectAdmins: false,
  };

// ============================================================
// MEMORY TRACKERS
// ============================================================

interface MessageRecord {
  timestamp: number;
  text: string;
}

const spamTracker =
  new Map<
    string,
    Map<string, MessageRecord[]>
  >();

const floodTracker =
  new Map<
    string,
    Map<string, number[]>
  >();

// ============================================================
// 🤖 AUTOMATIC BOT ENFORCEMENT TRACKER
// ============================================================

interface AutomaticBotEnforcementEntry {
  timestamp: number;
  confidence: number;
  action: ProtectionAction;
}

const automaticBotEnforcementTracker =
  new Map<
    string,
    AutomaticBotEnforcementEntry
  >();

const AUTOMATIC_BOT_ENFORCEMENT_COOLDOWN =
  10 * 60 * 1000;

// ============================================================
// FILE STORAGE
// ============================================================

function ensureDataFile(
  file: string,
  defaultValue: unknown = {},
): void {
  fs.mkdirSync(
    DATA_DIR,
    {
      recursive: true,
    },
  );

  if (!fs.existsSync(file)) {
    fs.writeFileSync(
      file,
      JSON.stringify(
        defaultValue,
        null,
        2,
      ),
      "utf8",
    );
  }
}

function readJson<T>(
  file: string,
  fallback: T,
): T {
  ensureDataFile(
    file,
    fallback,
  );

  try {
    const raw =
      fs.readFileSync(
        file,
        "utf8",
      );

    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(
  file: string,
  value: unknown,
): void {
  ensureDataFile(file);

  fs.writeFileSync(
    file,
    JSON.stringify(
      value,
      null,
      2,
    ),
    "utf8",
  );
}

// ============================================================
// GROUP SETTINGS
// ============================================================

function loadGroups(): GroupsStore {
  return readJson<GroupsStore>(
    GROUPS_FILE,
    {},
  );
}

function saveGroups(
  groups: GroupsStore,
): void {
  writeJson(
    GROUPS_FILE,
    groups,
  );
}

function getSettings(
  jid: string,
): GroupProtectionSettings {
  const groups =
    loadGroups();

  const saved =
    groups[jid] || {};

  const numberOrDefault = (
    value: unknown,
    fallback: number,
    minimum = 1,
  ): number => {
    const number =
      Number(value);

    if (
      !Number.isFinite(number) ||
      number < minimum
    ) {
      return fallback;
    }

    return number;
  };

  return {
    ...DEFAULT_SETTINGS,

    ...saved,

    antilink: {
      ...DEFAULT_SETTINGS.antilink,
      ...(saved.antilink || {}),
    },

    antigrouplink: {
      ...DEFAULT_SETTINGS.antigrouplink,
      ...(saved.antigrouplink || {}),
    },

    antistatus: {
      ...DEFAULT_SETTINGS.antistatus,
      ...(saved.antistatus || {}),
    },

    antispam: {
      ...DEFAULT_SETTINGS.antispam,
      ...(saved.antispam || {}),
    },

    antibot: {
      ...DEFAULT_SETTINGS.antibot,
      ...(saved.antibot || {}),
    },

    antimention: {
      ...DEFAULT_SETTINGS.antimention,
      ...(saved.antimention || {}),
    },

    antiflood: {
      ...DEFAULT_SETTINGS.antiflood,
      ...(saved.antiflood || {}),
    },

    antifake: {
      ...DEFAULT_SETTINGS.antifake,
      ...(saved.antifake || {}),
    },

    antinsfw: {
      ...DEFAULT_SETTINGS.antinsfw,
      ...(saved.antinsfw || {}),
    },

    warnLimit: Math.floor(
      numberOrDefault(
        saved.warnLimit,
        DEFAULT_SETTINGS.warnLimit,
      ),
    ),

    spamMessages: Math.floor(
      numberOrDefault(
        saved.spamMessages,
        DEFAULT_SETTINGS.spamMessages,
      ),
    ),

    spamWindowSeconds:
      numberOrDefault(
        saved.spamWindowSeconds,
        DEFAULT_SETTINGS.spamWindowSeconds,
      ),

    floodMessages: Math.floor(
      numberOrDefault(
        saved.floodMessages,
        DEFAULT_SETTINGS.floodMessages,
      ),
    ),

    floodWindowSeconds:
      numberOrDefault(
        saved.floodWindowSeconds,
        DEFAULT_SETTINGS.floodWindowSeconds,
      ),

    protectAdmins:
      saved.protectAdmins === true,
  };
}

function updateSettings(
  jid: string,
  patch:
    Partial<GroupProtectionSettings>,
): void {
  const groups =
    loadGroups();

  const current =
    getSettings(jid);

  groups[jid] = {
    ...current,
    ...patch,
  };

  saveGroups(groups);
}

// ============================================================
// JID / USER HELPERS
// ============================================================

function normalizeJid(
  jid?: string | null,
): string {
  if (!jid) {
    return "";
  }

  return jid
    .trim()
    .toLowerCase()
    .replace(/:\d+@/, "@")
    .replace(
      /@c\.us$/,
      "@s.whatsapp.net",
    );
}

function sameUser(
  first?: string | null,
  second?: string | null,
): boolean {
  const a =
    normalizeJid(first);

  const b =
    normalizeJid(second);

  if (!a || !b) {
    return false;
  }

  if (a === b) {
    return true;
  }

  const aNumber =
    a
      .split("@")[0]
      .replace(/\D/g, "");

  const bNumber =
    b
      .split("@")[0]
      .replace(/\D/g, "");

  return (
    Boolean(aNumber) &&
    Boolean(bNumber) &&
    aNumber === bNumber
  );
}

// ============================================================
// GLOBAL IDENTITY RESOLUTION
// ============================================================

interface ProtectionTarget {
  text: string;
  mentionJid: string;
}

async function resolveProtectionTarget(
  sock: WASocket,
  message: WAMessage,
  jid: string,
): Promise<ProtectionTarget> {
  const identity =
    await resolveIdentity(
      sock,
      jid,
      message.key.remoteJid ??
        undefined,
      undefined,
    );

  const resolvedJid =
    identity.jid ||
    normalizeJid(jid);

  const name =
    identity.name?.trim() ||
    "Unknown User";

  return {
    text:
      name === "Unknown User"
        ? "@Unknown User"
        : `@${name}`,
    mentionJid:
      resolvedJid,
  };
}

// ============================================================
// GROUP ADMIN DETECTION
// ============================================================

function isAdmin(
  metadata: any,
  jid: string,
): boolean {
  const participants =
    metadata?.participants || [];

  const participant =
    participants.find(
      (member: any) =>
        sameUser(
          member.id,
          jid,
        ) ||
        sameUser(
          member.phoneNumber,
          jid,
        ) ||
        sameUser(
          member.lid,
          jid,
        ),
    );

  return (
    participant?.admin === "admin" ||
    participant?.admin === "superadmin"
  );
}

// ============================================================
// BOT ADMIN DETECTION
// ============================================================

function isBotAdmin(
  sock: WASocket,
  metadata: any,
): boolean {
  const botJid =
    sock.user?.id || "";

  const botLid =
    sock.user?.lid || "";

  const botNumber =
    botJid
      .split("@")[0]
      .split(":")[0];

  const participants =
    metadata?.participants || [];

  return participants.some(
    (participant: any) => {
      const admin =
        participant.admin === "admin" ||
        participant.admin === "superadmin";

      if (!admin) {
        return false;
      }

      return (
        sameUser(
          participant.id,
          botJid,
        ) ||
        sameUser(
          participant.id,
          botLid,
        ) ||
        sameUser(
          participant.phoneNumber,
          botJid,
        ) ||
        sameUser(
          participant.phoneNumber,
          botLid,
        ) ||
        sameUser(
          participant.lid,
          botJid,
        ) ||
        sameUser(
          participant.lid,
          botLid,
        ) ||
        participant.id
          ?.split("@")[0]
          ?.split(":")[0] ===
          botNumber
      );
    },
  );
}

// ============================================================
// MESSAGE HELPERS
// ============================================================

function getText(
  message: WAMessage,
): string {
  const content =
    message.message;

  if (!content) {
    return "";
  }

  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    ""
  );
}

function getContextInfo(
  message: WAMessage,
): any {
  const content =
    message.message;

  if (!content) {
    return undefined;
  }

  return (
    content.extendedTextMessage
      ?.contextInfo ||

    content.imageMessage
      ?.contextInfo ||

    content.videoMessage
      ?.contextInfo ||

    content.documentMessage
      ?.contextInfo ||

    content.audioMessage
      ?.contextInfo ||

    (content as any)
      .statusMentionMessage
      ?.contextInfo
  );
}

/**
 * Raw mention extraction intentionally
 * remains synchronous and lightweight.
 *
 * Identity resolution happens only when
 * Dark Vortex needs to display the target.
 */
function getMentionedJids(
  message: WAMessage,
): string[] {
  const context =
    getContextInfo(message);

  const mentions =
    context?.mentionedJid;

  if (!Array.isArray(mentions)) {
    return [];
  }

  return mentions.filter(
    (
      value: unknown,
    ): value is string =>
      typeof value === "string",
  );
}

// ============================================================
// LINK DETECTION
// ============================================================

function containsLink(
  text: string,
): boolean {
  if (!text.trim()) {
    return false;
  }

  const urlPattern =
    /\b(?:https?:\/\/|www\.)[^\s<>()]+/i;

  const domainPattern =
    /\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|me|app|site|xyz|online|ng|uk|us|info|biz)(?:\/[^\s<>()]*)?/i;

  return (
    urlPattern.test(text) ||
    domainPattern.test(text)
  );
}

// ============================================================
// WHATSAPP GROUP LINK DETECTION
// ============================================================

function containsGroupLink(
  text: string,
): boolean {
  if (!text.trim()) {
    return false;
  }

  return (
    /(?:https?:\/\/)?chat\.whatsapp\.com\/[A-Za-z0-9_-]+/i.test(
      text,
    ) ||
    /(?:https?:\/\/)?wa\.me\/[A-Za-z0-9?=&/_.-]+/i.test(
      text,
    )
  );
}

// ============================================================
// 📱 WHATSAPP STATUS MENTION DETECTION
// ============================================================

function containsStatusMention(
  message: WAMessage,
  text: string,
): boolean {
  const content =
    message.message as any;

  if (!content) {
    return false;
  }

  if (
    content.statusMentionMessage ||
    content.groupStatusMentionMessage ||
    content.groupStatusMessage
  ) {
    return true;
  }

  const context =
    getContextInfo(message) as any;

  const statusSourceType =
    String(
      context?.statusSourceType ||
        "",
    ).toUpperCase();

  if (
    statusSourceType === "STATUS" ||
    statusSourceType === "STATUS_MENTION"
  ) {
    return true;
  }

  const quoted =
    context?.quotedMessage;

  if (
    quoted?.statusMentionMessage ||
    quoted?.groupStatusMentionMessage ||
    quoted?.groupStatusMessage
  ) {
    return true;
  }

  const mentions =
    getMentionedJids(message);

  if (
    mentions.some(
      (jid) =>
        normalizeJid(jid) ===
        "status@broadcast",
    )
  ) {
    return true;
  }

  const possibleStatusJids = [
    context?.statusJid,
    context?.statusMentionJid,
    context?.quotedMessage?.key
      ?.remoteJid,
  ];

  if (
    possibleStatusJids.some(
      (value) =>
        typeof value === "string" &&
        normalizeJid(value) ===
          "status@broadcast",
    )
  ) {
    return true;
  }

  if (
    /@status\b/i.test(text) ||
    /whatsapp\s+status/i.test(text)
  ) {
    return true;
  }

  return false;
}

// ============================================================
// MASS MENTION DETECTION
// ============================================================

function containsMassMention(
  message: WAMessage,
  text: string,
): boolean {
  const mentions =
    getMentionedJids(message);

  if (mentions.length >= 5) {
    return true;
  }

  if (
    /@everyone\b/i.test(text)
  ) {
    return true;
  }

  if (
    /@all\b/i.test(text)
  ) {
    return true;
  }

  return false;
}

// ============================================================
// 🤖 ANTI-BOT
// ============================================================

function looksLikeBot(
  message: WAMessage,
): boolean {
  if (message.key.fromMe) {
    return false;
  }

  const content =
    message.message as any;

  if (!content) {
    return false;
  }

  if (
    content.botMessage === true ||
    content.botReplyMessage === true ||
    content.aiMessage === true
  ) {
    return true;
  }

  const context =
    getContextInfo(message) as any;

  if (
    context?.botMessage === true ||
    context?.botReplyMessage === true ||
    context?.isBotMessage === true
  ) {
    return true;
  }

  if (
    (message as any).isBot === true ||
    (message as any).bot === true
  ) {
    return true;
  }

  if (
    (message as any).category ===
    "bot"
  ) {
    return true;
  }

  return false;
}

// ============================================================
// 🕵️ ANTI-FAKE
// ============================================================

function looksSuspicious(
  participant: any,
): boolean {
  if (!participant) {
    return true;
  }

  const id =
    typeof participant.id === "string"
      ? normalizeJid(
          participant.id,
        )
      : "";

  const phoneNumber =
    typeof participant.phoneNumber ===
    "string"
      ? normalizeJid(
          participant.phoneNumber,
        )
      : "";

  const lid =
    typeof participant.lid ===
    "string"
      ? normalizeJid(
          participant.lid,
        )
      : "";

  if (
    id.endsWith("@lid") ||
    lid.endsWith("@lid")
  ) {
    return false;
  }

  if (
    id.endsWith("@s.whatsapp.net") ||
    phoneNumber.endsWith(
      "@s.whatsapp.net",
    )
  ) {
    return false;
  }

  if (
    !id &&
    !phoneNumber &&
    !lid
  ) {
    return true;
  }

  if (
    id &&
    !id.includes("@")
  ) {
    return true;
  }

  return false;
}

// ============================================================
// SPAM DETECTION
// ============================================================

function checkSpam(
  jid: string,
  sender: string,
  text: string,
  settings: GroupProtectionSettings,
): boolean {
  let group =
    spamTracker.get(jid);

  if (!group) {
    group = new Map();
    spamTracker.set(
      jid,
      group,
    );
  }

  let records =
    group.get(sender) || [];

  const now =
    Date.now();

  records =
    records.filter(
      (record) =>
        now -
          record.timestamp <
        settings.spamWindowSeconds *
          1000,
    );

  records.push({
    timestamp: now,
    text,
  });

  if (records.length > 100) {
    records =
      records.slice(-100);
  }

  group.set(
    sender,
    records,
  );

  return (
    records.length >=
    settings.spamMessages
  );
}

// ============================================================
// FLOOD DETECTION
// ============================================================

function checkFlood(
  jid: string,
  sender: string,
  settings: GroupProtectionSettings,
): boolean {
  let group =
    floodTracker.get(jid);

  if (!group) {
    group = new Map();
    floodTracker.set(
      jid,
      group,
    );
  }

  let timestamps =
    group.get(sender) || [];

  const now =
    Date.now();

  timestamps =
    timestamps.filter(
      (timestamp) =>
        now -
          timestamp <
        settings.floodWindowSeconds *
          1000,
    );

  timestamps.push(now);

  if (timestamps.length > 100) {
    timestamps =
      timestamps.slice(-100);
  }

  group.set(
    sender,
    timestamps,
  );

  return (
    timestamps.length >=
    settings.floodMessages
  );
}

// ============================================================
// WARNING STORAGE
// ============================================================

function loadWarnings(): WarningStore {
  return readJson<WarningStore>(
    PROTECTION_WARNINGS_FILE,
    {},
  );
}

function saveWarnings(
  warnings: WarningStore,
): void {
  writeJson(
    PROTECTION_WARNINGS_FILE,
    warnings,
  );
}

function getWarningCount(
  groupJid: string,
  userJid: string,
): number {
  const warnings =
    loadWarnings();

  return (
    warnings[groupJid]?.[
      normalizeJid(userJid)
    ]?.count || 0
  );
}

function addProtectionWarning(
  groupJid: string,
  userJid: string,
): number {
  const warnings =
    loadWarnings();

  const group =
    warnings[groupJid] || {};

  const key =
    normalizeJid(userJid);

  const current =
    group[key]?.count || 0;

  const next =
    current + 1;

  group[key] = {
    count: next,
    updatedAt: Date.now(),
  };

  warnings[groupJid] =
    group;

  saveWarnings(
    warnings,
  );

  return next;
}

function resetProtectionWarnings(
  groupJid: string,
  userJid: string,
): void {
  const warnings =
    loadWarnings();

  if (
    warnings[groupJid]
  ) {
    delete warnings[groupJid][
      normalizeJid(userJid)
    ];

    saveWarnings(
      warnings,
    );
  }
}

// ============================================================
// PROTECTION ACTION RECORDS
// ============================================================

function recordProtectionAction(
  groupJid: string,
  userJid: string,
  protection: ProtectionName,
  action:
    | ProtectionAction
    | "automatic-kick",
  reason: string,
  warningCount: number,
): void {
  const records =
    readJson<ProtectionRecordStore>(
      PROTECTION_RECORDS_FILE,
      {},
    );

  if (!records[groupJid]) {
    records[groupJid] = [];
  }

  records[groupJid].push({
    id:
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,

    group: groupJid,

    user:
      normalizeJid(userJid),

    protection,

    action,

    reason,

    warningCount,

    timestamp:
      Date.now(),
  });

  if (
    records[groupJid].length >
    1000
  ) {
    records[groupJid] =
      records[groupJid].slice(
        -1000,
      );
  }

  writeJson(
    PROTECTION_RECORDS_FILE,
    records,
  );
}

// ============================================================
// BAN STORAGE
// ============================================================

function loadProtectionBans():
  ProtectionBanStore {
  return readJson<ProtectionBanStore>(
    PROTECTION_BANS_FILE,
    {},
  );
}

function saveProtectionBans(
  bans: ProtectionBanStore,
): void {
  writeJson(
    PROTECTION_BANS_FILE,
    bans,
  );
}

function recordProtectionBan(
  groupJid: string,
  userJid: string,
  protection: ProtectionName,
  reason: string,
): void {
  const bans =
    loadProtectionBans();

  if (!bans[groupJid]) {
    bans[groupJid] = {};
  }

  const key =
    normalizeJid(userJid);

  bans[groupJid][key] = {
    group: groupJid,
    user: key,
    reason,
    protection,
    timestamp: Date.now(),
  };

  saveProtectionBans(
    bans,
  );
}

// ============================================================
// MESSAGE DELETION
// ============================================================

async function deleteMessage(
  sock: WASocket,
  jid: string,
  message: WAMessage,
): Promise<boolean> {
  try {
    await sock.sendMessage(
      jid,
      {
        delete:
          message.key,
      },
    );

    return true;
  } catch (err) {
    console.error(
      "[DARK VORTEX] Protection delete error:",
      err,
    );

    return false;
  }
}

// ============================================================
// CONCISE PROTECTION RESPONSE
// ============================================================

function protectionLabel(
  protection: ProtectionName,
): string {
  const names:
    Record<ProtectionName, string> = {
      antilink:
        "🔗 Link",

      antigrouplink:
        "🔗 Group link",

      antistatus:
        "📱 Status activity",

      antispam:
        "💬 Spam",

      antibot:
        "🤖 Bot activity",

      antimention:
        "📣 Mass mention",

      antiflood:
        "🌊 Flood",

      antifake:
        "🕵️ Suspicious account",

      antinsfw:
        "🔞 NSFW content",
    };

  return names[protection];
}

// ============================================================
// RESOLVED PROTECTION RESPONSE
// ============================================================

async function protectionResponse(
  sock: WASocket,
  message: WAMessage,
  protection: ProtectionName,
  sender: string,
  reason: string,
  action: ProtectionAction,
  warningCount = 0,
  warnLimit = 3,
): Promise<{
  text: string;
  mentionJid: string;
}> {
  const target =
    await resolveProtectionTarget(
      sock,
      message,
      sender,
    );

  const mention =
    target.text;

  const label =
    protectionLabel(protection);

  if (
    action === "delete"
  ) {
    return {
      text: [
        `${label} removed.`,
        "",
        `${mention}, ${reason}`,
      ].join("\n"),

      mentionJid:
        target.mentionJid,
    };
  }

  if (
    action === "warn"
  ) {
    return {
      text: [
        `⚠️ ${label} detected.`,
        "",
        `${mention}, ${reason}`,
        `Warning: ${warningCount}/${warnLimit}`,
      ].join("\n"),

      mentionJid:
        target.mentionJid,
    };
  }

  if (
    action === "kick"
  ) {
    return {
      text: [
        "👢 Member removed.",
        "",
        `${mention} — ${reason}`,
      ].join("\n"),

      mentionJid:
        target.mentionJid,
    };
  }

  return {
    text: [
      "🚫 Member removed.",
      "",
      `${mention} — ${reason}`,
    ].join("\n"),

    mentionJid:
      target.mentionJid,
  };
}

// ============================================================
// SEND PROTECTION RESPONSE
// ============================================================

async function sendProtectionResponse(
  sock: WASocket,
  jid: string,
  sender: string,
  protection: ProtectionName,
  action: ProtectionAction,
  reason: string,
  warningCount = 0,
  warnLimit = 3,
  quotedMessage?: WAMessage,
): Promise<void> {
  try {
    if (!quotedMessage) {
      return;
    }

    const response =
      await protectionResponse(
        sock,
        quotedMessage,
        protection,
        sender,
        reason,
        action,
        warningCount,
        warnLimit,
      );

    await sendVortexReply(
      sock,
      jid,
      response.text,
      quotedMessage,
      {
        mentions: [
          response.mentionJid,
        ],
      } as any,
    );
  } catch (err) {
    console.error(
      "[DARK VORTEX] Protection response error:",
      err,
    );
  }
}

// ============================================================
// 🤖 AUTOMATIC BOT ACTION POLICY
// ============================================================

function getAutomaticBotAction(
  confidence: number,
  configuredAction: ProtectionAction,
): ProtectionAction | null {
  if (
    !Number.isFinite(confidence) ||
    confidence < 75
  ) {
    return null;
  }

  if (
    configuredAction === "delete"
  ) {
    return "delete";
  }

  if (
    configuredAction === "warn"
  ) {
    return "warn";
  }

  if (
    configuredAction === "kick"
  ) {
    return "kick";
  }

  if (
    configuredAction === "ban"
  ) {
    return "ban";
  }

  return null;
}

// ============================================================
// EXECUTE PROTECTION ACTION
// ============================================================

async function executeAction(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  sender: string,
  protection: ProtectionName,
  action: ProtectionAction,
  reason: string,
  warnLimit: number,
): Promise<void> {
  const normalizedSender =
    normalizeJid(sender);

  if (!normalizedSender) {
    return;
  }

  // ----------------------------------------------------------
  // CHECK BOT ADMIN STATUS
  // ----------------------------------------------------------

  let metadata: any;

  try {
    metadata =
      await sock.groupMetadata(
        jid,
      );
  } catch (err) {
    console.error(
      "[DARK VORTEX] Unable to read group metadata while enforcing protection:",
      err,
    );

    return;
  }

  const botAdmin =
    isBotAdmin(
      sock,
      metadata,
    );

  if (!botAdmin) {
    console.error(
      `[DARK VORTEX] Cannot enforce ${protection}/${action}: bot is not a group administrator.`,
    );

    try {
      await sendVortexReply(
        sock,
        jid,
        error(
          "BOT ADMIN REQUIRED",
          [
            "🛡️ Protection detected an offending message.",
            "Dark Vortex cannot enforce the action.",
            "",
            "💡 Promote Dark Vortex to group admin.",
          ],
        ),
        message,
      );
    } catch {
      // Ignore secondary notification failure.
    }

    return;
  }

  // ----------------------------------------------------------
  // DELETE MESSAGE FIRST
  // ----------------------------------------------------------

  const deleted =
    await deleteMessage(
      sock,
      jid,
      message,
    );

  if (!deleted) {
    console.error(
      `[DARK VORTEX] Failed to delete message for ${protection}.`,
    );
  }

  // ----------------------------------------------------------
  // DELETE ONLY
  // ----------------------------------------------------------

  if (
    action === "delete"
  ) {
    await sendProtectionResponse(
      sock,
      jid,
      normalizedSender,
      protection,
      action,
      reason,
      0,
      warnLimit,
      message,
    );

    recordProtectionAction(
      jid,
      normalizedSender,
      protection,
      action,
      reason,
      getWarningCount(
        jid,
        normalizedSender,
      ),
    );

    return;
  }

  // ----------------------------------------------------------
  // WARN
  // ----------------------------------------------------------

  if (
    action === "warn"
  ) {
    const warningCount =
      addProtectionWarning(
        jid,
        normalizedSender,
      );

    await sendProtectionResponse(
      sock,
      jid,
      normalizedSender,
      protection,
      "warn",
      reason,
      warningCount,
      warnLimit,
      message,
    );

    recordProtectionAction(
      jid,
      normalizedSender,
      protection,
      "warn",
      reason,
      warningCount,
    );

    // --------------------------------------------------------
    // WARNING LIMIT = AUTOMATIC KICK
    // --------------------------------------------------------

    if (
      warningCount >=
      warnLimit
    ) {
      try {
        const target =
          await resolveProtectionTarget(
            sock,
            message,
            normalizedSender,
          );

        await sendVortexReply(
          sock,
          jid,
          [
            "👢 Warning limit reached.",
            "",
            `${target.text} — ${warningCount}/${warnLimit} warnings.`,
            "Removing member...",
          ].join("\n"),
          message,
          {
            mentions: [
              target.mentionJid,
            ],
          } as any,
        );
      } catch (err) {
        console.error(
          "[DARK VORTEX] Warning limit response error:",
          err,
        );
      }

      try {
        await sock.groupParticipantsUpdate(
          jid,
          [
            normalizedSender,
          ],
          "remove",
        );

        recordProtectionAction(
          jid,
          normalizedSender,
          protection,
          "automatic-kick",
          `Warning limit reached: ${warningCount}/${warnLimit}.`,
          warningCount,
        );

        resetProtectionWarnings(
          jid,
          normalizedSender,
        );
      } catch (err) {
        console.error(
          "[DARK VORTEX] Automatic warning kick error:",
          err,
        );
      }
    }

    return;
  }

  // ----------------------------------------------------------
  // KICK
  // ----------------------------------------------------------

  if (
    action === "kick"
  ) {
    await sendProtectionResponse(
      sock,
      jid,
      normalizedSender,
      protection,
      "kick",
      reason,
      0,
      warnLimit,
      message,
    );

    try {
      await sock.groupParticipantsUpdate(
        jid,
        [
          normalizedSender,
        ],
        "remove",
      );

      recordProtectionAction(
        jid,
        normalizedSender,
        protection,
        "kick",
        reason,
        getWarningCount(
          jid,
          normalizedSender,
        ),
      );
    } catch (err) {
      console.error(
        "[DARK VORTEX] Protection kick error:",
        err,
      );
    }

    return;
  }

  // ----------------------------------------------------------
  // BAN
  // ----------------------------------------------------------

  if (
    action === "ban"
  ) {
    await sendProtectionResponse(
      sock,
      jid,
      normalizedSender,
      protection,
      "ban",
      reason,
      0,
      warnLimit,
      message,
    );

    try {
      await sock.groupParticipantsUpdate(
        jid,
        [
          normalizedSender,
        ],
        "remove",
      );

      recordProtectionBan(
        jid,
        normalizedSender,
        protection,
        reason,
      );

      recordProtectionAction(
        jid,
        normalizedSender,
        protection,
        "ban",
        reason,
        getWarningCount(
          jid,
          normalizedSender,
        ),
      );
    } catch (err) {
      console.error(
        "[DARK VORTEX] Protection ban/remove error:",
        err,
      );

      recordProtectionBan(
        jid,
        normalizedSender,
        protection,
        reason,
      );

      recordProtectionAction(
        jid,
        normalizedSender,
        protection,
        "ban",
        reason,
        getWarningCount(
          jid,
          normalizedSender,
        ),
      );
    }
  }
}

// ============================================================
// 🤖 AUTOMATIC AI + BEHAVIORAL BOT ENFORCEMENT
// ============================================================

export async function enforceAutomaticBotDetection(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  sender: string,
  detection: BotDetectionResult,
): Promise<boolean> {
  // ----------------------------------------------------------
  // GROUP ONLY
  // ----------------------------------------------------------

  if (
    !jid.endsWith("@g.us")
  ) {
    return false;
  }

  // ----------------------------------------------------------
  // NEVER ENFORCE AGAINST DARK VORTEX
  // ----------------------------------------------------------

  if (
    message.key.fromMe
  ) {
    return false;
  }

  const normalizedSender =
    normalizeJid(sender);

  if (!normalizedSender) {
    return false;
  }

  // ----------------------------------------------------------
  // VALID DETECTION REQUIRED
  // ----------------------------------------------------------

  if (
    !detection ||
    !detection.suspicious
  ) {
    return false;
  }

  const confidence =
    Number(detection.confidence);

  if (
    !Number.isFinite(confidence) ||
    confidence < 75
  ) {
    return false;
  }

  // ----------------------------------------------------------
  // LOAD GROUP SETTINGS
  // ----------------------------------------------------------

  const settings =
    getSettings(jid);

  // ----------------------------------------------------------
  // ANTIBOT MUST BE ENABLED
  // ----------------------------------------------------------

  if (
    !settings.antibot.enabled
  ) {
    return false;
  }

  // ----------------------------------------------------------
  // GROUP METADATA
  // ----------------------------------------------------------

  let metadata: any;

  try {
    metadata =
      await sock.groupMetadata(
        jid,
      );
  } catch (err) {
    console.error(
      "[DARK VORTEX] Automatic bot enforcement metadata error:",
      err,
    );

    return false;
  }

  // ----------------------------------------------------------
  // PROTECT ADMINS
  // ----------------------------------------------------------

  if (
    isAdmin(
      metadata,
      normalizedSender,
    ) &&
    !settings.protectAdmins
  ) {
    return false;
  }

  // ----------------------------------------------------------
  // BOT MUST BE ADMIN
  // ----------------------------------------------------------

  if (
    !isBotAdmin(
      sock,
      metadata,
    )
  ) {
    console.error(
      "[DARK VORTEX] Automatic bot enforcement skipped: bot is not a group administrator.",
    );

    return false;
  }

  // ----------------------------------------------------------
  // DETERMINE ACTION
  // ----------------------------------------------------------

  const action =
    getAutomaticBotAction(
      confidence,
      settings.antibot.action,
    );

  if (!action) {
    return false;
  }

  // ----------------------------------------------------------
  // DUPLICATE ENFORCEMENT PROTECTION
  // ----------------------------------------------------------

  const trackerKey =
    `${jid}:${normalizedSender}`;

  const previous =
    automaticBotEnforcementTracker.get(
      trackerKey,
    );

  const now =
    Date.now();

  if (
    previous &&
    now -
      previous.timestamp <
      AUTOMATIC_BOT_ENFORCEMENT_COOLDOWN
  ) {
    return false;
  }

  automaticBotEnforcementTracker.set(
    trackerKey,
    {
      timestamp: now,
      confidence,
      action,
    },
  );

  // ----------------------------------------------------------
  // BUILD REASON
  // ----------------------------------------------------------

  const aiProbability =
    detection.ai?.botProbability;

  const aiConfidence =
    detection.ai?.confidence;

  const aiReason =
    detection.ai?.reason;

  const reasonParts: string[] = [
    `Automated bot behavior detected with ${confidence.toFixed(1)}% confidence.`,
  ];

  if (
    typeof aiProbability ===
    "number"
  ) {
    reasonParts.push(
      `AI probability: ${aiProbability.toFixed(1)}%.`,
    );
  }

  if (
    typeof aiConfidence ===
    "number"
  ) {
    reasonParts.push(
      `AI confidence: ${aiConfidence.toFixed(1)}%.`,
    );
  }

  if (
    detection.ai?.risk
  ) {
    reasonParts.push(
      `Risk: ${detection.ai.risk}.`,
    );
  }

  if (
    aiReason
  ) {
    reasonParts.push(
      `Assessment: ${aiReason}`,
    );
  }

  const reason =
    reasonParts.join(" ");

  // ----------------------------------------------------------
  // ENFORCE THROUGH CENTRAL PROTECTION ENGINE
  // ----------------------------------------------------------

  try {
    await executeAction(
      sock,
      jid,
      message,
      normalizedSender,
      "antibot",
      action,
      reason,
      settings.warnLimit,
    );

    return true;
  } catch (err) {
    console.error(
      "[DARK VORTEX] Automatic bot enforcement failed:",
      err,
    );

    return false;
  }
}

// ============================================================
// COMMAND CONFIGURATION
// ============================================================

export async function handleProtectionCommand(
  sock: WASocket,
  jid: string,
  command: string,
  args: string[],
  message?: WAMessage,
): Promise<boolean> {
  const protectionCommands =
    new Set<
      ProtectionName |
      "protection" |
      "antistatusmention"
    >([
      "antilink",
      "antigrouplink",
      "antistatus",
      "antistatusmention",
      "antispam",
      "antibot",
      "antimention",
      "antiflood",
      "antifake",
      "antinsfw",
      "protection",
    ]);

  if (
    !protectionCommands.has(
      command as
        | ProtectionName
        | "protection"
        | "antistatusmention",
    )
  ) {
    return false;
  }

  // ----------------------------------------------------------
  // GROUP ONLY
  // ----------------------------------------------------------

  if (
    !jid.endsWith("@g.us")
  ) {
    await sendVortexReply(
      sock,
      jid,
      error(
        "GROUP ONLY",
        [
          "🛡️ Protection settings are group-only.",
          "",
          "💡 Run this command inside a group.",
        ],
      ),
      message,
    );

    return true;
  }

  // ----------------------------------------------------------
  // GROUP METADATA
  // ----------------------------------------------------------

  let metadata: any;

  try {
    metadata =
      await sock.groupMetadata(
        jid,
      );
  } catch (err) {
    console.error(
      "[DARK VORTEX] Protection metadata error:",
      err,
    );

    await sendVortexReply(
      sock,
      jid,
      error(
        "GROUP DATA ERROR",
        [
          "Unable to read group information.",
          "",
          "💡 Try again in a moment.",
        ],
      ),
      message,
    );

    return true;
  }

  // ----------------------------------------------------------
  // BOT ADMIN
  // ----------------------------------------------------------

  if (
    !isBotAdmin(
      sock,
      metadata,
    )
  ) {
    await sendVortexReply(
      sock,
      jid,
      error(
        "ADMIN ACCESS REQUIRED",
        [
          "🛡️ Dark Vortex must be a group admin",
          "to manage protection.",
          "",
          "💡 Promote Dark Vortex and try again.",
        ],
      ),
      message,
    );

    return true;
  }

  // ==========================================================
  // NORMALIZE COMMAND ALIAS
  // ==========================================================

  const protectionCommand =
    command === "antistatusmention"
      ? "antistatus"
      : command;

  const protection =
    protectionCommand as ProtectionName;

  // ==========================================================
  // SHOW STATUS
  // ==========================================================

  if (
    command === "protection"
  ) {
    const settings =
      getSettings(jid);

    await sendVortexReply(
      sock,
      jid,
      protectionStatus({
        antilink:
          settings.antilink.enabled,

        antigrouplink:
          settings.antigrouplink.enabled,

        antistatus:
          settings.antistatus.enabled,

        antispam:
          settings.antispam.enabled,

        antibot:
          settings.antibot.enabled,

        antimention:
          settings.antimention.enabled,

        antiflood:
          settings.antiflood.enabled,

        antifake:
          settings.antifake.enabled,

        antinsfw:
          settings.antinsfw.enabled,
      }),
      message,
    );

    return true;
  }

  // ==========================================================
  // CONFIGURE PROTECTION
  // ==========================================================

  const actionValues:
    ProtectionAction[] = [
      "delete",
      "warn",
      "kick",
      "ban",
    ];

  const mode =
    args[0]?.trim().toLowerCase();

  const requestedAction =
    args[1]?.trim().toLowerCase();

  const current =
    getSettings(jid)[protection];

  let updated:
    ProtectionSettings;

  // ----------------------------------------------------------
  // .antilink off
  // ----------------------------------------------------------

  if (
    mode === "off"
  ) {
    if (args.length > 1) {
      await sendVortexReply(
        sock,
        jid,
        commandUsage(
          protection,
          `${protection} off`,
        ),
        message,
      );

      return true;
    }

    updated = {
      ...current,
      enabled: false,
    };
  }

  // ----------------------------------------------------------
  // .antilink on
  // .antilink on warn
  // .antilink on kick
  // .antilink on ban
  // .antilink on delete
  // ----------------------------------------------------------

  else if (
    mode === "on"
  ) {
    if (
      args.length > 2 ||
      (
        requestedAction &&
        !actionValues.includes(
          requestedAction as ProtectionAction,
        )
      )
    ) {
      await sendVortexReply(
        sock,
        jid,
        commandUsage(
          protection,
          `${protection} on [delete|warn|kick|ban]`,
        ),
        message,
      );

      return true;
    }

    updated = {
      ...current,
      enabled: true,
      action:
        requestedAction
          ? requestedAction as ProtectionAction
          : current.action,
    };
  }

  // ----------------------------------------------------------
  // Backward-compatible shorthand.
  // ----------------------------------------------------------

  else if (
    actionValues.includes(
      mode as ProtectionAction,
    )
  ) {
    if (args.length > 1) {
      await sendVortexReply(
        sock,
        jid,
        commandUsage(
          protection,
          `${protection} [on|off|delete|warn|kick|ban]`,
        ),
        message,
      );

      return true;
    }

    updated = {
      ...current,
      enabled: true,
      action:
        mode as ProtectionAction,
    };
  }

  // ----------------------------------------------------------
  // Invalid mode.
  // ----------------------------------------------------------

  else {
    await sendVortexReply(
      sock,
      jid,
      commandUsage(
        protection,
        `${protection} on [delete|warn|kick|ban]`,
      ),
      message,
    );

    return true;
  }

  // ==========================================================
  // SAVE
  // ==========================================================

  updateSettings(
    jid,
    {
      [protection]: updated,
    },
  );

  // ==========================================================
  // CONCISE CONFIRMATION
  // ==========================================================

  const status =
    updated.enabled
      ? `🟢 Enabled · ${updated.action.toUpperCase()}`
      : "🔴 Disabled";

  await sendVortexReply(
    sock,
    jid,
    [
      `🛡️ ${protectionCommand}`,
      "",
      `Status: ${status}`,
    ].join("\n"),
    message,
  );

  return true;
}

// ============================================================
// MESSAGE PROTECTION
// ============================================================

export async function processProtection(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  sender: string,
): Promise<void> {
  // ----------------------------------------------------------
  // GROUP ONLY
  // ----------------------------------------------------------

  if (
    !jid.endsWith("@g.us")
  ) {
    return;
  }

  // ----------------------------------------------------------
  // IGNORE BOT'S OWN MESSAGE
  // ----------------------------------------------------------

  if (
    message.key.fromMe
  ) {
    return;
  }

  const normalizedSender =
    normalizeJid(sender);

  if (!normalizedSender) {
    return;
  }

  // ----------------------------------------------------------
  // GROUP METADATA
  // ----------------------------------------------------------

  let metadata: any;

  try {
    metadata =
      await sock.groupMetadata(
        jid,
      );
  } catch (err) {
    console.error(
      "[DARK VORTEX] Protection metadata lookup failed:",
      err,
    );

    return;
  }

  // ----------------------------------------------------------
  // SETTINGS
  // ----------------------------------------------------------

  const settings =
    getSettings(jid);

  // ----------------------------------------------------------
  // ADMINS
  // ----------------------------------------------------------

  if (
    isAdmin(
      metadata,
      normalizedSender,
    ) &&
    !settings.protectAdmins
  ) {
    return;
  }

  const text =
    getText(message);

  // ==========================================================
  // 1. WHATSAPP GROUP LINKS
  // ==========================================================

  if (
    settings.antigrouplink.enabled &&
    containsGroupLink(text)
  ) {
    await executeAction(
      sock,
      jid,
      message,
      normalizedSender,
      "antigrouplink",
      settings.antigrouplink.action,
      "WhatsApp group links aren't allowed in this group.",
      settings.warnLimit,
    );

    return;
  }

  // ==========================================================
  // 2. ALL LINKS
  // ==========================================================

  if (
    settings.antilink.enabled &&
    containsLink(text)
  ) {
    await executeAction(
      sock,
      jid,
      message,
      normalizedSender,
      "antilink",
      settings.antilink.action,
      "links aren't allowed in this group.",
      settings.warnLimit,
    );

    return;
  }

  // ==========================================================
  // 3. WHATSAPP STATUS MENTIONS
  // ==========================================================

  if (
    settings.antistatus.enabled &&
    containsStatusMention(
      message,
      text,
    )
  ) {
    await executeAction(
      sock,
      jid,
      message,
      normalizedSender,
      "antistatus",
      settings.antistatus.action,
      "WhatsApp Status mentions aren't allowed in this group.",
      settings.warnLimit,
    );

    return;
  }

  // ==========================================================
  // 4. MASS MENTIONS
  // ==========================================================

  if (
    settings.antimention.enabled &&
    containsMassMention(
      message,
      text,
    )
  ) {
    await executeAction(
      sock,
      jid,
      message,
      normalizedSender,
      "antimention",
      settings.antimention.action,
      "mass mentions aren't allowed in this group.",
      settings.warnLimit,
    );

    return;
  }

  // ==========================================================
  // 5. OTHER BOTS
  // ==========================================================

  if (
    settings.antibot.enabled &&
    looksLikeBot(message)
  ) {
    await executeAction(
      sock,
      jid,
      message,
      normalizedSender,
      "antibot",
      settings.antibot.action,
      "automated bot activity isn't allowed in this group.",
      settings.warnLimit,
    );

    return;
  }

  // ==========================================================
  // 6. FAKE / SUSPICIOUS ACCOUNT
  // ==========================================================

  if (
    settings.antifake.enabled
  ) {
    const participants =
      metadata?.participants ||
      [];

    const participant =
      participants.find(
        (member: any) =>
          sameUser(
            member.id,
            normalizedSender,
          ) ||
          sameUser(
            member.phoneNumber,
            normalizedSender,
          ) ||
          sameUser(
            member.lid,
            normalizedSender,
          ),
      );

    if (
      looksSuspicious(
        participant,
      )
    ) {
      await executeAction(
        sock,
        jid,
        message,
        normalizedSender,
        "antifake",
        settings.antifake.action,
        "a suspicious or unresolved account identity was detected.",
        settings.warnLimit,
      );

      return;
    }
  }

  // ==========================================================
  // 7. SPAM
  // ==========================================================

  if (
    settings.antispam.enabled &&
    checkSpam(
      jid,
      normalizedSender,
      text,
      settings,
    )
  ) {
    await executeAction(
      sock,
      jid,
      message,
      normalizedSender,
      "antispam",
      settings.antispam.action,
      "spam activity isn't allowed in this group.",
      settings.warnLimit,
    );

    return;
  }

  // ==========================================================
  // 8. FLOOD
  // ==========================================================

  if (
    settings.antiflood.enabled &&
    checkFlood(
      jid,
      normalizedSender,
      settings,
    )
  ) {
    await executeAction(
      sock,
      jid,
      message,
      normalizedSender,
      "antiflood",
      settings.antiflood.action,
      "sending messages too quickly isn't allowed in this group.",
      settings.warnLimit,
    );

    return;
  }

  // ==========================================================
  // 9. NSFW IMAGE DETECTION
  // ==========================================================

  if (
    settings.antinsfw.enabled
  ) {
    const imageMessage =
      message.message
        ?.imageMessage;

    if (imageMessage) {
      try {
        const media =
          await downloadMediaMessage(
            message,
            "buffer",
            {},
            {
              logger:
                mediaLogger,

              reuploadRequest:
                sock.updateMediaMessage,
            },
          );

        if (
          !Buffer.isBuffer(media)
        ) {
          console.error(
            "[DARK VORTEX] NSFW media download did not return a Buffer.",
          );

          return;
        }

        const result =
          await detectNsfw(
            media,
          );

        if (
          result?.isNsfw
        ) {
          await executeAction(
            sock,
            jid,
            message,
            normalizedSender,
            "antinsfw",
            settings.antinsfw.action,
            `NSFW content detected (${result.label}, ${(result.confidence * 100).toFixed(1)}% confidence).`,
            settings.warnLimit,
          );

          return;
        }
      } catch (err) {
        console.error(
          "[DARK VORTEX] NSFW detection error:",
          err,
        );
      }
    }
  }
}

// ============================================================
// MEMORY CLEANUP
// ============================================================

setInterval(
  () => {
    const now =
      Date.now();

    // --------------------------------------------------------
    // CLEAN SPAM TRACKER
    // --------------------------------------------------------

    for (
      const [
        groupJid,
        group,
      ] of spamTracker
    ) {
      for (
        const [
          sender,
          records,
        ] of group
      ) {
        const recent =
          records.filter(
            (record) =>
              now -
                record.timestamp <
              60 * 1000,
          );

        if (
          recent.length === 0
        ) {
          group.delete(
            sender,
          );
        } else {
          group.set(
            sender,
            recent,
          );
        }
      }

      if (
        group.size === 0
      ) {
        spamTracker.delete(
          groupJid,
        );
      }
    }

    // --------------------------------------------------------
    // CLEAN FLOOD TRACKER
    // --------------------------------------------------------

    for (
      const [
        groupJid,
        group,
      ] of floodTracker
    ) {
      for (
        const [
          sender,
          timestamps,
        ] of group
      ) {
        const recent =
          timestamps.filter(
            (timestamp) =>
              now -
                timestamp <
              60 * 1000,
          );

        if (
          recent.length === 0
        ) {
          group.delete(
            sender,
          );
        } else {
          group.set(
            sender,
            recent,
          );
        }
      }

      if (
        group.size === 0
      ) {
        floodTracker.delete(
          groupJid,
        );
      }
    }
  },
  5 * 60 * 1000,
);