import { createRiskFactor } from "./vx-risk.js";
import type { VxRiskFactor } from "./vx-types.js";

export type VxThreatType =
  | "MALWARE"
  | "SOCIAL_ENGINEERING"
  | "UNWANTED_SOFTWARE";

export interface VxThreatIntelResult {
  enabled: boolean;
  checked: boolean;
  safe: boolean;
  url: string;
  threatTypes: VxThreatType[];
  factors: VxRiskFactor[];
  source: "GOOGLE_WEB_RISK" | "NONE" | "ERROR";
  error?: string;
  checkedAt: number;
}

const WEB_RISK_ENDPOINT =
  "https://webrisk.googleapis.com/v1/uris:search";

const CACHE_TTL =
  Number(process.env.VX_THREAT_CACHE_TTL_MS || 21600000);

const TIMEOUT_MS =
  Number(process.env.VX_THREAT_TIMEOUT_MS || 5000);

interface CacheEntry {
  expiresAt: number;
  result: VxThreatIntelResult;
}

const cache = new Map<string, CacheEntry>();

function getApiKey(): string {
  return (
    process.env.VX_WEBRISK_API_KEY ||
    ""
  ).trim();
}

function isEnabled(): boolean {
  return (
    process.env.VX_ENABLED !== "false" &&
    process.env.VX_WEBRISK_ENABLED === "true" &&
    Boolean(getApiKey())
  );
}

function normalizeUrl(value: string): string {
  let url = value.trim();

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  return url;
}

function threatScore(
  threatTypes: VxThreatType[],
): number {
  if (
    threatTypes.includes("MALWARE")
  ) {
    return 45;
  }

  if (
    threatTypes.includes("SOCIAL_ENGINEERING")
  ) {
    return 40;
  }

  if (
    threatTypes.includes("UNWANTED_SOFTWARE")
  ) {
    return 30;
  }

  return 0;
}

function threatReason(
  threatTypes: VxThreatType[],
): string {
  return threatTypes
    .map(type => {
      switch (type) {
        case "MALWARE":
          return "Google Web Risk identified malware-related threat intelligence";

        case "SOCIAL_ENGINEERING":
          return "Google Web Risk identified a social-engineering/phishing threat";

        case "UNWANTED_SOFTWARE":
          return "Google Web Risk identified unwanted-software activity";

        default:
          return "Threat intelligence match";
      }
    })
    .join("; ");
}

function extractThreatTypes(
  value: unknown,
): VxThreatType[] {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return [];
  }

  const threat =
    (value as {
      threat?: {
        threatTypes?: unknown;
      };
    }).threat;

  if (
    !threat ||
    !Array.isArray(
      threat.threatTypes,
    )
  ) {
    return [];
  }

  const allowed: VxThreatType[] = [
    "MALWARE",
    "SOCIAL_ENGINEERING",
    "UNWANTED_SOFTWARE",
  ];

  return threat.threatTypes.filter(
    (
      item,
    ): item is VxThreatType =>
      typeof item === "string" &&
      allowed.includes(
        item as VxThreatType,
      ),
  );
}

async function fetchWithTimeout(
  url: string,
): Promise<Response> {
  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    TIMEOUT_MS,
  );

  try {
    return await fetch(
      url,
      {
        method: "GET",
        headers: {
          Accept:
            "application/json",
        },
        signal:
          controller.signal,
      },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkVxUrl(
  rawUrl: string,
): Promise<VxThreatIntelResult> {
  const url =
    normalizeUrl(rawUrl);

  const disabledResult:
    VxThreatIntelResult = {
      enabled: false,
      checked: false,
      safe: true,
      url,
      threatTypes: [],
      factors: [],
      source: "NONE",
      checkedAt: Date.now(),
    };

  if (!isEnabled()) {
    return disabledResult;
  }

  const cached =
    cache.get(url);

  if (
    cached &&
    cached.expiresAt > Date.now()
  ) {
    return cached.result;
  }

  const apiKey =
    getApiKey();

  const params =
    new URLSearchParams();

  params.set(
    "key",
    apiKey,
  );

  params.set(
    "uri",
    url,
  );

  params.append(
    "threatTypes",
    "MALWARE",
  );

  params.append(
    "threatTypes",
    "SOCIAL_ENGINEERING",
  );

  params.append(
    "threatTypes",
    "UNWANTED_SOFTWARE",
  );

  try {
    const response =
      await fetchWithTimeout(
        `${WEB_RISK_ENDPOINT}?${params.toString()}`,
      );

    if (!response.ok) {
      const errorText =
        await response.text();

      const result:
        VxThreatIntelResult = {
          enabled: true,
          checked: false,
          safe: true,
          url,
          threatTypes: [],
          factors: [],
          source: "ERROR",
          error:
            `HTTP ${response.status}: ${errorText.slice(0, 300)}`,
          checkedAt: Date.now(),
        };

      return result;
    }

    const body =
      await response.json();

    const threatTypes =
      extractThreatTypes(body);

    const score =
      threatScore(threatTypes);

    const factors =
      threatTypes.length
        ? [
            createRiskFactor(
              "external-threat-intelligence",
              score,
              threatReason(
                threatTypes,
              ),
            ),
          ]
        : [];

    const result:
      VxThreatIntelResult = {
        enabled: true,
        checked: true,
        safe:
          threatTypes.length === 0,
        url,
        threatTypes,
        factors,
        source:
          "GOOGLE_WEB_RISK",
        checkedAt: Date.now(),
      };

    cache.set(
      url,
      {
        expiresAt:
          Date.now() +
          CACHE_TTL,
        result,
      },
    );

    return result;
  } catch (error) {
    return {
      enabled: true,
      checked: false,
      safe: true,
      url,
      threatTypes: [],
      factors: [],
      source: "ERROR",
      error:
        error instanceof Error
          ? error.message
          : String(error),
      checkedAt: Date.now(),
    };
  }
}

export function extractVxUrls(
  text?: string,
): string[] {
  if (!text) {
    return [];
  }

  const matches =
    text.match(
      /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi,
    ) || [];

  return Array.from(
    new Set(
      matches.map(
        value =>
          value.replace(
            /[),.!?;:'"]+$/g,
            "",
          ),
      ),
    ),
  );
}

export async function analyzeVxUrls(
  text?: string,
): Promise<VxThreatIntelResult[]> {
  const urls =
    extractVxUrls(text);

  if (!urls.length) {
    return [];
  }

  return Promise.all(
    urls.map(
      url => checkVxUrl(url),
    ),
  );
}

export function clearVxThreatCache(): void {
  cache.clear();
}

export function getVxThreatCacheSize(): number {
  return cache.size;
}