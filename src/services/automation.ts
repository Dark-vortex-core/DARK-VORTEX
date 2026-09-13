import fs from "node:fs";
import path from "node:path";

import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import {
  automationStatus,
  commandUsage,
  success,
  error,
  system,
  info,
} from "../utils/message.js";

import {
  sendVortexReply,
} from "../utils/vortex-reply.js";

/* ============================================================
   🌑 DARK VORTEX — PREMIUM AUTOMATION SYSTEM

   Features:

   👋 Welcome
   👋 Goodbye
   🤖 Autoreply
   📝 Custom welcome messages
   📝 Custom goodbye messages

   Variables:

   @user
   {user}
   {group}

   ⚡ Powered by Vortex Tech
============================================================ */

/* ============================================================
   STORAGE
============================================================ */

const DATA_DIR = path.join(
  process.cwd(),
  "src",
  "data",
);

const DATA_FILE = path.join(
  DATA_DIR,
  "automation.json",
);

/* ============================================================
   TYPES
============================================================ */

export interface AutomationSettings {
  welcome: boolean;
  goodbye: boolean;
  welcomeMessage: string;
  goodbyeMessage: string;
  autoreply: boolean;
}

type AutomationStore =
  Record<string, AutomationSettings>;

/* ============================================================
   DEFAULT SETTINGS
============================================================ */

const DEFAULT_SETTINGS: AutomationSettings = {
  welcome: false,
  goodbye: false,
  welcomeMessage:
    "👋 Welcome @user to *{group}*!\n\n🌑 Dark Vortex is protecting this group.",
  goodbyeMessage:
    "👋 Goodbye @user!\n\n🌑 Dark Vortex wishes you the best.",
  autoreply: false,
};

/* ============================================================
   STORAGE HELPERS
============================================================ */

function ensureDataFile(): void {
  fs.mkdirSync(DATA_DIR, {
    recursive: true,
  });

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({}, null, 2),
      "utf8",
    );
  }
}

function loadData(): AutomationStore {
  ensureDataFile();

  try {
    return JSON.parse(
      fs.readFileSync(
        DATA_FILE,
        "utf8",
      ),
    ) as AutomationStore;
  } catch {
    return {};
  }
}

function saveData(
  data: AutomationStore,
): void {
  ensureDataFile();

  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(data, null, 2),
    "utf8",
  );
}

export function getAutomationSettings(
  jid: string,
): AutomationSettings {
  const data = loadData();

  return {
    ...DEFAULT_SETTINGS,
    ...(data[jid] || {}),
  };
}

function updateSettings(
  jid: string,
  patch: Partial<AutomationSettings>,
): AutomationSettings {
  const data = loadData();

  const current =
    getAutomationSettings(jid);

  const updated: AutomationSettings = {
    ...current,
    ...patch,
  };

  data[jid] = updated;

  saveData(data);

  return updated;
}

/* ============================================================
   VARIABLE REPLACEMENT
============================================================ */

function replaceVariables(
  message: string,
  user: string,
  group: string,
): string {
  const userMention =
    `@${user.split("@")[0]}`;

  return message
    .replace(/@user/g, userMention)
    .replace(/\{user\}/gi, userMention)
    .replace(/\{group\}/gi, group);
}

/* ============================================================
   WELCOME
============================================================ */

