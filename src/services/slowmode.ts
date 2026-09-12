
import fs from "node:fs";
import path from "node:path";

import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import {
  success,
  error,
  commandUsage,
} from "../utils/message.js";

import {
  isBotGroupAdmin,
} from "../utils/group-admin.js";
// =========================================================
// 🌑 DARK VORTEX — SLOWMODE SYSTEM
// =========================================================

const DATA_DIR = path.join(
  process.cwd(),
  "src",
  "data",
);

const DATA_FILE = path.join(
  DATA_DIR,
  "slowmode.json",
);

interface SlowmodeSettings {
  enabled: boolean;
  seconds: number;
}

type SlowmodeStore =
  Record<string, SlowmodeSettings>;

const DEFAULT_SETTINGS: SlowmodeSettings = {
  enabled: false,
  seconds: 10,
};

// =========================================================
// RUNTIME COOLDOWN CACHE
// =========================================================

const lastMessageTimes = new Map<
  string,
  Map<string, number>
>();

// =========================================================
// STORAGE
// =========================================================

function ensureDataFile(): void {
  fs.mkdirSync(DATA_DIR, {
    recursive: true,
  });

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({}, null, 2),
      "utf8",
    );
  }
}

function loadData(): SlowmodeStore {
  ensureDataFile();

  try {
    const raw = fs.readFileSync(
      DATA_FILE,
      "utf8",
    );

    if (!raw.trim()) {
      return {};
    }

    const parsed = JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    return parsed as SlowmodeStore;
  } catch (err) {
    console.error(
      "Dark Vortex slowmode load error:",
      err,
    );

    return {};
  }
}

function saveData(
  data: SlowmodeStore,
): void {
  ensureDataFile();

  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(data, null, 2),
    "utf8",
  );
}

// =========================================================
// SETTINGS
// =========================================================

function getSettings(
  jid: string,
): SlowmodeSettings {
  const data = loadData();

  const saved = data[jid];

  if (!saved) {
    return {
      ...DEFAULT_SETTINGS,
    };
  }

  const seconds =
    Number(saved.seconds);

  return {
    enabled:
      saved.enabled === true,
    seconds:
      Number.isInteger(seconds) &&
      seconds >= 1 &&
      seconds <= 3600
        ? seconds
        : DEFAULT_SETTINGS.seconds,
  };
}

function setSettings(
  jid: string,
  settings: SlowmodeSettings,
): void {
  const data = loadData();

  data[jid] = {
    enabled:
      settings.enabled === true,
    seconds:
      settings.seconds,
  };

  saveData(data);
}

// =========================================================
// JID NORMALIZATION
// =========================================================

function normalizeJid(
  jid: string | undefined | null,
): string {
  if (!jid) {
    return "";
  }

  return jid
    .trim()
    .toLowerCase();
}

// =========================================================
// PARTICIPANT ID RESOLUTION
// =========================================================

function getSenderIds(
  message: WAMessage,
): string[] {
  const ids = new Set<string>();

  const participant =
    message.key.participant;

  const remoteJid =
    message.key.remoteJid;

  if (participant) {
    ids.add(
      normalizeJid(participant),
    );
  }

  if (
    remoteJid &&
    remoteJid.endsWith("@lid")
  ) {
    ids.add(
      normalizeJid(remoteJid),
    );
  }

  return [...ids].filter(Boolean);
}

function participantMatches(
  participant: {
    id?: string;
    lid?: string;
  },
  senderIds: string[],
): boolean {
  const participantId =
    normalizeJid(participant.id);

  const participantLid =
    normalizeJid(
      participant.lid,
    );

  return senderIds.some(
    (senderId) =>
      senderId === participantId ||
      senderId === participantLid,
  );
}

function getParticipantKey(
  participant: {
    id?: string;
    lid?: string;
  },
  senderIds: string[],
): string {
  return (
    normalizeJid(participant.id) ||
    normalizeJid(participant.lid) ||
    senderIds[0] ||
    ""
  );
}

