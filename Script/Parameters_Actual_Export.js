// =============================================================================
// Parameters_Actual_Export.js — выгрузка параметров по статусу (2 этапа)
// =============================================================================
// Этап 1: POST /bo/rmkib.gamification/proxy/v1/parameters body { status: "<ACTUAL|ARCHIVE>" }
//         Получаем список и извлекаем objectId.
// Этап 2: по каждому objectId отдельный POST /bo/rmkib.gamification/proxy/v1/parameters
//         body { objectIds: [ "<id>" ] }.
//
// Стенды: PROM / PSI. Контуры: ALPHA / SIGMA.
// Куки сессии берутся автоматически из текущей вкладки (credentials: "include").
// =============================================================================

(function () {
  "use strict";

  /** По умолчанию: стенд PROM, контур SIGMA. */
  const DEFAULT_STAND = "PROM";
  const DEFAULT_CONTOUR = "SIGMA";
  const DEFAULT_STATUS = "ACTUAL";

  /** Значение по умолчанию для паузы между запросами детализации, мс. */
  const DEFAULT_DELAY_MS = 50;
  const MAX_DELAY_MS = 600000;

  /**
   * Базовые URL для 4 вариантов.
   * Для PSI временно используются те же ссылки, что и для PROM (по ТЗ из ToDo).
   */
  const PARAMETER_ORIGINS = {
    PROM: {
      ALPHA: "https://efs-our-business-prom.omega.sbrf.ru",
      SIGMA: "https://salesheroes.sberbank.ru"
    },
    PSI: {
      ALPHA: "https://iam-enigma-psi.omega.sbrf.ru",
      SIGMA: "https://salesheroes-psi.sigma.sbrf.ru"
    }
  };

  const PARAMETERS_PATH = "/bo/rmkib.gamification/proxy/v1/parameters";

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function dateYmd() {
    const d = new Date();
    const p = function (n) {
      return String(n).padStart(2, "0");
    };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function readDelayMs(inp) {
    var n = parseInt(String(inp.value || "").trim(), 10);
    if (isNaN(n) || n < 0) return DEFAULT_DELAY_MS;
    if (n > MAX_DELAY_MS) return MAX_DELAY_MS;
    return n;
  }

  /**
   * Извлекает уникальные objectId из ответа списка параметров.
   * @param {*} listData
   * @returns {string[]}
   */
  function extractObjectIds(listData) {
    const arr =
      listData &&
      listData.body &&
      Array.isArray(listData.body.parameters)
        ? listData.body.parameters
        : [];
    const out = [];
    const seen = {};
    for (var i = 0; i < arr.length; i++) {
      const id = arr[i] && arr[i].objectId != null ? String(arr[i].objectId).trim() : "";
      if (!id || seen[id]) continue;
      seen[id] = true;
      out.push(id);
    }
    return out;
  }

  async function postParameters(origin, bodyObj) {
    const res = await fetch(origin + PARAMETERS_PATH, {
      method: "POST",
      mode: "cors",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(bodyObj || {})
    });
    const data = await res.json().catch(function () {
      return null;
    });
    return {
      ok: res.ok,
      status: res.status,
      body: bodyObj,
      data: data
    };
  }

  function downloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], {
      type: "application/json"
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 0);
  }

  function startPanel() {
    var prev = document.getElementById("parametersActualExportPanelRoot");
    if (prev) prev.remove();

    var busy = false;

    const box = document.createElement("div");
    box.id = "parametersActualExportPanelRoot";
    box.style.cssText =
      "position:fixed;top:12px;left:12px;width:min(760px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;" +
      "z-index:999999;box-sizing:border-box;padding:18px;" +
      "background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;" +
      "box-shadow:0 10px 40px rgba(15,23,42,.12);font-family:system-ui,-apple-system,sans-serif;" +
      "font-size:12px;color:#0f172a;color-scheme:light;";

    const title = document.createElement("div");
    title.style.cssText = "font-size:17px;font-weight:700;color:#0f172a;margin:0 0 4px 0;letter-spacing:-0.02em;";
    title.textContent = "Параметры — выгрузка по статусу";
    box.appendChild(title);

    const sub = document.createElement("div");
    sub.style.cssText = "font-size:12px;color:#64748b;margin:0 0 12px 0;line-height:1.45;";
    sub.textContent =
      "Сценарий: список по статусу (ACTUAL/ARCHIVE) → objectId → отдельный запрос по каждому objectId. Подробности — в «Журнал работы».";
    box.appendChild(sub);

    const controls = document.createElement("div");
    controls.style.cssText =
      "display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px 10px;padding:10px 12px;margin-bottom:10px;" +
      "background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;align-items:end;";

    function mkLabel(text, forId) {
      const l = document.createElement("label");
      l.textContent = text;
      l.setAttribute("for", forId);
      l.style.cssText = "display:block;font-size:11px;color:#334155;margin-bottom:4px;font-weight:600;";
      return l;
    }

    const contourWrap = document.createElement("div");
    const contourId = "paramsActualContourSel";
    const contourLabel = mkLabel("Стенд", contourId);
    const selContour = document.createElement("select");
    selContour.id = contourId;
    selContour.style.cssText =
      "width:100%;box-sizing:border-box;padding:6px 8px;font-size:12px;border:1px solid #94a3b8;border-radius:6px;color-scheme:light;";
    ["PROM", "PSI"].forEach(function (k) {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = k;
      if (k === DEFAULT_STAND) o.selected = true;
      selContour.appendChild(o);
    });
    contourWrap.appendChild(contourLabel);
    contourWrap.appendChild(selContour);
    controls.appendChild(contourWrap);

    const standWrap = document.createElement("div");
    const standId = "paramsActualStandSel";
    const standLabel = mkLabel("Контур", standId);
    const selStand = document.createElement("select");
    selStand.id = standId;
    selStand.style.cssText =
      "width:100%;box-sizing:border-box;padding:6px 8px;font-size:12px;border:1px solid #94a3b8;border-radius:6px;color-scheme:light;";
    ["SIGMA", "ALPHA"].forEach(function (k) {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = k;
      if (k === DEFAULT_CONTOUR) o.selected = true;
      selStand.appendChild(o);
    });
    standWrap.appendChild(standLabel);
    standWrap.appendChild(selStand);
    controls.appendChild(standWrap);

    const statusWrap = document.createElement("div");
    const statusId = "paramsActualStatusSel";
    const statusLabel = mkLabel("Статус (этап 1)", statusId);
    const selStatus = document.createElement("select");
    selStatus.id = statusId;
    selStatus.style.cssText =
      "width:100%;box-sizing:border-box;padding:6px 8px;font-size:12px;border:1px solid #94a3b8;border-radius:6px;color-scheme:light;";
    ["ACTUAL", "ARCHIVE"].forEach(function (k) {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = k;
      if (k === DEFAULT_STATUS) o.selected = true;
      selStatus.appendChild(o);
    });
    statusWrap.appendChild(statusLabel);
    statusWrap.appendChild(selStatus);
    controls.appendChild(statusWrap);

    const delayWrap = document.createElement("div");
    const delayId = "paramsActualDelayInp";
    const delayLabel = mkLabel("Пауза между objectId, мс", delayId);
    const inpDelay = document.createElement("input");
    inpDelay.id = delayId;
    inpDelay.type = "number";
    inpDelay.min = "0";
    inpDelay.max = String(MAX_DELAY_MS);
    inpDelay.step = "1";
    inpDelay.value = String(DEFAULT_DELAY_MS);
    inpDelay.style.cssText =
      "width:100%;box-sizing:border-box;padding:6px 8px;font-size:12px;border:1px solid #94a3b8;border-radius:6px;color-scheme:light;";
    delayWrap.appendChild(delayLabel);
    delayWrap.appendChild(inpDelay);
    controls.appendChild(delayWrap);

    const runWrap = document.createElement("div");
    const btnRun = document.createElement("button");
    btnRun.type = "button";
    btnRun.textContent = "Запустить выгрузку";
    btnRun.style.cssText =
      "width:100%;min-height:34px;padding:8px 10px;font-size:11px;font-weight:700;cursor:pointer;border:none;border-radius:8px;color:#fff;" +
      "background:linear-gradient(180deg,#0284c7,#0369a1);box-shadow:0 2px 6px rgba(3,105,161,.3);";
    runWrap.appendChild(document.createElement("div"));
    runWrap.appendChild(btnRun);
    controls.appendChild(runWrap);

    box.appendChild(controls);

    const envInfo = document.createElement("div");
    envInfo.style.cssText =
      "font-size:11px;color:#334155;line-height:1.45;margin:0 0 10px 0;padding:8px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;word-break:break-all;";
    box.appendChild(envInfo);
    function refreshEnvInfo() {
      const contour = selContour.value;
      const stand = selStand.value;
      const origin =
        (PARAMETER_ORIGINS[contour] && PARAMETER_ORIGINS[contour][stand]) ||
        PARAMETER_ORIGINS.PROM.SIGMA;
      envInfo.textContent = "Текущий endpoint: " + origin + PARAMETERS_PATH;
    }
    selContour.addEventListener("change", refreshEnvInfo);
    selStand.addEventListener("change", refreshEnvInfo);
    refreshEnvInfo();

    const logLab = document.createElement("div");
    logLab.style.cssText =
      "font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#64748b;margin:14px 0 8px 0;";
    logLab.textContent = "Журнал работы";
    box.appendChild(logLab);

    const logEl = document.createElement("div");
    logEl.style.cssText =
      "margin:0;font-size:11px;color:#0f172a;background:#f8fafc;min-height:170px;max-height:320px;overflow:auto;" +
      "border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-family:ui-monospace,monospace;" +
      "white-space:pre-wrap;word-break:break-word;line-height:1.45;box-sizing:border-box;width:100%;";
    logEl.textContent = "—";
    box.appendChild(logEl);

    function log(s) {
      const line = typeof s === "string" ? s : String(s);
      if (logEl.textContent === "—") logEl.textContent = line;
      else logEl.textContent = logEl.textContent + "\n" + line;
      logEl.scrollTop = logEl.scrollHeight;
    }

    function setBusy(v) {
      busy = v;
      selContour.disabled = v;
      selStand.disabled = v;
      selStatus.disabled = v;
      inpDelay.disabled = v;
      btnRun.disabled = v;
    }

    btnRun.addEventListener("click", function () {
      if (busy) {
        log("Уже выполняется выгрузка — дождитесь завершения.");
        return;
      }
      const contour = selContour.value;
      const stand = selStand.value;
      const origin =
        (PARAMETER_ORIGINS[contour] && PARAMETER_ORIGINS[contour][stand]) ||
        PARAMETER_ORIGINS.PROM.SIGMA;
      const statusForList = selStatus.value;
      const pauseMs = readDelayMs(inpDelay);

      setBusy(true);
      void (async function () {
        try {
          console.log(
            "[Параметры] Запущена выгрузка. Стенд: " +
              contour +
              ", контур: " +
              stand +
              ", статус: " +
              statusForList +
              ". Подробности — в «Журнал работы»."
          );
          log(
            "Старт: стенд=" +
              contour +
              ", контур=" +
              stand +
              ", статус=" +
              statusForList +
              ", пауза=" +
              pauseMs +
              " мс"
          );
          log("Этап 1/2: список по status=" + statusForList + " …");

          const listRes = await postParameters(origin, { status: statusForList });
          log("  → список HTTP " + listRes.status + (listRes.ok ? " OK" : " — ошибка"));

          const objectIds = extractObjectIds(listRes.data);
          log("  → objectId к обработке: " + objectIds.length);

          const details = [];
          let okCount = 0;
          let errCount = 0;

          for (let i = 0; i < objectIds.length; i++) {
            const id = objectIds[i];
            log("Этап 2/2 [" + (i + 1) + "/" + objectIds.length + "] objectId " + id + " …");
            try {
              const d = await postParameters(origin, { objectIds: [id] });
              details.push({
                objectId: id,
                ok: d.ok,
                status: d.status,
                data: d.data
              });
              if (d.ok) okCount++;
              else errCount++;
              log("  → HTTP " + d.status + (d.ok ? " OK" : " — ошибка"));
            } catch (e) {
              details.push({
                objectId: id,
                ok: false,
                status: null,
                error: String(e)
              });
              errCount++;
              log("  → исключение: " + e);
            }
            if (i < objectIds.length - 1 && pauseMs > 0) await delay(pauseMs);
          }

          const out = {
            meta: {
              generatedAt: nowIso(),
              stand: contour,
              contour: stand,
              origin: origin,
              endpointPath: PARAMETERS_PATH,
              pauseBetweenDetailsMs: pauseMs,
              listRequestBody: { status: statusForList },
              totalObjectIds: objectIds.length,
              detailOk: okCount,
              detailErrors: errCount
            },
            list: listRes,
            details: details
          };

          const fileName = "parameters_" + contour + "_" + stand + "_" + dateYmd() + ".json";
          downloadJson(fileName, out);
          log(
            "Готово. Файл: " +
              fileName +
              " | objectId: " +
              objectIds.length +
              " | OK: " +
              okCount +
              " | ошибок: " +
              errCount
          );
          console.log(
            "[Параметры] Готово. Файл: " +
              fileName +
              " | objectId: " +
              objectIds.length +
              " | OK: " +
              okCount +
              " | ошибок: " +
              errCount
          );
        } catch (e) {
          log("Сбой сценария: " + e);
          console.error("[Параметры] Сбой сценария:", e);
        } finally {
          setBusy(false);
        }
      })();
    });

    const btnClose = document.createElement("button");
    btnClose.type = "button";
    btnClose.textContent = "Закрыть панель";
    btnClose.style.cssText =
      "margin-top:14px;width:100%;box-sizing:border-box;min-height:42px;padding:10px 14px;font-size:12px;cursor:pointer;" +
      "background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:8px;font-weight:500;";
    btnClose.addEventListener("click", function () {
      box.remove();
    });
    box.appendChild(btnClose);

    document.body.appendChild(box);
  }

  startPanel();
  console.log(
    "[Параметры] Панель открыта. Контур/стенд/пауза на панели; подробности — в «Журнал работы»."
  );
})();
