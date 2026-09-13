
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  readFile,
  mkdir,
  writeFile,
} from "node:fs/promises";

import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";
import {
  getSessionStatus,
  getSessionAccount,
  getSessionPairingMode,
  getReconnectCount,
  getSessionStartedAt,
} from "../services/session-state.js";
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
  sendVortexReply,
} from "../utils/vortex-reply.js";

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
  setAntiEdit,
  getAntiEditStatus,
} from "../services/anti-edit.js";

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
  markOwnerActivity,
  markOwnerResponse,
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

const BACKUP_DIRECTORY =
  path.resolve(
    __dirname,
    "../../backups",
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
  quotedMessage?: WAMessage,
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
      quotedMessage
        ? {
            quoted: quotedMessage,
          }
        : undefined,
    );
  } catch (err) {
    console.error(
      "Menu image error:",
      err,
    );

    await sendVortexReply(
      sock,
      jid,
      menu,
      quotedMessage,
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
  quotedMessage?: WAMessage,
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

    await sendVortexReply(
      sock,
      jid,
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
      quotedMessage,
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
      await sendVortexReply(
        sock,
        jid,
        info(
          "AWAY MODE",
          [
            "🕐 Automatic away mode is enabled.",
            "",
            "It activates after 15 minutes",
            "of owner inactivity.",
          ],
        ),
        quotedMessage,
      );

      return true;
    }

    await sendVortexReply(
      sock,
      jid,
      success(
        "AWAY MODE ENABLED",
        [
          "🕐 Status: AWAY",
          "",
          "Dark Vortex will now respond",
          "using your configured away message.",
        ],
      ),
      quotedMessage,
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

    await sendVortexReply(
      sock,
      jid,
      info(
        "AWAY MODE DISABLED",
        [
          "🔵 Status: ACTIVE",
          "",
          "Dark Vortex has marked you",
          "as active again.",
        ],
      ),
      quotedMessage,
    );

    return true;
  }

  await sendVortexReply(
    sock,
    jid,
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
    quotedMessage,
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
  /*
   * =======================================================
   * 🌑 DARK VORTEX — GLOBAL OWNER COMMAND LOCK
   *
   * Every Dark Vortex command is now owner-only.
   *
   * This intentionally overrides:
   * • public
   * • user
   * • admin
   * • group
   * • groupAdmin
   * • ownerGroup
   * • ownerGroupAdmin
   * • vx
   *
   * The AI assistant remains separate and can still answer
   * normal Dark Vortex questions.
   * =======================================================
   */

  if (!context.owner) {
    return false;
  }

  /*
   * Owner can use every registered command.
   *
   * Group-specific commands still require a group where
   * their existing handlers enforce that requirement.
   */
  return true;
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
  quotedMessage?: WAMessage,
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

  await sendVortexReply(
    sock,
    jid,
    error(
      "ACCESS DENIED",
      lines,
    ),
    quotedMessage,
  );
}


/* =========================================================
   👤 WHOIS — TARGET RESOLUTION
========================================================= */

function getWhoisTarget(
  message: WAMessage,
): string {
  const contextInfo =
    message.message
      ?.extendedTextMessage
      ?.contextInfo;

  if (!contextInfo) {
    return "";
  }

  if (contextInfo.participant) {
    return normalizeJid(
      contextInfo.participant,
    );
  }

  const mentioned =
    contextInfo.mentionedJid;

  if (
    mentioned &&
    mentioned.length > 0
  ) {
    return normalizeJid(
      mentioned[0],
    );
  }

  return "";
}


/* =========================================================
   👤 WHOIS — FORMAT
========================================================= */

function formatWhoisPhone(
  jid: string,
): string {
  const number =
    jid
      .split("@")[0]
      .split(":")[0]
      .replace(/[^\d]/g, "");

  return number
    ? `+${number}`
    : "UNKNOWN";
}


/* =========================================================
   👤 WHOIS COMMAND
========================================================= */

async function handleWhoisCommand(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  args: string[],
): Promise<boolean> {
  if (!jid.endsWith("@g.us")) {
    await sendVortexReply(
      sock,
      jid,
      error(
        "GROUP COMMAND",
        [
          "👥 .whois can only be used",
          "inside a WhatsApp group.",
          "",
          "💡 Reply to a member's message",
          "or mention them with @user.",
        ],
      ),
      message,
    );

    return true;
  }

  let targetJid =
    getWhoisTarget(message);

  if (
    !targetJid &&
    args[0]
  ) {
    const raw =
      args[0].trim();

    if (
      raw.includes("@")
    ) {
      targetJid =
        normalizeJid(raw);
    } else if (
      /^\d+$/.test(raw)
    ) {
      targetJid =
        `${raw}@s.whatsapp.net`;
    }
  }

  if (!targetJid) {
    await sendVortexReply(
      sock,
      jid,
      info(
        "WHOIS",
        [
          "👤 Select a group member.",
          "",
          "📝 USAGE",
          `${getPrefix()}whois @user`,
          "",
          "💬 Or simply reply to",
          "the user's message with:",
          `${getPrefix()}whois`,
        ],
      ),
      message,
    );

    return true;
  }

  try {
    const metadata =
      await sock.groupMetadata(
        jid,
      );

    const participant =
      metadata.participants.find(
        (item) => {
          const participantId =
            normalizeJid(
              item.id,
            );

          const participantLid =
            normalizeJid(
              (
                item as {
                  lid?: string;
                }
              ).lid,
            );

          return (
            participantId === targetJid ||
            participantLid === targetJid
          );
        },
      );

    if (!participant) {
      await sendVortexReply(
        sock,
        jid,
        error(
          "MEMBER NOT FOUND",
          [
            "❌ That user could not be found",
            "inside this group.",
            "",
            "💡 Make sure the selected",
            "account is still a member.",
          ],
        ),
        message,
      );

      return true;
    }

    const participantJid =
      normalizeJid(
        participant.id,
      );

    const phone =
      formatWhoisPhone(
        participantJid,
      );

    const role =
      participant.admin ===
        "superadmin"
        ? "GROUP OWNER"
        : participant.admin ===
            "admin"
          ? "ADMIN"
          : "MEMBER";

    const isBot =
      participantJid ===
      normalizeJid(
        sock.user?.id,
      ) ||
      participantJid ===
      normalizeJid(
        sock.user?.lid,
      );

    const status =
      isBot
        ? "🌑 DARK VORTEX"
        : "🟢 GROUP MEMBER";

    const displayName =
      (
        participant as {
          name?: string;
          notify?: string;
        }
      ).name ||
      (
        participant as {
          notify?: string;
        }
      ).notify ||
      "Unknown";

    await sendVortexReply(
      sock,
      jid,
      [
        "╭━━〔 👤 WHOIS 〕━━╮",
        "┃",
        `┃ 👤 Name   : ${displayName}`,
        `┃ 📱 Number : ${phone}`,
        `┃ 🛡️ Role   : ${role}`,
        `┃ 📡 Status : ${status}`,
        `┃ 🆔 JID    : ${participantJid}`,
        "┃",
        "┃ 🔐 VORTEX ACCESS",
        `┃ Admin    : ${
          participant.admin
            ? "YES"
            : "NO"
        }`,
        `┃ Bot      : ${
          isBot
            ? "YES"
            : "NO"
        }`,
        "┃",
        "┃ ⚡ VORTEX CORE",
        "┃ 🛡️ Security: ACTIVE",
        "┃",
        "┃ ⚡ Powered by Vortex Tech",
        "╰━━━━━━━━━━━━━━━━━━━━━━╯",
      ].join("\n"),
      message,
    );

    return true;
  } catch (err) {
    console.error(
      "Whois error:",
      err,
    );

    await sendVortexReply(
      sock,
      jid,
      error(
        "WHOIS FAILED",
        [
          "❌ Dark Vortex could not",
          "inspect that group member.",
          "",
          "💡 Try again in a moment.",
        ],
      ),
      message,
    );

    return true;
  }
}


/* =========================================================
   ⚙️ SETTINGS COMMAND
========================================================= */

async function handleSettingsCommand(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  args: string[],
): Promise<boolean> {
  const section =
    (
      args[0] ||
      "all"
    )
      .trim()
      .toLowerCase();

  const validSections =
    new Set([
      "all",
      "bot",
      "owner",
      "system",
      "security",
    ]);

  if (
    !validSections.has(
      section,
    )
  ) {
    await sendVortexReply(
      sock,
      jid,
      info(
        "SETTINGS",
        [
          "⚙️ Available sections:",
          "",
          `${getPrefix()}settings`,
          `${getPrefix()}settings bot`,
          `${getPrefix()}settings owner`,
          `${getPrefix()}settings system`,
          `${getPrefix()}settings security`,
        ],
      ),
      message,
    );

    return true;
  }

  const version =
    await getBotVersion();

  const lines: string[] = [
    "╭━━〔 ⚙️ DARK VORTEX SETTINGS 〕━━╮",
    "┃",
  ];

  if (
    section === "all" ||
    section === "bot"
  ) {
    lines.push(
      "┃ 🤖 BOT",
      `┃ Name     : ${config.botName}`,
      `┃ Mode     : ${String(config.mode).toUpperCase()}`,
      `┃ Prefix   : ${getPrefix()}`,
      `┃ Version  : ${version}`,
      "┃",
    );
  }

  if (
    section === "all" ||
    section === "owner"
  ) {
    lines.push(
      "┃ 👑 OWNER",
      `┃ Number   : ${getOwnerDisplay()}`,
      "┃ Access   : OWNER ONLY",
      "┃",
    );
  }

  if (
    section === "all" ||
    section === "system"
  ) {
    lines.push(
      "┃ 🖥️ SYSTEM",
      `┃ Platform : ${process.platform}`,
      `┃ Host     : ${os.hostname()}`,
      `┃ Node     : ${process.version}`,
      `┃ Timezone : ${config.timezone}`,
      `┃ Uptime   : ${formatUptime(process.uptime())}`,
      "┃",
    );
  }

  if (
    section === "all" ||
    section === "security"
  ) {
    lines.push(
      "┃ 🛡️ SECURITY",
      "┃ Command Access : REGISTRY",
      "┃ Owner Lock     : ACTIVE",
      "┃ VX Layer       : ACTIVE",
      "┃ Protection     : ACTIVE",
      "┃",
    );
  }

  lines.push(
    "┃ 🔒 Configuration is protected",
    "┃ from ordinary users.",
    "┃",
    "┃ ⚡ VORTEX CORE",
    "┃ 🛡️ Security: ACTIVE",
    "┃",
    "┃ ⚡ Powered by Vortex Tech",
    "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
  );

  await sendVortexReply(
    sock,
    jid,
    lines.join("\n"),
    message,
  );

  return true;
}


/* =========================================================
   💾 BACKUP COMMAND
========================================================= */

async function handleBackupCommand(
  sock: WASocket,
  jid: string,
  message: WAMessage,
): Promise<boolean> {
  try {
    await mkdir(
      BACKUP_DIRECTORY,
      {
        recursive: true,
      },
    );

    const timestamp =
      new Date()
        .toISOString()
        .replace(
          /[:.]/g,
          "-",
        );

    const backupFile =
      `dark-vortex-${timestamp}.json`;

    const backupPath =
      path.join(
        BACKUP_DIRECTORY,
        backupFile,
      );

    const backupData = {
      backupType:
        "DARK_VORTEX_CONFIGURATION",
      version:
        await getBotVersion(),
      createdAt:
        new Date().toISOString(),

      bot: {
        name:
          config.botName,
        mode:
          config.mode,
        prefix:
          getPrefix(),
        timezone:
          config.timezone,
      },

      owner: {
        number:
          config.ownerNumber,
      },

      system: {
        platform:
          process.platform,
        node:
          process.version,
      },

      security: {
        commandRegistry:
          true,
        ownerOnly:
          true,
        vx:
          true,
      },
    };

    await writeFile(
      backupPath,
      JSON.stringify(
        backupData,
        null,
        2,
      ),
      "utf8",
    );

    await sendVortexReply(
      sock,
      jid,
      success(
        "BACKUP CREATED",
        [
          "💾 Dark Vortex configuration",
          "backup completed successfully.",
          "",
          `📁 File: ${backupFile}`,
          `📦 Size: ${Buffer.byteLength(
            JSON.stringify(
              backupData,
            ),
            "utf8",
          )} bytes`,
          "",
          "🔐 WhatsApp authentication",
          "credentials were NOT included.",
          "",
          "🛡️ Backup stored locally.",
        ],
      ),
      message,
    );

    return true;
  } catch (err) {
    console.error(
      "Backup error:",
      err,
    );

    await sendVortexReply(
      sock,
      jid,
      error(
        "BACKUP FAILED",
        [
          "❌ Dark Vortex could not",
          "create the configuration backup.",
          "",
          "💡 Check that the bot process",
          "has write permission.",
        ],
      ),
      message,
    );

    return true;
  }
}


/* =========================================================
   ✏️ ANTI-EDIT COMMAND
========================================================= */

async function handleAntiEditCommand(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  args: string[],
): Promise<void> {
  const action =
    args[0]?.toLowerCase() ||
    "status";

  if (!jid.endsWith("@g.us")) {
    await sendVortexReply(
      sock,
      jid,
      [
        "╭━━━〔 🌑 ᴅᴀʀᴋ ᴠᴏʀᴛᴇx 〕━━━╮",
        "┃",
        "┃  ❌ GROUP ONLY",
        "┃",
        "┃  Anti-Edit can only be",
        "┃  configured inside groups.",
        "┃",
        "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
      ].join("\n"),
      message,
    );

    return;
  }

  if (
    action === "status" ||
    action === "check"
  ) {
    const enabled =
      getAntiEditStatus(jid);

    await sendVortexReply(
      sock,
      jid,
      [
        "╭━━━〔 🌑 ᴅᴀʀᴋ ᴠᴏʀᴛᴇx 〕━━━╮",
        "┃",
        "┃  ✏️ ANTI-EDIT",
        "┃",
        `┃  Status: ${
          enabled
            ? "🟢 ENABLED"
            : "🔴 DISABLED"
        }`,
        "┃",
        "┃  Usage:",
        "┃  • .antiedit on",
        "┃  • .antiedit off",
        "┃  • .antiedit status",
        "┃",
        "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
      ].join("\n"),
      message,
    );

    return;
  }

  if (
    action !== "on" &&
    action !== "off"
  ) {
    await sendVortexReply(
      sock,
      jid,
      [
        "╭━━━〔 🌑 ᴅᴀʀᴋ ᴠᴏʀᴛᴇx 〕━━━╮",
        "┃",
        "┃  ❌ INVALID OPTION",
        "┃",
        "┃  Use:",
        "┃  • .antiedit on",
        "┃  • .antiedit off",
        "┃  • .antiedit status",
        "┃",
        "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
      ].join("\n"),
      message,
    );

    return;
  }

  const enabled =
    action === "on";

  setAntiEdit(
    jid,
    enabled,
  );

  await sendVortexReply(
    sock,
    jid,
    [
      "╭━━━〔 🌑 ᴅᴀʀᴋ ᴠᴏʀᴛᴇx 〕━━━╮",
      "┃",
      `┃  ✏️ ANTI-EDIT ${
        enabled
          ? "ENABLED"
          : "DISABLED"
      }`,
      "┃",
      enabled
        ? "┃  Edited messages will"
        : "┃  Edited-message detection",
      enabled
        ? "┃  now be detected."
        : "┃  has been disabled.",
      "┃",
      enabled
        ? "┃  Original messages will"
        : "┃  ",
      enabled
        ? "┃  be restored when possible."
        : "┃  ",
      "┃",
      "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
    ].join("\n"),
    message,
  );
}

function formatSessionDuration(
  startedAt: number | null,
): string {
  if (!startedAt) {
    return "0s";
  }

  const totalSeconds = Math.max(
    0,
    Math.floor(
      (Date.now() - startedAt) / 1000,
    ),
  );

  const days = Math.floor(
    totalSeconds / 86400,
  );

  const hours = Math.floor(
    (totalSeconds % 86400) / 3600,
  );

  const minutes = Math.floor(
    (totalSeconds % 3600) / 60,
  );

  const seconds =
    totalSeconds % 60;

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }

  if (
    seconds > 0 ||
    parts.length === 0
  ) {
    parts.push(`${seconds}s`);
  }

  return parts.join(" ");
}

function formatSessionAccount(
  account: string | null,
): string {
  if (!account) {
    return "NOT CONNECTED";
  }

  const digits =
    account.replace(/\D/g, "");

  if (digits.length <= 6) {
    return digits;
  }

  return `+${digits.slice(0, 3)}•••${digits.slice(-3)}`;
}

function formatSessionTime(
  timestamp: number | null,
): string {
  if (!timestamp) {
    return "N/A";
  }

  return new Date(timestamp).toLocaleTimeString(
    "en-NG",
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Africa/Lagos",
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
       🌑 DARK VORTEX — AUTOMATIC REPLY SYSTEM
    ===================================================== */

    const sendReply = async (
      text: string,
    ): Promise<WAMessage | undefined> => {
      return await sendVortexReply(
        sock,
        jid,
        text,
        message,
      );
    };


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
       👑 OWNER ACTIVITY / RESPONSE DETECTION
    ===================================================== */

    if (owner && fromMe) {
      markOwnerActivity();

      markOwnerResponse(
        jid,
        message,
      );
    }


    /* =====================================================
       VORTEX SECURITY CONFIRMATION — EARLY HANDLING
    ===================================================== */

    const confirmationHandled =
  await handleVortexConfirmation(
    sock,
    jid,
    sender,
    messageText,
    message,
  );

if (confirmationHandled) {
  const confirmedSecurity =
    consumeConfirmedSecurityExecution();

  if (confirmedSecurity) {
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

    if (!confirmedCommandDefinition) {
      await sendVortexReply(
        sock,
        jid,
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
        message,
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

    const securityHandled =
      await handleVortexSecurityCommand(
        sock,
        jid,
        sender,
        confirmedSecurity.command,
        confirmedSecurity.args,
        message,
      );

    if (securityHandled) {
      return;
    }

    const ownerHandled =
      await handleOwnerCommand(
        sock,
        jid,
        confirmedSecurity.command,
        confirmedSecurity.args,
        message,
      );

    if (ownerHandled) {
      return;
    }

    const toolsHandled =
      await handleVortexToolsCommand(
        sock,
        jid,
        sender,
        confirmedSecurity.command,
        confirmedSecurity.args,
        message,
      );

    if (toolsHandled) {
      return;
    }

    return;
  }

  if (confirmationHandled) {
    return;
  }
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
      if (!fromMe) {
        try {
          const detection =
            await analyzeIncomingMessage(
              sender,
              message,
            );

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
      if (owner) {
        await sendVortexReply(
          sock,
          jid,
          unknownCommand(
            requestedCommand,
          ),
          message,
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
      if (
        access === "group" ||
        access === "groupAdmin"
      ) {
        await sendPermissionDenied(
          sock,
          jid,
          access,
          message,
        );
      }

      return;
    }


    /* =====================================================
       INTERNAL BOT DETECTION
    ===================================================== */

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
        await sendVortexReply(
          sock,
          jid,
          restResult.response,
          message,
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
              await sendVortexReply(
                sock,
                jid,
                progressText,
                message,
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
          await sendVortexReply(
            sock,
            jid,
            cleanupResult.response,
            message,
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
        message,
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
          message,
        );

        return;
      }

      const helpDefinition =
        getCommand(
          requestedHelp,
        );

      if (!helpDefinition) {
        if (owner) {
          await sendVortexReply(
            sock,
            jid,
            unknownCommand(
              requestedHelp,
            ),
            message,
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

      await sendVortexReply(
        sock,
        jid,
        helpText,
        message,
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
        message,
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

      await sendVortexReply(
        sock,
        jid,
        pingResponse(
          responseMs,
        ),
        message,
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
        await sendVortexReply(
          sock,
          jid,
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
          message,
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

        await sendVortexReply(
          sock,
          jid,
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
          message,
        );

        console.log(
          `[LATENCY] ${result.latencyMs}ms | ${result.level} | ${jid}`,
        );
      } catch (err) {
        console.error(
          "[LATENCY] Measurement failed:",
          err,
        );

        await sendVortexReply(
          sock,
          jid,
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
          message,
        );
      }

      return;
    }

    /* =====================================================
       SESSION STATUS
    ===================================================== */

    if (
      command === "session"
    ) {
      const sessionStatus =
        getSessionStatus();

      const account =
        getSessionAccount();

      const pairingMode =
        getSessionPairingMode();

      const reconnects =
        getReconnectCount();

      const sessionStartedAt =
        getSessionStartedAt();

      const statusIcon =
        sessionStatus === "CONNECTED"
          ? "🟢"
          : sessionStatus === "RECONNECTING"
            ? "🟡"
            : sessionStatus === "CONNECTING"
              ? "🟡"
              : sessionStatus === "RESTING"
                ? "🟠"
                : "🔴";

      const connectionLabel =
        sessionStatus === "CONNECTED"
          ? "STABLE"
          : sessionStatus === "RECONNECTING"
            ? "RECONNECTING"
            : sessionStatus === "CONNECTING"
              ? "CONNECTING"
              : sessionStatus === "RESTING"
                ? "RESTING"
                : "OFFLINE";

      const authStatus =
        sessionStatus === "CONNECTED"
          ? "AUTHENTICATED"
          : "NOT AUTHENTICATED";

      const vxStatus =
        sessionStatus === "CONNECTED"
          ? "ACTIVE"
          : "STANDBY";

      const sessionText =
`╭─「 🌑 DARK VORTEX • SESSION 」
│
│ ${statusIcon} Status       : ${sessionStatus}
│ 🔐 Auth         : ${authStatus}
│ 📱 Account      : ${formatSessionAccount(account)}
│ 🔗 Connection   : ${connectionLabel}
│ ⏱️ Session      : ${formatSessionDuration(sessionStartedAt)}
│ 🔄 Reconnects   : ${reconnects}
│ ⚡ Pairing Mode : ${pairingMode}
│ 🛡️ VX Security  : ${vxStatus}
│
│ 🕐 Connected    : ${formatSessionTime(sessionStartedAt)}
│
╰────────────────────────
      ⚡ VORTEX TECH`;

      await sendReply(
        sessionText,
      );

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
        await sendVortexReply(
          sock,
          jid,
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
          message,
        );

        return;
      }

      try {
        const newPrefix =
          await setPrefix(
            args[0],
          );

        await sendVortexReply(
          sock,
          jid,
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
          message,
        );
      } catch (err) {
        console.error(
          "Set prefix error:",
          err,
        );

        await sendVortexReply(
          sock,
          jid,
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
          message,
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
        message,
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
        await sendVortexReply(
          sock,
          jid,
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
          message,
        );

        return;
      }

      setAwayMessage(
        awayMessage,
      );

      await sendVortexReply(
        sock,
        jid,
        success(
          "AWAY MESSAGE SAVED",
          [
            "🕐 Private away message",
            "has been updated.",
            "",
            `📝 ${awayMessage}`,
          ],
        ),
        message,
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
        await sendVortexReply(
          sock,
          jid,
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
          message,
        );

        return;
      }

      setGroupAwayMessage(
        groupAwayMessage,
      );

      await sendVortexReply(
        sock,
        jid,
        success(
          "GROUP AWAY MESSAGE SAVED",
          [
            "👥 Group away message",
            "has been updated.",
            "",
            `📝 ${groupAwayMessage}`,
          ],
        ),
        message,
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

          await sendVortexReply(
            sock,
            jid,
            success(
              "STATUS SENT",
              [
                "📱 WhatsApp Status published.",
                "",
                `📝 ${statusText}`,
              ],
            ),
            message,
          );
        } catch (err) {
          console.error(
            "Text status error:",
            err,
          );

          await sendVortexReply(
            sock,
            jid,
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
            message,
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

          await sendVortexReply(
            sock,
            jid,
            success(
              "STATUS SENT",
              [
                "🖼️ Image Status published.",
              ],
            ),
            message,
          );
        } catch (err) {
          console.error(
            "Image status error:",
            err,
          );

          await sendVortexReply(
            sock,
            jid,
            error(
              "STATUS FAILED",
              [
                "🖼️ Dark Vortex could not",
                "publish the image Status.",
              ],
            ),
            message,
          );
        }

        return;
      }

      await sendVortexReply(
        sock,
        jid,
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
        message,
      );

      return;
    }


    /* =====================================================
       👤 WHOIS
    ===================================================== */

    if (
      command === "whois"
    ) {
      await handleWhoisCommand(
        sock,
        jid,
        message,
        args,
      );

      return;
    }


    /* =====================================================
       ⚙️ SETTINGS
    ===================================================== */

    if (
      command === "settings"
    ) {
      await handleSettingsCommand(
        sock,
        jid,
        message,
        args,
      );

      return;
    }


    /* =====================================================
       ✏️ ANTI-EDIT
    ===================================================== */

    if (
      command === "antiedit"
    ) {
      await handleAntiEditCommand(
        sock,
        jid,
        message,
        args,
      );

      return;
    }


    /* =====================================================
       💾 BACKUP
    ===================================================== */

    if (
      command === "backup"
    ) {
      await handleBackupCommand(
        sock,
        jid,
        message,
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
          message,
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
        message,
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
        message,
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
        message,
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
      await sendVortexReply(
        sock,
        jid,
        unknownCommand(
          command,
        ),
        message,
      );
    }

  } catch (err) {

    console.error(
      "Command handler error:",
      err,
    );

    try {
      await sendVortexReply(
        sock,
        jid,
        internalError(
          "command",
        ),
        message,
      );
    } catch (sendError) {
      console.error(
        "Failed to send command error:",
        sendError,
      );
    }
  }
}

