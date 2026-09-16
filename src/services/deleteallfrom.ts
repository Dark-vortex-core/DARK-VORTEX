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

import {
  sendVortexReply,
} from "../utils/vortex-reply.js";

import {
  resolveIdentity,
} from "../utils/identity.js";

// =========================================================
// 🌑 DARK VORTEX — DELETE ALL FROM
// ⚡ Powered by Vortex Tech
//
// Group tool:
//   /deleteallfrom @user
//   /deleteallfrom off @user
//
// Uses WhatsApp mention metadata to identify the target.
//
// Storage:
//   src/data/deleteallfrom/rules.json
//
// This service is independent from the existing
// moderation/protection services.
// =========================================================

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

// =========================================================
// STORAGE
// =========================================================

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
      (
        item,
      ): item is DeleteAllFromRule =>
        Boolean(
          item &&
          typeof item === "object" &&
          typeof (
            item as DeleteAllFromRule
          ).groupJid === "string" &&
          typeof (
            item as DeleteAllFromRule
          ).targetJid === "string" &&
          typeof (
            item as DeleteAllFromRule
          ).createdAt === "number",
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

// =========================================================
// MESSAGE HELPERS
// =========================================================

function getMentionedJid(
  message: WAMessage,
): string | undefined {
  const context =
    message.message
      ?.extendedTextMessage
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
      (
        value,
      ) =>
        typeof value === "string" &&
        value.trim().length > 0,
    );

  return jid
    ? normalizeJid(jid)
    : undefined;
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

/* =========================================================
   GLOBAL IDENTITY DISPLAY
========================================================= */

async function resolveTargetMention(
  sock: WASocket,
  targetJid: string,
  groupJid: string,
): Promise<string> {
  const identity =
    await resolveIdentity(
      sock,
      targetJid,
      groupJid,
    );

  if (
    identity.name ===
    "Unknown User"
  ) {
    return "@Unknown User";
  }

  return `@${identity.name}`;
}

// =========================================================
// COMMAND HANDLER
// =========================================================

export async function handleDeleteAllFromCommand(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  command: string,
  args: string[],
): Promise<boolean> {
  const normalizedCommand =
    command
      .trim()
      .toLowerCase();

  if (
    normalizedCommand !==
      "deleteallfrom" &&
    normalizedCommand !==
      "deleteallfromuser"
  ) {
    return false;
  }

  const reply = async (
    text: string,
    options?: {
      mentions?: string[];
    },
  ): Promise<WAMessage | undefined> => {
    const mentions =
      options?.mentions ?? [];

    if (
      mentions.length > 0
    ) {
      return await sock.sendMessage(
        jid,
        {
          text,
          mentions,
        },
        {
          quoted: message,
        },
      );
    }

    return await sendVortexReply(
      sock,
      jid,
      text,
      message,
    );
  };

  // ---------------------------------------------------------
  // GROUP ONLY
  // ---------------------------------------------------------

  if (!jid.endsWith("@g.us")) {
    await reply(
      [
        "⚠️ Group only.",
        "",
        "This command can only be used inside a group.",
      ].join("\n"),
    );

    return true;
  }

  // ---------------------------------------------------------
  // TARGET
  // ---------------------------------------------------------

  const targetJid =
    getMentionedJid(
      message,
    );

  if (!targetJid) {
    await reply(
      [
        "⚠️ User not tagged.",
        "",
        "Usage:",
        "/deleteallfrom @user",
        "",
        "Disable:",
        "/deleteallfrom off @user",
      ].join("\n"),
    );

    return true;
  }

  const rules =
    await loadRules();

  const groupJid =
    normalizeJid(jid);

  const existingIndex =
    rules.findIndex(
      (rule) =>
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

  const mention =
    await resolveTargetMention(
      sock,
      targetJid,
      groupJid,
    );

  // ---------------------------------------------------------
  // REMOVE RULE
  // ---------------------------------------------------------

  if (
    mode === "off" ||
    mode === "remove" ||
    mode === "disable"
  ) {
    if (
      existingIndex === -1
    ) {
      await reply(
        [
          "⚠️ Rule not found.",
          "",
          "No delete-all-from rule exists for this user.",
        ].join("\n"),
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

    await reply(
      [
        "🛑 Delete-all-from disabled.",
        "",
        `Target: ${mention}`,
        "Status: INACTIVE",
      ].join("\n"),
      {
        mentions: [
          targetJid,
        ],
      },
    );

    return true;
  }

  // ---------------------------------------------------------
  // DUPLICATE RULE
  // ---------------------------------------------------------

  if (
    existingIndex !== -1
  ) {
    await reply(
      [
        "⚠️ Rule already active.",
        "",
        `Target: ${mention}`,
        "Messages from this user are already being deleted.",
      ].join("\n"),
      {
        mentions: [
          targetJid,
        ],
      },
    );

    return true;
  }

  // ---------------------------------------------------------
  // CREATE RULE
  // ---------------------------------------------------------

  rules.push({
    groupJid,
    targetJid,
    createdAt:
      Date.now(),
  });

  await saveRules(
    rules,
  );

  await reply(
    [
      "🛡️ Delete-all-from enabled.",
      "",
      `Target: ${mention}`,
      "Status: ACTIVE",
      "",
      "New messages from this user will be automatically deleted.",
      "",
      "Disable:",
      "/deleteallfrom off @user",
    ].join("\n"),
    {
      mentions: [
        targetJid,
      ],
    },
  );

  return true;
}

// =========================================================
// 🤖 PROCESS AUTOMATIC DELETIONS
// =========================================================

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

  // ---------------------------------------------------------
  // NEVER DELETE THE BOT'S OWN MESSAGES
  // ---------------------------------------------------------

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

  // ---------------------------------------------------------
  // CHECK ACTIVE RULE
  // ---------------------------------------------------------

  const rules =
    await loadRules();

  const groupJid =
    normalizeJid(jid);

  const active =
    rules.some(
      (rule) =>
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

  if (!key.id) {
    return false;
  }

  // ---------------------------------------------------------
  // DELETE MESSAGE
  // ---------------------------------------------------------

  try {
    await sock.sendMessage(
      jid,
      {
        delete: {
          remoteJid: jid,
          fromMe:
            Boolean(
              key.fromMe,
            ),
          id: key.id,
          participant: sender,
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

// =========================================================
// DIAGNOSTICS
// =========================================================

export async function getDeleteAllFromRules():
  Promise<DeleteAllFromRules> {
  return loadRules();
}

