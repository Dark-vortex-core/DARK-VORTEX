
/* =========================================================
   🌑 DARK VORTEX — DELETE ALL FROM
   ⚡ Powered by Vortex Tech

   Group tool:
     /deleteallfrom @user
     /deleteallfrom off @user

   Uses WhatsApp mention metadata to identify the target.

   Storage:
     src/data/deleteallfrom/rules.json

   This service is independent from the existing
   moderation/protection services.
========================================================= */

import type {
  WASocket,
  WAMessage,
} from "@whiskeysockets/baileys";

import {
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";

import path from "node:path";

const FOOTER =
  "⚡ Powered by Vortex Tech";

const DATA_DIR =
  path.resolve(
    process.cwd(),
    "src",
    "data",
    "deleteallfrom",
  );

const RULES_FILE =
  path.join(
    DATA_DIR,
    "rules.json",
  );

const TEMP_FILE =
  `${RULES_FILE}.tmp`;

interface DeleteAllFromRule {
  groupJid: string;
  targetJid: string;
  createdAt: number;
  createdBy?: string;
}

type DeleteAllFromRules =
  DeleteAllFromRule[];

function normalizeJid(
  jid: string,
): string {
  return jid
    .trim()
    .toLowerCase();
}

async function loadRules():
  Promise<DeleteAllFromRules> {
  try {
    const raw =
      await readFile(
        RULES_FILE,
        "utf8",
      );

    const parsed: unknown =
      JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (item): item is DeleteAllFromRule =>
        Boolean(
          item &&
          typeof item === "object" &&
          typeof (item as DeleteAllFromRule)
            .groupJid === "string" &&
          typeof (item as DeleteAllFromRule)
            .targetJid === "string" &&
          typeof (item as DeleteAllFromRule)
            .createdAt === "number",
        ),
    );
  } catch {
    return [];
  }
}

async function saveRules(
  rules: DeleteAllFromRules,
): Promise<void> {
  await mkdir(
    DATA_DIR,
    {
      recursive: true,
    },
  );

  await writeFile(
    TEMP_FILE,
    JSON.stringify(
      rules,
      null,
      2,
    ),
    "utf8",
  );

  await rename(
    TEMP_FILE,
    RULES_FILE,
  );
}

function getMentionedJid(
  message: WAMessage,
): string | undefined {
  const context =
    message.message?.extendedTextMessage
      ?.contextInfo;

  const mentioned =
    context?.mentionedJid;

  if (
    !mentioned ||
    mentioned.length === 0
  ) {
    return undefined;
  }

  const jid =
    mentioned.find(
      value =>
        typeof value === "string" &&
        value.trim().length > 0,
    );

  return jid
    ? normalizeJid(jid)
    : undefined;
}

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
    content.extendedTextMessage
      ?.text
  ) {
    return (
      content.extendedTextMessage.text
    );
  }

  if (
    content.imageMessage
      ?.caption
  ) {
    return (
      content.imageMessage.caption
    );
  }

  if (
    content.videoMessage
      ?.caption
  ) {
    return (
      content.videoMessage.caption
    );
  }

  if (
    content.documentMessage
      ?.caption
  ) {
    return (
      content.documentMessage.caption
    );
  }

  return "";
}

function getMessageSender(
  message: WAMessage,
): string | undefined {
  const key =
    message.key;

  if (!key) {
    return undefined;
  }

  const participant =
    key.participant;

  if (
    typeof participant === "string" &&
    participant.length > 0
  ) {
    return normalizeJid(
      participant,
    );
  }

  const remoteJid =
    key.remoteJid;

  if (
    typeof remoteJid === "string" &&
    !remoteJid.endsWith("@g.us")
  ) {
    return normalizeJid(
      remoteJid,
    );
  }

  return undefined;
}

