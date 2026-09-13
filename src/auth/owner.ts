import { config } from "../config.js";

export function normalizeNumber(value: string): string {
  return value
    .replace(/@.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\D/g, "");
}

export function isOwner(
  sender?: string,
  senderAlt?: string,
  fromMe = false,
  botJid?: string,
  botAltJid?: string
): boolean {
  const configuredOwner =
    normalizeNumber(config.ownerNumber);

  if (!configuredOwner) {
    return false;
  }

  /*
   * Normal incoming message:
   * identify the actual sender only.
   */
  const candidates = [
    sender,
    senderAlt,
  ]
    .filter(
      (value): value is string =>
        typeof value === "string" &&
        value.length > 0
    )
    .map(normalizeNumber)
    .filter(Boolean);

  if (
    candidates.includes(configuredOwner)
  ) {
    return true;
  }

  /*
   * Messages sent by the bot's own WhatsApp account
   * are marked `fromMe`.
   *
   * This is especially important for GROUP commands,
   * because the owner is using the same WhatsApp account
   * that is running Dark Vortex.
   *
   * We only allow the bot JID when fromMe === true.
   */
  if (fromMe) {
    const botCandidates = [
      botJid,
      botAltJid,
    ]
      .filter(
        (value): value is string =>
          typeof value === "string" &&
          value.length > 0
      )
      .map(normalizeNumber)
      .filter(Boolean);

    if (
      botCandidates.includes(
        configuredOwner
      )
    ) {
      return true;
    }
  }

  return false;
}