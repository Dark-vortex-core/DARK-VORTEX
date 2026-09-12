import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const FILE = "src/data/maintenance.json";

const BOT_NAME = "🌑 DARK VORTEX";
const POWERED_BY = "⚡ Powered by Vortex Tech";

interface MaintenanceSettings {
  enabled: boolean;
}

const DEFAULT_SETTINGS: MaintenanceSettings = {
  enabled: false,
};

function ensureFile(): void {
  const dir = dirname(FILE);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  if (!existsSync(FILE)) {
    writeFileSync(
      FILE,
      JSON.stringify(DEFAULT_SETTINGS, null, 2),
      "utf8"
    );
  }
}

function loadSettings(): MaintenanceSettings {
  ensureFile();

  try {
    const data = JSON.parse(readFileSync(FILE, "utf8"));

    return {
      enabled: Boolean(data.enabled),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: MaintenanceSettings): void {
  ensureFile();

  writeFileSync(
    FILE,
    JSON.stringify(settings, null, 2),
    "utf8"
  );
}

export function isMaintenanceEnabled(): boolean {
  return loadSettings().enabled;
}

export async function handleMaintenanceCommand(
  sock: any,
  jid: string,
  command: string,
  args: string[]
): Promise<boolean> {
  if (command !== "maintenance") {
    return false;
  }

  const settings = loadSettings();
  const action = args[0]?.toLowerCase();

  if (!action || action === "status") {
    await sock.sendMessage(jid, {
      text:
        `╭━━━〔 ${BOT_NAME} 〕━━━╮\n` +
        `┃\n` +
        `┃ 🔧 *MAINTENANCE MODE*\n` +
        `┃\n` +
        `┃ Status: ${settings.enabled ? "🔴 ON" : "🟢 OFF"}\n` +
        `┃\n` +
        `┃ Commands:\n` +
        `┃ • /maintenance on\n` +
        `┃ • /maintenance off\n` +
        `┃ • /maintenance status\n` +
        `┃\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━╯\n` +
        `      ${POWERED_BY}`,
    });

    return true;
  }

  if (action === "on") {
    if (settings.enabled) {
      await sock.sendMessage(jid, {
        text:
          `${BOT_NAME}\n\n` +
          `⚠️ Maintenance mode is already *ON*.\n\n` +
          `${POWERED_BY}`,
      });

      return true;
    }

    settings.enabled = true;
    saveSettings(settings);

    await sock.sendMessage(jid, {
      text:
        `╭━━━〔 ${BOT_NAME} 〕━━━╮\n` +
        `┃\n` +
        `┃ 🔧 *MAINTENANCE ENABLED*\n` +
        `┃\n` +
        `┃ 🔴 Status: ON\n` +
        `┃ 👑 Owner access: Enabled\n` +
        `┃ 👥 User commands: Disabled\n` +
        `┃\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━╯\n` +
        `      ${POWERED_BY}`,
    });

    return true;
  }

  if (action === "off") {
    if (!settings.enabled) {
      await sock.sendMessage(jid, {
        text:
          `${BOT_NAME}\n\n` +
          `⚠️ Maintenance mode is already *OFF*.\n\n` +
          `${POWERED_BY}`,
      });

      return true;
    }

    settings.enabled = false;
    saveSettings(settings);

    await sock.sendMessage(jid, {
      text:
        `╭━━━〔 ${BOT_NAME} 〕━━━╮\n` +
        `┃\n` +
        `┃ ✅ *MAINTENANCE DISABLED*\n` +
        `┃\n` +
        `┃ 🟢 Status: OFF\n` +
        `┃ 👥 User commands: Enabled\n` +
        `┃\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━╯\n` +
        `      ${POWERED_BY}`,
    });

    return true;
  }

  await sock.sendMessage(jid, {
    text:
      `${BOT_NAME}\n\n` +
      `❌ Unknown maintenance option.\n\n` +
      `Use:\n` +
      `• /maintenance on\n` +
      `• /maintenance off\n` +
      `• /maintenance status\n\n` +
      `${POWERED_BY}`,
  });

  return true;
}