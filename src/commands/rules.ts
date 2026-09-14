import fs from "node:fs";
import path from "node:path";

import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import {
  sendVortexReply,
} from "../utils/vortex-reply.js";

const DATA_DIR = path.resolve("./src/data");
const RULES_FILE = path.join(DATA_DIR, "rules.json");

type RulesDatabase = Record<string, string>;

// ============================================================
// DATABASE
// ============================================================

function ensureDatabase(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {
      recursive: true,
    });
  }

  if (!fs.existsSync(RULES_FILE)) {
    fs.writeFileSync(
      RULES_FILE,
      JSON.stringify({}, null, 2),
      "utf8",
    );
  }
}

function loadDatabase(): RulesDatabase {
  ensureDatabase();

  try {
    return JSON.parse(
      fs.readFileSync(
        RULES_FILE,
        "utf8",
      ),
    ) as RulesDatabase;
  } catch {
    return {};
  }
}

function saveDatabase(
  database: RulesDatabase,
): void {
  ensureDatabase();

  fs.writeFileSync(
    RULES_FILE,
    JSON.stringify(
      database,
      null,
      2,
    ),
    "utf8",
  );
}

// ============================================================
// GET RULES
// ============================================================

function getRules(
  jid: string,
): string {
  const database =
    loadDatabase();

  return database[jid] || "";
}

// ============================================================
// SET RULES
// ============================================================

function setRules(
  jid: string,
  rules: string,
): void {
  const database =
    loadDatabase();

  database[jid] = rules.trim();

  saveDatabase(database);
}

// ============================================================
// CLEAR RULES
// ============================================================

function clearRules(
  jid: string,
): void {
  const database =
    loadDatabase();

  delete database[jid];

  saveDatabase(database);
}

// ============================================================
// GROUP CHECK
// ============================================================

function isGroup(
  jid: string,
): boolean {
  return jid.endsWith("@g.us");
}

// ============================================================
// COMMAND HANDLER
// ============================================================

export async function handleRulesCommand(
  sock: WASocket,
  jid: string,
  command: string,
  args: string[],
  message: WAMessage,
): Promise<boolean> {

  const supportedCommands = [
    "rules",
    "setrules",
    "clearrules",
  ];

  if (
    !supportedCommands.includes(
      command,
    )
  ) {
    return false;
  }

  const reply = async (
    text: string,
  ) => {
    return await sendVortexReply(
      sock,
      jid,
      text,
      message,
    );
  };

  // ----------------------------------------------------------
  // GROUP ONLY
  // ----------------------------------------------------------

  if (!isGroup(jid)) {

    await reply(
      [
        "❌ Group only.",
        "",
        "Rules commands can only be used inside groups.",
      ].join("\n"),
    );

    return true;
  }

  // ----------------------------------------------------------
  // SHOW RULES
  // ----------------------------------------------------------

  if (command === "rules") {

    const rules =
      getRules(jid);

    if (!rules) {

      await reply(
        [
          "📜 Group rules",
          "",
          "No rules have been configured yet.",
          "",
          "Create them with:",
          "/setrules Your group rules here",
        ].join("\n"),
      );

      return true;
    }

    const ruleLines =
      rules
        .split("\n")
        .map(
          (line, index) =>
            `${index + 1}. ${line}`,
        );

    await reply(
      [
        "📜 Group rules",
        "",
        ...ruleLines,
      ].join("\n"),
    );

    return true;
  }

  // ----------------------------------------------------------
  // SET RULES
  // ----------------------------------------------------------

  if (command === "setrules") {

    const rules =
      args.join(" ").trim();

    if (!rules) {

      await reply(
        [
          "❌ Missing rules.",
          "",
          "Usage:",
          "/setrules Be respectful",
          "",
          "Separate multiple rules with |",
        ].join("\n"),
      );

      return true;
    }

    const formattedRules =
      rules
        .split("|")
        .map(
          (rule) =>
            rule.trim(),
        )
        .filter(Boolean)
        .join("\n");

    setRules(
      jid,
      formattedRules,
    );

    await reply(
      [
        "✅ Rules updated.",
        "",
        ...formattedRules
          .split("\n")
          .map(
            (rule, index) =>
              `${index + 1}. ${rule}`,
          ),
      ].join("\n"),
    );

    return true;
  }

  // ----------------------------------------------------------
  // CLEAR RULES
  // ----------------------------------------------------------

  if (
    command === "clearrules"
  ) {

    clearRules(jid);

    await reply(
      [
        "🗑️ Rules cleared.",
        "",
        "The group's saved rules have been removed.",
      ].join("\n"),
    );

    return true;
  }

  return false;
}