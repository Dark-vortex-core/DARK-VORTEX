
import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import {
  vortexBox,
  POWERED_BY,
} from "../utils/message.js";

// ============================================================
// 🌑 DARK VORTEX — PREMIUM AWAY SYSTEM
// ⚡ Powered by Vortex Tech
// ============================================================
//
// Features:
//   🕐 Owner inactivity detection
//   💬 Private away replies
//   👥 Group mention-based away replies
//   ⏱️ Per-chat cooldown protection
//   ⚙️ Custom away messages
//
// ============================================================

const AWAY_AFTER_MS =
  15 * 60 * 1000;

const REPLY_COOLDOWN_MS =
  30 * 60 * 1000;

// ============================================================
// DEFAULT MESSAGES
// ============================================================

const DEFAULT_AWAY_MESSAGE =
  vortexBox(
    "🕐 OWNER AWAY",
    [
      "🤖 Hey there!",
      "",
      "Brian is currently away",
      "and may not be available",
      "to respond right now.",
      "",
      "🌑 I'm Dark Vortex,",
      "his personal assistant.",
      "",
      "📨 Your message has been",
      "noticed and Brian can",
      "get back to you when",
      "he's available.",
      "",
      "⚡ Thanks for your patience.",
    ],
  );

const DEFAULT_GROUP_MESSAGE =
  vortexBox(
    "🕐 OWNER AWAY",
    [
      "🤖 Hey!",
      "",
      "Brian is currently away",
      "and may not be available",
      "to respond right now.",
      "",
      "🌑 Dark Vortex is currently",
      "online as his assistant.",
      "",
      "📨 Brian will get back to",
      "you when he's available.",
    ],
  );

// ============================================================
// STATE
// ============================================================

let lastOwnerActivity =
  Date.now();

const replyCooldowns =
  new Map<string, number>();

let awayMessage =
  DEFAULT_AWAY_MESSAGE;

let groupAwayMessage =
  DEFAULT_GROUP_MESSAGE;

// ============================================================
// OWNER ACTIVITY
// ============================================================

export function markOwnerActivity(): void {
  lastOwnerActivity =
    Date.now();
}

export function getAwayDuration(): number {
  return (
    Date.now() -
    lastOwnerActivity
  );
}

export function forceAway(): void {
  lastOwnerActivity =
    Date.now() -
    AWAY_AFTER_MS -
    1000;
}

export function isOwnerAway(): boolean {
  return (
    getAwayDuration() >=
    AWAY_AFTER_MS
  );
}

// ============================================================
// MESSAGE HELPERS
// ============================================================

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
    content.extendedTextMessage
      ?.text
  ) {
    return (
      content
        .extendedTextMessage
        .text
    );
  }

  if (
    content.imageMessage
      ?.caption
  ) {
    return (
      content
        .imageMessage
        .caption
    );
  }

  if (
    content.videoMessage
      ?.caption
  ) {
    return (
      content
        .videoMessage
        .caption
    );
  }

  if (
    content.documentMessage
      ?.caption
  ) {
    return (
      content
        .documentMessage
        .caption
    );
  }

  return "";
}

// ============================================================
// OWNER JID MATCHING
// ============================================================

function normalizeJid(
  jid: string,
): string {
  return jid
    .split(":")[0]
    .trim()
    .toLowerCase();
}

function jidMatchesOwner(
  jid: string,
  ownerNumber: string,
): boolean {
  const normalized =
    normalizeJid(jid);

  const cleanNumber =
    ownerNumber.replace(
      /\D/g,
      "",
    );

  return (
    normalized ===
    `${cleanNumber}@s.whatsapp.net`
  );
}

// ============================================================
// OWNER MENTION DETECTION
// ============================================================

function isOwnerMentioned(
  message: WAMessage,
  ownerNumber: string,
): boolean {
  const context =
    message.message
      ?.extendedTextMessage
      ?.contextInfo;

  const mentionedJids =
    context?.mentionedJid || [];

  if (
    mentionedJids.some(
      (jid) =>
        jidMatchesOwner(
          jid,
          ownerNumber,
        ),
    )
  ) {
    return true;
  }

  const text =
    getMessageText(message);

  const cleanNumber =
    ownerNumber.replace(
      /\D/g,
      "",
    );

  const mentionPattern =
    new RegExp(
      `@${cleanNumber}\\b`,
      "i",
    );

  return mentionPattern.test(
    text,
  );
}

