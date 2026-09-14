import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import {
  config,
} from "../config.js";

import {
  sendVortexReply,
} from "../utils/vortex-reply.js";

interface ViewOnceInfo {
  type: "image" | "video" | "unknown";
}

function unwrapViewOnce(
  message: any,
): any | undefined {
  if (!message) {
    return undefined;
  }

  return (
    message.viewOnceMessageV2?.message ??
    message.viewOnceMessageV2Extension?.message ??
    message.viewOnceMessage?.message
  );
}

function getViewOnceInfo(
  message: WAMessage,
): ViewOnceInfo | null {
  const content =
    unwrapViewOnce(
      message.message,
    );

  if (!content) {
    return null;
  }

  if (content.imageMessage) {
    return {
      type: "image",
    };
  }

  if (content.videoMessage) {
    return {
      type: "video",
    };
  }

  return {
    type: "unknown",
  };
}

function getSenderJid(
  message: WAMessage,
): string {
  return (
    message.key.participant ??
    message.key.remoteJid ??
    "Unknown"
  );
}

function getChatJid(
  message: WAMessage,
): string {
  return (
    message.key.remoteJid ??
    "Unknown"
  );
}

function formatSender(
  jid: string,
): string {
  const number =
    jid
      .split("@")[0]
      .split(":")[0];

  if (
    !number ||
    number === "status"
  ) {
    return jid;
  }

  return `+${number}`;
}

function formatChat(
  jid: string,
): string {
  if (jid.endsWith("@g.us")) {
    return "Group";
  }

  return "Direct message";
}

export async function notifyOwnerOfViewOnce(
  sock: WASocket,
  message: WAMessage,
): Promise<boolean> {
  const info =
    getViewOnceInfo(
      message,
    );

  if (!info) {
    return false;
  }

  const chatJid =
    getChatJid(
      message,
    );

  const senderJid =
    getSenderJid(
      message,
    );

  const type =
    info.type === "image"
      ? "Image"
      : info.type === "video"
        ? "Video"
        : "Media";

  const sender =
    formatSender(
      senderJid,
    );

  const chat =
    formatChat(
      chatJid,
    );

  const notification = [
    "👁️ DARK VORTEX • VIEW ONCE",
    "",
    "A View Once message was received.",
    "",
    `Type: ${type}`,
    `From: ${sender}`,
    `Chat: ${chat}`,
    `Source: ${chatJid}`,
    "",
    "Status: Protected media",
  ].join("\n");

  await sendVortexReply(
    sock,
    config.ownerJid,
    notification,
    message,
  );

  return true;
}