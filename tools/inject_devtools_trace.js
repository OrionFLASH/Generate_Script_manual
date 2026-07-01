#!/usr/bin/env node
/**
 * Встраивает Script/lib/DevToolsTrace.js в каждый Script/*.js (после "use strict";).
 * Пропускает lib и файлы, где уже есть маркер DevToolsTrace v1.
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

const files = fs
  .readdirSync(SCRIPT_DIR)
  .filter((f) => f.endsWith(".js") && f !== "DevToolsTrace.js")
  .sort();

let updated = 0;
for (const name of files) {
  const fp = path.join(SCRIPT_DIR, name);
  let text = fs.readFileSync(fp, "utf8");
  if (text.includes(MARKER)) {
    console.log("skip (already): " + name);
    continue;
  }
  const patterns = ['"use strict";\n\n', '"use strict";\r\n\r\n', "(function () {\n", "(() => {\n"];
  let injected = false;
  for (const p of patterns) {
    const idx = text.indexOf(p);
    if (idx >= 0) {
      const insertAt = idx + p.length;
      text = text.slice(0, insertAt) + "\n" + lib + "\n" + text.slice(insertAt);
      injected = true;
      break;
    }
  }
  if (!injected) {
    console.warn("WARN: no injection point: " + name);
    continue;
  }
  fs.writeFileSync(fp, text, "utf8");
  console.log("OK inject: " + name);
  updated++;
}
console.log("Done: " + updated + " file(s)");
