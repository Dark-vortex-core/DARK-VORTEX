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
  security,
  error,
  commandUsage,
  protectionStatus,
} from "../utils/message.js";

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
// Explanation
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

  /**
   * By default group admins are exempt from protection.
   *
   * Set to true if you later want to protect admins too.
   */
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

function cleanUserNumber(
  jid?: string | null,
): string {
  const normalized =
    normalizeJid(jid);

  if (!normalized) {
    return "user";
  }

  return (
    normalized
      .split("@")[0]
      .replace(/\D/g, "") ||
    "user"
  );
}

function userMention(
  jid: string,
): string {
  return `@${cleanUserNumber(jid)}`;
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
    a.split("@")[0];

  const bNumber =
    b.split("@")[0];

  return (
    Boolean(aNumber) &&
    Boolean(bNumber) &&
    aNumber === bNumber
  );
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

  // ----------------------------------------------------------
  // DIRECT STATUS STRUCTURES
  // ----------------------------------------------------------

  if (
    content.statusMentionMessage ||
    content.groupStatusMentionMessage ||
    content.groupStatusMessage
  ) {
    return true;
  }

  // ----------------------------------------------------------
  // CONTEXT
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // QUOTED STATUS
  // ----------------------------------------------------------

  const quoted =
    context?.quotedMessage;

  if (
    quoted?.statusMentionMessage ||
    quoted?.groupStatusMentionMessage ||
    quoted?.groupStatusMessage
  ) {
    return true;
  }

  // ----------------------------------------------------------
  // STATUS BROADCAST JID
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // STATUS JID IN CONTEXT
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // TEXT FALLBACK
  // ----------------------------------------------------------

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
//
// IMPORTANT:
// WhatsApp/Baileys does not expose a universal reliable
// "this participant is a bot" flag for every third-party
// WhatsApp bot.
//
// Therefore this detector only reacts to explicit automation
// signals actually present in the message structure.
//
// It deliberately does NOT classify:
// - @lid accounts
// - normal commands
// - normal high-frequency users
// - ordinary WhatsApp accounts
//
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

  // Explicit message-level bot indicators.
  if (
    content.botMessage === true ||
    content.botReplyMessage === true ||
    content.aiMessage === true
  ) {
    return true;
  }

  const context =
    getContextInfo(message) as any;

  // Explicit context-level indicators.
  if (
    context?.botMessage === true ||
    context?.botReplyMessage === true ||
    context?.isBotMessage === true
  ) {
    return true;
  }

  // Explicit custom flags if exposed by the
  // message object.
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
//
// @lid is a legitimate WhatsApp identity and MUST NOT be
// considered fake.
//
// This detector focuses on malformed or unresolved group
// participant identities instead.
//
// ============================================================

function looksSuspicious(
  participant: any,
): boolean {
  if (!participant) {
    return true;
  }

  const id =
    typeof participant.id === "string"
      ? normalizeJid(participant.id)
      : "";

  const phoneNumber =
    typeof participant.phoneNumber ===
    "string"
      ? normalizeJid(
          participant.phoneNumber,
        )
      : "";

  // LID is legitimate.
  if (
    id.endsWith("@lid")
  ) {
    return false;
  }

  // Normal phone-number participant.
  if (
    id.endsWith("@s.whatsapp.net") ||
    phoneNumber.endsWith(
      "@s.whatsapp.net",
    )
  ) {
    return false;
  }

  // No usable identity at all.
  if (
    !id &&
    !phoneNumber
  ) {
    return true;
  }

  // Malformed identity.
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
// PROTECTION RESPONSE
// ============================================================

function protectionResponse(
  protection: ProtectionName,
  sender: string,
  reason: string,
  action: ProtectionAction,
  warningCount = 0,
  warnLimit = 3,
): string {
  const mention =
    userMention(sender);

  const names:
    Record<
      ProtectionName,
      string
    > = {
      antilink:
        "🔗 LINK DETECTED",

      antigrouplink:
        "🔗 GROUP LINK DETECTED",

      antistatus:
        "📱 STATUS ACTIVITY DETECTED",

      antispam:
        "💬 SPAM DETECTED",

      antibot:
        "🤖 BOT ACTIVITY DETECTED",

      antimention:
        "📣 MASS MENTION DETECTED",

      antiflood:
        "🌊 FLOOD DETECTED",

      antifake:
        "🕵️ SUSPICIOUS ACCOUNT DETECTED",

      antinsfw:
        "🔞 NSFW CONTENT DETECTED",
    };

  const title =
    names[protection];

  let lines: string[];

  // ----------------------------------------------------------
  // DELETE
  // ----------------------------------------------------------

  if (
    action === "delete"
  ) {
    lines = [
      mention,
      "",
      `📋 Reason: ${reason}`,
      "",
      "🗑️ Message removed.",
      "🟢 Protection enforced.",
      "",
      "🛡️ Group security remains active.",
    ];
  }

  // ----------------------------------------------------------
  // WARN
  // ----------------------------------------------------------

  else if (
    action === "warn"
  ) {
    lines = [
      mention,
      "",
      `📋 Reason: ${reason}`,
      "",
      "🗑️ Message removed.",
      "",
      `⚠️ Warning: ${warningCount}/${warnLimit}`,

      warningCount >= warnLimit
        ? "🚨 Warning limit reached."
        : "🟡 Please follow the group rules.",
    ];
  }

  // ----------------------------------------------------------
  // KICK
  // ----------------------------------------------------------

  else if (
    action === "kick"
  ) {
    lines = [
      mention,
      "",
      `📋 Reason: ${reason}`,
      "",
      "🗑️ Message removed.",
      "👢 Punishment: User removed.",
      "",
      "🛡️ Protection action enforced.",
    ];
  }

  // ----------------------------------------------------------
  // BAN
  // ----------------------------------------------------------

  else {
    lines = [
      mention,
      "",
      `📋 Reason: ${reason}`,
      "",
      "🗑️ Message removed.",
      "🚫 Punishment: User banned.",
      "",
      "🛡️ Protection action enforced.",
    ];
  }

  return security(
    title,
    lines,
  );
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
): Promise<void> {
  try {
    await sock.sendMessage(
      jid,
      {
        text:
          protectionResponse(
            protection,
            sender,
            reason,
            action,
            warningCount,
            warnLimit,
          ),

        mentions: [
          sender,
        ],
      },
    );
  } catch (err) {
    console.error(
      "[DARK VORTEX] Protection response error:",
      err,
    );
  }
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
      await sock.sendMessage(
        jid,
        {
          text:
            error(
              "BOT ADMIN REQUIRED",
              [
                "🛡️ Protection detected",
                "an offending message,",
                "but Dark Vortex cannot",
                "enforce the action.",
                "",
                "👑 Promote Dark Vortex",
                "to group administrator.",
              ],
            ),
        },
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
        await sock.sendMessage(
          jid,
          {
            text:
              security(
                "⚠️ WARNING LIMIT REACHED",
                [
                  userMention(
                    normalizedSender,
                  ),

                  `🚨 Warnings: ${warningCount}/${warnLimit}`,

                  "",

                  "👢 Maximum warning limit reached.",

                  "🛡️ Dark Vortex is removing the user.",

                  "",

                  "🔴 Protection action: ENFORCED",
                ],
              ),

            mentions: [
              normalizedSender,
            ],
          },
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

      // Keep the local protection record even if
      // WhatsApp rejects the participant removal.
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
// COMMAND CONFIGURATION
// ============================================================

export async function handleProtectionCommand(
  sock: WASocket,
  jid: string,
  command: string,
  args: string[],
  _message?: WAMessage,
): Promise<boolean> {
  const protectionCommands =
    new Set<
      ProtectionName |
      "protection" |
      "antistatusmention"
    >([
      "antilink",
      "antigrouplink",

      // Existing command.
      "antistatus",

      // New alias.
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
    await sock.sendMessage(
      jid,
      {
        text:
          error(
            "GROUP ONLY",
            [
              "🛡️ Protection settings",
              "can only be changed",
              "inside a WhatsApp group.",
              "",
              "💡 Open a group and",
              "try again.",
            ],
          ),
      },
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

    await sock.sendMessage(
      jid,
      {
        text:
          error(
            "GROUP DATA ERROR",
            [
              "Unable to read group",
              "information.",
              "",
              "💡 Try again in a moment.",
            ],
          ),
      },
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
    await sock.sendMessage(
      jid,
      {
        text:
          error(
            "ADMIN ACCESS REQUIRED",
            [
              "🛡️ Dark Vortex must be",
              "a group administrator",
              "to manage protection.",
              "",
              "💡 Promote Dark Vortex",
              "to admin and try again.",
            ],
          ),
      },
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

  // ==========================================================
  // SHOW STATUS
  // ==========================================================

  if (
    command === "protection"
  ) {
    const settings =
      getSettings(jid);

    await sock.sendMessage(
      jid,
      {
        text:
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
          }) +

          "\n\n" +

          security(
            "PROTECTION THRESHOLDS",
            [
              `⚠️ Warn limit: ${settings.warnLimit}`,

              `💬 Spam: ${settings.spamMessages} messages / ${settings.spamWindowSeconds}s`,

              `🌊 Flood: ${settings.floodMessages} messages / ${settings.floodWindowSeconds}s`,

              `👑 Protect admins: ${
                settings.protectAdmins
                  ? "ON"
                  : "OFF"
              }`,

              "",

              "🛡️ Security engine: ACTIVE",
            ],
          ),
      },
    );

    return true;
  }

  // ==========================================================
  // CONFIGURE PROTECTION
  // ==========================================================

  const protection =
    protectionCommand as ProtectionName;

  const value =
    args[0]?.toLowerCase();

  if (
    !value ||
    ![
      "on",
      "off",
      "delete",
      "warn",
      "kick",
      "ban",
    ].includes(value)
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          commandUsage(
            command,
            `/${command} on`,
            [
              `/${command} off`,
              `/${command} delete`,
              `/${command} warn`,
              `/${command} kick`,
              `/${command} ban`,
            ].join("\n"),
          ),
      },
    );

    return true;
  }

  const current =
    getSettings(jid)[
      protection
    ];

  let updated:
    ProtectionSettings;

  // ----------------------------------------------------------
  // ON
  // ----------------------------------------------------------

  if (
    value === "on"
  ) {
    updated = {
      ...current,
      enabled: true,
    };
  }

  // ----------------------------------------------------------
  // OFF
  // ----------------------------------------------------------

  else if (
    value === "off"
  ) {
    updated = {
      ...current,
      enabled: false,
    };
  }

  // ----------------------------------------------------------
  // ACTION
  // ----------------------------------------------------------

  else {
    updated = {
      enabled: true,
      action:
        value as ProtectionAction,
    };
  }

  updateSettings(
    jid,
    {
      [protection]:
        updated,
    },
  );

  const status =
    updated.enabled
      ? `🟢 ENABLED • Action: ${updated.action.toUpperCase()}`
      : "🔴 DISABLED";

  await sock.sendMessage(
    jid,
    {
      text:
        security(
          "PROTECTION UPDATED",
          [
            `🛡️ Feature: ${protectionCommand}`,

            `⚙️ Status: ${status}`,

            "",

            "🟢 Protection settings",
            "have been saved successfully.",

            "",

            "⚡ Dark Vortex security engine",
            "will enforce the new configuration.",
          ],
        ),
    },
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
  //
  // Admins remain exempt by default.
  //
  // protectAdmins can later be enabled if desired.
  //

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
      "WhatsApp group links are not allowed in this group.",
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
      "Links are not allowed in this group.",
      settings.warnLimit,
    );

    return;
  }

  // ==========================================================
  // 3. 📱 WHATSAPP STATUS MENTIONS
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
      "WhatsApp Status mentions are not allowed in this group.",
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
      "Mass mentions are not allowed in this group.",
      settings.warnLimit,
    );

    return;
  }

  // ==========================================================
  // 5. 🤖 OTHER BOTS
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
      "Automated bot activity is not allowed in this group.",
      settings.warnLimit,
    );

    return;
  }

  // ==========================================================
  // 6. 🕵️ FAKE / SUSPICIOUS ACCOUNT
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
        "Suspicious or unresolved account identity was detected.",
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
      "Spam activity is not allowed in this group.",
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
      "Sending messages too quickly is not allowed in this group.",
      settings.warnLimit,
    );

    return;
  }

  // ==========================================================
  // 9. 🔞 NSFW IMAGE DETECTION
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