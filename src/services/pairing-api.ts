import express, {
  type Express,
  type Request,
  type Response,
} from "express";

import cors from "cors";
import http from "node:http";
import crypto from "node:crypto";

export type PairingSessionMode =
  | "qr"
  | "pairing";

export type PairingSessionStatus =
  | "IDLE"
  | "STARTING"
  | "WAITING_FOR_QR"
  | "WAITING_FOR_PAIRING"
  | "CONNECTING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "STOPPING"
  | "ERROR";

export interface PairingApiState {
  status: PairingSessionStatus;
  mode: PairingSessionMode | null;
  qr: string | null;
  pairingCode: string | null;
  phoneNumber: string | null;
  connectedNumber: string | null;
  message: string;
  updatedAt: number;
}

interface PairingApiOptions {
  port: number;
  host: string;
  apiKey: string;

  getState?: () => PairingApiState;

  startSession: (
    mode: PairingSessionMode,
    phoneNumber?: string,
  ) => Promise<void>;

  stopSession: () => Promise<void>;
}

interface SseClient {
  response: Response;
}

let server: http.Server | null = null;

let options: PairingApiOptions | null = null;

const clients = new Set<SseClient>();

let state: PairingApiState = {
  status: "IDLE",
  mode: null,
  qr: null,
  pairingCode: null,
  phoneNumber: null,
  connectedNumber: null,
  message: "Dark Vortex pairing API ready.",
  updatedAt: Date.now(),
};

function normalizePhoneNumber(
  value: unknown,
): string {
  return String(value ?? "")
    .replace(/\D/g, "");
}

function isValidPhoneNumber(
  number: string,
): boolean {
  return (
    number.length >= 8 &&
    number.length <= 15
  );
}

function createState(
  patch: Partial<PairingApiState>,
): PairingApiState {
  state = {
    ...state,
    ...patch,
    updatedAt: Date.now(),
  };

  return state;
}

function broadcastState(): void {
  const payload = JSON.stringify({
    type: "state",
    data: state,
  });

  for (const client of clients) {
    try {
      client.response.write(
        `data: ${payload}\n\n`,
      );
    } catch {
      clients.delete(client);
    }
  }
}

function sendJson(
  response: Response,
  status: number,
  data: unknown,
): void {
  response.status(status).json(data);
}

function authenticate(
  request: Request,
): boolean {
  if (!options) {
    return false;
  }

  const provided =
    request.headers.authorization
      ?.replace(/^Bearer\s+/i, "")
      .trim();

  if (!provided) {
    return false;
  }

  if (provided.length !== options.apiKey.length) {
  return false;
}

return crypto.timingSafeEqual(
  Buffer.from(provided),
  Buffer.from(options.apiKey),
);
}

function requireAuth(
  request: Request,
  response: Response,
): boolean {
  if (authenticate(request)) {
    return true;
  }

  sendJson(response, 401, {
    success: false,
    error: "Unauthorized.",
  });

  return false;
}

