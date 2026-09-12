import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import {
  handleVcfCommand,
} from "./vcf.js";

import {
  handleSecurityPanelCommand,
} from "../services/vortex-security-panel.js";

import {
  handleGetJidCommand,
} from "./getjid.js";

import {
  measureLatency,
  getLatencyIcon,
  getLatencyDescription,
} from "../services/latency.js";

import {
  handleReportCommand,
} from "./report.js";

import {
  handleSlowmodeCommand,
} from "../services/slowmode.js";

import {
  analyzeIncomingMessage,
  shouldAlert,
  formatBotDetectionAlert,
} from "../services/bot-detector.js";

import {
  sendTextStatus,
  sendImageStatus,
} from "../services/status.js";

import {
  getCommands,
  getCommandsByCategory,
  getCategory,
  getCommand,
  getCommandAccess,
  requiresConfirmation,
} from "./registry.js";

import type {
  CommandAccess,
} from "./registry.js";

import {
  isGroupEnabled,
} from "../services/groupRegistry.js";

import { config } from "../config.js";
import { isOwner } from "../auth/owner.js";

import {
  error,
  info,
  pingResponse,
  unknownCommand,
  internalError,
  formatUptime,
  success,
} from "../utils/message.js";

import {
  getPrefix,
  setPrefix,
} from "../services/prefix.js";

import {
  handleAutomationCommand,
} from "../services/automation.js";

import {
  handleTriggerCommand,
} from "../services/triggers.js";

import {
  handleAnnouncementCommand,
} from "../services/announce.js";

import {
  handleMemoryCleanupCommand,
  formatCleanupProgress,
} from "../services/memory-cleaner.js";

import type {
  CleanupProgress,
} from "../services/memory-cleaner.js";

import {
  handleDeleteAllFromCommand,
} from "../services/deleteallfrom.js";

import {
  setAwayMessage,
  setGroupAwayMessage,
  isOwnerAway,
  getAwayDuration,
} from "../services/away.js";

import {
  handleGroupCommand,
} from "./group.js";

import {
  handleModerationCommand,
} from "./moderation.js";

import {
  handleProtectionCommand,
} from "./protection.js";

import {
  handleRulesCommand,
} from "./rules.js";

import {
  handleUtilityCommand,
} from "./utility.js";

import {
  handleOwnerCommand,
} from "./owner.js";

import {
  handleVxCommand,
} from "./vx.js";

import {
  handleVortexSecurityCommand,
  isVortexSecurityCommand,
} from "../services/vortex-security-handler.js";

import {
  consumeConfirmedSecurityExecution,
  createSecurityConfirmation,
  sendSecurityConfirmationPrompt,
  handleVortexConfirmation,
  handleVortexToolsCommand,
} from "./vortex-tools.js";

import {
  handleRestCommand,
} from "../services/rest-mode.js";


/* =========================================================
   🌑 DARK VORTEX — COMMAND HANDLER

   ⚡ Powered by Vortex Tech

   Central responsibilities:
   • Command parsing
   • Registry resolution
   • Permission enforcement
   • Response-mode enforcement
   • Group/admin enforcement
   • Owner/VX separation
   • Security confirmation
   • Group enable/disable gate
   • Modular command routing
   • Internal bot detection

   Security principle:
   The registry + dispatcher are authoritative.
   A command cannot become privileged merely because
   a user knows its name.
========================================================= */


/* =========================================================
   PATHS
========================================================= */

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

const MENU_IMAGE_PATH =
  path.resolve(
    __dirname,
    "../../assets/menu.jpg",
  );

const PACKAGE_JSON_PATH =
  path.resolve(
    __dirname,
    "../../package.json",
  );


/* =========================================================
   MESSAGE TEXT
========================================================= */

