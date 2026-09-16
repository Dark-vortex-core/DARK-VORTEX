import {
  type WAMessage,
  type WASocket,
  proto,
  jidNormalizedUser,
} from "@whiskeysockets/baileys";

import {
  sendVortexReply,
} from "../utils/vortex-reply.js";

import {
  resolveMessageIdentity,
  formatIdentity,
} from "../utils/identity.js";

type AntiEditSettings = {
  enabled: boolean;
};

type StoredMessage = {
  message: WAMessage;
  storedAt: number;
};

const DEFAULT_ENABLED = false;

const MESSAGE_CACHE_TTL =
  24 * 60 * 60 * 1000;

const MAX_CACHE_SIZE = 5000;

const groupSettings =
  new Map<string, AntiEditSettings>();

const originalMessages =
  new Map<string, StoredMessage>();

const processedEdits =
  new Map<string, number>();

function cleanup(): void {
  const now = Date.now();

  for (
    const [id, entry]
    of originalMessages
  ) {
    if (
      now - entry.storedAt >
      MESSAGE_CACHE_TTL
    ) {
      originalMessages.delete(id);
    }
  }

  for (
    const [id, timestamp]
    of processedEdits
  ) {
    if (
      now - timestamp >
      10 * 60 * 1000
    ) {
      processedEdits.delete(id);
    }
  }

  if (
    originalMessages.size >
    MAX_CACHE_SIZE
  ) {
    const entries = [
      ...originalMessages.entries(),
    ].sort(
      (a, b) =>
        a[1].storedAt -
        b[1].storedAt,
    );

    const removeCount =
      originalMessages.size -
      MAX_CACHE_SIZE;

    for (
      let i = 0;
      i < removeCount;
      i++
    ) {
      originalMessages.delete(
        entries[i][0],
      );
    }
  }
}

setInterval(
  cleanup,
  10 * 60 * 1000,
).unref();

function isGroup(
  jid: string | undefined,
): boolean {
  return !!jid &&
    jid.endsWith("@g.us");
}

function getMessageId(
  message: WAMessage,
): string {
  return message.key.id || "";
}

export function isAntiEditEnabled(
  jid: string,
): boolean {
  if (!isGroup(jid)) {
    return false;
  }

  return (
    groupSettings.get(jid)?.enabled ??
    DEFAULT_ENABLED
  );
}

export function setAntiEdit(
  jid: string,
  enabled: boolean,
): void {
  if (!isGroup(jid)) {
    return;
  }

  groupSettings.set(
    jid,
    {
      enabled,
    },
  );
}

export function getAntiEditStatus(
  jid: string,
): boolean {
  return isAntiEditEnabled(jid);
}

/*
 * Cache every incoming group message.
 *
 * This must happen when the original
 * message arrives, before WhatsApp edits it.
 */
export function rememberMessage(
  message: WAMessage,
): void {
  const id =
    getMessageId(message);

  const jid =
    message.key.remoteJid;

  if (!id || !jid) {
    return;
  }

  if (message.key.fromMe) {
    return;
  }

  if (!isGroup(jid)) {
    return;
  }

  const cloned =
    JSON.parse(
      JSON.stringify(message),
    ) as WAMessage;

  originalMessages.set(
    id,
    {
      message: cloned,
      storedAt: Date.now(),
    },
  );

  cleanup();
}

function getOriginal(
  messageId: string,
): WAMessage | undefined {
  return originalMessages.get(
    messageId,
  )?.message;
}

/*
 * Resolve the group name.
 */
async function resolveGroupName(
  sock: WASocket,
  jid: string,
): Promise<string> {
  try {
    const metadata =
      await sock.groupMetadata(jid);

    const subject =
      metadata?.subject?.trim();

    if (subject) {
      return subject;
    }
  } catch {
    /*
     * Group metadata is supplementary.
     * Anti-Edit should still report if
     * the lookup fails.
     */
  }

  return jid === "status@broadcast"
    ? "Status"
    : "Unknown group";
}

function extractText(
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
    return (
      content
        .extendedTextMessage
        .text
    );
  }

  if (
    content.imageMessage?.caption
  ) {
    return (
      content
        .imageMessage
        .caption
    );
  }

  if (
    content.videoMessage?.caption
  ) {
    return (
      content
        .videoMessage
        .caption
    );
  }

  if (
    content.documentMessage?.caption
  ) {
    return (
      content
        .documentMessage
        .caption
    );
  }

  return "";
}

function getContentType(
  message: WAMessage,
): string {
  const content =
    message.message;

  if (!content) {
    return "unknown";
  }

  if (
    content.conversation ||
    content.extendedTextMessage
  ) {
    return "text";
  }

  if (content.imageMessage) {
    return "image";
  }

  if (content.videoMessage) {
    return "video";
  }

  if (content.audioMessage) {
    return "audio";
  }

  if (content.documentMessage) {
    return "document";
  }

  if (content.stickerMessage) {
    return "sticker";
  }

  return "message";
}

