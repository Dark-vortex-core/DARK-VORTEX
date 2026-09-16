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
  resolveIdentity,
} from "../utils/identity.js";

import {
  generateNigerianMeme,
  generateRandomNigerianMeme,
} from "../utils/nigerian-meme-generator.js";

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
  enforceAutomaticBotDetection,
} from "../commands/protection.js";

import {
  sendTextStatus,
  sendImageStatus,
} from "../services/status.js";

import {
  sendGroupStatusFromReply,
} from "../services/group-status.js";

import {
  getGroupStatusState,
  setGroupStatusBlocked,
} from "../services/group-status-control.js";

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
  pingResponse,
  unknownCommand,
  internalError,
  formatUptime,
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

   Central command router.

   Response standard:
   • Concise
   • Readable
   • Every normal command reply quotes the trigger
   • Progress/edit messages remain direct edits
   • Media responses remain direct media sends
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
  ramUsage: string;
  memory: string;
  groups: number;
  botName: string;
}


function getPlatformName(): string {
  switch (process.platform) {
    case "win32":
      return "Windows";

    case "darwin":
      return "macOS";

    case "linux":
      return "Linux";

    case "android":
      return "Android";

    default:
      return process.platform;
  }
}


async function getMenuSystemInfo(
  sock: WASocket,
): Promise<MenuSystemInfo> {
  const totalMemory =
    os.totalmem();

  const freeMemory =
    os.freemem();

  const usedMemory =
    Math.max(
      0,
      totalMemory - freeMemory,
    );

  const ramPercent =
    totalMemory > 0
      ? Math.round(
          (usedMemory / totalMemory) * 100,
        )
      : 0;

  const processMemory =
    process.memoryUsage().rss;

  const version =
    await getBotVersion();

  let groups = 0;

  try {
    const participatingGroups =
      await sock.groupFetchAllParticipating();

    groups =
      Object.keys(
        participatingGroups,
      ).length;
  } catch (err) {
    console.error(
      "Menu group count error:",
      err,
    );
  }

  return {
    owner:
      getOwnerDisplay(),

    mode:
      config.mode.toUpperCase(),

    prefix:
      getPrefix(),

    version:
      version.startsWith("v")
        ? version
        : `v${version}`,

    platform:
      getPlatformName(),

    status:
      "● Online",

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

    ramUsage:
      `${(
        usedMemory /
        1024 /
        1024 /
        1024
      ).toFixed(1)} GB / ${(
        totalMemory /
        1024 /
        1024 /
        1024
      ).toFixed(1)} GB`,

    memory:
      `${(
        processMemory /
        1024 /
        1024
      ).toFixed(0)} MB`,

    groups,

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
    "🌑 DARK VORTEX",
    "",
    `Command: ${prefix}${command.name}`,
    `Category: ${categoryLabel}`,
    `Access: ${access || "public"}`,
    "",
    command.description,
    "",
    `Usage: ${prefix}${usage}`,
    `Aliases: ${aliases}`,
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
   CATEGORY MENU
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
   VX MENU
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
   COMMAND COUNT
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

  sections.push(
    [
      "🌑 DARK VORTEX",
      "",
      "Hey, Owner.",
      "Your control panel is ready.",
      "",
      "╭─「 SYSTEM STATUS 」────",
      `│ Status   : ${systemInfo.status}`,
      `│ Platform : ${systemInfo.platform}`,
      `│ Memory   : ${systemInfo.memory}`,
      `│ RAM      : ${systemInfo.ramBar} ${systemInfo.ramPercent}%`,
      `│            ${systemInfo.ramUsage}`,
      `│ Version  : ${systemInfo.version}`,
      `│ Runtime  : ${systemInfo.uptime}`,
      `│ Groups   : ${systemInfo.groups}`,
      "╰───────────────────────",
    ].join("\n"),
  );

  const categories = [
    "core",
    "owner",
    "group",
    "groupTools",
    "moderation",
    "security",
    "automation",
    "away",
  ] as const;

  for (
    const categoryId of categories
  ) {
    const category =
      getCategory(
        categoryId,
      );

    if (!category) {
      continue;
    }

    const commands =
      getCommandsByCategory(
        categoryId,
      ).filter(
        (command) =>
          !command.hidden &&
          !isVxCommand(
            command.name,
          ),
      );

    if (!commands.length) {
      continue;
    }

    sections.push(
      [
        `╭─「 ${category.icon} ${category.name.toUpperCase()} 」`,
        ...commands.map(
          (command) =>
            `│ ${prefix}${command.name}`,
        ),
        "╰───────────────────────",
      ].join("\n"),
    );
  }

  const vxCommands =
    getCommands()
      .filter(
        (command) =>
          !command.hidden &&
          isVxCommand(
            command.name,
          ),
      );

  if (vxCommands.length) {
    sections.push(
      [
        "╭─「 🧠 VX SECURITY 」",
        ...vxCommands.map(
          (command) =>
            `│ ${prefix}${command.name}`,
        ),
        "╰───────────────────────",
      ].join("\n"),
    );
  }

  sections.push(
    [
      "╭─「 COMMAND GUIDE 」────",
      `│ ${prefix}menu`,
      `│ ${prefix}help <command>`,
      "│",
      `│ ${getVisibleCommandCount()} commands available`,
      "╰───────────────────────",
    ].join("\n"),
  );

  sections.push(
    "╰─── ⚡ VORTEX TECH ───╯",
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
    await getMenuSystemInfo(
      sock,
    );

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
      [
        "🕐 Away status",
        "",
        `Status: ${
          isOwnerAway()
            ? "AWAY"
            : "ACTIVE"
        }`,
        `Inactive: ${duration} minutes`,
        "",
        "Commands:",
        `${getPrefix()}away on`,
        `${getPrefix()}away off`,
        `${getPrefix()}setaway <message>`,
        `${getPrefix()}setgroupaway <message>`,
      ].join("\n"),
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
        [
          "🕐 Away mode",
          "",
          "Automatic away mode is enabled.",
          "It activates after 15 minutes.",
        ].join("\n"),
        quotedMessage,
      );

      return true;
    }

    await sendVortexReply(
      sock,
      jid,
      [
        "🕐 Away mode enabled.",
        "",
        "Status: AWAY",
        "Dark Vortex will use your away message.",
      ].join("\n"),
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
      [
        "🕐 Away mode disabled.",
        "",
        "Status: ACTIVE",
      ].join("\n"),
      quotedMessage,
    );

    return true;
  }

  await sendVortexReply(
    sock,
    jid,
    [
      "🕐 Away commands",
      "",
      `${getPrefix()}away`,
      `${getPrefix()}away status`,
      `${getPrefix()}away on`,
      `${getPrefix()}away off`,
      `${getPrefix()}setaway <message>`,
      `${getPrefix()}setgroupaway <message>`,
    ].join("\n"),
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
  _access: CommandAccess,
  context: AccessContext,
): boolean {
  /*
   * GLOBAL OWNER-ONLY LOCK.
   *
   * Do not change this behavior.
   */

  if (!context.owner) {
    return false;
  }

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
    "🛡️ Command unavailable.",
    "",
    "This command can only be used inside groups.",
  ];

  if (
    access === "groupAdmin"
  ) {
    lines.push(
      "",
      "Group administrator permission is required.",
    );
  }

  await sendVortexReply(
    sock,
    jid,
    lines.join("\n"),
    quotedMessage,
  );
}