// =========================================================
// COMMAND
// =========================================================

export async function handleSlowmodeCommand(
  sock: WASocket,
  jid: string,
  command: string,
  args: string[],
): Promise<boolean> {
  if (command !== "slowmode") {
    return false;
  }

  // ---------------------------------------------------------
  // GROUP ONLY
  // ---------------------------------------------------------

  if (!jid.endsWith("@g.us")) {
    await sock.sendMessage(jid, {
      text: error(
        "GROUP ONLY",
        [
          "🐢 Slowmode can only be",
          "used inside a WhatsApp group.",
        ],
      ),
    });

    return true;
  }

  // ---------------------------------------------------------
  // GROUP METADATA
  // ---------------------------------------------------------

  let metadata:
    Awaited<
      ReturnType<WASocket["groupMetadata"]>
    >;

  try {
    metadata =
      await sock.groupMetadata(jid);
  } catch (err) {
    console.error(
      "Slowmode metadata error:",
      err,
    );

    await sock.sendMessage(jid, {
      text: error(
        "GROUP DATA ERROR",
        [
          "Unable to read group",
          "information.",
          "",
          "💡 Try again in a moment.",
        ],
      ),
    });

    return true;
  }

   // ---------------------------------------------------------
  // BOT ADMIN CHECK
  // ---------------------------------------------------------

  const botIsAdmin =
    await isBotGroupAdmin(
      sock,
      jid,
    );

  if (!botIsAdmin) {
    await sock.sendMessage(jid, {
      text: error(
        "BOT NOT ADMIN",
        [
          "🛡️ Dark Vortex must be",
          "a group administrator",
          "to manage slowmode.",
          "",
          "💡 Promote Dark Vortex",
          "to admin and try again.",
        ],
      ),
    });

    return true;
  }

      const settings =
        getSettings(jid);



  // ---------------------------------------------------------
  // SHOW STATUS
  // ---------------------------------------------------------

  if (args.length === 0) {
    await sock.sendMessage(jid, {
      text: commandUsage(
        "slowmode",
        "/slowmode 10",
        [
          "/slowmode 30",
          "/slowmode off",
          "",
          `Current status: ${
            settings.enabled
              ? `🟢 Enabled — ${settings.seconds}s`
              : "🔴 Disabled"
          }`,
        ].join("\n"),
      ),
    });

    return true;
  }

  // ---------------------------------------------------------
  // NORMALIZE ACTION
  // ---------------------------------------------------------

  const value =
    args[0]
      ?.trim()
      .toLowerCase();

  // ---------------------------------------------------------
  // OFF
  // ---------------------------------------------------------

  if (value === "off") {
    setSettings(jid, {
      enabled: false,
      seconds:
        settings.seconds,
    });

    lastMessageTimes.delete(jid);

    await sock.sendMessage(jid, {
      text: success(
        "SLOWMODE DISABLED",
        [
          "🐢 Members can now send",
          "messages normally.",
          "",
          "🟢 Slowmode is inactive.",
        ],
      ),
    });

    return true;
  }

  // ---------------------------------------------------------
  // VALIDATE TIME
  // ---------------------------------------------------------

  const seconds =
    Number(value);

  if (
    !Number.isInteger(seconds) ||
    seconds < 1 ||
    seconds > 3600
  ) {
    await sock.sendMessage(jid, {
      text: error(
        "INVALID TIME",
        [
          "⏱️ Choose between",
          "1 and 3600 seconds.",
          "",
          "📝 Example:",
          "/slowmode 10",
        ],
      ),
    });

    return true;
  }

  // ---------------------------------------------------------
  // ENABLE
  // ---------------------------------------------------------

  setSettings(jid, {
    enabled: true,
    seconds,
  });

  // Start with a clean cooldown state.
  lastMessageTimes.delete(jid);

  await sock.sendMessage(jid, {
    text: success(
      "SLOWMODE ENABLED",
      [
        `⏱️ Cooldown: ${seconds} seconds`,
        "",
        "🛡️ Admins are exempt.",
        "👤 Members who send too quickly",
        "will have their message deleted.",
        "",
        "🟢 Protection is active.",
      ],
    ),
  });

  return true;
}

