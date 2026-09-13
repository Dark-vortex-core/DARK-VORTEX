import type { WAMessage } from "@whiskeysockets/baileys";

const trackedMessageIds = new Map<string, number>();

const MESSAGE_EXPIRY_MS = 2 * 60 * 60 * 1000;

export function trackOutgoingMessage(
  message: WAMessage | undefined,
): void {
  const id = message?.key?.id;

  if (!id) {
    return;
  }

  trackedMessageIds.set(id, Date.now());
}

export function isTrackedOutgoingMessage(
  messageId: string | null|undefined,
): boolean {
  if (!messageId) {
    return false;
  }

  cleanupTrackedMessages();

  return trackedMessageIds.has(messageId);
}

export function untrackOutgoingMessage(
  messageId: string | undefined,
): void {
  if (!messageId) {
    return;
  }

  trackedMessageIds.delete(messageId);
}

function cleanupTrackedMessages(): void {
  const now = Date.now();

  for (const [id, timestamp] of trackedMessageIds) {
    if (now - timestamp > MESSAGE_EXPIRY_MS) {
      trackedMessageIds.delete(id);
    }
  }
}

setInterval(
  cleanupTrackedMessages,
  30 * 60 * 1000,
);