import {
  type WAMessage,
  type WASocket,
  proto,
} from "@whiskeysockets/baileys";

import { sendVortexReply } from "../utils/vortex-reply.js";

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

function getMessageId(
  message: WAMessage,
): string {
  return message.key.id || "";
}

function isGroup(
  jid: string | undefined,
): boolean {
  return !!jid && jid.endsWith("@g.us");
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

  groupSettings.set(jid, {
    enabled,
  });
}

export function getAntiEditStatus(
  jid: string,
): boolean {
  return isAntiEditEnabled(jid);
}

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

  if (
    message.key.fromMe
  ) {
    return;
  }

  /*
   * Anti-Edit is currently group-focused.
   * Private-message originals are not cached.
   */
  if (!isGroup(jid)) {
    return;
  }

  /*
   * Store a cloned message so later
   * mutations do not overwrite our
   * original copy.
   */
  const cloned =
    JSON.parse(
      JSON.stringify(message),
    ) as WAMessage;

  originalMessages.set(id, {
    message: cloned,
    storedAt: Date.now(),
  });

  cleanup();
}

function getOriginal(
  messageId: string,
): WAMessage | undefined {
  return originalMessages.get(
    messageId,
  )?.message;
}

function getParticipant(
  message: WAMessage,
): string {
  return (
    message.key.participant ||
    message.key.remoteJid ||
    "Unknown"
  );
}

function getDisplayName(
  message: WAMessage,
): string {
  const pushName =
    message.pushName?.trim();

  if (pushName) {
    return pushName;
  }

  return getParticipant(message);
}

function extractText(
  message: WAMessage,
): string {
  const content =
    message.message;

  if (!content) {
    return "";
  }

  if (
    content.conversation
  ) {
    return content.conversation;
  }

  if (
    content.extendedTextMessage
      ?.text
  ) {
    return (
      content.extendedTextMessage
        .text
    );
  }

  if (
    content.imageMessage
      ?.caption
  ) {
    return (
      content.imageMessage
        .caption
    );
  }

  if (
    content.videoMessage
      ?.caption
  ) {
    return (
      content.videoMessage
        .caption
    );
  }

  if (
    content.documentMessage
      ?.caption
  ) {
    return (
      content.documentMessage
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
    content.conversation
  ) {
    return "text";
  }

  if (
    content.extendedTextMessage
  ) {
    return "text";
  }

  if (
    content.imageMessage
  ) {
    return "image";
  }

  if (
    content.videoMessage
  ) {
    return "video";
  }

  if (
    content.audioMessage
  ) {
    return "audio";
  }

  if (
    content.documentMessage
  ) {
    return "document";
  }

  if (
    content.stickerMessage
  ) {
    return "sticker";
  }

  return "message";
}

function buildAlert(
  original: WAMessage,
  edited?: WAMessage,
): string {
  const name =
    getDisplayName(original);

  const originalText =
    extractText(original);

  const editedText =
    edited
      ? extractText(edited)
      : "";

  const type =
    getContentType(original);

  const lines: string[] = [
    "╭━━━〔 🌑 ᴅᴀʀᴋ ᴠᴏʀᴛᴇx 〕━━━╮",
    "┃",
    "┃  ✏️ MESSAGE EDITED",
    "┃",
    `┃  👤 ${name}`,
    `┃  📦 Type: ${type}`,
    "┃",
    "┃  📝 ORIGINAL MESSAGE",
    "┃",
  ];

  if (originalText) {
    lines.push(
      `┃  ${originalText}`,
    );
  } else {
    lines.push(
      "┃  [Original media message]",
    );
  }

  if (
    editedText &&
    editedText !== originalText
  ) {
    lines.push(
      "┃",
      "┃  🔄 NEW MESSAGE",
      "┃",
      `┃  ${editedText}`,
    );
  }

  lines.push(
    "┃",
    "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
  );

  return lines.join("\n");
}

function extractEditedMessage(
  update: any,
): WAMessage | undefined {
  /*
   * Modern Baileys can expose the
   * decrypted edited message directly
   * through update.message.
   */
  if (
    update?.message
  ) {
    return {
      key: update.key,
      message: update.message,
      pushName:
        update.pushName,
      messageTimestamp:
        update.messageTimestamp,
    } as WAMessage;
  }

  return undefined;
}

function getEditTargetId(
  update: any,
): string | undefined {
  const protocol =
    update?.message
      ?.protocolMessage;

  if (!protocol) {
    return undefined;
  }

  /*
   * WhatsApp's edit protocol references
   * the original message through key.
   */
  return (
    protocol.key?.id ||
    protocol.key?.messageId ||
    undefined
  );
}

function getProtocolEdit(
  update: any,
): proto.Message.IProtocolMessage | undefined {
  return update?.message
    ?.protocolMessage;
}

export async function processAntiEditUpdate(
  sock: WASocket,
  update: any,
): Promise<boolean> {
  const jid =
    update?.key?.remoteJid;

  if (!jid || !isGroup(jid)) {
    return false;
  }

  if (!isAntiEditEnabled(jid)) {
    return false;
  }

  /*
   * Never process Dark Vortex's own
   * outgoing messages.
   */
  if (update?.key?.fromMe) {
    return false;
  }

  const protocol =
    getProtocolEdit(update);

  const protocolType =
    protocol?.type;

  /*
   * WhatsApp/Baileys represents an edit
   * as MESSAGE_EDIT.
   *
   * We also accept the numeric/string form
   * for compatibility with different builds.
   */
  const isEdit =
    Number(protocolType) ===
      proto.Message.ProtocolMessage.Type.MESSAGE_EDIT ||
    String(protocolType) ===
      "MESSAGE_EDIT" ||
    String(protocolType) === "14";

  if (!isEdit) {
    return false;
  }

  const originalId =
    getEditTargetId(update);

  if (!originalId) {
    return false;
  }

  const original =
    getOriginal(originalId);

  if (!original) {
    /*
     * We cannot reconstruct an original
     * message that was never cached.
     */
    return false;
  }

  const editEventId =
    `${jid}:${originalId}:${String(
      update?.updateTimestamp ??
        update?.messageTimestamp ??
        Date.now(),
    )}`;

  if (
    processedEdits.has(
      editEventId,
    )
  ) {
    return true;
  }

  processedEdits.set(
    editEventId,
    Date.now(),
  );

  const edited =
    extractEditedMessage(update);

  const alert =
    buildAlert(
      original,
      edited,
    );

  try {
    await sendVortexReply(
      sock,
      jid,
      alert,
      original,
    );
  } catch {
    /*
     * If quoting the original fails,
     * send the alert without a quote.
     */
    await sendVortexReply(
      sock,
      jid,
      alert,
    );
  }

  return true;
}