export async function handleDeleteAllFromCommand(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  command: string,
  args: string[],
): Promise<boolean> {
  const normalizedCommand =
  command.trim().toLowerCase();

if (
  normalizedCommand !== "deleteallfrom" &&
  normalizedCommand !== "deleteallfromuser"
) {
  return false;
}

  if (
    !jid.endsWith("@g.us")
  ) {
    await sock.sendMessage(
      jid,
      {
        text: [
          "╭━━━〔 🌑 DARK VORTEX 〕━━━╮",
          "┃",
          "┃ ⚠️ GROUP ONLY",
          "┃",
          "┃ This command can only be",
          "┃ used inside a WhatsApp group.",
          "┃",
          "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
          "",
          FOOTER,
        ].join("\n"),
      },
    );

    return true;
  }

  const targetJid =
    getMentionedJid(
      message,
    );

  if (!targetJid) {
    await sock.sendMessage(
      jid,
      {
        text: [
          "╭━━━〔 🌑 DARK VORTEX 〕━━━╮",
          "┃",
          "┃ ⚠️ USER NOT TAGGED",
          "┃",
          "┣━━━━━━━━━━━━━━━━━━━━━━━━━━",
          "┃ Usage:",
          "┃ /deleteallfrom @user",
          "┃",
          "┃ Disable:",
          "┃ /deleteallfrom off @user",
          "┃",
          "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
          "",
          FOOTER,
        ].join("\n"),
      },
    );

    return true;
  }

  const rules =
    await loadRules();

  const groupJid =
    normalizeJid(jid);

  const existingIndex =
    rules.findIndex(
      rule =>
        normalizeJid(
          rule.groupJid,
        ) === groupJid &&
        normalizeJid(
          rule.targetJid,
        ) === targetJid,
    );

  const mode =
    args[0]
      ?.trim()
      .toLowerCase();

  /*
   * Remove rule.
   */
  if (
    mode === "off" ||
    mode === "remove" ||
    mode === "disable"
  ) {
    if (
      existingIndex === -1
    ) {
      await sock.sendMessage(
        jid,
        {
          text: [
            "╭━━━〔 🌑 DARK VORTEX 〕━━━╮",
            "┃",
            "┃ ⚠️ RULE NOT FOUND",
            "┃",
            "┃ No delete-all-from rule",
            "┃ exists for this user.",
            "┃",
            "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
            "",
            FOOTER,
          ].join("\n"),
        },
      );

      return true;
    }

    rules.splice(
      existingIndex,
      1,
    );

    await saveRules(
      rules,
    );

    await sock.sendMessage(
      jid,
      {
        text: [
          "╭━━━〔 🌑 DARK VORTEX 〕━━━╮",
          "┃",
          "┃ 🛑 DELETE-ALL-FROM DISABLED",
          "┃",
          "┣━━━━━━━━━━━━━━━━━━━━━━━━━━",
          `┃ 🎯 Target: @${targetJid.split("@")[0]}`,
          "┃",
          "┃ New messages from this",
          "┃ participant will no longer",
          "┃ be automatically deleted.",
          "┃",
          "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
          "",
          FOOTER,
        ].join("\n"),
        mentions: [
          targetJid,
        ],
      },
    );

    return true;
  }

  /*
   * Prevent duplicate rule.
   */
  if (
    existingIndex !== -1
  ) {
    await sock.sendMessage(
      jid,
      {
        text: [
          "╭━━━〔 🌑 DARK VORTEX 〕━━━╮",
          "┃",
          "┃ ⚠️ RULE ALREADY ACTIVE",
          "┃",
          "┣━━━━━━━━━━━━━━━━━━━━━━━━━━",
          `┃ 🎯 Target: @${targetJid.split("@")[0]}`,
          "┃",
          "┃ Messages from this user",
          "┃ are already being deleted.",
          "┃",
          "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
          "",
          FOOTER,
        ].join("\n"),
        mentions: [
          targetJid,
        ],
      },
    );

    return true;
  }

  /*
   * Create rule.
   */
  rules.push({
    groupJid,
    targetJid,
    createdAt:
      Date.now(),
  });

  await saveRules(
    rules,
  );

  await sock.sendMessage(
    jid,
    {
      text: [
        "╭━━━〔 🌑 DARK VORTEX 〕━━━╮",
        "┃",
        "┃ 🛡️ DELETE-ALL-FROM ACTIVE",
        "┃",
        "┣━━━━━━━━━━━━━━━━━━━━━━━━━━",
        `┃ 🎯 Target: @${targetJid.split("@")[0]}`,
        "┃",
        "┃ Status: ACTIVE",
        "┃",
        "┃ New messages from this",
        "┃ participant will be automatically",
        "┃ deleted while this rule remains active.",
        "┃",
        "┃ Disable:",
        "┃ /deleteallfrom off @user",
        "┃",
        "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
        "",
        FOOTER,
      ].join("\n"),
      mentions: [
        targetJid,
      ],
    },
  );

  return true;
}

/**
 * Called for every incoming group message.
 *
 * Returns true when the message was deleted.
 */
export async function processDeleteAllFrom(
  sock: WASocket,
  jid: string,
  message: WAMessage,
): Promise<boolean> {
  if (
    !jid.endsWith("@g.us")
  ) {
    return false;
  }

  const sender =
    getMessageSender(
      message,
    );

  if (!sender) {
    return false;
  }

  /*
   * Never delete the bot's own messages.
   */
  const botJid =
    sock.user?.id
      ? normalizeJid(
          sock.user.id,
        )
      : undefined;

  if (
    botJid &&
    sender === botJid
  ) {
    return false;
  }

  const rules =
    await loadRules();

  const groupJid =
    normalizeJid(jid);

  const active =
    rules.some(
      rule =>
        normalizeJid(
          rule.groupJid,
        ) === groupJid &&
        normalizeJid(
          rule.targetJid,
        ) === sender,
    );

  if (!active) {
    return false;
  }

  const key =
    message.key;

  if (
    !key.id
  ) {
    return false;
  }

  try {
    await sock.sendMessage(
      jid,
      {
        delete: {
          remoteJid:
            jid,
          fromMe:
            Boolean(
              key.fromMe,
            ),
          id:
            key.id,
          participant:
            sender,
        },
      },
    );

    return true;
  } catch (error) {
    console.error(
      "[DELETE-ALL-FROM] Failed to delete message:",
      error,
    );

    return false;
  }
}

/**
 * Optional utility for diagnostics.
 */
export async function getDeleteAllFromRules(
): Promise<DeleteAllFromRules> {
  return loadRules();
}

