/* =========================================================
   🌑 DARK VORTEX — SESSION STATE

   ⚡ Powered by Vortex Tech

   Shared runtime state for:
   • WhatsApp connection status
   • Session duration
   • Reconnect tracking
   • Last connection time
   • Pairing mode
   • Connected account
========================================================= */

export type SessionStatus =
  | "CONNECTED"
  | "CONNECTING"
  | "RECONNECTING"
  | "RESTING"
  | "OFFLINE";

interface SessionState {
  status: SessionStatus;
  sessionStartedAt: number | null;
  lastConnectedAt: number | null;
  lastDisconnectedAt: number | null;
  reconnectCount: number;
  accountNumber: string | null;
  pairingMode: "QR" | "PAIRING";
}

const state: SessionState = {
  status: "OFFLINE",
  sessionStartedAt: null,
  lastConnectedAt: null,
  lastDisconnectedAt: null,
  reconnectCount: 0,
  accountNumber: null,
  pairingMode:
    process.env.PAIRING_MODE
      ?.trim()
      .toLowerCase() === "pairing"
      ? "PAIRING"
      : "QR",
};

/* =========================================================
   STATUS
========================================================= */

export function setSessionStatus(
  status: SessionStatus,
): void {
  state.status = status;
}

export function getSessionStatus(): SessionStatus {
  return state.status;
}

/* =========================================================
   CONNECTION
========================================================= */

export function markSessionConnected(
  accountNumber?: string | null,
): void {
  const wasPreviouslyConnected =
    state.lastConnectedAt !== null;

  const now = Date.now();

  state.status = "CONNECTED";
  state.sessionStartedAt = now;
  state.lastConnectedAt = now;

  if (accountNumber) {
    state.accountNumber = accountNumber;
  }

  /*
   * Do not count the first connection as a reconnect.
   */
  if (wasPreviouslyConnected) {
    state.reconnectCount += 1;
  }
}

export function markSessionDisconnected(): void {
  state.status = "OFFLINE";
  state.lastDisconnectedAt =
    Date.now();
}

/* =========================================================
   ACCOUNT
========================================================= */

export function setSessionAccount(
  accountNumber: string | null,
): void {
  state.accountNumber =
    accountNumber;
}

export function getSessionAccount(): string | null {
  return state.accountNumber;
}

/* =========================================================
   PAIRING MODE
========================================================= */

export function setSessionPairingMode(
  mode: "QR" | "PAIRING",
): void {
  state.pairingMode = mode;
}

export function getSessionPairingMode():
  | "QR"
  | "PAIRING" {
  return state.pairingMode;
}

/* =========================================================
   RECONNECT COUNT
========================================================= */

export function getReconnectCount(): number {
  return state.reconnectCount;
}

/* =========================================================
   SESSION TIME
========================================================= */

export function getSessionStartedAt():
  number | null {
  return state.sessionStartedAt;
}

export function getLastConnectedAt():
  number | null {
  return state.lastConnectedAt;
}

export function getLastDisconnectedAt():
  number | null {
  return state.lastDisconnectedAt;
}

/* =========================================================
   RESET
========================================================= */

export function resetSessionState(): void {
  state.status = "OFFLINE";
  state.sessionStartedAt = null;
  state.lastConnectedAt = null;
  state.lastDisconnectedAt = null;
  state.reconnectCount = 0;
  state.accountNumber = null;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSessionSnapshot(): SessionState {
  return {
    ...state,
  };
}

/* =========================================================
   🌑 DARK VORTEX
   ⚡ Powered by Vortex Tech
========================================================= */