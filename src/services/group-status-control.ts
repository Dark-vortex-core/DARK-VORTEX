import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(
  __dirname,
  "../data",
);

const SETTINGS_FILE = path.join(
  DATA_DIR,
  "group-status-settings.json",
);

interface GroupStatusSetting {
  blocked: boolean;
  updatedAt: string;
}

type GroupStatusSettings = Record<
  string,
  GroupStatusSetting
>;

async function ensureStorage(): Promise<void> {
  await fs.mkdir(
    DATA_DIR,
    {
      recursive: true,
    },
  );

  try {
    await fs.access(
      SETTINGS_FILE,
    );
  } catch {
    await fs.writeFile(
      SETTINGS_FILE,
      "{}",
      "utf8",
    );
  }
}

async function loadSettings(): Promise<GroupStatusSettings> {
  await ensureStorage();

  try {
    const raw =
      await fs.readFile(
        SETTINGS_FILE,
        "utf8",
      );

    if (!raw.trim()) {
      return {};
    }

    const parsed =
      JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !== "object"
    ) {
      return {};
    }

    return parsed as GroupStatusSettings;
  } catch {
    return {};
  }
}

async function saveSettings(
  settings: GroupStatusSettings,
): Promise<void> {
  await ensureStorage();

  await fs.writeFile(
    SETTINGS_FILE,
    JSON.stringify(
      settings,
      null,
      2,
    ),
    "utf8",
  );
}

export async function isGroupStatusBlocked(
  groupJid: string,
): Promise<boolean> {
  if (
    !groupJid ||
    !groupJid.endsWith("@g.us")
  ) {
    return false;
  }

  const settings =
    await loadSettings();

  return (
    settings[groupJid]?.blocked === true
  );
}

export async function setGroupStatusBlocked(
  groupJid: string,
  blocked: boolean,
): Promise<void> {
  if (
    !groupJid ||
    !groupJid.endsWith("@g.us")
  ) {
    throw new Error(
      "Invalid group JID.",
    );
  }

  const settings =
    await loadSettings();

  settings[groupJid] = {
    blocked,
    updatedAt:
      new Date().toISOString(),
  };

  await saveSettings(
    settings,
  );
}

export async function getGroupStatusState(
  groupJid: string,
): Promise<"BLOCKED" | "ALLOWED"> {
  return (
    await isGroupStatusBlocked(
      groupJid,
    )
  )
    ? "BLOCKED"
    : "ALLOWED";
}