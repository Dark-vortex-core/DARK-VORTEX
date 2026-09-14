import os from "node:os";
import dns from "node:dns/promises";

import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

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
// 🌑 SECURITY PANEL
// =========================================================

export async function handleSecurityPanelCommand(
  sock: WASocket,
  jid: string,
  command: string,
  args: string[],
  quotedMessage?: WAMessage,
): Promise<boolean> {

  const reply = async (
    text: string,
  ): Promise<WAMessage | undefined> => {
    return await sendVortexReply(
      sock,
      jid,
      text,
      quotedMessage,
    );
  };

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

    await reply(
      [
        "🛡️ Vortex Security",
        "",
        "Status: 🟢 ONLINE",
        "WhatsApp: 🟢 CONNECTED",
        "Security: 🟢 ACTIVE",
        "",
        "Network",
        "• /ipinfo",
        "• /jhost",
        "• /dns <domain>",
        "",
        "System",
        "• /sysdiag",
        "• /health",
        "• /uptime",
        "",
        "Security",
        "• /scanbot",
        "• /audit",
        "• /timeline",
        "• /evidence",
        "• /snapshot",
        "",
        `Bot: ${botUser}`,
        `RAM: ${rss} MB`,
        `Heap: ${heap} MB`,
        `Uptime: ${formatUptime(process.uptime())}`,
      ].join("\n"),
    );

    return true;
  }

  // ---------------------------------------------------------
  // UPTIME
  // ---------------------------------------------------------

  if (command === "uptime") {
    await reply(
      [
        "⏱️ System uptime",
        "",
        `Process: ${formatUptime(process.uptime())}`,
        `Host: ${formatUptime(os.uptime())}`,
        "Status: 🟢 RUNNING",
      ].join("\n"),
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

    await reply(
      [
        "❤️ System health",
        "",
        "Bot: 🟢 HEALTHY",
        `WhatsApp: ${sock.user ? "🟢 CONNECTED" : "⚠️ UNKNOWN"}`,
        `Host: ${os.hostname()}`,
        `Memory: ${rss} MB`,
        `Uptime: ${formatUptime(process.uptime())}`,
      ].join("\n"),
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

    await reply(
      [
        "🖥️ Host diagnostics",
        "",
        `Hostname: ${os.hostname()}`,
        `Platform: ${os.platform()}`,
        `Architecture: ${os.arch()}`,
        `CPUs: ${os.cpus().length}`,
        "",
        "Network interfaces:",
        ...(networks.length
          ? networks
          : ["None detected."]),
      ].join("\n"),
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

    await reply(
      [
        "🌐 Network information",
        "",
        ...(addresses.length
          ? addresses
          : ["No local addresses detected."]),
        "",
        "Local server network information only.",
      ].join("\n"),
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
      await reply(
        [
          "❌ DNS lookup failed.",
          "",
          "Usage: /dns example.com",
        ].join("\n"),
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

      await reply(
        [
          "🌐 DNS lookup",
          "",
          `Host: ${hostname}`,
          "",
          ...records.map(
            (record) =>
              `• ${record.address} (IPv${record.family})`,
          ),
        ].join("\n"),
      );
    } catch (err) {
      console.error(
        "Vortex DNS lookup error:",
        err,
      );

      await reply(
        [
          "❌ DNS lookup failed.",
          "",
          `Unable to resolve ${hostname}.`,
        ].join("\n"),
      );
    }

    return true;
  }

  return false;
}