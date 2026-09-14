import fs from "node:fs";
import path from "node:path";

import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import {
  getAutomationSettings,
} from "./automation.js";

import {
  sendVortexReply,
} from "../utils/vortex-reply.js";

import {
  isBotGroupAdmin,
} from "../utils/group-admin.js";

// =========================================================
// 🌑 DARK VORTEX — TRIGGER SYSTEM
// =========================================================

const DATA_DIR = path.join(
  process.cwd(),
  "src",
  "data",
);

const DATA_FILE = path.join(
  DATA_DIR,
  "triggers.json",
);

interface Trigger {
  response: string;
}

type TriggerGroup =
  Record<string, Trigger>;

type TriggerStore =
  Record<string, TriggerGroup>;

// =========================================================
// STORAGE
// =========================================================

function ensureDataFile(): void {
  fs.mkdirSync(
    DATA_DIR,
    {
      recursive: true,
    },
  );

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        {},
        null,
        2,
      ),
      "utf8",
    );
  }
}

function loadTriggers(): TriggerStore {
  ensureDataFile();

  try {
    const raw =
      fs.readFileSync(
        DATA_FILE,
        "utf8",
      );

    if (!raw.trim()) {
      return {};
    }

    const parsed =
      JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    return parsed as TriggerStore;
  } catch (err) {
    console.error(
      "Dark Vortex trigger load error:",
      err,
    );

    return {};
  }
}

function saveTriggers(
  data: TriggerStore,
): void {
  ensureDataFile();

  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(
      data,
      null,
      2,
    ),
    "utf8",
  );
}

// =========================================================
// NORMALIZATION
// =========================================================

function normalizeTrigger(
  value: string,
): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// =========================================================
// MESSAGE EXTRACTION
// =========================================================

function extractMessageText(
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

// =========================================================
// COMMAND DETECTION
// =========================================================

function looksLikeCommand(
  text: string,
): boolean {
  const value =
    text.trim();

  if (!value) {
    return false;
  }

  return /^[/!#.\u200b]/.test(
    value,
  );
}

// =========================================================
// TRIGGER MATCHING
// =========================================================

function triggerMatches(
  messageText: string,
  trigger: string,
): boolean {
  const message =
    normalizeTrigger(
      messageText,
    );

  const target =
    normalizeTrigger(
      trigger,
    );

  if (
    !message ||
    !target
  ) {
    return false;
  }

  // Exact match.
  if (message === target) {
    return true;
  }

  // Very short triggers should not match
  // inside unrelated words.
  if (target.length < 3) {
    return false;
  }

  // Word-boundary style matching.
  const escaped =
    target.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );

  const pattern =
    new RegExp(
      `(^|[^\\p{L}\\p{N}_])${escaped}([^\\p{L}\\p{N}_]|$)`,
      "iu",
    );

  return pattern.test(
    message,
  );
}

// =========================================================
// COMMAND HANDLER
// =========================================================

