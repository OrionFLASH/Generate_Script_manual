#!/usr/bin/env node
/**
 * Интеграция DevToolsTrace во все Script/*.js: httpFetch, log, UI toggle.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const SCRIPT_DIR = path.join(__dirname, "..", "Script");

/** @type {Record<string, { id: string, logHook?: RegExp, logInsert?: string, mount?: RegExp, mountInsert?: string, attach?: RegExp, attachInsert?: string, extraUi?: boolean }>} */
const CFG = {
  "SUP_Config_Update.js": {
    id: "SUP_Config_Update",
    logHook: /(const line = ts \+ " " \+ prefix \+ " " \+ msg;\n)/,
    logInsert: "$1    devTrace.log(line);\n",
    mount: /(  bundleInfoEl\.textContent = "Bundle info: —";\n  panel\.appendChild\(bundleInfoEl\);\n\n)(  logEl = document\.createElement\("pre"\);)/,
    mountInsert: "$1  devTrace.mountToggleRow(panel, null);\n  var traceRowSup = panel.querySelector(\".devtools-trace-row\");\n  if (traceRowSup && logEl === null) {}\n$2",
    attach: /(  document\.body\.appendChild\(panel\);\n  panelLog\("Панель SUP_Config_Update)/,
    attachInsert: '  document.body.appendChild(panel);\n  devTrace.attachPanel(panel);\n  panelLog("Панель SUP_Config_Update',
  },
};

function injectInstances(text, scriptId) {
  const marker = "}\n\n  const PANEL_ID";
  const marker2 = "}\n\nconst ADDRESSBOOK";
  const marker3 = "}\n\n// =====";
  const marker4 = "}\n\n  const NEWS_ORIGINS";
  const marker5 = "}\n\n  /** @type";
  const inst =
    "\n  var __nativeFetch = fetch.bind(window);\n" +
    "  var devTrace = createDevToolsTrace({ scriptId: \"" +
    scriptId +
    "\" });\n" +
    "  var httpFetch = devTrace.wrapFetch(__nativeFetch);\n\n";
  for (const m of [marker, marker2, marker3, marker4, marker5]) {
    if (text.includes(m) && !text.includes("var devTrace = createDevToolsTrace")) {
      return text.replace(m, "}" + inst + m.slice(2));
    }
  }
  const endTrace = "    downloadLog: downloadLog\n  };\n}\n\n";
  if (text.includes(endTrace) && !text.includes("var devTrace = createDevToolsTrace")) {
    return text.replace(endTrace, "    downloadLog: downloadLog\n  };\n}\n" + inst);
  }
  return text;
}

function replaceFetch(text) {
  if (!text.includes("httpFetch")) return text;
  return text.replace(/\bawait fetch\(/g, "await httpFetch(");
}

/** @param {string} name */
function integrateFile(name) {
  const fp = path.join(SCRIPT_DIR, name);
  let text = fs.readFileSync(fp, "utf8");
  if (!text.includes("/* DevToolsTrace v1 */")) {
    console.warn("skip no trace: " + name);
    return;
  }
  if (text.includes("var devTrace = createDevToolsTrace")) {
    console.log("skip integrated: " + name);
    return;
  }
  const id = name.replace(/\.js$/, "");
  text = injectInstances(text, id);
  text = replaceFetch(text);

  if (name === "SUP_Config_Update.js") {
    text = text.replace(
      /const line = ts \+ " " \+ prefix \+ " " \+ msg;\n    if \(logEl\)/,
      'const line = ts + " " + prefix + " " + msg;\n    devTrace.log(line);\n    if (logEl)'
    );
    text = text.replace(
      /panel\.appendChild\(bundleInfoEl\);\n\n  logEl = document\.createElement\("pre"\)/,
      'panel.appendChild(bundleInfoEl);\n\n  devTrace.mountToggleRow(panel);\n\n  logEl = document.createElement("pre")'
    );
    text = text.replace(
      /document\.body\.appendChild\(panel\);\n  panelLog\("Панель SUP_Config_Update/,
      'document.body.appendChild(panel);\n  devTrace.attachPanel(panel);\n  panelLog("Панель SUP_Config_Update'
    );
  }

  if (name === "Parameters_Actual_Export.js") {
    text = text.replace(
      /function log\(msg\) \{\n    const ts =/,
      'function log(msg) {\n    devTrace.log(String(msg));\n    const ts ='
    );
    text = text.replace(
      /logEl\.textContent = "";\n    panel\.appendChild\(logWrap\);/,
      'logEl.textContent = "";\n    devTrace.mountToggleRow(panel, logWrap);\n    panel.appendChild(logWrap);'
    );
    text = text.replace(
      /document\.body\.appendChild\(panel\);\n\}\)\(\);/,
      "document.body.appendChild(panel);\n  devTrace.attachPanel(panel);\n})();"
    );
  }

  if (name === "AddressBook_export.js" || name === "AddressBook_export_OE.js") {
    text = text.replace(
      /function appendLog\(line\) \{\n    var s = String\(line\);\n/,
      "function appendLog(line) {\n    devTrace.log(String(line));\n    var s = String(line);\n"
    );
    text = text.replace(
      /logLab\.textContent = "Журнал работы";\n  box\.appendChild\(logLab\);\n  box\.appendChild\(logEl\);/,
      'logLab.textContent = "Журнал работы";\n  devTrace.mountToggleRow(box, logLab);\n  box.appendChild(logLab);\n  box.appendChild(logEl);'
    );
    text = text.replace(
      /startAddressBookPanel\(\);\nconsole\.log\(\n  "\[Адресная книга/,
      "startAddressBookPanel();\n(function attachTracePanel() {\n  var root = document.getElementById(\"" +
        (name.includes("_OE") ? "addressBookExportOePanelRoot" : "addressBookExportPanelRoot") +
        '");\n  if (root) devTrace.attachPanel(root);\n})();\nconsole.log(\n  "[Адресная книга'
    );
  }

  if (name === "File_DB_Load_GP.js" || name === "File_DB_Load_GP_v2.js") {
    text = text.replace(
      /function fileDlPanelEcho\(level, msg\) \{\n  var s =/,
      "function fileDlPanelEcho(level, msg) {\n  devTrace.log(typeof msg === \"string\" ? msg : String(msg));\n  var s ="
    );
    text = text.replace(
      /logLab\.textContent = "Журнал работы";\n  logLab\.style\.cssText = "font-weight:600[^"]*";\n  container\.appendChild\(logLab\);\n\n  const logEl = document\.createElement\("div"\);/,
      'logLab.textContent = "Журнал работы";\n  logLab.style.cssText = "font-weight:600;font-size:13px;color:#334155;margin:8px 0 4px 0;";\n  devTrace.mountToggleRow(container, logLab);\n  container.appendChild(logLab);\n\n  const logEl = document.createElement("div");'
    );
    const rootId = name.includes("v2") ? "fileDlGamificationPanelRootV2" : "fileDlGamificationPanelRoot";
    text = text.replace(
      new RegExp(
        "document\\.body\\.appendChild\\(container\\);\\n  fileDlPanelLogAppend = function \\(s\\)"
      ),
      "document.body.appendChild(container);\n  devTrace.attachPanel(container);\n  fileDlPanelLogAppend = function (s)"
    );
  }

  if (name === "News_Community_Export.js") {
    text = text.replace(
      /function log\(msg\) \{\n      var s = String\(msg\);\n/,
      "function log(msg) {\n      devTrace.log(String(msg));\n      var s = String(msg);\n"
    );
    text = text.replace(
      /logTitle\.textContent = "Журнал";\n      box\.appendChild\(logTitle\);\n      box\.appendChild\(logEl\);/,
      'logTitle.textContent = "Журнал";\n      devTrace.mountToggleRow(box, logTitle);\n      box.appendChild(logTitle);\n      box.appendChild(logEl);'
    );
    text = text.replace(/document\.body\.appendChild\(box\);\n    log\("Панель News/,
      'document.body.appendChild(box);\n    devTrace.attachPanel(box);\n    log("Панель News');
  }

  if (name === "Profile_GP_LOAD_file.js") {
    text = text.replace(
      /function appendJournalLine\(line\) \{\n  if \(typeof panelJournalAppend === "function"\)/,
      'function appendJournalLine(line) {\n  devTrace.log(String(line));\n  if (typeof panelJournalAppend === "function")'
    );
    text = text.replace(
      /journalLabel\.textContent = "Журнал работы";\n  panel\.appendChild\(journalLabel\);\n  panel\.appendChild\(journalEl\);/,
      'journalLabel.textContent = "Журнал работы";\n  devTrace.mountToggleRow(panel, journalLabel);\n  panel.appendChild(journalLabel);\n  panel.appendChild(journalEl);'
    );
    text = text.replace(
      /document\.body\.appendChild\(panel\);\n  appendJournalLine\("Панель Profile_GP/,
      'document.body.appendChild(panel);\n  devTrace.attachPanel(panel);\n  appendJournalLine("Панель Profile_GP'
    );
  }

  if (name === "Tournament_LeadersForAdmin.js") {
    text = text.replace(
      /function log\(msg\) \{\n    var s = String\(msg\);\n/,
      "function log(msg) {\n    devTrace.log(String(msg));\n    var s = String(msg);\n"
    );
    text = text.replace(
      /logLab\.textContent = "Журнал работы";\n  box\.appendChild\(logLab\);\n  box\.appendChild\(logEl\);/,
      'logLab.textContent = "Журнал работы";\n  devTrace.mountToggleRow(box, logLab);\n  box.appendChild(logLab);\n  box.appendChild(logEl);'
    );
    text = text.replace(
      /document\.body\.appendChild\(box\);\n  log\("Панель Tournament/,
      'document.body.appendChild(box);\n  devTrace.attachPanel(box);\n  log("Панель Tournament'
    );
  }

  if (name === "UI_AutoTest.js") {
    text = text.replace(
      /console\.log\("\[UI_AutoTest\] Старт прохода по меню"\);/,
      'devTrace.ui("autotest start", { items: MENU_HREFS.length });\n  console.log("[UI_AutoTest] Старт прохода по меню");'
    );
    text = text.replace(
      /console\.log\("\[UI_AutoTest\]" \+ \(ok \? " OK: " : " НЕ OK: "\) \+ href\);/,
      'devTrace.log("[UI_AutoTest]" + (ok ? " OK: " : " НЕ OK: ") + href);\n      console.log("[UI_AutoTest]" + (ok ? " OK: " : " НЕ OK: ") + href);'
    );
    if (!text.includes("devtools-trace-row")) {
      const bar =
        '\n  var traceBar = document.createElement("div");\n' +
        '  traceBar.style.cssText = "position:fixed;bottom:12px;left:12px;z-index:999999;max-width:420px;";\n' +
        "  document.body.appendChild(traceBar);\n" +
        "  devTrace.mountToggleRow(traceBar);\n";
      text = text.replace(/\(async function run\(\) \{/, "(async function run() {" + bar);
    }
  }

  if (name === "UI_AutoTest_LinksCrawler.js") {
    text = text.replace(
      /function appendLog\(msg\) \{\n    var line =/,
      "function appendLog(msg) {\n    devTrace.log(String(msg));\n    var line ="
    );
    text = text.replace(
      /logFileWrap\.appendChild\(logToFileLabel\);\n  panel\.appendChild\(logFileWrap\);/,
      "logFileWrap.appendChild(logToFileLabel);\n  devTrace.mountToggleRow(panel, logFileWrap);\n  panel.appendChild(logFileWrap);"
    );
    text = text.replace(
      /document\.body\.appendChild\(panel\);\n  restoreLogFromSession/,
      "document.body.appendChild(panel);\n  devTrace.attachPanel(panel);\n  restoreLogFromSession"
    );
  }

  fs.writeFileSync(fp, text, "utf8");
  console.log("integrated: " + name);
}

const files = fs.readdirSync(SCRIPT_DIR).filter((f) => f.endsWith(".js") && f !== "DevToolsTrace.js");
for (const f of files) integrateFile(f);