function createApp(): Express {
  const app = express();

  app.use(
    cors({
      origin: true,
      methods: [
        "GET",
        "POST",
        "OPTIONS",
      ],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
      ],
    }),
  );

  app.use(
    express.json({
      limit: "32kb",
    }),
  );

  // ==========================================================
  // HEALTH
  // ==========================================================

  app.get(
    "/",
    (_request, response) => {
      response.json({
        name: "Dark Vortex Pairing API",
        status: "ONLINE",
        version: "1.0.0",
      });
    },
  );

  // ==========================================================
  // STATUS
  // ==========================================================

  app.get(
    "/api/status",
    (request, response) => {
      if (
        !requireAuth(
          request,
          response,
        )
      ) {
        return;
      }

      sendJson(response, 200, {
        success: true,
        data: options?.getState?.() ?? state,
      });
    },
  );

  // ==========================================================
  // START SESSION
  // ==========================================================

  app.post(
    "/api/session/start",
    async (request, response) => {
      if (
        !requireAuth(
          request,
          response,
        )
      ) {
        return;
      }

      const mode =
        String(
          request.body?.mode ?? "",
        )
          .trim()
          .toLowerCase();

      if (
        mode !== "qr" &&
        mode !== "pairing"
      ) {
        sendJson(response, 400, {
          success: false,
          error:
            "mode must be either 'qr' or 'pairing'.",
        });

        return;
      }

      let phoneNumber:
        | string
        | undefined;

      if (
        mode === "pairing"
      ) {
        phoneNumber =
          normalizePhoneNumber(
            request.body?.phoneNumber,
          );

        if (
          !isValidPhoneNumber(
            phoneNumber,
          )
        ) {
          sendJson(response, 400, {
            success: false,
            error:
              "A valid international phone number is required.",
          });

          return;
        }
      }

      try {
        createState({
          status: "STARTING",
          mode,
          qr: null,
          pairingCode: null,
          phoneNumber:
            phoneNumber ?? null,
          connectedNumber: null,
          message:
            mode === "qr"
              ? "Starting QR authentication..."
              : "Starting phone-number pairing...",
        });

        broadcastState();

        await options!.startSession(
          mode,
          phoneNumber,
        );

        sendJson(response, 200, {
          success: true,
          data: state,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        createState({
          status: "ERROR",
          message,
        });

        broadcastState();

        sendJson(response, 500, {
          success: false,
          error: message,
        });
      }
    },
  );

  // ==========================================================
  // QR SHORTCUT
  // ==========================================================

  app.post(
    "/api/session/qr",
    async (request, response) => {
      if (
        !requireAuth(
          request,
          response,
        )
      ) {
        return;
      }

      try {
        createState({
          status: "STARTING",
          mode: "qr",
          qr: null,
          pairingCode: null,
          phoneNumber: null,
          connectedNumber: null,
          message:
            "Starting QR authentication...",
        });

        broadcastState();

        await options!.startSession(
          "qr",
        );
        setPairingArtifactVisibility(true, "qr");

        sendJson(response, 200, {
          success: true,
          data: state,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        createState({
          status: "ERROR",
          message,
        });

        broadcastState();

        sendJson(response, 500, {
          success: false,
          error: message,
        });
      }
    },
  );

  // ==========================================================
  // PAIRING SHORTCUT
  // ==========================================================

  app.post(
    "/api/session/pairing",
    async (request, response) => {
      if (
        !requireAuth(
          request,
          response,
        )
      ) {
        return;
      }

      const phoneNumber =
        normalizePhoneNumber(
          request.body?.phoneNumber,
        );

      if (
        !isValidPhoneNumber(
          phoneNumber,
        )
      ) {
        sendJson(response, 400, {
          success: false,
          error:
            "A valid international phone number is required.",
        });

        return;
      }

      try {
        createState({
          status: "STARTING",
          mode: "pairing",
          qr: null,
          pairingCode: null,
          phoneNumber,
          connectedNumber: null,
          message:
            "Starting phone-number pairing...",
        });

        broadcastState();

        await options!.startSession(
          "pairing",
          phoneNumber,
        );

        setPairingArtifactVisibility(
          true,
          "pairing",
        );

        sendJson(response, 200, {
          success: true,
          data: state,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        createState({
          status: "ERROR",
          message,
        });

        broadcastState();

        sendJson(response, 500, {
          success: false,
          error: message,
        });
      }
    },
  );

  // ==========================================================
  // STOP
  // ==========================================================

  app.post(
    "/api/session/stop",
    async (request, response) => {
      if (
        !requireAuth(
          request,
          response,
        )
      ) {
        return;
      }

      try {
        createState({
          status: "STOPPING",
          message:
            "Stopping WhatsApp session...",
        });

        broadcastState();

        await options!.stopSession();

        createState({
          status: "DISCONNECTED",
          qr: null,
          pairingCode: null,
          connectedNumber: null,
          message:
            "WhatsApp session stopped.",
        });

        broadcastState();

        sendJson(response, 200, {
          success: true,
          data: state,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        createState({
          status: "ERROR",
          message,
        });

        broadcastState();

        sendJson(response, 500, {
          success: false,
          error: message,
        });
      }
    },
  );

  // ==========================================================
  // SERVER-SENT EVENTS
  // ==========================================================

  app.get(
    "/api/session/events",
    (request, response) => {
      if (
        !requireAuth(
          request,
          response,
        )
      ) {
        return;
      }

      response.setHeader(
        "Content-Type",
        "text/event-stream",
      );

      response.setHeader(
        "Cache-Control",
        "no-cache, no-transform",
      );

      response.setHeader(
        "Connection",
        "keep-alive",
      );

      response.setHeader(
        "X-Accel-Buffering",
        "no",
      );

      response.flushHeaders?.();

      const client: SseClient = {
        response,
      };

      clients.add(client);

      response.write(
        `data: ${JSON.stringify({
          type: "state",
          data: state,
        })}\n\n`,
      );

      request.on(
        "close",
        () => {
          clients.delete(client);
        },
      );
    },
  );

  return app;
}


// ============================================================
// PUBLIC STATE CONTROLS
// ============================================================
let pairingArtifactVisible = false;

let latestPairingQr: string | null = null;
let latestPairingCode: string | null = null;

export function setPairingArtifactVisibility(
  visible: boolean,
  mode?: PairingSessionMode,
): void {
  pairingArtifactVisible = visible;

  if (!visible) {
    return;
  }

  if (
    mode === "qr" &&
    latestPairingQr
  ) {
    createState({
      status: "WAITING_FOR_QR",
      qr: latestPairingQr,
      pairingCode: null,
      message:
        "QR code ready. Scan it with WhatsApp.",
    });

    broadcastState();
    return;
  }

  if (
    mode === "pairing" &&
    latestPairingCode
  ) {
    createState({
      status: "WAITING_FOR_PAIRING",
      pairingCode: latestPairingCode,
      qr: null,
      message:
        "Pairing code ready. Enter it in WhatsApp.",
    });

    broadcastState();
  }
}

export function updatePairingApiState(
  patch: Partial<PairingApiState>,
): void {
  createState(patch);
  broadcastState();
}

export function setPairingQr(
  qr: string,
): void {
  latestPairingQr = qr;
  latestPairingCode = null;

  if (!pairingArtifactVisible) {
    return;
  }

  createState({
    status: "WAITING_FOR_QR",
    qr,
    pairingCode: null,
    message:
      "QR code ready. Scan it with WhatsApp.",
  });

  broadcastState();
}

export function setPairingCode(
  code: string,
): void {
  latestPairingCode = code;
  latestPairingQr = null;

  if (!pairingArtifactVisible) {
    return;
  }

  createState({
    status: "WAITING_FOR_PAIRING",
    pairingCode: code,
    qr: null,
    message:
      "Pairing code ready. Enter it in WhatsApp.",
  });

  broadcastState();
}

export function setPairingConnecting(): void {
  createState({
    status: "CONNECTING",
    message:
      "Connecting to WhatsApp...",
  });

  broadcastState();
}

export function setPairingConnected(
  connectedNumber?: string,
): void {
  createState({
    status: "CONNECTED",
    qr: null,
    pairingCode: null,
    connectedNumber:
      connectedNumber ?? null,
    message:
      "Dark Vortex is connected to WhatsApp.",
  });

  broadcastState();
}

export function setPairingDisconnected(
  message =
    "WhatsApp session disconnected.",
): void {
  createState({
    status: "DISCONNECTED",
    qr: null,
    pairingCode: null,
    connectedNumber: null,
    message,
  });

  broadcastState();
}

export async function startPairingApi(
  apiOptions: PairingApiOptions,
): Promise<void> {
  if (server) {
    return;
  }

  options = apiOptions;

  const app =
    createApp();

  server =
    http.createServer(app);

  await new Promise<void>(
    (resolve, reject) => {
      server!.once(
        "error",
        reject,
      );

      server!.listen(
        apiOptions.port,
        apiOptions.host,
        () => {
          server!.off(
            "error",
            reject,
          );

          resolve();
        },
      );
    },
  );

  console.log(
    `🌐 Dark Vortex Pairing API listening on ${apiOptions.host}:${apiOptions.port}`,
  );
}

export async function stopPairingApi(): Promise<void> {
  if (!server) {
    return;
  }

  for (const client of clients) {
    try {
      client.response.end();
    } catch {}
  }

  clients.clear();

  await new Promise<void>(
    (resolve) => {
      server!.close(() => {
        resolve();
      });
    },
  );

  server = null;
  options = null;
}