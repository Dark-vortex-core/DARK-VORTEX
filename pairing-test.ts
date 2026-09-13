import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
} from "@whiskeysockets/baileys";

import pino from "pino";

const PHONE_NUMBER = "2347039663381";

async function main() {
  console.log("========================================");
  console.log(" DARK VORTEX — BAILEYS PAIRING TEST");
  console.log("========================================");

  const { state, saveCreds } =
    await useMultiFileAuthState("./pairing-test-auth");

  if (state.creds.registered) {
    console.log("Test auth is already registered.");
    console.log(
      "Delete pairing-test-auth before testing again.",
    );
    return;
  }

  const { version } =
    await fetchLatestBaileysVersion();

  console.log(
    "WhatsApp Web version:",
    version.join("."),
  );

  const sock = makeWASocket({
    auth: state,
    version,
    logger: pino({
      level: "silent",
    }),
    browser: Browsers.windows("Chrome"),
    connectTimeoutMs: 120000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 10000,
    markOnlineOnConnect: false,
  });

  sock.ev.on(
    "creds.update",
    saveCreds,
  );

  let requested = false;

  sock.ev.on(
    "connection.update",
    async ({
      connection,
      lastDisconnect,
    }) => {
      console.log(
        "Connection:",
        connection,
      );

      if (
        connection === "connecting" &&
        !requested
      ) {
        requested = true;

        console.log(
          "Waiting 5 seconds before pairing request...",
        );

        setTimeout(async () => {
          try {
            console.log(
              "Requesting pairing code...",
            );

            const code =
              await sock.requestPairingCode(
                PHONE_NUMBER,
              );

            console.log("");
            console.log(
              "========================================",
            );
            console.log(
              " PAIRING CODE:",
              code,
            );
            console.log(
              "========================================",
            );
            console.log("");
          } catch (error) {
            console.error(
              "PAIRING REQUEST FAILED:",
              error,
            );
          }
        }, 5000);
      }

      if (
        connection === "close"
      ) {
        const statusCode =
          (lastDisconnect?.error as any)
            ?.output?.statusCode;

        console.log(
          "Connection closed.",
        );

        console.log(
          "Status code:",
          statusCode,
        );

        if (
          statusCode ===
          DisconnectReason.loggedOut
        ) {
          console.log(
            "WhatsApp reported LOGGED OUT.",
          );
        }
      }

      if (
        connection === "open"
      ) {
        console.log(
          "SUCCESS: WhatsApp connection opened.",
        );
      }
    },
  );
}

main().catch(console.error);