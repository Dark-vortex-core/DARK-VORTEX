import fs from "node:fs";
import path from "node:path";

import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import {
  sendVortexReply,
} from "../utils/vortex-reply.js";

// ============================================================
// 🌑 DARK VORTEX — AUTOMATION SYSTEM
//
// Features:
// • Welcome
// • Goodbye
// • Autoreply
// • Custom welcome messages
// • Custom goodbye messages
//
// Variables:
// • @user
// • {user}
// • {group}
// ============================================================

// ============================================================
// STORAGE
// ============================================================

const DATA_DIR = path.join(
  process.cwd(),
  "src",
  "data",
);

const DATA_FILE = path.join(
  DATA_DIR,
  "automation.json",
);

// ============================================================
// TYPES
// ============================================================

export interface AutomationSettings {
  welcome: boolean;
  goodbye: boolean;
  welcomeMessage: string;
  goodbyeMessage: string;
  autoreply: boolean;
}

type AutomationStore =
  Record<string, AutomationSettings>;

// ============================================================
// DEFAULT SETTINGS
// ============================================================

const DEFAULT_SETTINGS: AutomationSettings = {
  welcome: false,
  goodbye: false,

  welcomeMessage:
    "👋 Welcome @user to *{group}*!\n\n🌑 Dark Vortex is protecting this group.",

  goodbyeMessage:
    "👋 Goodbye @user!\n\n🌑 Dark Vortex wishes you the best.",

  autoreply: false,
};

// ============================================================
// STORAGE HELPERS
// ============================================================

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

function loadData(): AutomationStore {
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

    return parsed as AutomationStore;
  } catch (err) {
    console.error(
      "Dark Vortex automation load error:",
      err,
    );

    return {};
  }
}

