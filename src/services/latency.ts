import type { WASocket } from "@whiskeysockets/baileys";

export type LatencyLevel =
  | "EXCELLENT"
  | "GOOD"
  | "MODERATE"
  | "HIGH"
  | "CRITICAL";

export interface LatencyResult {
  latencyMs: number;
  level: LatencyLevel;
  connected: boolean;
  timestamp: number;
}

function classifyLatency(
  latencyMs: number,
): LatencyLevel {
  if (latencyMs < 100) {
    return "EXCELLENT";
  }

  if (latencyMs < 250) {
    return "GOOD";
  }

  if (latencyMs < 500) {
    return "MODERATE";
  }

  if (latencyMs < 1000) {
    return "HIGH";
  }

  return "CRITICAL";
}

/**
 * Measures a real WhatsApp round-trip by sending a
 * lightweight message to the requesting chat.
 *
 * The caller should delete/edit the measurement message
 * if desired.
 */
export async function measureLatency(
  sock: WASocket,
  jid: string,
): Promise<LatencyResult> {
  const startedAt = performance.now();

  const sent = await sock.sendMessage(
    jid,
    {
      text: "⚡ Measuring Dark Vortex latency...",
    },
  );

  const latencyMs = Math.max(
    0,
    Math.round(
      performance.now() - startedAt,
    ),
  );

  /**
   * The send operation completing measures the local
   * Baileys/WhatsApp send round-trip. It does not claim
   * to measure the recipient's network latency.
   */
  return {
    latencyMs,
    level: classifyLatency(
      latencyMs,
    ),
    connected: Boolean(
      sock.user?.id,
    ),
    timestamp: Date.now(),
  };
}

export function getLatencyIcon(
  level: LatencyLevel,
): string {
  switch (level) {
    case "EXCELLENT":
      return "🟢";

    case "GOOD":
      return "🟢";

    case "MODERATE":
      return "🟡";

    case "HIGH":
      return "🟠";

    case "CRITICAL":
      return "🔴";

    default:
      return "⚪";
  }
}

export function getLatencyDescription(
  level: LatencyLevel,
): string {
  switch (level) {
    case "EXCELLENT":
      return "Excellent response performance.";

    case "GOOD":
      return "Good response performance.";

    case "MODERATE":
      return "Moderate response delay detected.";

    case "HIGH":
      return "High response delay detected.";

    case "CRITICAL":
      return "Critical response delay detected.";

    default:
      return "Latency status unknown.";
  }
}