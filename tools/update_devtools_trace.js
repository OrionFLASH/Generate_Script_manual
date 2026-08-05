#!/usr/bin/env node
/**
 * Заменяет встроенный блок DevToolsTrace (маркер → конец createDevToolsTrace)
 * во всех Script/*.js на актуальную копию из Script/lib/DevToolsTrace.js.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LIB = path.join(ROOT, "Script", "lib", "DevToolsTrace.js");
const SCRIPT_DIR = path.join(ROOT, "Script");
const MARKER = "/* DevToolsTrace v1 */";

const lib = fs.readFileSync(LIB, "utf8");
if (!lib.includes(MARKER)) {
  console.error("Lib missing marker");
  process.exit(1);
}

/**
 * Находит конец функции createDevToolsTrace: от маркера до закрывающей } на уровне 0.
 * @param {string} text
 * @param {number} startIdx индекс MARKER
 * @returns {number} индекс после закрывающей скобки функции
 */
function findTraceBlockEnd(text, startIdx) {
  const fnIdx = text.indexOf("function createDevToolsTrace", startIdx);
  if (fnIdx < 0) return -1;
  const braceOpen = text.indexOf("{", fnIdx);
  if (braceOpen < 0) return -1;
  let depth = 0;
  for (let i = braceOpen; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

const files = fs
  .readdirSync(SCRIPT_DIR)
  .filter((f) => f.endsWith(".js"))
  .sort();

let updated = 0;
let skipped = 0;
for (const name of files) {
  const fp = path.join(SCRIPT_DIR, name);
  let text = fs.readFileSync(fp, "utf8");
  const start = text.indexOf(MARKER);
  if (start < 0) {
    skipped++;
    continue;
  }
  // Включаем комментарий перед маркером, если это блок «DevToolsTrace — …»
  let blockStart = start;
  const commentStart = text.lastIndexOf("/**\n * DevToolsTrace", start);
  if (commentStart >= 0 && start - commentStart < 400) {
    blockStart = commentStart;
  }
  const end = findTraceBlockEnd(text, start);
  if (end < 0) {
    console.warn("WARN: cannot find end: " + name);
    continue;
  }
  const next = text.slice(end);
  const needsNl = next.startsWith("\n") ? "" : "\n";
  text = text.slice(0, blockStart) + lib.trimEnd() + needsNl + text.slice(end);
  fs.writeFileSync(fp, text, "utf8");
  console.log("OK update: " + name);
  updated++;
}
console.log("Done: updated=" + updated + " skipped(no marker)=" + skipped);
