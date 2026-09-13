import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import {
  vortexBox,
  POWERED_BY,
} from "../utils/message.js";

import {
  sendVortexReply,
} from "../utils/vortex-reply.js";

// ============================================================
// 🌑 DARK VORTEX — PREMIUM OWNER AVAILABILITY ENGINE
// ⚡ Powered by Vortex Tech
// ============================================================
//
// FEATURES
//
// 🕐 Automatic owner inactivity detection
// 🟢 Automatic AVAILABLE state
// 🔴 Automatic AWAY state
// 👤 Owner activity tracking
// 💬 Private-message detection
// 👥 Group mention detection
// ⌨️ WhatsApp typing/presence effect
// 🧠 Conversation-aware pending-message tracking
// 🎯 Specific owner-response detection
// 🔁 Automatic availability recovery
// ⏱️ Per-chat cooldown protection
// ⚙️ Custom away messages
//
// ============================================================


// ============================================================
// CONFIGURATION
// ============================================================

const AWAY_AFTER_MS =
  5 * 60 * 1000;

const REPLY_COOLDOWN_MS =
  5 * 60 * 1000;

const TYPING_DELAY_MS =
  1800;

const PENDING_MESSAGE_EXPIRY_MS =
  60 * 60 * 1000;


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
// OWNER AVAILABILITY STATE
// ============================================================

export type OwnerAvailability =
  | "AVAILABLE"
  | "AWAY";

let ownerAvailability:
  OwnerAvailability =
    "AVAILABLE";

let lastOwnerActivity =
  Date.now();

let lastIncomingMessage =
  0;

let lastOwnerResponse =
  0;


// ============================================================
// PENDING MESSAGE STATE
// ============================================================

export interface PendingMessage {
  key: string;
  jid: string;
  sender: string;
  messageId?: string;
  timestamp: number;
  responded: boolean;
}

const pendingMessages =
  new Map<string, PendingMessage>();


// ============================================================
// REPLY COOLDOWNS
// ============================================================

const replyCooldowns =
  new Map<string, number>();


// ============================================================
// CUSTOM MESSAGES
// ============================================================

let awayMessage =
  DEFAULT_AWAY_MESSAGE;

let groupAwayMessage =
  DEFAULT_GROUP_MESSAGE;


// ============================================================
// JID NORMALIZATION
// ============================================================

function normalizeJid(
  jid: string,
): string {
  return jid
    .split(":")[0]
    .trim()
    .toLowerCase();
}


// ============================================================
// CONVERSATION KEY
// ============================================================

function createConversationKey(
  jid: string,
  sender: string,
): string {
  return (
    `${normalizeJid(jid)}:${normalizeJid(sender)}`
  );
}


// ============================================================
// OWNER JID MATCHING
// ============================================================

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
// REGISTER INCOMING MESSAGE
// ============================================================

function registerPendingMessage(
  jid: string,
  sender: string,
  messageId?: string,
): void {
  const key =
    createConversationKey(
      jid,
      sender,
    );

  pendingMessages.set(
    key,
    {
      key,
      jid,
      sender,
      messageId,
      timestamp: Date.now(),
      responded: false,
    },
  );

  lastIncomingMessage =
    Date.now();
}


// ============================================================
// MARK SPECIFIC CONVERSATION RESPONDED
// ============================================================

export function markOwnerResponse(
  jid: string,
  message: WAMessage,
): void {
  lastOwnerResponse =
    Date.now();

  /*
   * ----------------------------------------------------------
   * PRIVATE CHAT
   * ----------------------------------------------------------
   *
   * In a private chat, the remote JID identifies the person.
   */

  if (!jid.endsWith("@g.us")) {
    const key =
      createConversationKey(
        jid,
        jid,
      );

    const pending =
      pendingMessages.get(key);

    if (pending) {
      pending.responded =
        true;

      console.log(
        `🟢 [AWAY] Owner responded to ${jid}`,
      );
    }

    return;
  }


  /*
   * ----------------------------------------------------------
   * GROUP CHAT
   * ----------------------------------------------------------
   *
   * If the owner replied to a quoted message,
   * contextInfo.participant identifies exactly
   * who the owner replied to.
   */

  const context =
    message.message
      ?.extendedTextMessage
      ?.contextInfo;

  const quotedParticipant =
    context?.participant;

  if (quotedParticipant) {
    const key =
      createConversationKey(
        jid,
        quotedParticipant,
      );

    const pending =
      pendingMessages.get(key);

    if (pending) {
      pending.responded =
        true;

      console.log(
        `🟢 [AWAY] Owner responded to ${quotedParticipant} in ${jid}`,
      );

      return;
    }
  }

  /*
   * ----------------------------------------------------------
   * UNQUOTED GROUP MESSAGE
   * ----------------------------------------------------------
   *
   * We intentionally do NOT mark every pending person
   * as responded.
   *
   * We only know that the owner was active.
   */
}