export async function sendWelcome(
  sock: WASocket,
  jid: string,
  participant: string,
  _groupName?: string,
): Promise<void> {
  const settings =
    getAutomationSettings(jid);

  if (!settings.welcome) {
    return;
  }

  let groupName = "this group";

  try {
    const metadata =
      await sock.groupMetadata(jid);

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

/* ============================================================
   GOODBYE
============================================================ */

export async function sendGoodbye(
  sock: WASocket,
  jid: string,
  participant: string,
  _groupName?: string,
): Promise<void> {
  const settings =
    getAutomationSettings(jid);

  if (!settings.goodbye) {
    return;
  }

  let groupName = "this group";

  try {
    const metadata =
      await sock.groupMetadata(jid);

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

/* ============================================================
   AUTOREPLY COMMAND
============================================================ */

async function handleAutoreply(
  sock: WASocket,
  jid: string,
  args: string[],
  quotedMessage?: WAMessage,
): Promise<boolean> {

  /* ==========================================================
     GROUP ONLY
  ========================================================== */

  if (!jid.endsWith("@g.us")) {
    await sendVortexReply(
      sock,
      jid,
      error(
        "GROUP ONLY",
        [
          "🤖 Autoreply settings",
          "can only be managed",
          "inside a WhatsApp group.",
          "",
          "💡 Open a group and",
          "try again.",
        ],
      ),
      quotedMessage,
    );

    return true;
  }

  /* ==========================================================
     GROUP METADATA
  ========================================================== */

  let metadata: any;

  try {
    metadata =
      await sock.groupMetadata(jid);
  } catch (err) {
    console.error(
      "Autoreply metadata error:",
      err,
    );

    await sendVortexReply(
      sock,
      jid,
      error(
        "GROUP DATA ERROR",
        [
          "Unable to read group",
          "information.",
          "",
          "💡 Try again in a moment.",
        ],
      ),
      quotedMessage,
    );

    return true;
  }

  /* ==========================================================
     BOT ADMIN
  ========================================================== */

  const botJid =
    sock.user?.id || "";

  const botLid =
    sock.user?.lid || "";

  const botParticipant =
    metadata.participants.find(
      (participant: any) =>
        participant.id === botJid ||
        participant.id === botLid,
    );

  const botIsAdmin =
    botParticipant?.admin === "admin" ||
    botParticipant?.admin === "superadmin";

  if (!botIsAdmin) {
    await sendVortexReply(
      sock,
      jid,
      error(
        "ADMIN ACCESS REQUIRED",
        [
          "🛡️ Dark Vortex must be",
          "a group administrator",
          "to manage autoreply.",
          "",
          "💡 Promote Dark Vortex",
          "to admin and try again.",
        ],
      ),
      quotedMessage,
    );

    return true;
  }

  const settings =
    getAutomationSettings(jid);

  const value =
    args[0]?.toLowerCase();

  /* ==========================================================
     STATUS
  ========================================================== */

  if (
    !value ||
    value === "status"
  ) {
    await sendVortexReply(
      sock,
      jid,
      system(
        "AUTOMATION CONTROL",
        [
          `👋 Welcome: ${
            settings.welcome
              ? "🟢 ON"
              : "🔴 OFF"
          }`,
          `👋 Goodbye: ${
            settings.goodbye
              ? "🟢 ON"
              : "🔴 OFF"
          }`,
          `🤖 Autoreply: ${
            settings.autoreply
              ? "🟢 ON"
              : "🔴 OFF"
          }`,
          "",
          "🤖 AUTOREPLY",
          `Status: ${
            settings.autoreply
              ? "🟢 ENABLED"
              : "🔴 DISABLED"
          }`,
          "",
          "💡 Use",
          `${
            args.length === 0
              ? "/autoreply on"
              : "/autoreply <on|off>"
          }`,
        ],
      ),
      quotedMessage,
    );

    return true;
  }

  /* ==========================================================
     ON
  ========================================================== */

  if (value === "on") {
    updateSettings(
      jid,
      {
        autoreply: true,
      },
    );

    await sendVortexReply(
      sock,
      jid,
      success(
        "AUTOREPLY ENABLED",
        [
          "🤖 Dark Vortex autoreply",
          "is now active.",
          "",
          "⚡ Custom trigger responses",
          "will be handled by the",
          "trigger system.",
          "",
          "🟢 Status: ACTIVE",
        ],
      ),
      quotedMessage,
    );

    return true;
  }

  /* ==========================================================
     OFF
  ========================================================== */

  if (value === "off") {
    updateSettings(
      jid,
      {
        autoreply: false,
      },
    );

    await sendVortexReply(
      sock,
      jid,
      success(
        "AUTOREPLY DISABLED",
        [
          "🤖 Dark Vortex will no",
          "longer process automatic",
          "replies.",
          "",
          "🔴 Status: INACTIVE",
        ],
      ),
      quotedMessage,
    );

    return true;
  }

  /* ==========================================================
     INVALID
  ========================================================== */

  await sendVortexReply(
    sock,
    jid,
    commandUsage(
      "autoreply",
      "/autoreply on",
      [
        "/autoreply off",
        "/autoreply status",
      ].join("\n"),
    ),
    quotedMessage,
  );

  return true;
}

/* ============================================================
   AUTOMATION COMMAND HANDLER
============================================================ */

export async function handleAutomationCommand(
  sock: WASocket,
  jid: string,
  command: string,
  args: string[],
  quotedMessage?: WAMessage,
): Promise<boolean> {

  /* ==========================================================
     AUTOREPLY
  ========================================================== */

  if (command === "autoreply") {
    return handleAutoreply(
      sock,
      jid,
      args,
      quotedMessage,
    );
  }

  /* ==========================================================
     WELCOME
  ========================================================== */

  if (command === "welcome") {
    const value =
      args[0]?.toLowerCase();

    const settings =
      getAutomationSettings(jid);

    if (
      value !== "on" &&
      value !== "off"
    ) {
      await sendVortexReply(
        sock,
        jid,
        commandUsage(
          "welcome",
          "/welcome on",
          [
            "/welcome off",
            "",
            `Current status: ${
              settings.welcome
                ? "🟢 Enabled"
                : "🔴 Disabled"
            }`,
          ].join("\n"),
        ),
        quotedMessage,
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

    await sendVortexReply(
      sock,
      jid,
      success(
        enabled
          ? "WELCOME ENABLED"
          : "WELCOME DISABLED",
        [
          `👋 Status: ${
            enabled
              ? "🟢 ENABLED"
              : "🔴 DISABLED"
          }`,
          "",
          ...(enabled
            ? [
                "New members will receive",
                "the configured welcome message.",
              ]
            : [
                "Welcome automation is now",
                "disabled.",
              ]),
        ],
      ),
      quotedMessage,
    );

    return true;
  }

  /* ==========================================================
     GOODBYE
  ========================================================== */

  if (command === "goodbye") {
    const value =
      args[0]?.toLowerCase();

    const settings =
      getAutomationSettings(jid);

    if (
      value !== "on" &&
      value !== "off"
    ) {
      await sendVortexReply(
        sock,
        jid,
        commandUsage(
          "goodbye",
          "/goodbye on",
          [
            "/goodbye off",
            "",
            `Current status: ${
              settings.goodbye
                ? "🟢 Enabled"
                : "🔴 Disabled"
            }`,
          ].join("\n"),
        ),
        quotedMessage,
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

    await sendVortexReply(
      sock,
      jid,
      success(
        enabled
          ? "GOODBYE ENABLED"
          : "GOODBYE DISABLED",
        [
          `👋 Status: ${
            enabled
              ? "🟢 ENABLED"
              : "🔴 DISABLED"
          }`,
          "",
          ...(enabled
            ? [
                "Members leaving the group",
                "will receive the goodbye message.",
              ]
            : [
                "Goodbye automation is now",
                "disabled.",
              ]),
        ],
      ),
      quotedMessage,
    );

    return true;
  }

  /* ==========================================================
     SET WELCOME
  ========================================================== */

  if (command === "setwelcome") {
    const message =
      args.join(" ").trim();

    if (!message) {
      await sendVortexReply(
        sock,
        jid,
        commandUsage(
          "setwelcome",
          "/setwelcome Welcome @user to {group}!",
          [
            "",
            "VARIABLES",
            "👤 @user",
            "👤 {user}",
            "👥 {group}",
            "",
            "💡 Example",
            "/setwelcome 👋 Welcome @user to {group}!",
          ].join("\n"),
        ),
        quotedMessage,
      );

      return true;
    }

    updateSettings(
      jid,
      {
        welcomeMessage: message,
      },
    );

    await sendVortexReply(
      sock,
      jid,
      success(
        "WELCOME MESSAGE SAVED",
        [
          "👋 Your custom welcome",
          "message has been saved.",
          "",
          "AVAILABLE VARIABLES",
          "👤 @user / {user}",
          "👥 {group}",
          "",
          "🟢 Configuration updated.",
          "",
          "💡 Enable it with",
          "/welcome on",
        ],
      ),
      quotedMessage,
    );

    return true;
  }

  /* ==========================================================
     SET GOODBYE
  ========================================================== */

  if (command === "setgoodbye") {
    const message =
      args.join(" ").trim();

    if (!message) {
      await sendVortexReply(
        sock,
        jid,
        commandUsage(
          "setgoodbye",
          "/setgoodbye Goodbye @user!",
          [
            "",
            "VARIABLES",
            "👤 @user",
            "👤 {user}",
            "👥 {group}",
            "",
            "💡 Example",
            "/setgoodbye 👋 Goodbye @user!",
          ].join("\n"),
        ),
        quotedMessage,
      );

      return true;
    }

    updateSettings(
      jid,
      {
        goodbyeMessage: message,
      },
    );

    await sendVortexReply(
      sock,
      jid,
      success(
        "GOODBYE MESSAGE SAVED",
        [
          "👋 Your custom goodbye",
          "message has been saved.",
          "",
          "AVAILABLE VARIABLES",
          "👤 @user / {user}",
          "👥 {group}",
          "",
          "🟢 Configuration updated.",
          "",
          "💡 Enable it with",
          "/goodbye on",
        ],
      ),
      quotedMessage,
    );

    return true;
  }

  /* ==========================================================
     AUTOMATION STATUS
  ========================================================== */

  if (command === "automation") {
    const settings =
      getAutomationSettings(jid);

    await sendVortexReply(
      sock,
      jid,
      automationStatus(
        settings.welcome,
        settings.goodbye,
        settings.autoreply,
      ) +
        "\n\n" +
        info(
          "CONFIGURATION",
          [
            "📝 WELCOME MESSAGE",
            settings.welcomeMessage,
            "",
            "📝 GOODBYE MESSAGE",
            settings.goodbyeMessage,
            "",
            "⚙️ Use the commands below",
            "to modify automation.",
            "",
            "👋 /welcome on|off",
            "👋 /goodbye on|off",
            "🤖 /autoreply on|off",
            "📝 /setwelcome <message>",
            "📝 /setgoodbye <message>",
          ],
        ),
      quotedMessage,
    );

    return true;
  }

  return false;
}