/* =========================================================
   WHOIS — TARGET
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
   WHOIS — PHONE
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
   WHOIS
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
      [
        "👤 WHOIS",
        "",
        "This command can only be used inside a group.",
      ].join("\n"),
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

    if (raw.includes("@")) {
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
      [
        "👤 WHOIS",
        "",
        `Usage: ${getPrefix()}whois @user`,
        `Or reply to a member's message with ${getPrefix()}whois`,
      ].join("\n"),
      message,
    );

    return true;
  }

  try {
    const metadata =
      await sock.groupMetadata(jid);

    const normalizedTarget =
      normalizeJid(targetJid);

    const participant =
      metadata.participants.find(
        (item) => {
          const identifiers = [
            item.id,
            (item as {
              lid?: string;
            }).lid,
            (item as {
              phoneNumber?: string;
            }).phoneNumber,
          ]
            .filter(
              (
                value,
              ): value is string =>
                typeof value ===
                  "string" &&
                value.trim().length > 0,
            )
            .map(
              (value) =>
                normalizeJid(
                  value,
                ),
            );

          return identifiers.includes(
            normalizedTarget,
          );
        },
      );

    if (!participant) {
      await sendVortexReply(
        sock,
        jid,
        [
          "👤 Member not found.",
          "",
          "The selected account is not in this group.",
        ].join("\n"),
        message,
      );

      return true;
    }

    const participantJid =
      normalizeJid(
        participant.id,
      );

    const identity =
      await resolveIdentity(
        sock,
        participantJid,
        jid,
        undefined,
      );

    const phone =
      identity.phone ??
      "UNKNOWN";

    const role =
      participant.admin ===
        "superadmin"
        ? "GROUP OWNER"
        : participant.admin ===
            "admin"
          ? "ADMIN"
          : "MEMBER";

    const botJid =
      normalizeJid(
        sock.user?.id,
      );

    const botLid =
      normalizeJid(
        sock.user?.lid,
      );

    const participantLid =
      normalizeJid(
        (
          participant as {
            lid?: string;
          }
        ).lid,
      );

    const isBot =
      participantJid ===
        botJid ||
      participantJid ===
        botLid ||
      (
        participantLid &&
        participantLid ===
          botLid
      );

    await sendVortexReply(
      sock,
      jid,
      [
        "👤 WHOIS",
        "",
        `Name: ${identity.name}`,
        `Number: ${phone}`,
        `Role: ${role}`,
        `Status: ${
          isBot
            ? "DARK VORTEX"
            : "GROUP MEMBER"
        }`,
        `JID: ${identity.jid}`,
        "",
        `Admin: ${
          participant.admin
            ? "YES"
            : "NO"
        }`,
        `Bot: ${
          isBot
            ? "YES"
            : "NO"
        }`,
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
      [
        "❌ WHOIS failed.",
        "",
        "Unable to inspect that group member.",
        "Try again in a moment.",
      ].join("\n"),
      message,
    );

    return true;
  }
}

/* =========================================================
   SETTINGS
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
      [
        "⚙️ Settings",
        "",
        `${getPrefix()}settings`,
        `${getPrefix()}settings bot`,
        `${getPrefix()}settings owner`,
        `${getPrefix()}settings system`,
        `${getPrefix()}settings security`,
      ].join("\n"),
      message,
    );

    return true;
  }

  const version =
    await getBotVersion();

  const lines: string[] = [
    "⚙️ DARK VORTEX SETTINGS",
    "",
  ];

  if (
    section === "all" ||
    section === "bot"
  ) {
    lines.push(
      "Bot",
      `Name: ${config.botName}`,
      `Mode: ${String(config.mode).toUpperCase()}`,
      `Prefix: ${getPrefix()}`,
      `Version: ${version}`,
      "",
    );
  }

  if (
    section === "all" ||
    section === "owner"
  ) {
    lines.push(
      "Owner",
      `Number: ${getOwnerDisplay()}`,
      "Access: OWNER ONLY",
      "",
    );
  }

  if (
    section === "all" ||
    section === "system"
  ) {
    lines.push(
      "System",
      `Platform: ${process.platform}`,
      `Host: ${os.hostname()}`,
      `Node: ${process.version}`,
      `Timezone: ${config.timezone}`,
      `Uptime: ${formatUptime(process.uptime())}`,
      "",
    );
  }

  if (
    section === "all" ||
    section === "security"
  ) {
    lines.push(
      "Security",
      "Command Access: REGISTRY",
      "Owner Lock: ACTIVE",
      "VX Layer: ACTIVE",
      "Protection: ACTIVE",
      "",
    );
  }

  lines.push(
    "Configuration is protected.",
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
   BACKUP
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

    const serialized =
      JSON.stringify(
        backupData,
        null,
        2,
      );

    await writeFile(
      backupPath,
      serialized,
      "utf8",
    );

    await sendVortexReply(
      sock,
      jid,
      [
        "💾 Backup created.",
        "",
        `File: ${backupFile}`,
        `Size: ${Buffer.byteLength(
          serialized,
          "utf8",
        )} bytes`,
        "",
        "WhatsApp authentication credentials were not included.",
      ].join("\n"),
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
      [
        "❌ Backup failed.",
        "",
        "The configuration backup could not be created.",
        "Check write permissions and try again.",
      ].join("\n"),
      message,
    );

    return true;
  }
}


/* =========================================================
   ANTI-EDIT
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
        "✏️ Anti-edit",
        "",
        "This command can only be configured inside groups.",
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
        "✏️ Anti-edit",
        "",
        `Status: ${enabled ? "ENABLED" : "DISABLED"}`,
        "",
        `Use ${getPrefix()}antiedit on`,
        `Use ${getPrefix()}antiedit off`,
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
        "✏️ Anti-edit",
        "",
        `Use ${getPrefix()}antiedit on`,
        `Use ${getPrefix()}antiedit off`,
        `Use ${getPrefix()}antiedit status`,
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
      `✏️ Anti-edit ${enabled ? "enabled" : "disabled"}.`,
      "",
      enabled
        ? "Edited messages will be detected and restored when possible."
        : "Edited-message detection has been disabled.",
    ].join("\n"),
    message,
  );
}


/* =========================================================
   SESSION FORMATTERS
========================================================= */

