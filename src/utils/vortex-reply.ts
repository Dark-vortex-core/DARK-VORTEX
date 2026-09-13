
import type {
  WAMessage,
  WASocket,
  MiscMessageGenerationOptions,
} from "@whiskeysockets/baileys";

import {
  trackOutgoingMessage,
} from "./outgoing-message-tracker.js";
/*
 * =========================================================
 * DARK VORTEX REPLY SYSTEM
 * =========================================================
 *
 * Features:
 * • Native WhatsApp quoted replies
 * • Optional Read More effect
 * • Automatic Read More for long messages
 * • Safe handling of missing/invalid messages
 */

const READ_MORE_MARKER = "\u200e".repeat(4001);

/*
 * WhatsApp's long-message collapse effect.
 *
 * The marker is only added when the message is long enough.
 */
export function addReadMore(
  text: string,
  threshold = 1200,
): string {
  if (!text || text.length <= threshold) {
    return text;
  }

  return `${READ_MORE_MARKER}${text}`;
}

/*
 * Send a normal Dark Vortex reply.
 *
 * By default:
 * • Quotes the triggering message
 * • Automatically adds Read More to long responses
 */
export async function sendVortexReply(
  sock: WASocket,
  jid: string,
  text: string,
  quotedMessage?: WAMessage,
  options?: MiscMessageGenerationOptions,
): Promise<WAMessage | undefined> {
  const finalText = addReadMore(text);

  const sentMessage =
  await sock.sendMessage(
    jid,
    {
      text: finalText,
    },
    {
      ...options,
      ...(quotedMessage
        ? { quoted: quotedMessage }
        : {}),
    },
  );

trackOutgoingMessage(
  sentMessage,
);

return sentMessage;
}

/*
 * Send a reply without Read More.
 *
 * Useful for:
 * • Short status messages
 * • Progress updates
 * • Small confirmations
 */
export async function sendVortexShortReply(
  sock: WASocket,
  jid: string,
  text: string,
  quotedMessage?: WAMessage,
  options?: MiscMessageGenerationOptions,
): Promise<WAMessage | undefined> {
  const sentMessage =
  await sock.sendMessage(
    jid,
    {
      text,
    },
    {
      ...options,
      ...(quotedMessage
        ? { quoted: quotedMessage }
        : {}),
    },
  );

trackOutgoingMessage(
  sentMessage,
);

return sentMessage;
}

/*
 * Send a reply with Read More explicitly enabled.
 */
export async function sendVortexReadMoreReply(
  sock: WASocket,
  jid: string,
  text: string,
  quotedMessage?: WAMessage,
  options?: MiscMessageGenerationOptions,
): Promise<WAMessage | undefined> {
  const sentMessage =
  await sock.sendMessage(
    jid,
    {
      text: addReadMore(
        text,
        0,
      ),
    },
    {
      ...options,
      ...(quotedMessage
        ? { quoted: quotedMessage }
        : {}),
    },
  );

trackOutgoingMessage(
  sentMessage,
);

return sentMessage;
}