// =========================================================
// MESSAGE PROCESSOR
// =========================================================

export async function processSlowmode(
  sock: WASocket,
  jid: string,
  message: WAMessage,
): Promise<boolean> {
  // ---------------------------------------------------------
  // GROUP ONLY
  // ---------------------------------------------------------

  if (!jid.endsWith("@g.us")) {
    return false;
  }

  // ---------------------------------------------------------
  // SETTINGS
  // ---------------------------------------------------------

  const settings =
    getSettings(jid);

  if (!settings.enabled) {
    return false;
  }

  // ---------------------------------------------------------
  // IGNORE BOT MESSAGES
  // ---------------------------------------------------------

  if (message.key.fromMe) {
    return false;
  }

  // ---------------------------------------------------------
  // RESOLVE SENDER
  // ---------------------------------------------------------

  const senderIds =
    getSenderIds(message);

  if (senderIds.length === 0) {
    return false;
  }

  // ---------------------------------------------------------
  // READ GROUP MEMBERS
  // ---------------------------------------------------------

  try {
    const metadata =
      await sock.groupMetadata(jid);

    const participant =
      metadata.participants.find(
        (member) =>
          participantMatches(
            member,
            senderIds,
          ),
      );

    // If WhatsApp does not give us a
    // resolvable participant, do not
    // punish the message.
    if (!participant) {
      return false;
    }

    // -------------------------------------------------------
    // ADMINS ARE EXEMPT
    // -------------------------------------------------------

    const isAdmin =
      participant.admin ===
        "admin" ||
      participant.admin ===
        "superadmin";

    if (isAdmin) {
      return false;
    }

    // -------------------------------------------------------
    // STABLE SENDER KEY
    // -------------------------------------------------------

    const senderKey =
      getParticipantKey(
        participant,
        senderIds,
      );

    if (!senderKey) {
      return false;
    }

    // -------------------------------------------------------
    // COOLDOWN MAP
    // -------------------------------------------------------

    let groupTimes =
      lastMessageTimes.get(jid);

    if (!groupTimes) {
      groupTimes = new Map();

      lastMessageTimes.set(
        jid,
        groupTimes,
      );
    }

    const now =
      Date.now();

    const previous =
      groupTimes.get(
        senderKey,
      );

    const cooldownMs =
      settings.seconds * 1000;

    // -------------------------------------------------------
    // MESSAGE TOO FAST
    // -------------------------------------------------------

    if (
      previous !== undefined &&
      now - previous < cooldownMs
    ) {
      try {
        await sock.sendMessage(
          jid,
          {
            delete:
              message.key,
          },
        );
      } catch (err) {
        console.error(
          "Dark Vortex slowmode delete error:",
          err,
        );
      }

      return true;
    }

    // -------------------------------------------------------
    // FIRST MESSAGE / COOLDOWN EXPIRED
    // -------------------------------------------------------

    groupTimes.set(
      senderKey,
      now,
    );

    // -------------------------------------------------------
    // CLEAN OLD ENTRIES
    // -------------------------------------------------------

    for (
      const [
        key,
        timestamp,
      ] of groupTimes
    ) {
      if (
        now - timestamp >
        cooldownMs * 2
      ) {
        groupTimes.delete(key);
      }
    }

    return false;
  } catch (err) {
    console.error(
      "Dark Vortex slowmode processing error:",
      err,
    );

    // Never block a message if the
    // metadata lookup itself fails.
    return false;
  }
}

