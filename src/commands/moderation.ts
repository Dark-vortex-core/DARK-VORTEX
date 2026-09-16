
/* =========================================================
   🌑 DARK VORTEX — MODERATION ENGINE

   ⚡ Powered by Vortex Tech
========================================================= */

import fs from "node:fs";
import path from "node:path";

import type {
  GroupMetadata,
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import {
  sendVortexReply,
} from "../utils/vortex-reply.js";

import {
  resolveIdentity,
} from "../utils/identity.js";

/* =========================================================
   DATABASE PATHS
========================================================= */

const DATA_DIR = path.resolve("./src/data");

const WARNINGS_FILE = path.join(
  DATA_DIR,
  "warnings.json",
);

const BANS_FILE = path.join(
  DATA_DIR,
  "bans.json",
);

const WARNLIMIT_FILE = path.join(
  DATA_DIR,
  "warnlimits.json",
);

const DEFAULT_WARN_LIMIT = 3;

/* =========================================================
   DATABASE TYPES
========================================================= */

type WarningDatabase = Record<
  string,
  Record<string, number>
>;

type BanDatabase = Record<
  string,
  string[]
>;

type WarnLimitDatabase = Record<
  string,
  number
>;

/* =========================================================
   DATABASE INITIALIZATION
========================================================= */

function ensureDatabase(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {
      recursive: true,
    });
  }

  if (!fs.existsSync(WARNINGS_FILE)) {
    fs.writeFileSync(
      WARNINGS_FILE,
      JSON.stringify({}, null, 2),
      "utf8",
    );
  }

  if (!fs.existsSync(BANS_FILE)) {
    fs.writeFileSync(
      BANS_FILE,
      JSON.stringify({}, null, 2),
      "utf8",
    );
  }

  if (!fs.existsSync(WARNLIMIT_FILE)) {
    fs.writeFileSync(
      WARNLIMIT_FILE,
      JSON.stringify({}, null, 2),
      "utf8",
    );
  }
}

/* =========================================================
   SAFE JSON HELPERS
========================================================= */