function saveData(
  data: AutomationStore,
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

export function getAutomationSettings(
  jid: string,
): AutomationSettings {
  const data =
    loadData();

  return {
    ...DEFAULT_SETTINGS,
    ...(data[jid] || {}),
  };
}

function updateSettings(
  jid: string,
  patch: Partial<AutomationSettings>,
): AutomationSettings {
  const data =
    loadData();

  const current =
    getAutomationSettings(
      jid,
    );

  const updated: AutomationSettings = {
    ...current,
    ...patch,
  };

  data[jid] = updated;

  saveData(data);

  return updated;
}

// ============================================================
// VARIABLE REPLACEMENT
// ============================================================

function replaceVariables(
  message: string,
  user: string,
  group: string,
): string {
  const userMention =
    `@${user.split("@")[0]}`;

  return message
    .replace(
      /@user/g,
      userMention,
    )
    .replace(
      /\{user\}/gi,
      userMention,
    )
    .replace(
      /\{group\}/gi,
      group,
    );
}

// ============================================================
// WELCOME
// ============================================================

export async function sendWelcome(
  sock: WASocket,
  jid: string,
  participant: string,
  _groupName?: string,
): Promise<void> {
  const settings =
    getAutomationSettings(
      jid,
    );

  if (!settings.welcome) {
    return;
  }

  let groupName =
    "this group";

  try {
    const metadata =
      await sock.groupMetadata(
        jid,
      );

    groupName =
      metadata.subject ||
      "this group";
  } catch {
    // Keep default group name.
  }

  const text =
    replaceVariables(
      settings.welcomeMessage,
      participant,
      groupName,
    );

  await sock.sendMessage(
    jid,
    {
      text,
      mentions: [
        participant,
      ],
    },
  );
}

// ============================================================
// GOODBYE
// ============================================================

export async function sendGoodbye(
  sock: WASocket,
  jid: string,
  participant: string,
  _groupName?: string,
): Promise<void> {
  const settings =
    getAutomationSettings(
      jid,
    );

  if (!settings.goodbye) {
    return;
  }

  let groupName =
    "this group";

  try {
    const metadata =
      await sock.groupMetadata(
        jid,
      );

    groupName =
      metadata.subject ||
      "this group";
  } catch {
    // Keep default group name.
  }

  const text =
    replaceVariables(
      settings.goodbyeMessage,
      participant,
      groupName,
    );

  await sock.sendMessage(
    jid,
    {
      text,
      mentions: [
        participant,
      ],
    },
  );
}

// ============================================================
// AUTOREPLY COMMAND
// ============================================================

async function handleAutoreply(
  sock: WASocket,
  jid: string,
  args: string[],
  quotedMessage?: WAMessage,
): Promise<boolean> {
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

  // ----------------------------------------------------------
  // GROUP ONLY
  // ----------------------------------------------------------

  if (!jid.endsWith("@g.us")) {
    await reply(
      [
        "⚠️ Group only.",
        "",
        "Autoreply can only be managed inside a group.",
      ].join("\n"),
    );

    return true;
  }

  // ----------------------------------------------------------
  // GROUP METADATA
  // ----------------------------------------------------------

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
      "Autoreply metadata error:",
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

  // ----------------------------------------------------------
  // BOT ADMIN
  // ----------------------------------------------------------

  const botJid =
    sock.user?.id || "";

  const botLid =
    sock.user?.lid || "";

  const botParticipant =
    metadata.participants.find(
      (participant) =>
        participant.id === botJid ||
        participant.id === botLid,
    );

  const botIsAdmin =
    botParticipant?.admin === "admin" ||
    botParticipant?.admin === "superadmin";

  if (!botIsAdmin) {
    await reply(
      [
        "🛡️ Bot admin required.",
        "",
        "Dark Vortex must be a group administrator",
        "to manage autoreply.",
      ].join("\n"),
    );

    return true;
  }

  const settings =
    getAutomationSettings(
      jid,
    );

  const value =
    args[0]
      ?.trim()
      .toLowerCase();

  // ----------------------------------------------------------
  // STATUS
  // ----------------------------------------------------------

  if (
    !value ||
    value === "status"
  ) {
    await reply(
      [
        "🤖 Autoreply",
        "",
        `Status: ${
          settings.autoreply
            ? "🟢 Enabled"
            : "🔴 Disabled"
        }`,
        "",
        "Usage:",
        "/autoreply on",
        "/autoreply off",
      ].join("\n"),
    );

    return true;
  }

  // ----------------------------------------------------------
  // ON
  // ----------------------------------------------------------

  if (value === "on") {
    updateSettings(
      jid,
      {
        autoreply: true,
      },
    );

    await reply(
      [
        "🤖 Autoreply enabled.",
        "",
        "Trigger responses are now active.",
      ].join("\n"),
    );

    return true;
  }

  // ----------------------------------------------------------
  // OFF
  // ----------------------------------------------------------

  if (value === "off") {
    updateSettings(
      jid,
      {
        autoreply: false,
      },
    );

    await reply(
      [
        "🤖 Autoreply disabled.",
        "",
        "Automatic replies are now inactive.",
      ].join("\n"),
    );

    return true;
  }

  // ----------------------------------------------------------
  // INVALID
  // ----------------------------------------------------------

  await reply(
    [
      "❌ Invalid option.",
      "",
      "Use:",
      "/autoreply on",
      "/autoreply off",
      "/autoreply status",
    ].join("\n"),
  );

  return true;
}

// ============================================================
// AUTOMATION COMMAND HANDLER
// ============================================================

export async function handleAutomationCommand(
  sock: WASocket,
  jid: string,
  command: string,
  args: string[],
  quotedMessage?: WAMessage,
): Promise<boolean> {
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

  // ----------------------------------------------------------
  // AUTOREPLY
  // ----------------------------------------------------------

  if (command === "autoreply") {
    return handleAutoreply(
      sock,
      jid,
      args,
      quotedMessage,
    );
  }

  // ----------------------------------------------------------
  // WELCOME
  // ----------------------------------------------------------

  if (command === "welcome") {
    const value =
      args[0]
        ?.trim()
        .toLowerCase();

    const settings =
      getAutomationSettings(
        jid,
      );

    if (
      value !== "on" &&
      value !== "off"
    ) {
      await reply(
        [
          "👋 Welcome automation",
          "",
          `Status: ${
            settings.welcome
              ? "🟢 Enabled"
              : "🔴 Disabled"
          }`,
          "",
          "Usage:",
          "/welcome on",
          "/welcome off",
        ].join("\n"),
      );

      return true;
    }

    const enabled =
      value === "on";

    updateSettings(
      jid,
      {
        welcome: enabled,
      },
    );

    await reply(
      [
        enabled
          ? "👋 Welcome enabled."
          : "👋 Welcome disabled.",
        "",
        enabled
          ? "New members will receive the configured welcome message."
          : "Welcome automation is now inactive.",
      ].join("\n"),
    );

    return true;
  }

  // ----------------------------------------------------------
  // GOODBYE
  // ----------------------------------------------------------

  if (command === "goodbye") {
    const value =
      args[0]
        ?.trim()
        .toLowerCase();

    const settings =
      getAutomationSettings(
        jid,
      );

    if (
      value !== "on" &&
      value !== "off"
    ) {
      await reply(
        [
          "👋 Goodbye automation",
          "",
          `Status: ${
            settings.goodbye
              ? "🟢 Enabled"
              : "🔴 Disabled"
          }`,
          "",
          "Usage:",
          "/goodbye on",
          "/goodbye off",
        ].join("\n"),
      );

      return true;
    }

    const enabled =
      value === "on";

    updateSettings(
      jid,
      {
        goodbye: enabled,
      },
    );

    await reply(
      [
        enabled
          ? "👋 Goodbye enabled."
          : "👋 Goodbye disabled.",
        "",
        enabled
          ? "Members leaving the group will receive the configured goodbye message."
          : "Goodbye automation is now inactive.",
      ].join("\n"),
    );

    return true;
  }

  // ----------------------------------------------------------
  // SET WELCOME
  // ----------------------------------------------------------

  if (command === "setwelcome") {
    const message =
      args.join(" ").trim();

    if (!message) {
      await reply(
        [
          "📝 Set welcome message",
          "",
          "Usage:",
          "/setwelcome Welcome @user to {group}!",
          "",
          "Variables:",
          "@user / {user}",
          "{group}",
        ].join("\n"),
      );

      return true;
    }

    updateSettings(
      jid,
      {
        welcomeMessage:
          message,
      },
    );

    await reply(
      [
        "✅ Welcome message saved.",
        "",
        "Variables:",
        "@user / {user}",
        "{group}",
        "",
        "Enable with /welcome on",
      ].join("\n"),
    );

    return true;
  }

  // ----------------------------------------------------------
  // SET GOODBYE
  // ----------------------------------------------------------

  if (command === "setgoodbye") {
    const message =
      args.join(" ").trim();

    if (!message) {
      await reply(
        [
          "📝 Set goodbye message",
          "",
          "Usage:",
          "/setgoodbye Goodbye @user!",
          "",
          "Variables:",
          "@user / {user}",
          "{group}",
        ].join("\n"),
      );

      return true;
    }

    updateSettings(
      jid,
      {
        goodbyeMessage:
          message,
      },
    );

    await reply(
      [
        "✅ Goodbye message saved.",
        "",
        "Variables:",
        "@user / {user}",
        "{group}",
        "",
        "Enable with /goodbye on",
      ].join("\n"),
    );

    return true;
  }

  // ----------------------------------------------------------
  // AUTOMATION STATUS
  // ----------------------------------------------------------

  if (command === "automation") {
    const settings =
      getAutomationSettings(
        jid,
      );

    await reply(
      [
        "⚙️ Automation",
        "",
        `Welcome: ${
          settings.welcome
            ? "🟢 ON"
            : "🔴 OFF"
        }`,

        `Goodbye: ${
          settings.goodbye
            ? "🟢 ON"
            : "🔴 OFF"
        }`,

        `Autoreply: ${
          settings.autoreply
            ? "🟢 ON"
            : "🔴 OFF"
        }`,

        "",
        "Commands:",
        "/welcome on|off",
        "/goodbye on|off",
        "/autoreply on|off",
        "/setwelcome <message>",
        "/setgoodbye <message>",
      ].join("\n"),
    );

    return true;
  }

  return false;
}