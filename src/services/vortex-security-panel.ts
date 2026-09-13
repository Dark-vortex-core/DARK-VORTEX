import os from "node:os";
import dns from "node:dns/promises";

import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import {
  vortexBox,
  error,
  success,
  info,
} from "../utils/message.js";

import {
  sendVortexReply,
} from "../utils/vortex-reply.js";

// =========================================================
// 🌑 DARK VORTEX — SECURITY TOOLS PANEL
// =========================================================

function formatUptime(
  seconds: number,
): string {
  const total = Math.floor(seconds);

  const days =
    Math.floor(total / 86400);

  const hours =
    Math.floor((total % 86400) / 3600);

  const minutes =
    Math.floor((total % 3600) / 60);

  const secs =
    total % 60;

  return [
    days ? `${days}d` : "",
    hours ? `${hours}h` : "",
    minutes ? `${minutes}m` : "",
    `${secs}s`,
  ]
    .filter(Boolean)
    .join(" ");
}

// =========================================================
// PANEL
// =========================================================

export async function handleSecurityPanelCommand(
  sock: WASocket,
  jid: string,
  command: string,
  args: string[],
  quotedMessage?: WAMessage,
): Promise<boolean> {

  // ---------------------------------------------------------
  // PANEL
  // ---------------------------------------------------------

  if (
    command === "panel" ||
    command === "securitypanel"
  ) {
    const botUser =
      sock.user?.id || "UNKNOWN";

    const memory =
      process.memoryUsage();

    const rss =
      Math.round(
        memory.rss / 1024 / 1024,
      );

    const heap =
      Math.round(
        memory.heapUsed / 1024 / 1024,
      );

    await sendVortexReply(
      sock,
      jid,
      vortexBox(
        "🛡️ VORTEX SECURITY PANEL",
        [
          "🟢 SYSTEM       ONLINE",
          "🟢 WHATSAPP     CONNECTED",
          "🟢 SECURITY     ACTIVE",
          "",
          "┌─ NETWORK ─────────────┐",
          "│ 🌐 /ipinfo            │",
          "│ 🖥️ /jhost             │",
          "│ 🔎 /dns <domain>      │",
          "└───────────────────────┘",
          "",
          "┌─ SYSTEM ──────────────┐",
          "│ 💻 /sysdiag           │",
          "│ ❤️ /health            │",
          "│ ⏱️ /uptime            │",
          "└───────────────────────┘",
          "",
          "┌─ SECURITY ────────────┐",
          "│ 🔍 /scanbot           │",
          "│ 📋 /audit             │",
          "│ 📊 /timeline          │",
          "│ 🧾 /evidence          │",
          "│ 📸 /snapshot          │",
          "└───────────────────────┘",
          "",
          `🤖 Bot: ${botUser}`,
          `💾 RAM: ${rss} MB`,
          `🧠 Heap: ${heap} MB`,
          `⏱️ Uptime: ${formatUptime(process.uptime())}`,
          "",
          "╰─── ⚡ VORTEX TECH ───╯",
        ],
      ),
      quotedMessage,
    );

    return true;
  }

  // ---------------------------------------------------------
  // UPTIME
  // ---------------------------------------------------------

  if (command === "uptime") {
    await sendVortexReply(
      sock,
      jid,
      success(
        "SYSTEM UPTIME",
        [
          `⏱️ Process: ${formatUptime(process.uptime())}`,
          `🖥️ Host: ${formatUptime(os.uptime())}`,
          "",
          "🟢 Dark Vortex process is running.",
        ],
      ),
      quotedMessage,
    );

    return true;
  }

  // ---------------------------------------------------------
  // HEALTH
  // ---------------------------------------------------------

  if (command === "health") {
    const memory =
      process.memoryUsage();

    const rss =
      Math.round(
        memory.rss / 1024 / 1024,
      );

    await sendVortexReply(
      sock,
      jid,
      success(
        "SYSTEM HEALTH",
        [
          "🟢 Bot Process: HEALTHY",
          `🟢 WhatsApp: ${sock.user ? "CONNECTED" : "UNKNOWN"}`,
          `🟢 Host: ${os.hostname()}`,
          `💾 Memory: ${rss} MB`,
          `⏱️ Uptime: ${formatUptime(process.uptime())}`,
        ],
      ),
      quotedMessage,
    );

    return true;
  }

  // ---------------------------------------------------------
  // JHOST
  // ---------------------------------------------------------

  if (
    command === "jhost" ||
    command === "hostinfo"
  ) {
    const interfaces =
      os.networkInterfaces();

    const networks: string[] = [];

    for (
      const [
        name,
        entries,
      ] of Object.entries(interfaces)
    ) {
      for (
        const entry of entries ?? []
      ) {
        if (
          entry.family === "IPv4"
        ) {
          networks.push(
            `${name}: ${entry.address}${
              entry.internal
                ? " (local)"
                : ""
            }`,
          );
        }
      }
    }

    await sendVortexReply(
      sock,
      jid,
      info(
        "HOST DIAGNOSTICS",
        [
          `🖥️ Hostname: ${os.hostname()}`,
          `💻 Platform: ${os.platform()}`,
          `🏗️ Architecture: ${os.arch()}`,
          `⚙️ CPUs: ${os.cpus().length}`,
          "",
          "📡 Network interfaces:",
          ...(networks.length
            ? networks
            : ["No interfaces detected."]),
        ],
      ),
      quotedMessage,
    );

    return true;
  }

  // ---------------------------------------------------------
  // IP INFO
  // ---------------------------------------------------------

  if (command === "ipinfo") {
    const interfaces =
      os.networkInterfaces();

    const addresses: string[] = [];

    for (
      const [
        name,
        entries,
      ] of Object.entries(interfaces)
    ) {
      for (
        const entry of entries ?? []
      ) {
        if (
          entry.family === "IPv4"
        ) {
          addresses.push(
            `${name}: ${entry.address}`,
          );
        }
      }
    }

    await sendVortexReply(
      sock,
      jid,
      info(
        "NETWORK INFORMATION",
        [
          "🌐 Local network addresses:",
          "",
          ...(addresses.length
            ? addresses
            : ["None detected."]),
          "",
          "ℹ️ This reports the bot server's",
          "local network information only.",
        ],
      ),
      quotedMessage,
    );

    return true;
  }

  // ---------------------------------------------------------
  // DNS
  // ---------------------------------------------------------

  if (command === "dns") {
    const hostname =
      args[0]?.trim();

    if (!hostname) {
      await sendVortexReply(
        sock,
        jid,
        error(
          "DNS USAGE",
          [
            "Usage:",
            "/dns example.com",
          ],
        ),
        quotedMessage,
      );

      return true;
    }

    try {
      const records =
        await dns.lookup(
          hostname,
          {
            all: true,
          },
        );

      await sendVortexReply(
        sock,
        jid,
        success(
          "DNS LOOKUP",
          [
            `🌐 Host: ${hostname}`,
            "",
            ...records.map(
              (record) =>
                `📡 ${record.address} (${record.family})`,
            ),
          ],
        ),
        quotedMessage,
      );
    } catch (err) {
      console.error(
        "Vortex DNS lookup error:",
        err,
      );

      await sendVortexReply(
        sock,
        jid,
        error(
          "DNS FAILED",
          [
            `Unable to resolve ${hostname}.`,
          ],
        ),
        quotedMessage,
      );
    }

    return true;
  }

  return false;
}