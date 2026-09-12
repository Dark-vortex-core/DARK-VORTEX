import {
  downloadMediaMessage,
  type WAMessage,
  type WASocket,
} from "@whiskeysockets/baileys";

/* =========================================================
   STATUS SERVICE
========================================================= */

const STATUS_JID =
  "status@broadcast";

/* =========================================================
   SEND TEXT STATUS
========================================================= */

export async function sendTextStatus(
  sock: WASocket,
  text: string,
): Promise<void> {
  const message =
    text.trim();

  if (!message) {
    throw new Error(
      "Status message cannot be empty.",
    );
  }

  await sock.sendMessage(
    STATUS_JID,
    {
      text: message,
    },
    {
      broadcast: true,
    },
  );
}

/* =========================================================
   SEND IMAGE STATUS
========================================================= */

export async function sendImageStatus(
  sock: WASocket,
  message: WAMessage,
  caption = "",
): Promise<void> {
  if (
    !message.message?.imageMessage
  ) {
    throw new Error(
      "The replied message does not contain an image.",
    );
  }

  const image =
    await downloadMediaMessage(
      message,
      "buffer",
      {},

    );

  await sock.sendMessage(
    STATUS_JID,
    {
      image,
      caption:
        caption.trim(),
    },
    {
      broadcast: true,
    },
  );
}