// ============================================================
// GET PENDING AWAY MESSAGES
// ============================================================

export function getPendingAwayMessages():
  PendingMessage[] {
  cleanupExpiredPendingMessages();

  return Array.from(
    pendingMessages.values(),
  ).filter(
    (pending) =>
      !pending.responded,
  );
}


// ============================================================
// OWNER ACTIVITY
// ============================================================

/**
 * Called when the actual owner sends a WhatsApp message.
 *
 * IMPORTANT:
 * This does NOT mark pending conversations as responded.
 *
 * Response detection is handled separately by
 * markOwnerResponse().
 */
export function markOwnerActivity(): void {
  lastOwnerActivity =
    Date.now();

  if (
    ownerAvailability !==
    "AVAILABLE"
  ) {
    ownerAvailability =
      "AVAILABLE";

    console.log(
      "🟢 [AWAY] Owner is active again.",
    );
  }
}


// ============================================================
// AWAY DURATION
// ============================================================

export function getAwayDuration(): number {
  return (
    Date.now() -
    lastOwnerActivity
  );
}


// ============================================================
// LAST INCOMING MESSAGE
// ============================================================

export function getLastIncomingMessage(): number {
  return lastIncomingMessage;
}


// ============================================================
// LAST OWNER RESPONSE
// ============================================================

export function getLastOwnerResponse(): number {
  return lastOwnerResponse;
}


// ============================================================
// AVAILABILITY ENGINE
// ============================================================

export function updateOwnerAvailability():
  OwnerAvailability {

  const inactiveFor =
    getAwayDuration();

  if (
    inactiveFor >=
    AWAY_AFTER_MS
  ) {
    if (
      ownerAvailability !==
      "AWAY"
    ) {
      ownerAvailability =
        "AWAY";

      console.log(
        "🔴 [AWAY] Owner inactivity threshold reached.",
      );
    }
  } else {
    ownerAvailability =
      "AVAILABLE";
  }

  return ownerAvailability;
}


// ============================================================
// GET OWNER AVAILABILITY
// ============================================================

export function getOwnerAvailability():
  OwnerAvailability {
  return updateOwnerAvailability();
}


// ============================================================
// FORCE AWAY
// ============================================================

export function forceAway(): void {
  lastOwnerActivity =
    Date.now() -
    AWAY_AFTER_MS -
    1000;

  ownerAvailability =
    "AWAY";

  console.log(
    "🔴 [AWAY] Owner manually forced into Away mode.",
  );
}


// ============================================================
// FORCE AVAILABLE
// ============================================================

export function forceAvailable(): void {
  markOwnerActivity();
}


// ============================================================
// OWNER STATE CHECKS
// ============================================================

export function isOwnerAway(): boolean {
  return (
    updateOwnerAvailability() ===
    "AWAY"
  );
}

export function isOwnerAvailable(): boolean {
  return (
    updateOwnerAvailability() ===
    "AVAILABLE"
  );
}


// ============================================================
// MESSAGE TEXT
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
// TYPING EFFECT
// ============================================================

async function showTypingEffect(
  sock: WASocket,
  jid: string,
): Promise<void> {

  try {
    await sock.sendPresenceUpdate(
      "composing",
      jid,
    );

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          TYPING_DELAY_MS,
        ),
    );

    await sock.sendPresenceUpdate(
      "paused",
      jid,
    );

  } catch (error) {

    console.error(
      "⚠️ [AWAY] Typing effect failed:",
      error,
    );
  }
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
// PROCESS AWAY
// ============================================================