function getMessageText(
  message: WAMessage,
): string {
  const content =
    message.message;

  if (!content) {
    return "";
  }

  if (content.conversation) {
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
   VERSION
========================================================= */

async function getBotVersion(): Promise<string> {
  try {
    const raw =
      await readFile(
        PACKAGE_JSON_PATH,
        "utf8",
      );

    const packageData =
      JSON.parse(raw) as {
        version?: unknown;
      };

    if (
      typeof packageData.version === "string" &&
      packageData.version.trim()
    ) {
      return packageData.version.trim();
    }
  } catch (err) {
    console.error(
      "Package version error:",
      err,
    );
  }

  return "1.0.0";
}


/* =========================================================
   RAM BAR
========================================================= */

function createRamBar(
  percentage: number,
): string {
  const totalBlocks = 10;

  const safePercentage =
    Math.max(
      0,
      Math.min(
        100,
        Number.isFinite(percentage)
          ? percentage
          : 0,
      ),
    );

  const filledBlocks =
    Math.round(
      (safePercentage / 100) *
        totalBlocks,
    );

  return (
    "█".repeat(
      filledBlocks,
    ) +
    "░".repeat(
      totalBlocks -
        filledBlocks,
    )
  );
}


/* =========================================================
   OWNER DISPLAY
========================================================= */

function getOwnerDisplay(): string {
  const owner =
    config.ownerNumber.trim();

  if (!owner) {
    return "NOT CONFIGURED";
  }

  if (owner.includes("@")) {
    return owner
      .split("@")[0]
      .replace(/[^\d]/g, "");
  }

  const digits =
    owner.replace(
      /[^\d]/g,
      "",
    );

  return digits || "NOT CONFIGURED";
}


/* =========================================================
   SYSTEM INFORMATION
========================================================= */

interface MenuSystemInfo {
  owner: string;
  mode: string;
  prefix: string;
  version: string;
  platform: string;
  status: string;
  timezone: string;
  uptime: string;
  ramPercent: number;
  ramBar: string;
  memory: string;
  botName: string;
}


async function getMenuSystemInfo():
  Promise<MenuSystemInfo> {
  const totalMemory =
    os.totalmem();

  const freeMemory =
    os.freemem();

  const usedMemory =
    Math.max(
      0,
      totalMemory -
        freeMemory,
    );

  const ramPercent =
    totalMemory > 0
      ? Math.round(
          (usedMemory /
            totalMemory) *
            100,
        )
      : 0;

  const version =
    await getBotVersion();

  return {
    owner:
      getOwnerDisplay(),

    mode:
      config.mode.toUpperCase(),

    prefix:
      getPrefix(),

    version,

    platform:
      process.platform,

    status:
      "ONLINE",

    timezone:
      config.timezone,

    uptime:
      formatUptime(
        process.uptime(),
      ),

    ramPercent,

    ramBar:
      createRamBar(
        ramPercent,
      ),

    memory:
      `${(
        freeMemory /
        1024 /
        1024 /
        1024
      ).toFixed(1)} GB FREE`,

    botName:
      config.botName,
  };
}


/* =========================================================
   COMMAND HELP
========================================================= */

function buildCommandHelp(
  commandName: string,
): string | null {
  const command =
    getCommand(
      commandName,
    );

  if (!command) {
    return null;
  }

  const category =
    getCategory(
      command.category,
    );

  const prefix =
    getPrefix();

  const usage =
    command.usage ||
    command.name;

  const aliases =
    command.aliases &&
    command.aliases.length > 0
      ? command.aliases
          .map(
            (alias) =>
              `${prefix}${alias}`,
          )
          .join(", ")
      : "None";

  const categoryLabel =
    category
      ? `${category.icon} ${category.name}`
      : command.category;

  const access =
    getCommandAccess(
      command,
    );

  return [
    "╭━━〔 ⚡ COMMAND HELP 〕━━╮",
    "┃",
    "┃ 🔹 Command",
    `┃    ${prefix}${command.name}`,
    "┃",
    "┃ 📝 Description",
    `┃    ${command.description}`,
    "┃",
    "┃ 📂 Category",
    `┃    ${categoryLabel}`,
    "┃",
    "┃ 🔐 Access",
    `┃    ${access || "public"}`,
    "┃",
    "┃ 🧾 Usage",
    `┃    ${prefix}${usage}`,
    "┃",
    "┃ 🔗 Aliases",
    `┃    ${aliases}`,
    "┃",
    "┃ 💡 TIP",
    "┃    Use the command exactly",
    "┃    as shown above.",
    "┃",
    "┃ ⚡ VORTEX CORE",
    "┃ 🛡️ Security: ACTIVE",
    "┃",
    "┃ ⚡ Powered by Vortex Tech",
    "╰━━━━━━━━━━━━━━━━━━━━━━╯",
  ].join("\n");
}


/* =========================================================
   CATEGORY DISPLAY
========================================================= */

function getDisplayCategory(
  categoryId: string,
): {
  icon: string;
  name: string;
} | null {
  const category =
    getCategory(
      categoryId as Parameters<
        typeof getCategory
      >[0],
    );

  if (!category) {
    return null;
  }

  return {
    icon: category.icon,
    name: category.name,
  };
}


/* =========================================================
   VX COMMAND DETECTION
========================================================= */

function isVxCommand(
  commandName: string,
): boolean {
  const command =
    getCommand(
      commandName,
    );

  if (!command) {
    return false;
  }

  const access =
    getCommandAccess(
      command,
    );

  /*
   * VX is determined by the registry.
   *
   * The command name check is retained only to
   * distinguish the VX namespace from ordinary
   * owner commands such as restart/settings.
   */
  const normalized =
    command.name
      .trim()
      .toLowerCase();

  return (
    access === "vx" ||
    (
      access === "owner" &&
      (
        normalized.startsWith("vx") ||
        normalized === "checkbot" ||
        normalized === "scanbot" ||
        normalized === "progress" ||
        normalized === "audit" ||
        normalized === "iptrace" ||
        normalized === "s9"
      )
    )
  );
}


/* =========================================================
   MENU COMMAND LINE FORMATTER
========================================================= */

function formatCommandLine(
  commandNames: string[],
): string[] {
  const prefix =
    getPrefix();

  return commandNames
    .filter(
      (name) =>
        name.trim().length > 0,
    )
    .map(
      (name) =>
        `┃ ◈ ${prefix}${name}`,
    );
}


/* =========================================================
   STANDARD CATEGORY MENU
========================================================= */

function buildCategoryMenu(
  categoryId:
    Parameters<
      typeof getCommandsByCategory
    >[0],
): string {
  const category =
    getDisplayCategory(
      categoryId,
    );

  if (!category) {
    return "";
  }

  const commands =
    getCommandsByCategory(
      categoryId,
    ).filter(
      (command) =>
        !command.hidden,
    );

  if (!commands.length) {
    return "";
  }

  return formatCommandLine(
    commands.map(
      (command) =>
        command.name,
    ),
  ).join("\n");
}


/* =========================================================
   VX INTELLIGENCE MENU
========================================================= */

function buildVxMenu(): string {
  const vxCommands =
    getCommands()
      .filter(
        (command) =>
          !command.hidden &&
          isVxCommand(
            command.name,
          ),
      );

  if (!vxCommands.length) {
    return "";
  }

  return [
    "┃ 🧠 VX SECURITY INTELLIGENCE",
    ...formatCommandLine(
      vxCommands.map(
        (command) =>
          command.name,
      ),
    ),
  ].join("\n");
}


/* =========================================================
   CATEGORY COUNT
========================================================= */

function getVisibleCommandCount(): number {
  return getCommands()
    .filter(
      (command) =>
        !command.hidden,
    )
    .length;
}


/* =========================================================
   PREMIUM MENU
========================================================= */

function buildPremiumMenu(
  systemInfo: MenuSystemInfo,
): string {
  const sections: string[] = [];

  const prefix =
    systemInfo.prefix;

  const commandCount =
    getVisibleCommandCount();

  sections.push(
    [
      "╭━━〔 🖥️ SYSTEM STATUS 〕━━╮",
      "┃",
      `┃ 🌑 Bot      : ${systemInfo.botName}`,
      `┃ 👑 Owner    : ${systemInfo.owner}`,
      `┃ ⚙️ Mode     : ${systemInfo.mode}`,
      `┃ 💻 Platform : ${systemInfo.platform}`,
      `┃ 🌍 Timezone : ${systemInfo.timezone}`,
      `┃ ⏱️ Uptime   : ${systemInfo.uptime}`,
      `┃ 🧠 RAM      : ${systemInfo.ramBar} ${systemInfo.ramPercent}%`,
      `┃ 💾 Memory   : ${systemInfo.memory}`,
      `┃ 🔧 Version  : ${systemInfo.version}`,
      "┃",
      "┃ 🟢 Core     : ONLINE",
      "┃ 🛡️ Security : ACTIVE",
      "┃",
      "╰━━━━━━━━━━━━━━━━━━━━━━╯",
    ].join("\n"),
  );

  const core =
    buildCategoryMenu(
      "core",
    );

  if (core) {
    sections.push(
      [
        "╭━━〔 ⚡ SYSTEM 〕━━╮",
        core,
        "┃",
        "╰━━━━━━━━━━━━━━━━━━╯",
      ].join("\n"),
    );
  }

  const owner =
    buildCategoryMenu(
      "owner",
    );

  if (owner) {
    sections.push(
      [
        "╭━━〔 👑 OWNER CONTROLS 〕━━╮",
        owner,
        "┃",
        "╰━━━━━━━━━━━━━━━━━━━━━━━━╯",
      ].join("\n"),
    );
  }

  const group =
    buildCategoryMenu(
      "group",
    );

  if (group) {
    sections.push(
      [
        "╭━━〔 👥 GROUP MANAGEMENT 〕━━╮",
        group,
        "┃",
        "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
      ].join("\n"),
    );
  }

  const groupTools =
    buildCategoryMenu(
      "groupTools",
    );

  if (groupTools) {
    sections.push(
      [
        "╭━━〔 🛠️ GROUP TOOLS 〕━━╮",
        groupTools,
        "┃",
        "╰━━━━━━━━━━━━━━━━━━━━━━╯",
      ].join("\n"),
    );
  }

  const moderation =
    buildCategoryMenu(
      "moderation",
    );

  if (moderation) {
    sections.push(
      [
        "╭━━〔 ⚔️ MODERATION 〕━━╮",
        moderation,
        "┃",
        "╰━━━━━━━━━━━━━━━━━━━━━╯",
      ].join("\n"),
    );
  }

  const securityCommands =
    getCommandsByCategory(
      "security",
    ).filter(
      (command) =>
        !command.hidden &&
        !isVxCommand(
          command.name,
        ),
    );

  if (securityCommands.length) {
    sections.push(
      [
        "╭━━〔 🛡️ SECURITY 〕━━╮",
        "┃ 🛡️ GROUP PROTECTION",
        ...formatCommandLine(
          securityCommands.map(
            (command) =>
              command.name,
          ),
        ),
        "┃",
        "╰━━━━━━━━━━━━━━━━━━━━━╯",
      ].join("\n"),
    );
  }

  const vxMenu =
    buildVxMenu();

  if (vxMenu) {
    sections.push(
      [
        "╭━━〔 🧠 VX INTELLIGENCE 〕━━╮",
        vxMenu,
        "┃",
        "┃ 🔬 Detection • Analysis • Monitoring",
        "┃",
        "╰━━━━━━━━━━━━━━━━━━━━━━━━━╯",
      ].join("\n"),
    );
  }

  const automation =
    buildCategoryMenu(
      "automation",
    );

  if (automation) {
    sections.push(
      [
        "╭━━〔 🤖 AUTOMATION 〕━━╮",
        automation,
        "┃",
        "╰━━━━━━━━━━━━━━━━━━━━━━╯",
      ].join("\n"),
    );
  }

  const away =
    buildCategoryMenu(
      "away",
    );

  if (away) {
    sections.push(
      [
        "╭━━〔 🕐 AWAY SYSTEM 〕━━╮",
        away,
        "┃",
        "╰━━━━━━━━━━━━━━━━━━━━━╯",
      ].join("\n"),
    );
  }

  sections.push(
    [
      "╭━━〔 📖 COMMAND GUIDE 〕━━╮",
      "┃",
      `┃ ${prefix}menu`,
      "┃ └─ Open command center",
      "┃",
      `┃ ${prefix}help <command>`,
      "┃ └─ Detailed command help",
      "┃",
      `┃ ${prefix}help ping`,
      "┃ └─ Example",
      "┃",
      "┃ 💡 TIP",
      "┃ Use HELP for command usage,",
      "┃ descriptions and aliases.",
      "┃",
      "╰━━━━━━━━━━━━━━━━━━━━━━━━╯",
    ].join("\n"),
  );

  sections.push(
    [
      "╭━━〔 🌑 DARK VORTEX 〕━━╮",
      "┃",
      `┃ 📊 Commands : ${commandCount}`,
      "┃ 🟢 Status   : ONLINE",
      "┃ ⚡ Engine   : VORTEX CORE",
      "┃ 🛡️ Security : ACTIVE",
      "┃",
      "┃ ⚡ Powered by Vortex Tech",
      "╰━━━━━━━━━━━━━━━━━━━━━━╯",
    ].join("\n"),
  );

  return sections.join(
    "\n\n",
  );
}


/* =========================================================
   SEND MENU
========================================================= */

async function sendPremiumMenu(
  sock: WASocket,
  jid: string,
): Promise<void> {
  const systemInfo =
    await getMenuSystemInfo();

  const menu =
    buildPremiumMenu(
      systemInfo,
    );

  try {
    const image =
      await readFile(
        MENU_IMAGE_PATH,
      );

    await sock.sendMessage(
      jid,
      {
        image,
        caption: menu,
      },
    );
  } catch (err) {
    console.error(
      "Menu image error:",
      err,
    );

    await sock.sendMessage(
      jid,
      {
        text: menu,
      },
    );
  }
}


/* =========================================================
   AWAY COMMAND
========================================================= */

async function handleAwayCommand(
  sock: WASocket,
  jid: string,
  args: string[],
): Promise<boolean> {
  const action =
    args[0]?.toLowerCase();

  if (
    action === "status" ||
    !action
  ) {
    const duration =
      Math.floor(
        getAwayDuration() /
          60000,
      );

    await sock.sendMessage(
      jid,
      {
        text:
          info(
            "AWAY STATUS",
            [
              `🕐 Status: ${
                isOwnerAway()
                  ? "🟢 AWAY"
                  : "🔵 ACTIVE"
              }`,
              `⏱️ Inactive: ${duration} minutes`,
              "",
              "⏳ Automatic away activates",
              "after 15 minutes.",
              "",
              "📖 COMMANDS",
              `${getPrefix()}away on`,
              `${getPrefix()}away off`,
              `${getPrefix()}setaway <message>`,
              `${getPrefix()}setgroupaway <message>`,
            ],
          ),
      },
    );

    return true;
  }

  if (
    action === "on"
  ) {
    const awayModule =
      await import(
        "../services/away.js"
      );

    if (
      typeof awayModule.forceAway ===
      "function"
    ) {
      awayModule.forceAway();
    } else {
      await sock.sendMessage(
        jid,
        {
          text:
            info(
              "AWAY MODE",
              [
                "🕐 Automatic away mode is enabled.",
                "",
                "It activates after 15 minutes",
                "of owner inactivity.",
              ],
            ),
        },
      );

      return true;
    }

    await sock.sendMessage(
      jid,
      {
        text:
          success(
            "AWAY MODE ENABLED",
            [
              "🕐 Status: AWAY",
              "",
              "Dark Vortex will now respond",
              "using your configured away message.",
            ],
          ),
      },
    );

    return true;
  }

  if (
    action === "off"
  ) {
    const awayModule =
      await import(
        "../services/away.js"
      );

    awayModule.markOwnerActivity();

    await sock.sendMessage(
      jid,
      {
        text:
          info(
            "AWAY MODE DISABLED",
            [
              "🔵 Status: ACTIVE",
              "",
              "Dark Vortex has marked you",
              "as active again.",
            ],
          ),
      },
    );

    return true;
  }

  await sock.sendMessage(
    jid,
    {
      text:
        info(
          "AWAY COMMANDS",
          [
            `${getPrefix()}away`,
            `${getPrefix()}away status`,
            `${getPrefix()}away on`,
            `${getPrefix()}away off`,
            `${getPrefix()}setaway <message>`,
            `${getPrefix()}setgroupaway <message>`,
          ],
        ),
    },
  );

  return true;
}


/* =========================================================
   NORMALIZE JID
========================================================= */

function normalizeJid(
  value: string | undefined,
): string {
  if (!value) {
    return "";
  }

  return value
    .trim()
    .toLowerCase()
    .replace(
      /^whatsapp:/,
      "",
    );
}


/* =========================================================
   GROUP ADMIN CHECK
========================================================= */

async function isSenderGroupAdmin(
  sock: WASocket,
  jid: string,
  sender: string,
  senderAlt: string,
): Promise<boolean> {
  if (!jid.endsWith("@g.us")) {
    return false;
  }

  try {
    const metadata =
      await sock.groupMetadata(
        jid,
      );

    const senderCandidates =
      new Set(
        [
          normalizeJid(sender),
          normalizeJid(senderAlt),
        ].filter(Boolean),
      );

    for (
      const participant of
      metadata.participants
    ) {
      const participantJid =
        normalizeJid(
          participant.id,
        );

      const participantLid =
        normalizeJid(
          (
            participant as {
              lid?: string;
            }
          ).lid,
        );

      if (
        senderCandidates.has(
          participantJid,
        ) ||
        (
          participantLid &&
          senderCandidates.has(
            participantLid,
          )
        )
      ) {
        return (
          participant.admin === "admin" ||
          participant.admin === "superadmin"
        );
      }
    }
  } catch (err) {
    console.error(
      "Group admin check error:",
      err,
    );
  }

  return false;
}


/* =========================================================
   COMMAND ACCESS
========================================================= */

interface AccessContext {
  owner: boolean;
  group: boolean;
  groupAdmin: boolean;
}


function commandAccessAllowed(
  access: CommandAccess,
  context: AccessContext,
): boolean {
  switch (access) {
    case "public":
    case "user":
      return true;

    case "owner":
      return context.owner;

    case "vx":
      return context.owner;

    case "admin":
      return (
        context.owner ||
        context.groupAdmin
      );

    case "group":
      return context.group;

    case "groupAdmin":
      return (
        context.group &&
        context.groupAdmin
      );

    case "ownerGroup":
      return (
        context.owner &&
        context.group
      );

    case "ownerGroupAdmin":
      return (
        context.owner &&
        context.group &&
        context.groupAdmin
      );

    default:
      return false;
  }
}


/* =========================================================
   MODE CHECK
========================================================= */

function modeAllowsCommand(
  mode: string,
  jid: string,
  owner: boolean,
): boolean {
  const isGroup =
    jid.endsWith("@g.us");

  const isDm =
    !isGroup;

  switch (
    mode
      .trim()
      .toLowerCase()
  ) {
    case "silent":
      return owner;

    case "group":
      return isGroup;

    case "dm":
      return isDm;

    case "public":
    default:
      return true;
  }
}


/* =========================================================
   PERMISSION FAILURE
========================================================= */

async function sendPermissionDenied(
  sock: WASocket,
  jid: string,
  access: CommandAccess,
): Promise<void> {
  if (
    access !== "group" &&
    access !== "groupAdmin"
  ) {
    return;
  }

  const lines = [
    "🛡️ Dark Vortex blocked this command.",
    "",
    "👥 This command is available",
    "inside groups.",
  ];

  if (
    access === "groupAdmin"
  ) {
    lines.push(
      "",
      "👑 Group administrator permission",
      "is required.",
    );
  }

  lines.push(
    "",
    "⚡ Powered by Vortex Tech",
  );

  await sock.sendMessage(
    jid,
    {
      text:
        error(
          "ACCESS DENIED",
          lines,
        ),
    },
  );
}


/* =========================================================
   COMMAND HANDLER
========================================================= */

export async function handleCommand(
  sock: WASocket,
  jid: string,
  sender: string,
  text: string,
  message: WAMessage,
  senderAlt: string,
  fromMe: boolean,
): Promise<void> {
  try {

    /* =====================================================
       MESSAGE TEXT
    ===================================================== */

    const messageText =
      getMessageText(
        message,
      ).trim();

    if (!messageText) {
      return;
    }


    /* =====================================================
       OWNER AUTHENTICATION
    ===================================================== */

    const owner =
      isOwner(
        sender,
        senderAlt,
        fromMe,
        sock.user?.id,
        sock.user?.lid,
      );

        /* =====================================================
       VORTEX SECURITY CONFIRMATION — EARLY HANDLING
    ===================================================== */

    /*
     * Confirmation replies such as YES / NO / CANCEL / ABORT
     * are intentionally allowed without the command prefix.
     *
     * This MUST run before the prefix gate, otherwise a plain
     * "YES" is treated as an ordinary message and the pending
     * security operation can never be executed.
     */

    const confirmationHandled =
      await handleVortexConfirmation(
        sock,
        jid,
        sender,
        messageText,
      );

    const confirmedSecurity =
      consumeConfirmedSecurityExecution();

    if (
      confirmedSecurity
    ) {
      /*
       * A confirmed security operation must still be owner-only.
       * Re-check the identity at execution time.
       */
      if (
        !owner ||
        confirmedSecurity.ownerJid !== sender ||
        confirmedSecurity.chatJid !== jid
      ) {
        return;
      }

      const confirmedCommandDefinition =
        getCommand(
          confirmedSecurity.command,
        );

      if (
        !confirmedCommandDefinition
      ) {
        await sock.sendMessage(
          jid,
          {
            text:
              error(
                "CONFIRMATION FAILED",
                [
                  "❌ The confirmed command is no longer registered.",
                  "",
                  `Command: ${confirmedSecurity.command}`,
                  "",
                  "The operation was not executed.",
                ],
              ),
          },
        );

        return;
      }

      const confirmedAccess =
        getCommandAccess(
          confirmedCommandDefinition,
        );

      const confirmedGroup =
        jid.endsWith("@g.us");

      let confirmedGroupAdmin =
        false;

      if (
        confirmedGroup &&
        (
          confirmedAccess === "admin" ||
          confirmedAccess === "groupAdmin" ||
          confirmedAccess === "ownerGroupAdmin"
        )
      ) {
        confirmedGroupAdmin =
          await isSenderGroupAdmin(
            sock,
            jid,
            sender,
            senderAlt,
          );
      }

      if (
        !commandAccessAllowed(
          confirmedAccess,
          {
            owner,
            group:
              confirmedGroup,
            groupAdmin:
              confirmedGroupAdmin,
          },
        )
      ) {
        return;
      }

      if (
        !modeAllowsCommand(
          config.mode,
          jid,
          owner,
        )
      ) {
        return;
      }

      /*
       * Execute the confirmed operation DIRECTLY.
       *
       * Do not send it back through the normal command parser,
       * otherwise the command would request confirmation again.
       */
      const securityHandled =
        await handleVortexSecurityCommand(
          sock,
          jid,
          sender,
          confirmedSecurity.command,
          confirmedSecurity.args,
          message,
        );

      if (
        securityHandled
      ) {
        return;
      }

      /*
       * Fallback for any confirmed owner command that is not
       * handled by the VORTEX SECURITY module.
       */
      const ownerHandled =
        await handleOwnerCommand(
          sock,
          jid,
          confirmedSecurity.command,
          confirmedSecurity.args,
        );

      if (
        ownerHandled
      ) {
        return;
      }

      return;
    }

    /*
     * YES/NO/CANCEL/ABORT that was actually consumed by the
     * confirmation system must stop here.
     */
    if (
      confirmationHandled
    ) {
      return;
    }


    /* =====================================================
       PREFIX
    ===================================================== */

      const prefix =
        getPrefix();

      const isLatencyCommand =
        messageText
          .trim()
          .toLowerCase() ===
        ";latency";

      if (
        !messageText.startsWith(
          prefix,
        ) &&
        !isLatencyCommand
      ) {
      /*
       * Non-command messages may still be inspected
       * by the security layer below/elsewhere.
       *
       * The command dispatcher itself does nothing.
       */
      if (!fromMe) {
        try {
          const detection =
            await analyzeIncomingMessage(
              sender,
              message,
            );

          /*
           * Security detection is intentionally kept
           * separate from command responses.
           *
           * This prevents an ordinary message that happens
           * to contain suspicious content from generating
           * an extra message while a command operation is
           * running.
           */
          if (
            detection.suspicious &&
            await shouldAlert(sender)
          ) {
            const number =
              sender
                .split(":")[0]
                .replace(
                  "@s.whatsapp.net",
                  "",
                )
                .replace(
                  "@lid",
                  "",
                );

            /*
             * Detection alerts remain enabled for ordinary
             * incoming messages. Command messages are
             * handled below and are not double-replied to.
             */
            await sock.sendMessage(
              jid,
              {
                text:
                  formatBotDetectionAlert(
                    detection,
                    `@${number}`,
                  ),
                mentions: [
                  sender,
                ],
              },
            );
          }
        } catch (detectorError) {
          console.error(
            "Bot detector error:",
            detectorError,
          );
        }
      }

      return;
    }


    /* =====================================================
       COMMAND + ARGUMENTS
    ===================================================== */

    const body =
      isLatencyCommand
        ? "latency"
        : messageText
          .slice(prefix.length)
          .trim();

    if (!body) {
      return;
    }

    const parts =
      body.split(/\s+/);

    const requestedCommand =
      (
        parts.shift() ||
        ""
      ).trim();

    const args =
      parts;

    if (!requestedCommand) {
      return;
    }


    /* =====================================================
       COMMAND REGISTRY RESOLUTION
    ===================================================== */

    const commandDefinition =
      getCommand(
        requestedCommand,
      );


    /* =====================================================
       UNKNOWN COMMAND
    ===================================================== */

    if (!commandDefinition) {
      /*
       * Only the owner receives unknown-command diagnostics.
       * This prevents the bot from leaking its command surface
       * to arbitrary users.
       */
      if (owner) {
        await sock.sendMessage(
          jid,
          {
            text:
              unknownCommand(
                requestedCommand,
              ),
          },
        );
      }

      return;
    }


    /* =====================================================
       CANONICAL COMMAND
    ===================================================== */

    const command =
      commandDefinition.name;

    const access =
      getCommandAccess(
        commandDefinition,
      );


    /* =====================================================
       GROUP CONTEXT
    ===================================================== */

    const group =
      jid.endsWith("@g.us");

    let groupAdmin =
      false;

    if (
      group &&
      (
        access === "admin" ||
        access === "groupAdmin" ||
        access === "ownerGroupAdmin"
      )
    ) {
      groupAdmin =
        await isSenderGroupAdmin(
          sock,
          jid,
          sender,
          senderAlt,
        );
    }


    /* =====================================================
       RESPONSE MODE
    ===================================================== */

    if (
      !modeAllowsCommand(
        config.mode,
        jid,
        owner,
      )
    ) {
      return;
    }


    /* =====================================================
       REGISTRY PERMISSION
    ===================================================== */

    const accessAllowed =
      commandAccessAllowed(
        access,
        {
          owner,
          group,
          groupAdmin,
        },
      );

    if (!accessAllowed) {
      /*
       * Never reveal VX, Finalkey, owner infrastructure,
       * or privileged command details to ordinary users.
       */
      if (
        access === "group" ||
        access === "groupAdmin"
      ) {
        await sendPermissionDenied(
          sock,
          jid,
          access,
        );
      }

      return;
    }


    /* =====================================================
       INTERNAL BOT DETECTION
    ===================================================== */

    /*
     * Do not emit a detector alert here.
     *
     * Command messages must remain under the command
     * dispatcher so later operation/response integration
     * can guarantee exactly one editable response.
     */
    if (!fromMe) {
      try {
        await analyzeIncomingMessage(
          sender,
          message,
        );
      } catch (detectorError) {
        console.error(
          "Command bot detector error:",
          detectorError,
        );
      }
    }


    /* =====================================================
       DARK VORTEX REST MODE
    ===================================================== */

    /*
     * REST commands are now resolved only after registry
     * authorization. A REST handler therefore cannot become
     * an authorization bypass.
     */
    const restResult =
      await handleRestCommand(
        command.toLowerCase(),
        args,
      );

    if (
      restResult.handled
    ) {
      if (
        restResult.response
      ) {
        await sock.sendMessage(
          jid,
          {
            text:
              restResult.response,
          },
        );
      }

      return;
    }


    /* =====================================================
       MEMORY CLEANER
    ===================================================== */

    let cleanupProgressMessage:
      WAMessage | undefined;

    const cleanupProgress:
      CleanupProgress =
      async (
        stage: string,
        percent: number,
      ) => {
        try {
          const progressText =
            formatCleanupProgress(
              stage,
              percent,
            );

          if (
            !cleanupProgressMessage
          ) {
            cleanupProgressMessage =
              await sock.sendMessage(
                jid,
                {
                  text:
                    progressText,
                },
              );

            return;
          }

          await sock.sendMessage(
            jid,
            {
              text:
                progressText,
              edit:
                cleanupProgressMessage.key,
            },
          );
        } catch (progressError) {
          console.error(
            "Memory cleanup progress update error:",
            progressError,
          );
        }
      };

    const cleanupResult =
      await handleMemoryCleanupCommand(
        command.toLowerCase(),
        args,
        cleanupProgress,
      );

    if (
      cleanupResult.handled
    ) {
      if (
        cleanupResult.response
      ) {
        if (
          cleanupProgressMessage
        ) {
          try {
            await sock.sendMessage(
              jid,
              {
                text:
                  cleanupResult.response,
                edit:
                  cleanupProgressMessage.key,
              },
            );
          } catch (editError) {
            console.error(
              "Memory cleanup final edit error:",
              editError,
            );
          }
        } else {
          await sock.sendMessage(
            jid,
            {
              text:
                cleanupResult.response,
            },
          );
        }
      }

      return;
    }


    /* =====================================================
       VORTEX SECURITY CONFIRMATION
    ===================================================== */

    if (
      isVortexSecurityCommand(
        command.toLowerCase(),
      ) &&
      requiresConfirmation(
        commandDefinition,
      )
    ) {
      createSecurityConfirmation(
        sender,
        jid,
        command,
        args,
      );

      await sendSecurityConfirmationPrompt(
        sock,
        jid,
        command,
      );

      return;
    }


    /* =====================================================
       HELP
    ===================================================== */

    if (
      command === "help"
    ) {
      const requestedHelp =
        args.join(" ").trim();

      if (!requestedHelp) {
        await sendPremiumMenu(
          sock,
          jid,
        );

        return;
      }

      const helpDefinition =
        getCommand(
          requestedHelp,
        );

      if (!helpDefinition) {
        if (owner) {
          await sock.sendMessage(
            jid,
            {
              text:
                unknownCommand(
                  requestedHelp,
                ),
            },
          );
        }

        return;
      }

      const helpAccess =
        getCommandAccess(
          helpDefinition,
        );

      if (
        !commandAccessAllowed(
          helpAccess,
          {
            owner,
            group,
            groupAdmin,
          },
        )
      ) {
        return;
      }

      const helpText =
        buildCommandHelp(
          helpDefinition.name,
        );

      if (!helpText) {
        return;
      }

      await sock.sendMessage(
        jid,
        {
          text:
            helpText,
        },
      );

      return;
    }


    /* =====================================================
       MENU
    ===================================================== */

    if (
      command === "menu"
    ) {
      await sendPremiumMenu(
        sock,
        jid,
      );

      return;
    }


    /* =====================================================
       PING
    ===================================================== */

    if (
      command === "ping"
    ) {
      const start =
        Date.now();

      const responseMs =
        Math.max(
          1,
          Date.now() -
            start,
        );

      await sock.sendMessage(
        jid,
        {
          text:
            pingResponse(
              responseMs,
            ),
        },
      );

      return;
    }

      /* =====================================================
       LATENCY DETECTOR
    ===================================================== */

    if (
      command === "latency"
    ) {
      if (!owner) {
        return;
      }

      const startedAt =
        Date.now();

      try {
        await sock.sendMessage(
          jid,
          {
            text:
              [
                "╭━━〔 ⚡ LATENCY DETECTOR 〕━━╮",
                "┃",
                "┃ 📡 Measuring Dark Vortex",
                "┃    WhatsApp send latency...",
                "┃",
                "┃ ⏳ Please wait...",
                "┃",
                "╰━━━━━━━━━━━━━━━━━━━━━━━━╯",
              ].join("\n"),
          },
        );

        const result =
          await measureLatency(
            sock,
            jid,
          );

        const detectorTime =
          Math.max(
            0,
            Date.now() -
              startedAt,
          );

        await sock.sendMessage(
          jid,
          {
            text:
              [
                "╭━━〔 ⚡ LATENCY RESULT 〕━━╮",
                "┃",
                `┃ ${getLatencyIcon(result.level)} Latency : ${result.latencyMs}ms`,
                `┃ 📊 Level   : ${result.level}`,
                `┃ 🔌 Socket  : ${
                  result.connected
                    ? "CONNECTED"
                    : "DISCONNECTED"
                }`,
                `┃ ⏱️ Handler : ${detectorTime}ms`,
                "┃",
                "┃ 🧠 Assessment",
                `┃ ${getLatencyDescription(result.level)}`,
                "┃",
                "┃ ℹ️ Measurement represents",
                "┃    Dark Vortex → WhatsApp",
                "┃    send-operation latency.",
                "┃",
                "┃ ⚡ VORTEX CORE",
                "┃ 🛡️ Security: ACTIVE",
                "┃",
                "┃ ⚡ Powered by Vortex Tech",
                "╰━━━━━━━━━━━━━━━━━━━━━━━━╯",
              ].join("\n"),
          },
        );

        console.log(
          `[LATENCY] ${result.latencyMs}ms | ${result.level} | ${jid}`,
        );
      } catch (err) {
        console.error(
          "[LATENCY] Measurement failed:",
          err,
        );

        await sock.sendMessage(
          jid,
          {
            text:
              error(
                "LATENCY FAILED",
                [
                  "❌ Dark Vortex could not",
                  "complete the latency measurement.",
                  "",
                  "🔌 Socket:",
                  sock.user?.id
                    ? "CONNECTED"
                    : "DISCONNECTED",
                  "",
                  "💡 Check the WhatsApp connection",
                  "and try again.",
                ],
              ),
          },
        );
      }

      return;
    }

    /* =====================================================
       PREFIX
    ===================================================== */

    if (
      command === "setprefix"
    ) {
      if (
        args.length !== 1
      ) {
        await sock.sendMessage(
          jid,
          {
            text:
              info(
                "PREFIX SETTINGS",
                [
                  `🔧 Current: ${getPrefix()}`,
                  "",
                  "📝 USAGE",
                  `${getPrefix()}setprefix !`,
                  "",
                  "💡 Prefix must contain",
                  "1 to 3 characters.",
                ],
              ),
          },
        );

        return;
      }

      try {
        const newPrefix =
          await setPrefix(
            args[0],
          );

        await sock.sendMessage(
          jid,
          {
            text:
              success(
                "PREFIX UPDATED",
                [
                  `🔧 New Prefix: ${newPrefix}`,
                  "",
                  `📖 Example: ${newPrefix}menu`,
                  "",
                  "💾 Prefix saved permanently.",
                ],
              ),
          },
        );
      } catch (err) {
        console.error(
          "Set prefix error:",
          err,
        );

        await sock.sendMessage(
          jid,
          {
            text:
              error(
                "INVALID PREFIX",
                [
                  "❌ Prefix could not be saved.",
                  "",
                  "📏 Prefix requirements:",
                  "• 1 to 3 characters",
                  "• No spaces",
                  "",
                  `💡 Example: ${getPrefix()}setprefix !`,
                ],
              ),
          },
        );
      }

      return;
    }


    /* =====================================================
       AWAY
    ===================================================== */

    if (
      command === "away"
    ) {
      await handleAwayCommand(
        sock,
        jid,
        args,
      );

      return;
    }


    /* =====================================================
       PRIVATE AWAY MESSAGE
    ===================================================== */

    if (
      command === "setaway"
    ) {
      const awayMessage =
        args.join(" ").trim();

      if (!awayMessage) {
        await sock.sendMessage(
          jid,
          {
            text:
              info(
                "SET AWAY MESSAGE",
                [
                  "🕐 Configure your private",
                  "away response.",
                  "",
                  "📝 USAGE",
                  `${getPrefix()}setaway Your away message`,
                  "",
                  "💡 Used for private chats",
                  "when you are away.",
                ],
              ),
          },
        );

        return;
      }

      setAwayMessage(
        awayMessage,
      );

      await sock.sendMessage(
        jid,
        {
          text:
            success(
              "AWAY MESSAGE SAVED",
              [
                "🕐 Private away message",
                "has been updated.",
                "",
                `📝 ${awayMessage}`,
              ],
            ),
        },
      );

      return;
    }


    /* =====================================================
       GROUP AWAY MESSAGE
    ===================================================== */

    if (
      command === "setgroupaway"
    ) {
      const groupAwayMessage =
        args.join(" ").trim();

      if (!groupAwayMessage) {
        await sock.sendMessage(
          jid,
          {
            text:
              info(
                "SET GROUP AWAY",
                [
                  "🕐 Configure your group",
                  "away response.",
                  "",
                  "📝 USAGE",
                  `${getPrefix()}setgroupaway Your group away message`,
                  "",
                  "💡 Sent when you are mentioned",
                  "in a group while away.",
                ],
              ),
          },
        );

        return;
      }

      setGroupAwayMessage(
        groupAwayMessage,
      );

      await sock.sendMessage(
        jid,
        {
          text:
            success(
              "GROUP AWAY MESSAGE SAVED",
              [
                "👥 Group away message",
                "has been updated.",
                "",
                `📝 ${groupAwayMessage}`,
              ],
            ),
        },
      );

      return;
    }


    /* =====================================================
       STATUS
    ===================================================== */

    if (
      command === "status"
    ) {
      const statusText =
        args.join(" ").trim();

      if (statusText) {
        try {
          await sendTextStatus(
            sock,
            statusText,
          );

          await sock.sendMessage(
            jid,
            {
              text:
                success(
                  "STATUS SENT",
                  [
                    "📱 WhatsApp Status published.",
                    "",
                    `📝 ${statusText}`,
                  ],
                ),
            },
          );
        } catch (err) {
          console.error(
            "Text status error:",
            err,
          );

          await sock.sendMessage(
            jid,
            {
              text:
                error(
                  "STATUS FAILED",
                  [
                    "📱 Dark Vortex could not",
                    "publish the WhatsApp Status.",
                    "",
                    "💡 Check the WhatsApp connection",
                    "and try again.",
                  ],
                ),
            },
          );
        }

        return;
      }

      const contextInfo =
        message.message
          ?.extendedTextMessage
          ?.contextInfo;

      const quotedMessage =
        contextInfo?.quotedMessage;

      if (
        quotedMessage?.imageMessage
      ) {
        try {
          const quoted: WAMessage = {
            key: {
              remoteJid:
                jid,
              fromMe:
                false,
              id:
                contextInfo?.stanzaId ||
                "",
            },
            message:
              quotedMessage,
          };

          await sendImageStatus(
            sock,
            quoted,
          );

          await sock.sendMessage(
            jid,
            {
              text:
                success(
                  "STATUS SENT",
                  [
                    "🖼️ Image Status published.",
                  ],
                ),
            },
          );
        } catch (err) {
          console.error(
            "Image status error:",
            err,
          );

          await sock.sendMessage(
            jid,
            {
              text:
                error(
                  "STATUS FAILED",
                  [
                    "🖼️ Dark Vortex could not",
                    "publish the image Status.",
                  ],
                ),
            },
          );
        }

        return;
      }

      await sock.sendMessage(
        jid,
        {
          text:
            info(
              "STATUS COMMAND",
              [
                "📱 WhatsApp Status",
                "",
                "📝 TEXT STATUS",
                `• ${getPrefix()}status Hello everyone!`,
                "",
                "🖼️ IMAGE STATUS",
                "Reply to an image with:",
                `• ${getPrefix()}status`,
              ],
            ),
        },
      );

      return;
    }


    /* =====================================================
       OWNER COMMANDS
    ===================================================== */

    if (
      owner
    ) {
      const ownerHandled =
        await handleOwnerCommand(
          sock,
          jid,
          command,
          args,
        );

      if (
        ownerHandled
      ) {
        return;
      }
    }


    /* =====================================================
       VX SECURITY COMMANDS
    ===================================================== */

    if (
      owner &&
      isVxCommand(
        command,
      )
    ) {
      const vxHandled =
        await handleVxCommand(
          sock,
          jid,
          command,
          args,
          message,
        );

      if (
        vxHandled
      ) {
        return;
      }
    }


    /* =====================================================
       DARK VORTEX TOOLS
    ===================================================== */

    const vortexToolsHandled =
      await handleVortexToolsCommand(
        sock,
        jid,
        sender,
        command,
        args,
        message,
      );

    if (
      vortexToolsHandled
    ) {
      return;
    }


    /* =====================================================
       GROUP CONTROL COMMANDS
    ===================================================== */

    const groupHandled =
      await handleGroupCommand(
        sock,
        jid,
        command,
        args,
        message,
      );

    if (
      groupHandled
    ) {
      return;
    }


    /* =====================================================
       DISABLED GROUP GATE
    ===================================================== */

    if (
      group
    ) {
      const enabled =
        await isGroupEnabled(
          jid,
        );

      if (!enabled) {
        return;
      }
    }


    /* =====================================================
       AUTOMATION
    ===================================================== */
    const securityPanelHandled =
      await handleSecurityPanelCommand(
        sock,
        jid,
        command,
        args,
      );

    if (securityPanelHandled) {
      return;
    }

    const automationHandled =
      await handleAutomationCommand(
        sock,
        jid,
        command,
        args,
      );

    if (
      automationHandled
    ) {
      return;
    }


    /* =====================================================
       TRIGGERS
    ===================================================== */

    const triggerHandled =
      await handleTriggerCommand(
        sock,
        jid,
        command,
        args,
      );

    if (
      triggerHandled
    ) {
      return;
    }


    /* =====================================================
       ANNOUNCEMENT
    ===================================================== */

    const announcementHandled =
      await handleAnnouncementCommand(
        sock,
        jid,
        command,
        args,
      );

    if (
      announcementHandled
    ) {
      return;
    }


    /* =====================================================
       REPORT
    ===================================================== */

    const reportHandled =
      await handleReportCommand(
        sock,
        jid,
        command,
        args,
      );

    if (
      reportHandled
    ) {
      return;
    }


    /* =====================================================
       SLOWMODE
    ===================================================== */

    const slowmodeHandled =
      await handleSlowmodeCommand(
        sock,
        jid,
        command,
        args,
      );

    if (
      slowmodeHandled
    ) {
      return;
    }


    /* =====================================================
       GET JID
    ===================================================== */

    const getJidHandled =
      await handleGetJidCommand(
        sock,
        jid,
        command,
      );

    if (
      getJidHandled
    ) {
      return;
    }


    /* =====================================================
       VCF
    ===================================================== */

    const vcfHandled =
      await handleVcfCommand(
        sock,
        jid,
        command,
      );

    if (
      vcfHandled
    ) {
      return;
    }


    /* =====================================================
       DELETE ALL FROM
    ===================================================== */

    const deleteAllFromHandled =
      await handleDeleteAllFromCommand(
        sock,
        jid,
        message,
        command,
        args,
      );

    if (
      deleteAllFromHandled
    ) {
      return;
    }


    /* =====================================================
       MODERATION
    ===================================================== */

    const moderationHandled =
      await handleModerationCommand(
        sock,
        jid,
        command,
        args,
        message,
      );

    if (
      moderationHandled
    ) {
      return;
    }


    /* =====================================================
       PROTECTION
    ===================================================== */

    const protectionHandled =
      await handleProtectionCommand(
        sock,
        jid,
        command,
        args,
        message,
      );

    if (
      protectionHandled
    ) {
      return;
    }


    /* =====================================================
       RULES
    ===================================================== */

    const rulesHandled =
      await handleRulesCommand(
        sock,
        jid,
        command,
        args,
        message,
      );

    if (
      rulesHandled
    ) {
      return;
    }


    /* =====================================================
       UTILITY
    ===================================================== */

    const utilityHandled =
      await handleUtilityCommand(
        sock,
        jid,
        command,
        args,
        message,
      );

    if (
      utilityHandled
    ) {
      return;
    }


    /* =====================================================
       UNKNOWN / UNIMPLEMENTED
    ===================================================== */

    if (owner) {
      await sock.sendMessage(
        jid,
        {
          text:
            unknownCommand(
              command,
            ),
        },
      );
    }

  } catch (err) {

    console.error(
      "Command handler error:",
      err,
    );

    try {
      await sock.sendMessage(
        jid,
        {
          text:
            internalError(
              "command",
            ),
        },
      );
    } catch (sendError) {
      console.error(
        "Failed to send command error:",
        sendError,
      );
    }
  }
}