export async function handleTriggerCommand(
  sock: WASocket,
  jid: string,
  command: string,
  args: string[],
  quotedMessage?: WAMessage,
): Promise<boolean> {
  if (command !== "trigger") {
    return false;
  }

  const reply = async (
    text: string,
  ): Promise<WAMessage | undefined> => {
    return await sendVortexReply(
      sock,
      jid,
      text,
      quotedMessage,
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
        "Triggers can only be configured inside a group.",
      ].join("\n"),
    );

    return true;
  }

  // ---------------------------------------------------------
  // BOT ADMIN CHECK
  // ---------------------------------------------------------

  let metadata:
    Awaited<
      ReturnType<WASocket["groupMetadata"]>
    >;

  try {
    metadata =
      await sock.groupMetadata(
        jid,
      );
  } catch (err) {
    console.error(
      "Trigger metadata error:",
      err,
    );

    await reply(
      [
        "❌ Group data unavailable.",
        "",
        "Unable to read group information.",
        "Try again in a moment.",
      ].join("\n"),
    );

    return true;
  }

  const botIsAdmin =
    await isBotGroupAdmin(
      sock,
      jid,
    );

  if (!botIsAdmin) {
    await reply(
      [
        "🛡️ Bot admin required.",
        "",
        "Dark Vortex must be a group administrator",
        "to manage triggers.",
      ].join("\n"),
    );

    return true;
  }

  // ---------------------------------------------------------
  // ACTION
  // ---------------------------------------------------------

  const action =
    args[0]
      ?.trim()
      .toLowerCase();

  const store =
    loadTriggers();

  if (!store[jid]) {
    store[jid] = {};
  }

  const groupTriggers =
    store[jid];

  // ---------------------------------------------------------
  // HELP
  // ---------------------------------------------------------

  if (!action) {
    await reply(
      [
        "⚡ Trigger",
        "",
        "Commands:",
        "/trigger add <trigger> <response>",
        "/trigger list",
        "/trigger remove <trigger>",
        "/trigger clear",
        "",
        "Enable automatic responses with:",
        "/autoreply on",
      ].join("\n"),
    );

    return true;
  }

  // ---------------------------------------------------------
  // ADD
  // ---------------------------------------------------------

  if (action === "add") {
    if (args.length < 3) {
      await reply(
        [
          "❌ Invalid trigger command.",
          "",
          "Usage:",
          "/trigger add <trigger> <response>",
          "",
          "Example:",
          "/trigger add hello Hello 👋",
        ].join("\n"),
      );

      return true;
    }

    const trigger =
      normalizeTrigger(
        args[1],
      );

    const response =
      args
        .slice(2)
        .join(" ")
        .trim();

    if (!trigger) {
      await reply(
        [
          "❌ Invalid trigger.",
          "",
          "The trigger cannot be empty.",
        ].join("\n"),
      );

      return true;
    }

    if (!response) {
      await reply(
        [
          "❌ Invalid response.",
          "",
          "The response cannot be empty.",
        ].join("\n"),
      );

      return true;
    }

    if (trigger.length > 100) {
      await reply(
        [
          "❌ Trigger too long.",
          "",
          "Keep triggers below 100 characters.",
        ].join("\n"),
      );

      return true;
    }

    groupTriggers[trigger] = {
      response,
    };

    saveTriggers(store);

    await reply(
      [
        "✅ Trigger saved.",
        "",
        `Trigger: ${trigger}`,
        `Response: ${response}`,
        "",
        "Enable automatic replies with /autoreply on.",
      ].join("\n"),
    );

    return true;
  }

  // ---------------------------------------------------------
  // LIST
  // ---------------------------------------------------------

  if (action === "list") {
    const triggers =
      Object.keys(
        groupTriggers,
      );

    if (triggers.length === 0) {
      await reply(
        [
          "⚡ Trigger list",
          "",
          "No triggers configured.",
          "",
          "Example:",
          "/trigger add hello Hello 👋",
        ].join("\n"),
      );

      return true;
    }

    const lines =
      triggers.map(
        (
          trigger,
          index,
        ) =>
          `${index + 1}. ${trigger}`,
      );

    await reply(
      [
        "⚡ Trigger list",
        "",
        ...lines,
        "",
        `Total: ${triggers.length}`,
      ].join("\n"),
    );

    return true;
  }

  // ---------------------------------------------------------
  // REMOVE
  // ---------------------------------------------------------

  if (action === "remove") {
    const trigger =
      normalizeTrigger(
        args
          .slice(1)
          .join(" "),
      );

    if (!trigger) {
      await reply(
        [
          "❌ Missing trigger.",
          "",
          "Usage:",
          "/trigger remove hello",
        ].join("\n"),
      );

      return true;
    }

    if (!groupTriggers[trigger]) {
      await reply(
        [
          "❌ Trigger not found.",
          "",
          `No trigger named "${trigger}" exists.`,
        ].join("\n"),
      );

      return true;
    }

    delete groupTriggers[
      trigger
    ];

    saveTriggers(store);

    await reply(
      [
        "🗑️ Trigger removed.",
        "",
        `Trigger: ${trigger}`,
      ].join("\n"),
    );

    return true;
  }

  // ---------------------------------------------------------
  // CLEAR
  // ---------------------------------------------------------

  if (action === "clear") {
    const count =
      Object.keys(
        groupTriggers,
      ).length;

    store[jid] = {};

    saveTriggers(store);

    await reply(
      [
        "🗑️ Triggers cleared.",
        "",
        `Removed: ${count}`,
      ].join("\n"),
    );

    return true;
  }

  // ---------------------------------------------------------
  // UNKNOWN ACTION
  // ---------------------------------------------------------

  await reply(
    [
      "❌ Unknown trigger action.",
      "",
      "/trigger add <trigger> <response>",
      "/trigger list",
      "/trigger remove <trigger>",
      "/trigger clear",
    ].join("\n"),
  );

  return true;
}

// =========================================================
// 🤖 PROCESS AUTOMATIC TRIGGERS
// =========================================================

export async function processTrigger(
  sock: WASocket,
  jid: string,
  message: WAMessage,
): Promise<boolean> {
  // ---------------------------------------------------------
  // GROUP ONLY
  // ---------------------------------------------------------

  if (!jid.endsWith("@g.us")) {
    return false;
  }

  // ---------------------------------------------------------
  // NEVER REPLY TO OUR OWN MESSAGE
  // ---------------------------------------------------------

  if (message.key.fromMe) {
    return false;
  }

  // ---------------------------------------------------------
  // AUTOMATION MASTER SWITCH
  // ---------------------------------------------------------

  const settings =
    getAutomationSettings(
      jid,
    );

  if (!settings.autoreply) {
    return false;
  }

  // ---------------------------------------------------------
  // EXTRACT TEXT
  // ---------------------------------------------------------

  const text =
    extractMessageText(
      message,
    );

  if (!text.trim()) {
    return false;
  }

  // Do not let triggers intercept bot commands.
  if (looksLikeCommand(text)) {
    return false;
  }

  // ---------------------------------------------------------
  // LOAD GROUP TRIGGERS
  // ---------------------------------------------------------

  const store =
    loadTriggers();

  const groupTriggers =
    store[jid];

  if (!groupTriggers) {
    return false;
  }

  const triggerNames =
    Object.keys(
      groupTriggers,
    );

  if (triggerNames.length === 0) {
    return false;
  }

  // ---------------------------------------------------------
  // FIND BEST MATCH
  // ---------------------------------------------------------

  const matchedTrigger =
    triggerNames
      .sort(
        (a, b) =>
          b.length - a.length,
      )
      .find(
        (trigger) =>
          triggerMatches(
            text,
            trigger,
          ),
      );

  if (!matchedTrigger) {
    return false;
  }

  const trigger =
    groupTriggers[
      matchedTrigger
    ];

  if (
    !trigger ||
    !trigger.response?.trim()
  ) {
    return false;
  }

  // ---------------------------------------------------------
  // SEND RESPONSE
  // ---------------------------------------------------------

  try {
    await sendVortexReply(
      sock,
      jid,
      trigger.response,
      message,
    );

    return true;
  } catch (err) {
    console.error(
      "Dark Vortex trigger response error:",
      err,
    );

    return false;
  }
}