// ============================================================
// COOLDOWN
// ============================================================

function isOnCooldown(
  jid: string,
): boolean {
  const lastReply =
    replyCooldowns.get(jid);

  if (!lastReply) {
    return false;
  }

  const elapsed =
    Date.now() -
    lastReply;

  if (
    elapsed >=
    REPLY_COOLDOWN_MS
  ) {
    replyCooldowns.delete(
      jid,
    );

    return false;
  }

  return true;
}

function setCooldown(
  jid: string,
): void {
  replyCooldowns.set(
    jid,
    Date.now(),
  );
}

// ============================================================
// AWAY MESSAGE CONFIGURATION
// ============================================================

export function setAwayMessage(
  message: string,
): void {
  const trimmed =
    message.trim();

  if (!trimmed) {
    return;
  }

  awayMessage =
    trimmed;
}

export function getAwayMessage(): string {
  return awayMessage;
}

export function getGroupAwayMessage(): string {
  return groupAwayMessage;
}

export function setGroupAwayMessage(
  message: string,
): void {
  const trimmed =
    message.trim();

  if (!trimmed) {
    return;
  }

  groupAwayMessage =
    trimmed;
}

// ============================================================
// PROCESS AWAY REPLY
// ============================================================

export async function processAway(
  sock: WASocket,
  message: WAMessage,
  ownerNumber: string,
): Promise<boolean> {
  // ----------------------------------------------------------
  // Ignore messages sent by the bot/owner itself
  // ----------------------------------------------------------

  if (message.key.fromMe) {
    markOwnerActivity();
    return false;
  }

  // ----------------------------------------------------------
  // If owner is still active, do nothing
  // ----------------------------------------------------------

  if (!isOwnerAway()) {
    return false;
  }

  // ----------------------------------------------------------
  // Determine remote chat
  // ----------------------------------------------------------

  const remoteJid =
    message.key.remoteJid;

  if (!remoteJid) {
    return false;
  }

  // ----------------------------------------------------------
  // Never reply to WhatsApp status
  // ----------------------------------------------------------

  if (
    remoteJid ===
    "status@broadcast"
  ) {
    return false;
  }

  // ----------------------------------------------------------
  // Determine DM or group
  // ----------------------------------------------------------

  const isGroup =
    remoteJid.endsWith(
      "@g.us",
    );

  // ----------------------------------------------------------
  // Groups require owner mention
  // ----------------------------------------------------------

  if (isGroup) {
    if (
      !isOwnerMentioned(
        message,
        ownerNumber,
      )
    ) {
      return false;
    }
  }

  // ----------------------------------------------------------
  // Determine sender
  // ----------------------------------------------------------

  const sender =
    message.key.participant ||
    message.key.remoteJid ||
    "";

  if (!sender) {
    return false;
  }

  // ----------------------------------------------------------
  // Never reply to owner
  // ----------------------------------------------------------

  if (
    jidMatchesOwner(
      sender,
      ownerNumber,
    )
  ) {
    return false;
  }

  // ----------------------------------------------------------
  // Cooldown protection
  // ----------------------------------------------------------

  const cooldownKey =
    isGroup
      ? `${remoteJid}:${sender}`
      : remoteJid;

  if (
    isOnCooldown(
      cooldownKey,
    )
  ) {
    return false;
  }

  // ----------------------------------------------------------
  // Send away message
  // ----------------------------------------------------------

  try {
    const text =
      isGroup
        ? groupAwayMessage
        : awayMessage;

    await sock.sendMessage(
      remoteJid,
      {
        text,
      },
    );

    setCooldown(
      cooldownKey,
    );

    console.log(
      `🤖 Away reply sent to ${cooldownKey}`,
    );

    return true;
  } catch (err) {
    console.error(
      "❌ Away reply failed:",
      err,
    );

    return false;
  }
}

// ============================================================
// CLEAN EXPIRED COOLDOWNS
// ============================================================

setInterval(
  () => {
    const now =
      Date.now();

    for (
      const [
        jid,
        timestamp,
      ] of replyCooldowns
    ) {
      if (
        now - timestamp >=
        REPLY_COOLDOWN_MS
      ) {
        replyCooldowns.delete(
          jid,
        );
      }
    }
  },
  10 * 60 * 1000,
);

// Keep the shared brand export referenced in this module
// so the branding layer remains available for future
// away-system extensions.
void POWERED_BY;

