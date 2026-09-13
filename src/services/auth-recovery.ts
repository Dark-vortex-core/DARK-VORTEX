import fs from "node:fs/promises";
import path from "node:path";

const AUTH_DIR =
  process.env.WHATSAPP_AUTH_DIR?.trim() ||
  path.resolve("./auth");

export async function authDirectoryExists(): Promise<boolean> {
  try {
    await fs.access(AUTH_DIR);
    return true;
  } catch {
    return false;
  }
}

export async function clearWhatsAppAuth(): Promise<void> {
  try {
    await fs.rm(AUTH_DIR, {
      recursive: true,
      force: true,
    });

    console.log(
      `[AUTH RECOVERY] WhatsApp auth directory cleared: ${AUTH_DIR}`,
    );
  } catch (error) {
    console.error(
      "[AUTH RECOVERY] Failed to clear WhatsApp auth directory.",
      error,
    );

    throw error;
  }
}

export async function resetWhatsAppAuth(): Promise<void> {
  await clearWhatsAppAuth();
}

export function getWhatsAppAuthDirectory(): string {
  return AUTH_DIR;
}