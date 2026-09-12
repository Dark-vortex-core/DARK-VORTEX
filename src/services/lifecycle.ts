import type { WASocket } from "@whiskeysockets/baileys";

export type LifecycleAction =
  | "restart"
  | "shutdown"
  | null;

let activeSocket: WASocket | null = null;

let lifecycleAction: LifecycleAction = null;

let lifecycleInProgress = false;

let reconnectEnabled = true;

export function setActiveSocket(
  sock: WASocket | null,
): void {
  activeSocket = sock;
}

export function getActiveSocket(): WASocket | null {
  return activeSocket;
}

export function getLifecycleAction(): LifecycleAction {
  return lifecycleAction;
}

export function isLifecycleInProgress(): boolean {
  return lifecycleInProgress;
}

export function isReconnectEnabled(): boolean {
  return reconnectEnabled;
}

export function disableReconnect(): void {
  reconnectEnabled = false;
}

export function enableReconnect(): void {
  reconnectEnabled = true;
}

export function beginLifecycleAction(
  action: "restart" | "shutdown",
): boolean {
  if (lifecycleInProgress) {
    return false;
  }

  lifecycleInProgress = true;
  lifecycleAction = action;

  return true;
}

export function clearLifecycleAction(): void {
  lifecycleAction = null;
  lifecycleInProgress = false;
}

export async function closeActiveSocket(): Promise<void> {
  const sock = activeSocket;

  if (!sock) {
    return;
  }

  try {
    sock.ws?.close();
  } catch (error) {
    console.error(
      "❌ Failed to close active WhatsApp socket:",
      error,
    );
  }

  activeSocket = null;
}