async function buildAlert(
  sock: WASocket,
  groupJid: string,
  original: WAMessage,
  edited?: WAMessage,
): Promise<string> {
  /*
   * GLOBAL IDENTITY RESOLVER
   *
   * This handles:
   * • pushName
   * • normal WhatsApp JIDs
   * • LIDs
   * • group participant metadata
   *
   * Raw LIDs are never shown.
   */
  const identity =
    await resolveMessageIdentity(
      sock,
      original,
    );

  const displayName =
    formatIdentity(identity);

  const groupName =
    await resolveGroupName(
      sock,
      groupJid,
    );

  const originalText =
    extractText(original);

  const editedText =
    edited
      ? extractText(edited)
      : "";

  const type =
    getContentType(original);

  const lines = [
    "✏️ Message edited.",
    "",
    displayName,
    `Group: ${groupName}`,
    `Type: ${type}`,
    "",
    "Original:",
  ];

  if (originalText) {
    lines.push(
      originalText,
    );
  } else {
    lines.push(
      "[Original media message]",
    );
  }

  if (
    editedText &&
    editedText !== originalText
  ) {
    lines.push(
      "",
      "New:",
      editedText,
    );
  }

  return lines.join("\n");
}

/*
 * Baileys can expose the edit payload
 * directly or inside update.update.
 */
function normalizeUpdate(
  raw: any,
): {
  key: any;
  message: any;
  updateTimestamp?: number;
} {
  const nested =
    raw?.update;

  return {
    key:
      raw?.key ??
      nested?.key,

    message:
      raw?.message ??
      nested?.message,

    updateTimestamp:
      raw?.updateTimestamp ??
      nested?.updateTimestamp ??
      raw?.messageTimestamp ??
      nested?.messageTimestamp,
  };
}

function getProtocolEdit(
  message: any,
): proto.Message.IProtocolMessage | undefined {
  return message
    ?.protocolMessage;
}

function getEditTargetId(
  protocol:
    | proto.Message.IProtocolMessage
    | undefined,
): string | undefined {
  return (
    protocol?.key?.id ||
    undefined
  );
}

function isMessageEdit(
  protocol:
    | proto.Message.IProtocolMessage
    | undefined,
): boolean {
  if (!protocol) {
    return false;
  }

  const type =
    protocol.type;

  return (
    type ===
      proto.Message
        .ProtocolMessage
        .Type.MESSAGE_EDIT ||
    Number(type) === 14 ||
    String(type) ===
      "MESSAGE_EDIT"
  );
}

function extractEditedMessage(
  key: any,
  message: any,
): WAMessage | undefined {
  if (!message) {
    return undefined;
  }

  return {
    key,
    message,
  } as WAMessage;
}

/*
 * Resolve the owner's private chat.
 *
 * The owner is the WhatsApp account currently
 * connected to this Dark Vortex socket.
 *
 * This means the group JID is NEVER used as
 * the Anti-Edit alert destination.
 */
function getOwnerJid(
  sock: WASocket,
): string | undefined {
  const ownId =
    sock.user?.id;

  if (!ownId) {
    return undefined;
  }

  return jidNormalizedUser(
    ownId,
  );
}

export async function processAntiEditUpdate(
  sock: WASocket,
  rawUpdate: any,
): Promise<boolean> {
  const update =
    normalizeUpdate(
      rawUpdate,
    );

  const jid =
    update.key?.remoteJid;

  if (!jid || !isGroup(jid)) {
    return false;
  }

  if (!isAntiEditEnabled(jid)) {
    return false;
  }

  if (update.key?.fromMe) {
    return false;
  }

  const protocol =
    getProtocolEdit(
      update.message,
    );

  if (!isMessageEdit(protocol)) {
    return false;
  }

  const originalId =
    getEditTargetId(
      protocol,
    );

  if (!originalId) {
    return false;
  }

  const original =
    getOriginal(
      originalId,
    );

  if (!original) {
    return false;
  }

  const eventId =
    [
      jid,
      originalId,
      String(
        update.updateTimestamp ??
        Date.now(),
      ),
    ].join(":");

  if (
    processedEdits.has(eventId)
  ) {
    return true;
  }

  processedEdits.set(
    eventId,
    Date.now(),
  );

  const edited =
    extractEditedMessage(
      update.key,
      update.message,
    );

  const alert =
    await buildAlert(
      sock,
      jid,
      original,
      edited,
    );

  /*
   * CRITICAL:
   *
   * Destination = OWNER DM.
   *
   * Never use `jid` here.
   */
  const ownerJid =
    getOwnerJid(sock);

  if (!ownerJid) {
    processedEdits.delete(
      eventId,
    );

    return false;
  }

  try {
    /*
     * Send privately to the owner and
     * quote the original message.
     */
    await sendVortexReply(
      sock,
      ownerJid,
      alert,
      original,
    );
  } catch {
    /*
     * If quoting fails, still send the
     * Anti-Edit report privately.
     */
    await sendVortexReply(
      sock,
      ownerJid,
      alert,
    );
  }

  return true;
}