export async function processAway(
  sock: WASocket,
  message: WAMessage,
  ownerNumber: string,
  deliveryJid?: string,
): Promise<boolean> {

  /*
   * Never process the bot's own outgoing message.
   */
  if (message.key.fromMe) {
    return false;
  }


  /*
   * Refresh availability.
   */
  updateOwnerAvailability();


  /*
   * Owner is currently available.
   */
  if (
    ownerAvailability !==
    "AWAY"
  ) {
    return false;
  }


  /*
   * Determine chat.
   */
  const remoteJid =
    deliveryJid ||
    message.key.remoteJid;

  if (!remoteJid) {
    return false;
  }


  /*
   * Ignore WhatsApp status.
   */
  if (
    remoteJid ===
    "status@broadcast"
  ) {
    return false;
  }


  /*
   * Determine group/private.
   */
  const isGroup =
    remoteJid.endsWith(
      "@g.us",
    );


  /*
   * Groups only trigger Away when
   * the owner is mentioned.
   */
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


  /*
   * Determine sender.
   */
  const sender =
    message.key.participant ||
    message.key.remoteJid ||
    "";

  if (!sender) {
    return false;
  }


  /*
   * Never reply to the owner.
   */
  if (
    jidMatchesOwner(
      sender,
      ownerNumber,
    )
  ) {
    return false;
  }


  /*
   * Register the exact conversation.
   */
  registerPendingMessage(
    remoteJid,
    sender,
    message.key.id ||
      undefined,
  );


  /*
   * Cooldown key.
   */
  const cooldownKey =
    isGroup
      ? createConversationKey(
          remoteJid,
          sender,
        )
      : normalizeJid(
          remoteJid,
        );


  /*
   * Respect cooldown.
   */
  if (
    isOnCooldown(
      cooldownKey,
    )
  ) {
    return false;
  }


  /*
   * Typing + response.
   */
  try {

    console.log(
      `⌨️ [AWAY] Typing to ${cooldownKey}`,
    );


    await showTypingEffect(
      sock,
      remoteJid,
    );


    const text =
      isGroup
        ? groupAwayMessage
        : awayMessage;


    await sendVortexReply(
      sock,
      remoteJid,
      text,
      message,
    );


    setCooldown(
      cooldownKey,
    );


    console.log(
      `🤖 [AWAY] Reply sent to ${cooldownKey}`,
    );


    return true;

  } catch (error) {

    console.error(
      "❌ [AWAY] Reply failed:",
      error,
    );

    try {
      await sock.sendPresenceUpdate(
        "paused",
        remoteJid,
      );
    } catch {
      // Ignore presence cleanup failure.
    }

    return false;
  }
}


// ============================================================
// CLEAN EXPIRED PENDING MESSAGES
// ============================================================

function cleanupExpiredPendingMessages(): void {

  const now =
    Date.now();

  for (
    const [
      key,
      pending,
    ] of pendingMessages
  ) {

    if (
      now -
        pending.timestamp >
      PENDING_MESSAGE_EXPIRY_MS
    ) {
      pendingMessages.delete(
        key,
      );
    }
  }
}


// ============================================================
// OWNER STATUS
// ============================================================

export function getOwnerStatus(): {
  availability: OwnerAvailability;
  away: boolean;
  inactiveFor: number;
  lastOwnerActivity: number;
  lastIncomingMessage: number;
  lastOwnerResponse: number;
  pendingMessages: number;
} {

  updateOwnerAvailability();

  cleanupExpiredPendingMessages();

  let pendingCount =
    0;

  for (
    const pending of
      pendingMessages.values()
  ) {

    if (
      !pending.responded
    ) {
      pendingCount++;
    }
  }

  return {

    availability:
      ownerAvailability,

    away:
      ownerAvailability ===
      "AWAY",

    inactiveFor:
      getAwayDuration(),

    lastOwnerActivity,

    lastIncomingMessage,

    lastOwnerResponse,

    pendingMessages:
      pendingCount,
  };
}


// ============================================================
// PERIODIC CLEANUP
// ============================================================

setInterval(
  () => {

    const now =
      Date.now();


    // --------------------------------------------------------
    // Cooldowns
    // --------------------------------------------------------

    for (
      const [
        jid,
        timestamp,
      ] of replyCooldowns
    ) {

      if (
        now -
          timestamp >=
        REPLY_COOLDOWN_MS
      ) {
        replyCooldowns.delete(
          jid,
        );
      }
    }


    // --------------------------------------------------------
    // Pending conversations
    // --------------------------------------------------------

    cleanupExpiredPendingMessages();


    // --------------------------------------------------------
    // Availability
    // --------------------------------------------------------

    updateOwnerAvailability();

  },
  60 * 1000,
);


// ============================================================
// BRAND REFERENCE
// ============================================================

void POWERED_BY;