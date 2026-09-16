import type {
  GroupMetadata,
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import {
  jidNormalizedUser,
} from "@whiskeysockets/baileys";

export interface ResolvedIdentity {
  jid: string;
  name: string;
  phone?: string;
  isLid: boolean;
}

/**
 * Normalize a WhatsApp JID while preserving the
 * identifier type (@s.whatsapp.net, @lid, @g.us, etc.).
 */
function normalizeJid(
  jid: string,
): string {
  const value =
    String(jid || "").trim();

  if (!value) {
    return "";
  }

  try {
    return jidNormalizedUser(value);
  } catch {
    return value
      .split(":")[0]
      .toLowerCase();
  }
}

/**
 * Returns true when the identifier is a WhatsApp LID.
 */
export function isLidJid(
  jid: string,
): boolean {
  return normalizeJid(jid)
    .endsWith("@lid");
}

/**
 * Extract a phone number only from a real
 * WhatsApp phone JID or phoneNumber field.
 *
 * LIDs are NEVER treated as phone numbers.
 */
export function phoneFromJid(
  jid: string,
): string | undefined {
  const normalized =
    normalizeJid(jid);

  if (
    !normalized.endsWith(
      "@s.whatsapp.net",
    )
  ) {
    return undefined;
  }

  const number =
    normalized
      .split("@")[0]
      .replace(/[^\d]/g, "");

  if (!number) {
    return undefined;
  }

  return `+${number}`;
}

/**
 * Safely extract a phone number from
 * a participant's phoneNumber field.
 */
function phoneFromValue(
  value: unknown,
): string | undefined {
  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    return undefined;
  }

  const digits =
    String(value).replace(
      /[^\d]/g,
      "",
    );

  if (!digits) {
    return undefined;
  }

  return `+${digits}`;
}

/**
 * Safely clean a display name.
 */
function cleanName(
  name: unknown,
): string | undefined {
  if (
    typeof name !== "string"
  ) {
    return undefined;
  }

  const value =
    name.trim();

  if (!value) {
    return undefined;
  }

  return value;
}

/**
 * Get the most useful display name
 * from a group participant.
 */
function participantName(
  participant: any,
): string | undefined {
  if (!participant) {
    return undefined;
  }

  return (
    cleanName(
      participant.notify,
    ) ??
    cleanName(
      participant.name,
    ) ??
    cleanName(
      participant.pushName,
    )
  );
}

/**
 * Get all known identifiers for a participant.
 *
 * A participant can expose:
 *
 * • id
 * • lid
 * • phoneNumber
 *
 * This allows LID ↔ phone/JID matching.
 */
function getParticipantIdentifiers(
  participant: any,
): string[] {
  if (!participant) {
    return [];
  }

  const identifiers = [
    participant.id,
    participant.lid,
    participant.phoneNumber,
  ];

  return [
    ...new Set(
      identifiers
        .filter(
          (
            value,
          ): value is string =>
            typeof value === "string" &&
            value.trim().length > 0,
        )
        .map(
          (value) =>
            normalizeJid(value),
        )
        .filter(Boolean),
    ),
  ];
}

/**
 * Find a participant in group metadata.
 *
 * Supports both normal phone JIDs and LIDs.
 */
async function findGroupParticipant(
  sock: WASocket,
  groupJid:
    | string
    | undefined,
  targetJid: string,
): Promise<any | undefined> {
  if (
    !groupJid ||
    !groupJid.endsWith("@g.us")
  ) {
    return undefined;
  }

  try {
    const metadata:
      GroupMetadata =
      await sock.groupMetadata(
        groupJid,
      );

    const normalizedTarget =
      normalizeJid(targetJid);

    return metadata.participants.find(
      (participant) => {
        const identifiers =
          getParticipantIdentifiers(
            participant,
          );

        return identifiers.includes(
          normalizedTarget,
        );
      },
    );
  } catch {
    return undefined;
  }
}

/**
 * Resolve identity from a message.
 */
export async function resolveMessageIdentity(
  sock: WASocket,
  message: WAMessage,
): Promise<ResolvedIdentity> {
  const senderJid =
    message.key.participant ??
    message.key.remoteJid ??
    "";

  const chatJid =
    message.key.remoteJid ??
    "";

  return resolveIdentity(
    sock,
    senderJid,
    chatJid,
    message.pushName,
  );
}

/**
 * Resolve a WhatsApp user into a safe
 * human-readable identity.
 *
 * Priority:
 *
 * 1. Message pushName
 * 2. Group participant name
 * 3. Participant phoneNumber
 * 4. JID phone number
 * 5. Safe fallback
 *
 * Raw LIDs are NEVER displayed as phone numbers.
 */
