import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

/* =========================================================
   🌑 DARK VORTEX — GROUP STATUS
========================================================= */

interface QuotedContent {
  text?: string;
  image?: {
    image: any;
    caption?: string;
  };
  video?: {
    video: any;
    caption?: string;
  };
}

function getQuotedMessage(
  message: WAMessage,
): WAMessage | null {
  const contextInfo =
    message.message
      ?.extendedTextMessage
      ?.contextInfo;

  const quotedMessage =
    contextInfo?.quotedMessage;

  if (!quotedMessage) {
    return null;
  }

  return {
    key: {
      remoteJid:
        message.key.remoteJid || "",
      fromMe: false,
      id:
        contextInfo.stanzaId || "",
      participant:
        contextInfo.participant,
    },
    message:
      quotedMessage,
  };
}

async function downloadQuotedMedia(
  sock: WASocket,
  quoted: WAMessage,
): Promise<Buffer> {
  const baileys =
    await import(
      "@whiskeysockets/baileys"
    );

  return await baileys.downloadMediaMessage(
    quoted,
    "buffer",
    {},
    {
      logger: undefined as any,
      reuploadRequest: sock.updateMediaMessage,
    },
  ) as Buffer;
}

export async function sendGroupStatusFromReply(
  sock: WASocket,
  groupJid: string,
  commandMessage: WAMessage,
): Promise<{
  success: boolean;
  type?: "text" | "image" | "video";
  error?: string;
}> {
  if (!groupJid.endsWith("@g.us")) {
    return {
      success: false,
      error:
        "This command can only be used inside a group.",
    };
  }

  const quoted =
    getQuotedMessage(
      commandMessage,
    );

  if (!quoted?.message) {
    return {
      success: false,
      error:
        "Reply to a text, photo, or video message.",
    };
  }

  const content =
    quoted.message;

  /* =======================================================
     TEXT
  ======================================================= */

  const text =
    content.conversation ||
    content.extendedTextMessage?.text;

  if (text?.trim()) {
    await sock.sendMessage(
      groupJid,
      {
        groupStatusMessage: {
          text: text.trim(),
        },
      } as any,
    );

    return {
      success: true,
      type: "text",
    };
  }

  /* =======================================================
     IMAGE
  ======================================================= */

  if (content.imageMessage) {
    const buffer =
      await downloadQuotedMedia(
        sock,
        quoted,
      );

    await sock.sendMessage(
      groupJid,
      {
        groupStatusMessage: {
          image: buffer,
          caption:
            content.imageMessage.caption ||
            undefined,
        },
      } as any,
    );

    return {
      success: true,
      type: "image",
    };
  }

  /* =======================================================
     VIDEO
  ======================================================= */

  if (content.videoMessage) {
    const buffer =
      await downloadQuotedMedia(
        sock,
        quoted,
      );

    await sock.sendMessage(
      groupJid,
      {
        groupStatusMessage: {
          video: buffer,
          caption:
            content.videoMessage.caption ||
            undefined,
        },
      } as any,
    );

    return {
      success: true,
      type: "video",
    };
  }

  return {
    success: false,
    error:
      "That message type is not supported. Reply to a text, photo, or video.",
  };
}