function formatSessionDuration(
  startedAt: number | null,
): string {
  if (!startedAt) {
    return "0s";
  }

  const totalSeconds =
    Math.max(
      0,
      Math.floor(
        (Date.now() - startedAt) / 1000,
      ),
    );

  const days =
    Math.floor(
      totalSeconds / 86400,
    );

  const hours =
    Math.floor(
      (totalSeconds % 86400) / 3600,
    );

  const minutes =
    Math.floor(
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
    account.replace(
      /\D/g,
      "",
    );

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
    const sendReply = async (
      responseText: string,
    ): Promise<WAMessage | undefined> => {
      return await sendVortexReply(
        sock,
        jid,
        responseText,
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
       OWNER ACTIVITY
    ===================================================== */

    if (
      owner &&
      fromMe
    ) {
      markOwnerActivity();

      markOwnerResponse(
        jid,
        message,
      );
    }


    /* =====================================================
       SECURITY CONFIRMATION
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
            [
              "❌ Confirmation failed.",
              "",
              `Command: ${confirmedSecurity.command}`,
              "The command is no longer registered.",
            ].join("\n"),
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
            const identity =
  await resolveIdentity(
    sock,
    sender,
    jid,
    message.pushName,
  );

const displayTarget =
  identity.name === "Unknown User"
    ? "Unknown User"
    : identity.name;

await sendVortexReply(
  sock,
  jid,
  formatBotDetectionAlert(
    detection,
    displayTarget,
  ),
  message,
  {
    mentions: [sender],
  } as any,
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
       COMMAND REGISTRY
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
       AUTOMATIC BOT DETECTION
    ===================================================== */

    if (!fromMe) {
      try {
        const botDetection =
          await analyzeIncomingMessage(
            sender,
            message,
          );

        if (botDetection) {
          await enforceAutomaticBotDetection(
            sock,
            jid,
            message,
            sender,
            botDetection,
          );
        }
      } catch (detectorError) {
        console.error(
          "[DARK VORTEX] Automatic bot detection error:",
          detectorError,
        );
      }
    }


    /* =====================================================
       REST MODE
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
          Date.now() - start,
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
       LATENCY
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
        const progress =
          await sendVortexReply(
            sock,
            jid,
            [
              "⚡ DARK VORTEX",
              "",
              "Measuring WhatsApp latency...",
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
            Date.now() - startedAt,
          );

        const resultText =
          [
            "⚡ Latency result",
            "",
            `${getLatencyIcon(result.level)} ${result.latencyMs}ms`,
            `Level: ${result.level}`,
            `Socket: ${
              result.connected
                ? "CONNECTED"
                : "DISCONNECTED"
            }`,
            `Handler: ${detectorTime}ms`,
            "",
            getLatencyDescription(
              result.level,
            ),
          ].join("\n");

        if (progress) {
          try {
            await sock.sendMessage(
              jid,
              {
                text:
                  resultText,
                edit:
                  progress.key,
              },
            );
          } catch {
            await sendVortexReply(
              sock,
              jid,
              resultText,
              message,
            );
          }
        }

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
          [
            "❌ Latency check failed.",
            "",
            `Socket: ${
              sock.user?.id
                ? "CONNECTED"
                : "DISCONNECTED"
            }`,
            "Try again in a moment.",
          ].join("\n"),
          message,
        );
      }

      return;
    }


    /* =====================================================
       SESSION
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

      await sendReply(
        [
          "🌑 DARK VORTEX • SESSION",
          "",
          `${statusIcon} Status: ${sessionStatus}`,
          `🔐 Auth: ${authStatus}`,
          `📱 Account: ${formatSessionAccount(account)}`,
          `🔗 Connection: ${connectionLabel}`,
          `⏱️ Duration: ${formatSessionDuration(sessionStartedAt)}`,
          `🔄 Reconnects: ${reconnects}`,
          `⚡ Pairing: ${pairingMode}`,
          `🛡️ VX: ${vxStatus}`,
          `🕐 Connected: ${formatSessionTime(sessionStartedAt)}`,
        ].join("\n"),
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
          [
            "🔧 Prefix settings",
            "",
            `Current: ${getPrefix()}`,
            `Usage: ${getPrefix()}setprefix !`,
            "Prefix must contain 1–3 characters.",
          ].join("\n"),
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
          [
            "✅ Prefix updated.",
            "",
            `New prefix: ${newPrefix}`,
            `Example: ${newPrefix}menu`,
            "Saved permanently.",
          ].join("\n"),
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
          [
            "❌ Invalid prefix.",
            "",
            "Requirements:",
            "• 1–3 characters",
            "• No spaces",
          ].join("\n"),
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
          [
            "🕐 Set away message",
            "",
            `Usage: ${getPrefix()}setaway <message>`,
          ].join("\n"),
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
        [
          "✅ Away message saved.",
          "",
          `Message: ${awayMessage}`,
        ].join("\n"),
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
          [
            "🕐 Set group away message",
            "",
            `Usage: ${getPrefix()}setgroupaway <message>`,
          ].join("\n"),
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
        [
          "✅ Group away message saved.",
          "",
          `Message: ${groupAwayMessage}`,
        ].join("\n"),
        message,
      );

      return;
    }


    /* =====================================================
       GROUP STATUS CONTROL
    ===================================================== */

    if (
      command === "blockgcstatus"
    ) {
      if (!group) {
        await sendVortexReply(
          sock,
          jid,
          [
            "🛑 Group only.",
            "",
            "Use this command inside a WhatsApp group.",
          ].join("\n"),
          message,
        );

        return;
      }

      const action =
        (
          args[0] ||
          ""
        )
          .trim()
          .toLowerCase();

      if (
        !action ||
        action === "status"
      ) {
        const state =
          await getGroupStatusState(
            jid,
          );

        await sendVortexReply(
          sock,
          jid,
          [
            "👥 Group Status control",
            "",
            `Status: ${
              state === "BLOCKED"
                ? "BLOCKED"
                : "ALLOWED"
            }`,
            "",
            `${getPrefix()}blockgcstatus on`,
            `${getPrefix()}blockgcstatus off`,
            `${getPrefix()}blockgcstatus status`,
          ].join("\n"),
          message,
        );

        return;
      }

      if (
        action === "on" ||
        action === "enable" ||
        action === "enabled"
      ) {
        await setGroupStatusBlocked(
          jid,
          true,
        );

        await sendVortexReply(
          sock,
          jid,
          [
            "🛑 Group Status blocked.",
            "",
            "Members are now blocked from posting to this group's Group Status.",
          ].join("\n"),
          message,
        );

        return;
      }

      if (
        action === "off" ||
        action === "disable" ||
        action === "disabled"
      ) {
        await setGroupStatusBlocked(
          jid,
          false,
        );

        await sendVortexReply(
          sock,
          jid,
          [
            "🟢 Group Status allowed.",
            "",
            "Members can post to this group's Group Status again.",
          ].join("\n"),
          message,
        );

        return;
      }

      await sendVortexReply(
        sock,
        jid,
        [
          "❌ Invalid option.",
          "",
          `Usage: ${getPrefix()}blockgcstatus <on|off|status>`,
        ].join("\n"),
        message,
      );

      return;
    }


    /* =====================================================
       GROUP STATUS
    ===================================================== */

    if (
      command === "togcstatus"
    ) {
      if (!group) {
        await sendVortexReply(
          sock,
          jid,
          [
            "👥 Group only.",
            "",
            "Use this command inside a WhatsApp group.",
          ].join("\n"),
          message,
        );

        return;
      }

      try {
        const result =
          await sendGroupStatusFromReply(
            sock,
            jid,
            message,
          );

        if (!result.success) {
          await sendVortexReply(
            sock,
            jid,
            [
              "❌ Group Status failed.",
              "",
              result.error ||
                "Could not publish the Group Status.",
              "",
              `Reply to a text, photo, or video and use ${getPrefix()}togcstatus`,
            ].join("\n"),
            message,
          );

          return;
        }

        const typeLabel =
          result.type === "image"
            ? "Image"
            : result.type === "video"
              ? "Video"
              : "Text";

        await sendVortexReply(
          sock,
          jid,
          [
            "👥 Group Status published.",
            "",
            `Type: ${typeLabel}`,
            "Destination: This group",
          ].join("\n"),
          message,
        );
      } catch (err) {
        console.error(
          "[DARK VORTEX] Group Status error:",
          err,
        );

        await sendVortexReply(
          sock,
          jid,
          [
            "❌ Group Status failed.",
            "",
            "Unable to publish the Group Status.",
            "Check the WhatsApp connection and try again.",
          ].join("\n"),
          message,
        );
      }

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
            [
              "📱 Status published.",
              "",
              `Text: ${statusText}`,
            ].join("\n"),
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
            [
              "❌ Status failed.",
              "",
              "Could not publish the WhatsApp Status.",
            ].join("\n"),
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
            "🖼️ Image Status published.",
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
            [
              "❌ Status failed.",
              "",
              "Could not publish the image Status.",
            ].join("\n"),
            message,
          );
        }

        return;
      }

      await sendVortexReply(
        sock,
        jid,
        [
          "📱 WhatsApp Status",
          "",
          `Text: ${getPrefix()}status Hello everyone!`,
          `Image: Reply to an image with ${getPrefix()}status`,
        ].join("\n"),
        message,
      );

      return;
    }


    /* =====================================================
       WHOIS
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
       SETTINGS
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
       ANTI-EDIT
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
       BACKUP
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

    if (owner) {
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
       GROUP CONTROL
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

    if (group) {
      const enabled =
        await isGroupEnabled(
          jid,
        );

      if (!enabled) {
        return;
      }
    }


    /* =====================================================
       SECURITY PANEL
    ===================================================== */

    const securityPanelHandled =
      await handleSecurityPanelCommand(
        sock,
        jid,
        command,
        args,
        message,
      );

    if (
      securityPanelHandled
    ) {
      return;
    }


    /* =====================================================
       AUTOMATION
    ===================================================== */

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
        message,
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
        message,
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
        message,
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
        args,
        message,
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
       NIGERIAN MEME / JOKE GENERATOR
    ===================================================== */

    if (
      requestedCommand === "meme" ||
      requestedCommand === "joke" ||
      requestedCommand === "naija"
    ) {
      const memeInput = args.join(" ").trim();

      let response: string;

      // .joke / .naija
      if (
        requestedCommand === "joke" ||
        requestedCommand === "naija"
      ) {
        response = generateRandomNigerianMeme();
      }

      // .meme
      else if (!memeInput) {
        response = generateRandomNigerianMeme();
      }

      else {
        const normalized = memeInput
          .toLowerCase()
          .replace(/[-_]/g, " ")
          .trim();

        const styleAliases: Record<string, string> = {
          banter: "banter",
          story: "story",
          dialogue: "dialogue",
          twist: "plot_twist",
          "plot twist": "plot_twist",
          "one liner": "one_liner",
        };

        const categoryAliases: Record<string, string> = {
          random: "random",
          family: "family",
          parents: "parents",
          money: "money",
          salary: "salary",
          relationship: "relationship",
          school: "school",
          work: "work",
          transport: "transport",
          traffic: "traffic",
          power: "power",
          nepa: "power",
          phcn: "power",
          internet: "internet",
          data: "internet",
          food: "food",
          pos: "pos",
          whatsapp: "whatsapp",
          friends: "friends",
          landlord: "landlord",
          social: "social",
          lagos: "lagos",
          abuja: "abuja",
        };

        // Style command
        if (styleAliases[normalized]) {
          response = generateNigerianMeme({
            style: styleAliases[normalized] as any,
          });
        }

        // Category command
        else if (categoryAliases[normalized]) {
          response = generateNigerianMeme({
            category: categoryAliases[normalized] as any,
          });
        }

        // Unknown option
        else {
          response =
            `❌ Unknown meme category/style: ${memeInput}\n\n` +
            `Try:\n` +
            `• random\n` +
            `• banter\n` +
            `• story\n` +
            `• dialogue\n` +
            `• twist\n` +
            `• one-liner\n` +
            `• food\n` +
            `• money\n` +
            `• relationship\n` +
            `• school\n` +
            `• work\n` +
            `• traffic\n` +
            `• power\n` +
            `• WhatsApp\n` +
            `• Lagos\n` +
            `• Abuja`;
        }
      }

      await sendVortexReply(
        sock,
        jid,
        response,
        message,
      );

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