import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(
  __dirname,
  "../data"
);

const PREFIX_FILE = path.join(
  DATA_DIR,
  "prefix.json"
);

const DEFAULT_PREFIX = "/";

interface PrefixData {
  prefix: string;
}

let currentPrefix =
  DEFAULT_PREFIX;

// ============================================================
// LOAD PREFIX
// ============================================================

export async function loadPrefix(): Promise<string> {
  try {
    await mkdir(
      DATA_DIR,
      { recursive: true }
    );

    const raw =
      await readFile(
        PREFIX_FILE,
        "utf8"
      );

    const data =
      JSON.parse(raw) as PrefixData;

    if (
      typeof data.prefix === "string" &&
      data.prefix.length > 0 &&
      data.prefix.length <= 3
    ) {
      currentPrefix =
        data.prefix;
    }

  } catch {
    currentPrefix =
      DEFAULT_PREFIX;

    await savePrefix(
      DEFAULT_PREFIX
    );
  }

  return currentPrefix;
}

// ============================================================
// SAVE PREFIX
// ============================================================

async function savePrefix(
  prefix: string
): Promise<void> {

  await mkdir(
    DATA_DIR,
    { recursive: true }
  );

  await writeFile(
    PREFIX_FILE,
    JSON.stringify(
      {
        prefix,
      },
      null,
      2
    ),
    "utf8"
  );
}

// ============================================================
// GET PREFIX
// ============================================================

export function getPrefix(): string {
  return currentPrefix;
}

// ============================================================
// SET PREFIX
// ============================================================

export async function setPrefix(
  prefix: string
): Promise<string> {

  const cleaned =
    prefix.trim();

  if (
    !cleaned ||
    cleaned.length > 3
  ) {
    throw new Error(
      "Prefix must contain between 1 and 3 characters."
    );
  }

  if (
    /\s/.test(cleaned)
  ) {
    throw new Error(
      "Prefix cannot contain spaces."
    );
  }

  currentPrefix =
    cleaned;

  await savePrefix(
    currentPrefix
  );

  return currentPrefix;
}