export async function resolveIdentity(
  sock: WASocket,
  jid: string,
  contextJid?: string,
  pushName?: string | null,
): Promise<ResolvedIdentity> {
  const normalized =
    normalizeJid(jid);

  if (!normalized) {
    return {
      jid: "",
      name: "Unknown User",
      isLid: false,
    };
  }

  const isLid =
    isLidJid(normalized);

  /**
   * Message-level name is the fastest
   * reliable identity source.
   */
  const directName =
    cleanName(pushName);

  if (directName) {
    return {
      jid: normalized,
      name: directName,
      phone:
        phoneFromJid(
          normalized,
        ),
      isLid,
    };
  }

  /**
   * Resolve against group metadata.
   *
   * This supports:
   *
   * target @lid
   *       ↓
   * participant.lid
   *
   * OR
   *
   * target phone JID
   *       ↓
   * participant.id / phoneNumber
   */
  const participant =
    await findGroupParticipant(
      sock,
      contextJid,
      normalized,
    );

  if (participant) {
    const groupName =
      participantName(
        participant,
      );

    const participantPhone =
      phoneFromValue(
        participant.phoneNumber,
      ) ??
      phoneFromJid(
        participant.id,
      );

    if (groupName) {
      return {
        jid: normalized,
        name: groupName,
        phone:
          participantPhone,
        isLid,
      };
    }

    if (participantPhone) {
      return {
        jid: normalized,
        name: participantPhone,
        phone:
          participantPhone,
        isLid,
      };
    }
  }

  /**
   * Normal phone JID fallback.
   */
  const phone =
    phoneFromJid(
      normalized,
    );

  if (phone) {
    return {
      jid: normalized,
      name: phone,
      phone,
      isLid: false,
    };
  }

  /**
   * Never expose a raw LID.
   */
  if (isLid) {
    return {
      jid: normalized,
      name: "Unknown User",
      isLid: true,
    };
  }

  return {
    jid: normalized,
    name: "Unknown User",
    isLid,
  };
}

/**
 * Resolve a mentioned user.
 */
export async function resolveMention(
  sock: WASocket,
  message: WAMessage,
  mentionedJid: string,
): Promise<ResolvedIdentity> {
  const contextJid =
    message.key.remoteJid ??
    undefined;

  return resolveIdentity(
    sock,
    mentionedJid,
    contextJid,
    undefined,
  );
}

/**
 * Format an identity for Dark Vortex.
 */
export function formatIdentity(
  identity: ResolvedIdentity,
): string {
  if (
    identity.name ===
    "Unknown User"
  ) {
    return "👤 Unknown User";
  }

  return `👤 ${identity.name}`;
}

/**
 * Resolve and format an identity.
 */
export async function resolveAndFormatIdentity(
  sock: WASocket,
  jid: string,
  contextJid?: string,
  pushName?: string | null,
): Promise<string> {
  const identity =
    await resolveIdentity(
      sock,
      jid,
      contextJid,
      pushName,
    );

  return formatIdentity(
    identity,
  );
}

/**
 * Resolve all mentions in a message.
 *
 * Returns:
 *
 * JID/LID → ResolvedIdentity
 */
export async function resolveMessageMentions(
  sock: WASocket,
  message: WAMessage,
): Promise<
  Map<string, ResolvedIdentity>
> {
  const result =
    new Map<
      string,
      ResolvedIdentity
    >();

  const messageContent:
    any =
    message.message;

  if (!messageContent) {
    return result;
  }

  const mentioned:
    string[] = [];

  const collectMentions =
    (content: any) => {
      if (!content) {
        return;
      }

      if (
        Array.isArray(
          content.contextInfo
            ?.mentionedJid,
        )
      ) {
        mentioned.push(
          ...content
            .contextInfo
            .mentionedJid,
        );
      }

      for (
        const value of Object.values(
          content,
        )
      ) {
        if (
          value &&
          typeof value ===
            "object" &&
          value !== content
        ) {
          collectMentions(
            value,
          );
        }
      }
    };

  collectMentions(
    messageContent,
  );

  const uniqueMentions =
    [
      ...new Set(
        mentioned
          .filter(Boolean)
          .map(
            (jid) =>
              normalizeJid(
                jid,
              ),
          ),
      ),
    ];

  /**
   * Resolve mentions in parallel.
   *
   * This is faster than resolving
   * each mention sequentially.
   */
  const resolved =
    await Promise.all(
      uniqueMentions.map(
        async (
          mentionedJid,
        ) => {
          const identity =
            await resolveMention(
              sock,
              message,
              mentionedJid,
            );

          return [
            mentionedJid,
            identity,
          ] as const;
        },
      ),
    );

  for (
    const [
      mentionedJid,
      identity,
    ] of resolved
  ) {
    result.set(
      mentionedJid,
      identity,
    );
  }

  return result;
}

/**
 * Safely replace raw WhatsApp identifiers
 * in text.
 */
export async function resolveIdentifiersInText(
  sock: WASocket,
  text: string,
  message?: WAMessage,
): Promise<string> {
  if (!text) {
    return text;
  }

  const matches =
    text.match(
      /\b\d{5,20}@s\.whatsapp\.net\b|\b\d+@lid\b/g,
    );

  if (!matches?.length) {
    return text;
  }

  const unique =
    [
      ...new Set(matches),
    ];

  const resolved =
    await Promise.all(
      unique.map(
        async (rawJid) => {
          const identity =
            await resolveIdentity(
              sock,
              rawJid,
              message?.key
                .remoteJid ??
                undefined,
              undefined,
            );

          return [
            rawJid,
            identity.name ===
            "Unknown User"
              ? "Unknown User"
              : identity.name,
          ] as const;
        },
      ),
    );

  let result = text;

  for (
    const [
      rawJid,
      replacement,
    ] of resolved
  ) {
    result =
      result.replaceAll(
        rawJid,
        replacement,
      );
  }

  return result;
}