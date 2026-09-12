
/* =========================================================
   🌑 DARK VORTEX — PREMIUM MODERATION ENGINE
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
  warningIssued,
  warningLimitReached,
  warningStatus,
  commandUsage,
  success,
  error,
  warning,
  security,
  system,
  info,
} from "../utils/message.js";

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
    .replace(/@c\.us$/i, "@s.whatsapp.net");
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
   USER DISPLAY
========================================================= */

function cleanMention(
  jid: string,
): string {
  const number = getJidNumber(jid);

  return number
    ? `@${number}`
    : "@user";
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
    await sock.sendMessage(
      jid,
      {
        text: commandUsage(
          "ban / warn",
          "Reply to a user's message → /ban",
          "Reply to a user's message to target them precisely.",
        ),
      },
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
    database[jid].length !==
    before;

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
     * Ban remains active in the database.
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

    await sock.sendMessage(
      jid,
      {
        text: security(
          "BANNED USER BLOCKED",
          [
            `👤 Target: ${cleanMention(
              participant.id,
            )}`,
            "",
            "🔴 Status: REMOVED",
            "🛡️ Protection: PERMANENT BAN",
            "",
            "🚫 Re-entry protection remains active.",
          ],
        ),
        mentions: [
          participant.id,
        ],
      },
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
    cleanMention(user);

  /* =======================================================
     WARNING LIMIT DISABLED
  ======================================================= */

  if (warnLimit === 0) {
    const response =
      warningIssued(
        mention,
        count,
        0,
        reason,
      ).replace(
        "🚨 Warning limit reached.",
        "🟢 Automatic removal: OFF.",
      );

    await sock.sendMessage(
      jid,
      {
        text: response,
        mentions: [user],
      },
    );

    return;
  }

  /* =======================================================
     WARNING LIMIT REACHED
  ======================================================= */

  if (count >= warnLimit) {
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

      await sock.sendMessage(
        jid,
        {
          text: warningLimitReached(
            mention,
            warnLimit,
            reason,
          ),
          mentions: [user],
        },
      );
    } catch (err) {
      console.error(
        "Automatic warning removal error:",
        err,
      );

      await sock.sendMessage(
        jid,
        {
          text: warning(
            "WARNING LIMIT REACHED",
            [
              `👤 Target: ${mention}`,
              `⚠️ Warnings: ${count}/${warnLimit}`,
              "",
              `📋 Reason: ${reason}`,
              "",
              "❌ Automatic removal failed.",
              "🛡️ The warning record has been retained.",
              "",
              "💡 Check Dark Vortex admin permissions.",
            ],
          ),
          mentions: [user],
        },
      );
    }

    return;
  }

  /* =======================================================
     NORMAL WARNING
  ======================================================= */

  await sock.sendMessage(
    jid,
    {
      text: warningIssued(
        mention,
        count,
        warnLimit,
        reason,
      ),
      mentions: [user],
    },
  );
}

/* =========================================================
   WARNING LIMIT COMMAND
========================================================= */

async function handleWarnLimit(
  sock: WASocket,
  jid: string,
  args: string[],
): Promise<void> {
  const currentLimit =
    getWarnLimit(jid);

  /* =======================================================
     SHOW CURRENT LIMIT
  ======================================================= */

  if (!args.length) {
    if (currentLimit === 0) {
      await sock.sendMessage(
        jid,
        {
          text: system(
            "WARNING LIMIT",
            [
              "⚙️ Automatic warning removal",
              "is currently disabled.",
              "",
              "📊 Current limit: OFF",
              "🟢 Warnings can still be issued.",
              "",
              "⚡ Enable with:",
              "/warnlimit 3",
            ],
          ),
        },
      );

      return;
    }

    await sock.sendMessage(
      jid,
      {
        text: system(
          "WARNING LIMIT",
          [
            "🟢 Protection is active.",
            "",
            `📊 Current limit: ${currentLimit}`,
            `🔴 Removal threshold: ${currentLimit} warning(s)`,
            "",
            "⚙️ Change limit:",
            "/warnlimit 5",
            "",
            "🟢 Disable automatic removal:",
            "/warnlimit off",
          ],
        ),
      },
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
    setWarnLimit(
      jid,
      0,
    );

    await sock.sendMessage(
      jid,
      {
        text: success(
          "WARNING LIMIT DISABLED",
          [
            "⚠️ Members can still receive warnings.",
            "🟢 Automatic removal is now OFF.",
            "",
            "⚙️ Enable again with:",
            "/warnlimit 3",
          ],
        ),
      },
    );

    return;
  }

  /* =======================================================
     SET NUMBER
  ======================================================= */

  const limit =
    Number(args[0]);

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    await sock.sendMessage(
      jid,
      {
        text: error(
          "INVALID WARNING LIMIT",
          [
            "❌ The supplied limit is invalid.",
            "",
            "📊 Allowed range:",
            "1 – 100 warnings",
            "",
            "📝 Examples:",
            "/warnlimit 3",
            "/warnlimit 5",
            "/warnlimit 10",
            "/warnlimit off",
          ],
        ),
      },
    );

    return;
  }

  setWarnLimit(
    jid,
    limit,
  );

  await sock.sendMessage(
    jid,
    {
      text: success(
        "WARNING LIMIT UPDATED",
        [
          `📊 New limit: ${limit}`,
          "",
          `🔴 User will be removed at ${limit} warning(s).`,
          "🛡️ Automatic enforcement: ENABLED",
        ],
      ),
    },
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
    await sock.sendMessage(
      jid,
      {
        text: security(
          "PROTECTED TARGET",
          [
            "🛡️ Target: DARK VORTEX BOT",
            "",
            "❌ Self-moderation is blocked.",
            "The bot cannot ban itself.",
          ],
        ),
      },
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
    await sock.sendMessage(
      jid,
      {
        text: error(
          "USER NOT FOUND",
          [
            `👤 Target: ${cleanMention(target)}`,
            "",
            "The replied user is not currently",
            "a member of this group.",
          ],
        ),
      },
    );

    return;
  }

  /* -------------------------------------------------------
     ADMIN PROTECTION
  ------------------------------------------------------- */

  if (
    isAdmin(participant)
  ) {
    await sock.sendMessage(
      jid,
      {
        text: security(
          "ADMIN PROTECTED",
          [
            `👤 Target: ${cleanMention(
              participant.id,
            )}`,
            "",
            "🛡️ Administrators cannot be banned",
            "by the moderation engine.",
          ],
        ),
        mentions: [
          participant.id,
        ],
      },
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

    await sock.sendMessage(
      jid,
      {
        text: security(
          "USER PERMANENTLY BANNED",
          [
            `👤 Target: ${cleanMention(
              participant.id,
            )}`,
            "",
            "🔴 Status: PERMANENTLY BANNED",
            "🛡️ Re-entry protection: ENABLED",
            "",
            "🚫 If the user rejoins,",
            "Dark Vortex will remove them automatically.",
          ],
        ),
        mentions: [
          participant.id,
        ],
      },
    );
  } catch (err) {
    console.error(
      "Ban error:",
      err,
    );

    await sock.sendMessage(
      jid,
      {
        text: error(
          "BAN FAILED",
          [
            `👤 Target: ${cleanMention(
              participant.id,
            )}`,
            "",
            "❌ WhatsApp rejected the removal.",
            "",
            "🟢 Ban database:",
            "NOT UPDATED",
            "",
            "💡 Check Dark Vortex admin permissions.",
          ],
        ),
        mentions: [
          participant.id,
        ],
      },
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

  try {
    await sock.groupParticipantsUpdate(
      jid,
      [target],
      "add",
    );

    await sock.sendMessage(
      jid,
      {
        text: success(
          "USER UNBANNED",
          [
            `👤 Target: ${cleanMention(target)}`,
            "",
            wasBanned
              ? "🟢 Permanent ban removed."
              : "ℹ️ User was not in the ban database.",
            "",
            "📥 Add request sent.",
            "🛡️ Re-entry protection: CLEARED",
          ],
        ),
        mentions: [target],
      },
    );
  } catch (err) {
    console.error(
      "Unban error:",
      err,
    );

    /*
     * Preserve existing behavior:
     * the ban record has already been removed,
     * while WhatsApp may reject the add operation.
     */
    await sock.sendMessage(
      jid,
      {
        text: warning(
          "BAN REMOVED",
          [
            `👤 Target: ${cleanMention(target)}`,
            "",
            wasBanned
              ? "🟢 Permanent ban removed."
              : "ℹ️ User was not in the ban database.",
            "",
            "⚠️ WhatsApp rejected the add request.",
            "📥 The user may need to rejoin manually.",
          ],
        ),
        mentions: [target],
      },
    );
  }
}

/* =========================================================
   SHOW BANNED USERS
========================================================= */

async function showBanned(
  sock: WASocket,
  jid: string,
): Promise<void> {
  const banned =
    getBannedUsers(jid);

  if (!banned.length) {
    await sock.sendMessage(
      jid,
      {
        text: info(
          "BANNED USERS",
          [
            "🟢 Ban database is clear.",
            "",
            "No users are currently",
            "under permanent ban protection.",
            "",
            "🛡️ Re-entry protection: INACTIVE",
          ],
        ),
      },
    );

    return;
  }

  const lines =
    banned.map(
      (user, index) =>
        `${index + 1}. ${cleanMention(user)}`,
    );

  await sock.sendMessage(
    jid,
    {
      text: security(
        "BANNED USERS",
        [
          `🚫 Total: ${banned.length}`,
          "",
          ...lines,
          "",
          "🛡️ Re-entry protection: ACTIVE",
          "⚡ Banned users are monitored automatically.",
        ],
      ),
      mentions: banned,
    },
  );
}

/* =========================================================
   CLEAR ALL BANS
========================================================= */

async function clearBans(
  sock: WASocket,
  jid: string,
): Promise<void> {
  const database =
    loadBans();

  const count =
    database[jid]?.length || 0;

  if (!count) {
    await sock.sendMessage(
      jid,
      {
        text: system(
          "CLEAR BANS",
          [
            "🟢 No stored bans were found.",
            "",
            "The ban database is already clear.",
            "🛡️ Re-entry protection: INACTIVE",
          ],
        ),
      },
    );

    return;
  }

  delete database[jid];

  saveBans(database);

  await sock.sendMessage(
    jid,
    {
      text: success(
        "BANS CLEARED",
        [
          `🧹 Removed ${count} stored ban${
            count === 1
              ? ""
              : "s"
          }.`,
          "",
          "🟢 Ban database cleared.",
          "🛡️ Re-entry protection: RESET",
        ],
      ),
    },
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
    await sock.sendMessage(
      jid,
      {
        text: security(
          "PROTECTED TARGET",
          [
            "🛡️ Target: DARK VORTEX BOT",
            "",
            "❌ The bot cannot warn itself.",
            "Self-moderation has been blocked.",
          ],
        ),
      },
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
    await sock.sendMessage(
      jid,
      {
        text: error(
          "USER NOT FOUND",
          [
            `👤 Target: ${cleanMention(target)}`,
            "",
            "The replied user is not currently",
            "a member of this group.",
          ],
        ),
      },
    );

    return;
  }

  /* -------------------------------------------------------
     ADMIN PROTECTION
  ------------------------------------------------------- */

  if (
    isAdmin(participant)
  ) {
    await sock.sendMessage(
      jid,
      {
        text: security(
          "ADMIN PROTECTED",
          [
            `👤 Target: ${cleanMention(
              participant.id,
            )}`,
            "",
            "🛡️ Administrators cannot be warned.",
          ],
        ),
        mentions: [
          participant.id,
        ],
      },
    );

    return;
  }

  await addWarning(
    sock,
    jid,
    participant.id,
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
    cleanMention(target);

  await sock.sendMessage(
    jid,
    {
      text: warningStatus(
        mention,
        count,
        warnLimit,
      ),
      mentions: [target],
    },
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

  await sock.sendMessage(
    jid,
    {
      text: success(
        "WARNINGS RESET",
        [
          `👤 Target: ${cleanMention(target)}`,
          "",
          `⚠️ Previous warnings: ${previous}`,
          "🟢 Current warnings: 0",
          "",
          "♻️ Warning record has been cleared.",
        ],
      ),
      mentions: [target],
    },
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
    await sock.sendMessage(
      jid,
      {
        text: error(
          "GROUP ONLY",
          [
            `⚡ Command: /${command}`,
            "",
            "👥 This moderation command",
            "can only be used inside a group.",
            "",
            "💡 Open a WhatsApp group",
            "and try again.",
          ],
        ),
      },
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
    await sock.sendMessage(
      jid,
      {
        text: security(
          "ADMIN ACCESS REQUIRED",
          [
            "🛡️ Dark Vortex must be",
            "a group administrator.",
            "",
            "⚔️ Moderation action blocked.",
            "",
            "💡 Promote Dark Vortex to admin",
            "and try again.",
          ],
        ),
      },
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
    await sock.sendMessage(
      jid,
      {
        text: error(
          "GROUP ACCESS ERROR",
          [
            "❌ Group information could not be retrieved.",
            "",
            "⚙️ The moderation action was not executed.",
            "",
            "💡 Please try again shortly.",
          ],
        ),
      },
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
      );
      return true;

    case "clearbans":
      await clearBans(
        sock,
        jid,
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