function readJsonFile<T>(
  filePath: string,
  fallback: T,
): T {
  ensureDatabase();

  try {
    const raw = fs.readFileSync(
      filePath,
      "utf8",
    );

    if (!raw.trim()) {
      return fallback;
    }

    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile<T>(
  filePath: string,
  data: T,
): void {
  ensureDatabase();

  fs.writeFileSync(
    filePath,
    JSON.stringify(data, null, 2),
    "utf8",
  );
}

/* =========================================================
   WARNING DATABASE
========================================================= */

function loadWarnings(): WarningDatabase {
  return readJsonFile<WarningDatabase>(
    WARNINGS_FILE,
    {},
  );
}

function saveWarnings(
  database: WarningDatabase,
): void {
  writeJsonFile(
    WARNINGS_FILE,
    database,
  );
}

/* =========================================================
   BAN DATABASE
========================================================= */

function loadBans(): BanDatabase {
  return readJsonFile<BanDatabase>(
    BANS_FILE,
    {},
  );
}

function saveBans(
  database: BanDatabase,
): void {
  writeJsonFile(
    BANS_FILE,
    database,
  );
}

/* =========================================================
   WARNING LIMIT DATABASE
========================================================= */

function loadWarnLimits(): WarnLimitDatabase {
  return readJsonFile<WarnLimitDatabase>(
    WARNLIMIT_FILE,
    {},
  );
}

function saveWarnLimits(
  database: WarnLimitDatabase,
): void {
  writeJsonFile(
    WARNLIMIT_FILE,
    database,
  );
}

/* =========================================================
   WARNING LIMIT
========================================================= */

/**
 * Returns the configured warning limit.
 *
 * 0 = automatic removal disabled.
 */
export function getWarnLimit(
  jid: string,
): number {
  const database = loadWarnLimits();
  const limit = database[jid];

  if (
    typeof limit !== "number" ||
    !Number.isFinite(limit) ||
    limit < 0
  ) {
    return DEFAULT_WARN_LIMIT;
  }

  return Math.floor(limit);
}

/**
 * Sets the warning limit.
 *
 * 0 = automatic removal disabled.
 */
export function setWarnLimit(
  jid: string,
  limit: number,
): void {
  const database = loadWarnLimits();

  database[jid] = Math.max(
    0,
    Math.floor(limit),
  );

  saveWarnLimits(database);
}

/* =========================================================
   JID HELPERS
========================================================= */

function normalizeJid(
  jid?: string | null,
): string {
  if (!jid) {
    return "";
  }

  return jid
    .trim()
    .replace(/:\d+(?=@)/, "")
    .replace(
      /@c\.us$/i,
      "@s.whatsapp.net",
    );
}

function getJidNumber(
  jid?: string | null,
): string {
  if (!jid) {
    return "";
  }

  return jid
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

function sameUser(
  a?: string | null,
  b?: string | null,
): boolean {
  if (!a || !b) {
    return false;
  }

  const normalizedA = normalizeJid(a);
  const normalizedB = normalizeJid(b);

  if (
    normalizedA &&
    normalizedA === normalizedB
  ) {
    return true;
  }

  const numberA = getJidNumber(normalizedA);
  const numberB = getJidNumber(normalizedB);

  return Boolean(
    numberA &&
      numberB &&
      numberA === numberB,
  );
}

/* =========================================================
   GLOBAL IDENTITY DISPLAY
========================================================= */

/**
 * Resolves a JID through the global identity system.
 *
 * Display names come from identity.ts.
 * The original JID is still used for the actual
 * WhatsApp mention metadata.
 */
async function resolveMention(
  sock: WASocket,
  jid: string,
  contextJid?: string,
): Promise<string> {
  const identity = await resolveIdentity(
    sock,
    jid,
    contextJid,
  );

  if (identity.name === "Unknown User") {
    return "@Unknown User";
  }

  return `@${identity.name}`;
}

/* =========================================================
   REPLY HELPERS
========================================================= */

/**
 * Normal Dark Vortex reply.
 */
async function sendModerationReply(
  sock: WASocket,
  jid: string,
  text: string,
  message?: WAMessage,
): Promise<void> {
  await sendVortexReply(
    sock,
    jid,
    text,
    message,
  );
}

/**
 * Reply with real WhatsApp mentions.
 *
 * The display name is resolved globally,
 * while the raw JID remains the actual mention target.
 */
async function sendModerationMentionReply(
  sock: WASocket,
  jid: string,
  text: string,
  mentionedJids: string[],
  message?: WAMessage,
): Promise<void> {
  await sock.sendMessage(
    jid,
    {
      text,
      mentions: mentionedJids,
    },
    message
      ? {
          quoted: message,
        }
      : undefined,
  );
}

/* =========================================================
   GROUP HELPERS
========================================================= */

function isGroup(
  jid: string,
): boolean {
  return jid.endsWith("@g.us");
}

function isAdmin(
  participant:
    GroupMetadata["participants"][number],
): boolean {
  return (
    participant.admin === "admin" ||
    participant.admin === "superadmin"
  );
}

async function getGroup(
  sock: WASocket,
  jid: string,
): Promise<GroupMetadata | null> {
  try {
    return await sock.groupMetadata(jid);
  } catch {
    return null;
  }
}

async function isBotAdmin(
  sock: WASocket,
  jid: string,
): Promise<boolean> {
  try {
    const metadata =
      await sock.groupMetadata(jid);

    const botJid =
      sock.user?.id || "";

    const botLid =
      sock.user?.lid || "";

    const botNumber =
      getJidNumber(botJid);

    const participant =
      metadata.participants.find(
        (item) => {
          if (
            sameUser(
              item.id,
              botJid,
            )
          ) {
            return true;
          }

          if (
            botLid &&
            sameUser(
              item.id,
              botLid,
            )
          ) {
            return true;
          }

          const participantNumber =
            getJidNumber(item.id);

          return Boolean(
            botNumber &&
              participantNumber &&
              botNumber ===
                participantNumber,
          );
        },
      );

    return Boolean(
      participant &&
        isAdmin(participant),
    );
  } catch {
    return false;
  }
}

/* =========================================================
   QUOTED MESSAGE TARGET
========================================================= */

function getReplyTarget(
  message: WAMessage,
): string | null {
  const context =
    message.message
      ?.extendedTextMessage
      ?.contextInfo ||
    message.message
      ?.imageMessage
      ?.contextInfo ||
    message.message
      ?.videoMessage
      ?.contextInfo ||
    message.message
      ?.documentMessage
      ?.contextInfo ||
    message.message
      ?.audioMessage
      ?.contextInfo ||
    message.message
      ?.stickerMessage
      ?.contextInfo;

  if (!context?.quotedMessage) {
    return null;
  }

  return context.participant || null;
}

async function requireReplyTarget(
  sock: WASocket,
  jid: string,
  message: WAMessage,
): Promise<string | null> {
  const target =
    getReplyTarget(message);

  if (!target) {
    await sendModerationReply(
      sock,
      jid,
      [
        "⚙️ Reply required.",
        "",
        "Reply to the user's message",
        "you want to moderate.",
      ].join("\n"),
      message,
    );

    return null;
  }

  return normalizeJid(target);
}

/* =========================================================
   PARTICIPANT LOOKUP
========================================================= */

function findParticipant(
  metadata: GroupMetadata,
  target: string,
) {
  return metadata.participants.find(
    (participant) =>
      sameUser(
        participant.id,
        target,
      ),
  );
}

/* =========================================================
   BOT PROTECTION
========================================================= */

function isBot(
  sock: WASocket,
  target: string,
): boolean {
  const botJid =
    sock.user?.id || "";

  const botLid =
    sock.user?.lid || "";

  return (
    sameUser(
      target,
      botJid,
    ) ||
    Boolean(
      botLid &&
        sameUser(
          target,
          botLid,
        ),
    )
  );
}

/* =========================================================
   BAN DATABASE HELPERS
========================================================= */

export function isBanned(
  jid: string,
  user: string,
): boolean {
  const database = loadBans();

  const groupBans =
    database[jid] || [];

  const target =
    normalizeJid(user);

  return groupBans.some(
    (bannedUser) =>
      sameUser(
        bannedUser,
        target,
      ),
  );
}

export function getBannedUsers(
  jid: string,
): string[] {
  const database = loadBans();

  return [
    ...(database[jid] || []),
  ];
}

function addBan(
  jid: string,
  user: string,
): void {
  const database = loadBans();

  if (!database[jid]) {
    database[jid] = [];
  }

  const normalized =
    normalizeJid(user);

  if (!normalized) {
    return;
  }

  const alreadyBanned =
    database[jid].some(
      (bannedUser) =>
        sameUser(
          bannedUser,
          normalized,
        ),
    );

  if (!alreadyBanned) {
    database[jid].push(
      normalized,
    );
  }

  saveBans(database);
}

function removeBan(
  jid: string,
  user: string,
): boolean {
  const database = loadBans();

  if (!database[jid]) {
    return false;
  }

  const normalized =
    normalizeJid(user);

  const before =
    database[jid].length;

  database[jid] =
    database[jid].filter(
      (bannedUser) =>
        !sameUser(
          bannedUser,
          normalized,
        ),
    );

  const changed =
    database[jid].length !== before;

  if (
    database[jid].length === 0
  ) {
    delete database[jid];
  }

  saveBans(database);

  return changed;
}

/* =========================================================
   AUTOMATIC BAN ENFORCEMENT
========================================================= */

export async function enforceBan(
  sock: WASocket,
  jid: string,
  user: string,
): Promise<boolean> {
  if (
    !isBanned(
      jid,
      user,
    )
  ) {
    return false;
  }

  const target =
    normalizeJid(user);

  if (
    isBot(
      sock,
      target,
    )
  ) {
    return false;
  }

  try {
    const metadata =
      await sock.groupMetadata(jid);

    const participant =
      findParticipant(
        metadata,
        target,
      );

    /*
     * User is already absent.
     * Ban remains active in database.
     */
    if (!participant) {
      return true;
    }

    /*
     * Never automatically remove administrators.
     */
    if (
      isAdmin(participant)
    ) {
      return true;
    }

    await sock.groupParticipantsUpdate(
      jid,
      [participant.id],
      "remove",
    );

    const mention =
      await resolveMention(
        sock,
        participant.id,
        jid,
      );

    await sendModerationMentionReply(
      sock,
      jid,
      [
        "🚫 Banned user removed.",
        "",
        `${mention} attempted to rejoin.`,
      ].join("\n"),
      [participant.id],
    );

    return true;
  } catch (err) {
    console.error(
      "Automatic ban enforcement error:",
      err,
    );

    return false;
  }
}

/* =========================================================
   WARNING COUNT
========================================================= */

export function getWarnings(
  jid: string,
  user: string,
): number {
  const database =
    loadWarnings();

  return (
    database[jid]?.[
      normalizeJid(user)
    ] || 0
  );
}

/* =========================================================
   RESET WARNINGS
========================================================= */

export function resetWarnings(
  jid: string,
  user: string,
): void {
  const database =
    loadWarnings();

  if (!database[jid]) {
    return;
  }

  delete database[jid][
    normalizeJid(user)
  ];

  if (
    Object.keys(
      database[jid],
    ).length === 0
  ) {
    delete database[jid];
  }

  saveWarnings(database);
}

/* =========================================================
   ADD WARNING
========================================================= */

export async function addWarning(
  sock: WASocket,
  jid: string,
  target: string,
  reason = "No reason provided",
  quotedMessage?: WAMessage,
): Promise<void> {
  const database =
    loadWarnings();

  if (!database[jid]) {
    database[jid] = {};
  }

  const user =
    normalizeJid(target);

  database[jid][user] =
    (database[jid][user] || 0) + 1;

  const count =
    database[jid][user];

  saveWarnings(database);

  const warnLimit =
    getWarnLimit(jid);

  const mention =
    await resolveMention(
      sock,
      user,
      jid,
    );

  /* =======================================================
     WARNING LIMIT DISABLED
  ======================================================= */

  if (warnLimit === 0) {
    await sendModerationMentionReply(
      sock,
      jid,
      [
        "⚠️ Warning issued.",
        "",
        `${mention}, ${reason}`,
        `Warnings: ${count}`,
        "Automatic removal: OFF",
      ].join("\n"),
      [user],
      quotedMessage,
    );

    return;
  }

  /* =======================================================
     WARNING LIMIT REACHED
  ======================================================= */

  if (
    count >= warnLimit
  ) {
    try {
      await sock.groupParticipantsUpdate(
        jid,
        [user],
        "remove",
      );

      resetWarnings(
        jid,
        user,
      );

      await sendModerationMentionReply(
        sock,
        jid,
        [
          "👢 Member removed.",
          "",
          `${mention} — warning limit reached.`,
          `Warnings: ${count}/${warnLimit}`,
        ].join("\n"),
        [user],
        quotedMessage,
      );
    } catch (err) {
      console.error(
        "Automatic warning removal error:",
        err,
      );

      await sendModerationMentionReply(
        sock,
        jid,
        [
          "⚠️ Warning limit reached.",
          "",
          `${mention} — ${count}/${warnLimit}`,
          "Member removal failed.",
          "",
          "Check Dark Vortex admin access.",
        ].join("\n"),
        [user],
        quotedMessage,
      );
    }

    return;
  }

  /* =======================================================
     NORMAL WARNING
  ======================================================= */

  await sendModerationMentionReply(
    sock,
    jid,
    [
      "⚠️ Warning issued.",
      "",
      `${mention}, ${reason}`,
      `Warning: ${count}/${warnLimit}`,
    ].join("\n"),
    [user],
    quotedMessage,
  );
}

/* =========================================================
   WARNING LIMIT COMMAND
========================================================= */

async function handleWarnLimit(
  sock: WASocket,
  jid: string,
  args: string[],
  message: WAMessage,
): Promise<void> {
  const currentLimit =
    getWarnLimit(jid);

  /* =======================================================
     SHOW CURRENT LIMIT
  ======================================================= */

  if (!args.length) {
    if (
      currentLimit === 0
    ) {
      await sendModerationReply(
        sock,
        jid,
        [
          "⚙️ Warning limit",
          "",
          "Status: OFF",
          "Warnings remain available.",
          "Automatic removal is disabled.",
        ].join("\n"),
        message,
      );

      return;
    }

    await sendModerationReply(
      sock,
      jid,
      [
        "⚙️ Warning limit",
        "",
        `Limit: ${currentLimit}`,
        "Automatic removal: ON",
      ].join("\n"),
      message,
    );

    return;
  }

  /* =======================================================
     TURN OFF
  ======================================================= */

  if (
    args[0].toLowerCase() ===
    "off"
  ) {
    if (args.length > 1) {
      await sendModerationReply(
        sock,
        jid,
        [
          "⚙️ Usage",
          "",
          ".warnlimit off",
        ].join("\n"),
        message,
      );

      return;
    }

    setWarnLimit(
      jid,
      0,
    );

    await sendModerationReply(
      sock,
      jid,
      [
        "⚙️ Warning limit updated.",
        "",
        "Status: OFF",
        "Automatic removal: disabled",
      ].join("\n"),
      message,
    );

    return;
  }

  /* =======================================================
     SET NUMBER
  ======================================================= */

  if (args.length > 1) {
    await sendModerationReply(
      sock,
      jid,
      [
        "⚙️ Usage",
        "",
        ".warnlimit <1-100>",
        ".warnlimit off",
      ].join("\n"),
      message,
    );

    return;
  }

  const limit =
    Number(args[0]);

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    await sendModerationReply(
      sock,
      jid,
      [
        "⚠️ Invalid warning limit.",
        "",
        "Use a number from 1 to 100.",
        "",
        "Example: .warnlimit 3",
      ].join("\n"),
      message,
    );

    return;
  }

  setWarnLimit(
    jid,
    limit,
  );

  await sendModerationReply(
    sock,
    jid,
    [
      "⚙️ Warning limit updated.",
      "",
      `Limit: ${limit}`,
      "Automatic removal: ON",
    ].join("\n"),
    message,
  );
}

/* =========================================================
   BAN USER
========================================================= */

async function banUser(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  metadata: GroupMetadata,
): Promise<void> {
  const target =
    await requireReplyTarget(
      sock,
      jid,
      message,
    );

  if (!target) {
    return;
  }

  /* -------------------------------------------------------
     BOT PROTECTION
  ------------------------------------------------------- */

  if (
    isBot(
      sock,
      target,
    )
  ) {
    await sendModerationReply(
      sock,
      jid,
      [
        "🛡️ Action blocked.",
        "",
        "Dark Vortex cannot ban itself.",
      ].join("\n"),
      message,
    );

    return;
  }

  const participant =
    findParticipant(
      metadata,
      target,
    );

  /* -------------------------------------------------------
     USER NOT FOUND
  ------------------------------------------------------- */

  if (!participant) {
    const mention =
      await resolveMention(
        sock,
        target,
        jid,
      );

    await sendModerationReply(
      sock,
      jid,
      [
        "⚠️ User not found.",
        "",
        `${mention} is not currently in this group.`,
      ].join("\n"),
      message,
    );

    return;
  }

  /* -------------------------------------------------------
     ADMIN PROTECTION
  ------------------------------------------------------- */

  if (
    isAdmin(participant)
  ) {
    const mention =
      await resolveMention(
        sock,
        participant.id,
        jid,
      );

    await sendModerationMentionReply(
      sock,
      jid,
      [
        "🛡️ Action blocked.",
        "",
        `${mention} is a group admin.`,
        "Administrators cannot be banned.",
      ].join("\n"),
      [participant.id],
      message,
    );

    return;
  }

  /* -------------------------------------------------------
     REMOVE + STORE BAN
  ------------------------------------------------------- */

  try {
    await sock.groupParticipantsUpdate(
      jid,
      [participant.id],
      "remove",
    );

    addBan(
      jid,
      participant.id,
    );

    const mention =
      await resolveMention(
        sock,
        participant.id,
        jid,
      );

    await sendModerationMentionReply(
      sock,
      jid,
      [
        "🚫 Member banned.",
        "",
        `${mention} was removed and added to the ban list.`,
      ].join("\n"),
      [participant.id],
      message,
    );
  } catch (err) {
    console.error(
      "Ban error:",
      err,
    );

    const mention =
      await resolveMention(
        sock,
        participant.id,
        jid,
      );

    await sendModerationMentionReply(
      sock,
      jid,
      [
        "⚠️ Ban failed.",
        "",
        `${mention} could not be removed.`,
        "Ban list was not updated.",
      ].join("\n"),
      [participant.id],
      message,
    );
  }
}

/* =========================================================
   UNBAN USER
========================================================= */

async function unbanUser(
  sock: WASocket,
  jid: string,
  message: WAMessage,
): Promise<void> {
  const target =
    await requireReplyTarget(
      sock,
      jid,
      message,
    );

  if (!target) {
    return;
  }

  const wasBanned =
    isBanned(
      jid,
      target,
    );

  removeBan(
    jid,
    target,
  );

  const mention =
    await resolveMention(
      sock,
      target,
      jid,
    );

  try {
    await sock.groupParticipantsUpdate(
      jid,
      [target],
      "add",
    );

    await sendModerationMentionReply(
      sock,
      jid,
      [
        "🟢 User unbanned.",
        "",
        `${mention} — ban removed.`,
        "Re-entry request sent.",
      ].join("\n"),
      [target],
      message,
    );
  } catch (err) {
    console.error(
      "Unban error:",
      err,
    );

    await sendModerationMentionReply(
      sock,
      jid,
      [
        "🟢 Ban removed.",
        "",
        `${mention} — ban cleared.`,
        wasBanned
          ? "WhatsApp rejected the add request."
          : "User was not in the ban database.",
      ].join("\n"),
      [target],
      message,
    );
  }
}

/* =========================================================
   SHOW BANNED USERS
========================================================= */

async function showBanned(
  sock: WASocket,
  jid: string,
  message: WAMessage,
): Promise<void> {
  const banned =
    getBannedUsers(jid);

  if (!banned.length) {
    await sendModerationReply(
      sock,
      jid,
      [
        "🚫 Banned users",
        "",
        "No users are currently banned.",
      ].join("\n"),
      message,
    );

    return;
  }

  const resolvedLines: string[] = [];

  for (
    let index = 0;
    index < banned.length;
    index += 1
  ) {
    const mention =
      await resolveMention(
        sock,
        banned[index],
        jid,
      );

    resolvedLines.push(
      `${index + 1}. ${mention}`,
    );
  }

  await sendModerationMentionReply(
    sock,
    jid,
    [
      "🚫 Banned users",
      "",
      `Total: ${banned.length}`,
      "",
      ...resolvedLines,
    ].join("\n"),
    banned,
    message,
  );
}

/* =========================================================
   CLEAR ALL BANS
========================================================= */

async function clearBans(
  sock: WASocket,
  jid: string,
  message: WAMessage,
): Promise<void> {
  const database =
    loadBans();

  const count =
    database[jid]?.length || 0;

  if (!count) {
    await sendModerationReply(
      sock,
      jid,
      [
        "🚫 Ban list",
        "",
        "Already clear.",
      ].join("\n"),
      message,
    );

    return;
  }

  delete database[jid];

  saveBans(database);

  await sendModerationReply(
    sock,
    jid,
    [
      "🧹 Ban list cleared.",
      "",
      `Removed: ${count}`,
    ].join("\n"),
    message,
  );
}

/* =========================================================
   WARN USER
========================================================= */

async function warnUser(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  metadata: GroupMetadata,
): Promise<void> {
  const target =
    await requireReplyTarget(
      sock,
      jid,
      message,
    );

  if (!target) {
    return;
  }

  /* -------------------------------------------------------
     BOT PROTECTION
  ------------------------------------------------------- */

  if (
    isBot(
      sock,
      target,
    )
  ) {
    await sendModerationReply(
      sock,
      jid,
      [
        "🛡️ Action blocked.",
        "",
        "Dark Vortex cannot warn itself.",
      ].join("\n"),
      message,
    );

    return;
  }

  const participant =
    findParticipant(
      metadata,
      target,
    );

  /* -------------------------------------------------------
     USER NOT FOUND
  ------------------------------------------------------- */

  if (!participant) {
    const mention =
      await resolveMention(
        sock,
        target,
        jid,
      );

    await sendModerationReply(
      sock,
      jid,
      [
        "⚠️ User not found.",
        "",
        `${mention} is not currently in this group.`,
      ].join("\n"),
      message,
    );

    return;
  }

  /* -------------------------------------------------------
     ADMIN PROTECTION
  ------------------------------------------------------- */

  if (
    isAdmin(participant)
  ) {
    const mention =
      await resolveMention(
        sock,
        participant.id,
        jid,
      );

    await sendModerationMentionReply(
      sock,
      jid,
      [
        "🛡️ Action blocked.",
        "",
        `${mention} is a group admin.`,
        "Administrators cannot be warned.",
      ].join("\n"),
      [participant.id],
      message,
    );

    return;
  }

  await addWarning(
    sock,
    jid,
    participant.id,
    "Manual warning issued.",
    message,
  );
}

/* =========================================================
   SHOW WARNINGS
========================================================= */

async function showWarnings(
  sock: WASocket,
  jid: string,
  message: WAMessage,
): Promise<void> {
  const target =
    await requireReplyTarget(
      sock,
      jid,
      message,
    );

  if (!target) {
    return;
  }

  const count =
    getWarnings(
      jid,
      target,
    );

  const warnLimit =
    getWarnLimit(jid);

  const mention =
    await resolveMention(
      sock,
      target,
      jid,
    );

  await sendModerationMentionReply(
    sock,
    jid,
    [
      "⚠️ Warning status",
      "",
      `User: ${mention}`,
      `Warnings: ${count}`,
      `Limit: ${
        warnLimit === 0
          ? "OFF"
          : warnLimit
      }`,
    ].join("\n"),
    [target],
    message,
  );
}

/* =========================================================
   RESET WARNING
========================================================= */

async function resetWarning(
  sock: WASocket,
  jid: string,
  message: WAMessage,
): Promise<void> {
  const target =
    await requireReplyTarget(
      sock,
      jid,
      message,
    );

  if (!target) {
    return;
  }

  const previous =
    getWarnings(
      jid,
      target,
    );

  resetWarnings(
    jid,
    target,
  );

  const mention =
    await resolveMention(
      sock,
      target,
      jid,
    );

  await sendModerationMentionReply(
    sock,
    jid,
    [
      "♻️ Warnings reset.",
      "",
      `${mention} — ${previous} warning(s) cleared.`,
    ].join("\n"),
    [target],
    message,
  );
}

/* =========================================================
   COMMAND HANDLER
========================================================= */

export async function handleModerationCommand(
  sock: WASocket,
  jid: string,
  command: string,
  args: string[],
  message: WAMessage,
): Promise<boolean> {
  const moderationCommands =
    new Set([
      "ban",
      "unban",
      "banned",
      "clearbans",
      "warn",
      "warnings",
      "resetwarn",
      "clearwarn",
      "warnlimit",
    ]);

  if (
    !moderationCommands.has(command)
  ) {
    return false;
  }

  /* =======================================================
     GROUP ONLY
  ======================================================= */

  if (!isGroup(jid)) {
    await sendModerationReply(
      sock,
      jid,
      [
        "👥 Group only.",
        "",
        "This moderation command must be used inside a group.",
      ].join("\n"),
      message,
    );

    return true;
  }

  /* =======================================================
     BOT ADMIN CHECK
  ======================================================= */

  if (
    !(await isBotAdmin(
      sock,
      jid,
    ))
  ) {
    await sendModerationReply(
      sock,
      jid,
      [
        "🛡️ Admin access required.",
        "",
        "Promote Dark Vortex to group admin.",
      ].join("\n"),
      message,
    );

    return true;
  }

  /* =======================================================
     WARNING LIMIT
  ======================================================= */

  if (
    command === "warnlimit"
  ) {
    await handleWarnLimit(
      sock,
      jid,
      args,
      message,
    );

    return true;
  }

  /* =======================================================
     GROUP METADATA
  ======================================================= */

  const metadata =
    await getGroup(
      sock,
      jid,
    );

  if (!metadata) {
    await sendModerationReply(
      sock,
      jid,
      [
        "⚠️ Group data unavailable.",
        "",
        "Try the moderation command again.",
      ].join("\n"),
      message,
    );

    return true;
  }

  /* =======================================================
     COMMAND SWITCH
  ======================================================= */

  switch (command) {
    case "ban":
      await banUser(
        sock,
        jid,
        message,
        metadata,
      );
      return true;

    case "unban":
      await unbanUser(
        sock,
        jid,
        message,
      );
      return true;

    case "banned":
      await showBanned(
        sock,
        jid,
        message,
      );
      return true;

    case "clearbans":
      await clearBans(
        sock,
        jid,
        message,
      );
      return true;

    case "warn":
      await warnUser(
        sock,
        jid,
        message,
        metadata,
      );
      return true;

    case "warnings":
      await showWarnings(
        sock,
        jid,
        message,
      );
      return true;

    case "resetwarn":
    case "clearwarn":
      await resetWarning(
        sock,
        jid,
        message,
      );
      return true;

    default:
      return false;
  }
}

