window.__POSTPNG_BOOT = window.__POSTPNG_BOOT || {};
window.__POSTPNG_BOOT.appLoaded = true;

import {
  loadSettings,
  saveSettings,
  parsePageRange,
  safeBaseName,
  formatBytes,
} from "./settings-service.js";
import { loadPdf, renderPage } from "./pdf-service.js";
import { downloadBlob, zipImages, copyText } from "./export-service.js";
import {
  $,
  $$,
  toast,
  setMessage,
  setProgress,
  confirmDiscard,
} from "./ui-service.js";
let zipCompleteTimer;
const state = {
  settings: loadSettings(),
  file: null,
  pdf: null,
  images: [],
  status: "idle",
  cancel: false,
  dialogIndex: 0,
};
const names = { x: "X投稿モード", normal: "通常モード" };
const DEBUG = new URLSearchParams(location.search).has("debug");

function debugLog(...args) {
  if (DEBUG) console.info(...args);
}

function debugWarn(...args) {
  if (DEBUG) console.warn(...args);
}

debugLog("app.js loaded");
debugLog("location.href", location.href);
debugLog("location.protocol", location.protocol);
debugLog(
  "serviceWorker " +
    ("serviceWorker" in navigator ? "available" : "not available"),
);
function startupStatus() {
  return document.getElementById("startupStatus");
}
function setStartupStatus(message, type = "info") {
  const el = startupStatus();
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", type === "error");
  el.classList.remove("hidden");
}
function showRuntimeError(error) {
  const message = error?.message || String(error || "不明なエラー");
  setStartupStatus(
    `アプリの実行中にエラーが発生しました\n詳細：${message}`,
    "error",
  );
}
window.addEventListener("error", (event) => {
  console.error("window error", event.error || event.message, event);
  showRuntimeError(event.error || event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("window unhandledrejection", event.reason, event);
  showRuntimeError(event.reason);
});
function init() {
  setStartupStatus("アプリを起動しています…");
  try {
    debugLog("init started");
    debugLog("bind started");
    bind();
    debugLog("bind completed");
    debugLog("applySettingsToUi started");
    applySettingsToUi();
    debugLog("applySettingsToUi completed");
    updateFormatConstraints();
    debugLog("renderAll started");
    renderAll();
    debugLog("renderAll completed");
    debugLog("init completed");
    window.__POSTPNG_BOOT.initCompleted = true;
    setStartupStatus("アプリ起動完了");
    setTimeout(() => startupStatus()?.classList.add("hidden"), 3000);
  } catch (error) {
    console.error("init failed", error);
    const message = error?.message || String(error);
    setStartupStatus(`アプリの初期化に失敗しました\n詳細：${message}`, "error");
  }
}
function requireElement(id) {
  const el = $("#" + id);
  if (!el) throw new Error(`必須DOM要素が見つかりません: #${id}`);
  return el;
}
function requireModeRadios() {
  const radios = $$("input[name=mode]");
  if (!radios.length)
    throw new Error("必須DOM要素が見つかりません: input[name=mode]");
  return radios;
}
function verifyRequiredDom() {
  [
    "pdfFile",
    "settingsJumpBtn",
    "convertBtn",
    "bottomSelectBtn",
    "changePdfBtn",
    "settingsCard",
    "xSettings",
    "normalSettings",
    "message",
    "previewContainer",
  ].forEach(requireElement);
  requireModeRadios();
}
function openFilePicker() {
  const input = $("#pdfFile");
  input.value = "";
  input.click();
}

function bind() {
  verifyRequiredDom();
  $("#pdfFile").addEventListener("change", (e) =>
    handleFile(e.target.files?.[0]),
  );
  $("#bottomSelectBtn").onclick = openFilePicker;
  $("#changePdfBtn").onclick = openFilePicker;
  $("#settingsJumpBtn").onclick = () =>
    $("#settingsCard").scrollIntoView({ behavior: "smooth" });
  $("#convertBtn").onclick = convert;
  $("#reconvertBtn").onclick = convert;
  $("#downloadZipBtn").onclick = downloadAll;
  $("#cancelBtn").onclick = () => {
    state.cancel = true;
    setMessage(
      "キャンセル要求を受け付けました。現在のページ完了後に停止します。",
      "warn",
    );
  };
  $$("input[name=mode]").forEach(
    (r) => (r.onchange = () => changeMode(r.value)),
  );
  [
    "xWidth",
    "xTrim",
    "xQuality",
    "normalFormat",
    "normalScale",
    "pageRange",
    "backgroundColor",
    "normalTrim",
    "jpegQuality",
    "draftTitle",
    "draftDate",
    "draftNote",
    "draftTags",
    "altTemplate",
  ].forEach((id) => {
    const el = requireElement(id);
    el.addEventListener("input", readUiSettings);
    if (el.tagName === "SELECT") {
      el.addEventListener("change", readUiSettings);
    }
  });
  $("#normalFormat").onchange = () => {
    updateFormatConstraints();
    readUiSettings();
  };
  $("#jpegQuality").oninput = () =>
    ($("#jpegQualityText").textContent = $("#jpegQuality").value);
  $("#dropZone").addEventListener("dragover", (e) => {
    e.preventDefault();
    $("#dropZone").classList.add("drag");
  });
  $("#dropZone").addEventListener("dragleave", () =>
    $("#dropZone").classList.remove("drag"),
  );
  $("#dropZone").addEventListener("drop", (e) => {
    e.preventDefault();
    $("#dropZone").classList.remove("drag");
    handleFile(e.dataTransfer.files?.[0]);
  });
  $("#closeDialogBtn").onclick = () => $("#previewDialog").close();
  $("#prevImageBtn").onclick = () => openDialog(state.dialogIndex - 1);
  $("#nextImageBtn").onclick = () => openDialog(state.dialogIndex + 1);
  $("#saveDialogBtn").onclick = () => {
    const i = state.images[state.dialogIndex];
    if (i) downloadBlob(i.blob, i.fileName);
  };
}
function updateFormatConstraints() {
  const isJpeg = $("#normalFormat").value === "jpeg";
  $("#jpegQualityLabel").classList.toggle("hidden", !isJpeg);
  const transparent = $("#backgroundColor option[value=transparent]");
  transparent.disabled = isJpeg;
  $("#jpegTransparentHelp").classList.toggle("hidden", !isJpeg);
  if (isJpeg && $("#backgroundColor").value === "transparent")
    $("#backgroundColor").value = "white";
}
function readUiSettings() {
  updateFormatConstraints();
  Object.assign(state.settings, {
    mode: document.querySelector("input[name=mode]:checked").value,
    x: {
      width: $("#xWidth").value,
      trim: $("#xTrim").value,
      quality: $("#xQuality").value,
    },
    normal: {
      format: $("#normalFormat").value,
      scale: $("#normalScale").value,
      range: $("#pageRange").value,
      background: $("#backgroundColor").value,
      trim: $("#normalTrim").value,
      quality: Number($("#jpegQuality").value),
    },
    draft: {
      title: $("#draftTitle").value,
      date: $("#draftDate").value,
      note: $("#draftNote").value,
      tags: $("#draftTags").value,
      altTemplate: $("#altTemplate").value,
    },
  });
  saveSettings(state.settings);
  renderMode();
}
function applySettingsToUi() {
  document.querySelector(
    `input[name=mode][value=${state.settings.mode}]`,
  ).checked = true;
  $("#xWidth").value = state.settings.x.width;
  $("#xTrim").value = state.settings.x.trim;
  $("#xQuality").value = state.settings.x.quality;
  $("#normalFormat").value = state.settings.normal.format;
  $("#normalScale").value = state.settings.normal.scale;
  $("#pageRange").value = state.settings.normal.range;
  $("#backgroundColor").value = state.settings.normal.background;
  $("#normalTrim").value = state.settings.normal.trim;
  $("#jpegQuality").value = state.settings.normal.quality;
  $("#jpegQualityText").textContent = state.settings.normal.quality;
  $("#draftTitle").value = state.settings.draft.title;
  $("#draftDate").value = state.settings.draft.date;
  $("#draftNote").value = state.settings.draft.note;
  $("#draftTags").value = state.settings.draft.tags;
  $("#altTemplate").value = state.settings.draft.altTemplate;
  updateFormatConstraints();
}
function changeMode(mode) {
  if (state.images.length && !confirmDiscard()) {
    document.querySelector(
      `input[name=mode][value=${state.settings.mode}]`,
    ).checked = true;
    return;
  }
  revokeImages();
  state.settings.mode = mode;
  saveSettings(state.settings);
  renderAll();
}
async function handleFile(file) {
  if (!file) return;
  if (state.images.length && !confirmDiscard()) return;
  if (
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    setMessage("PDFファイルを選択してください。", "error");
    return;
  }
  revokeImages();
  state.file = file;
  state.pdf = null;
  state.status = "loadingPdf";
  renderAll();
  setMessage("PDFを読み込んでいます…");
  try {
    state.pdf = await loadPdf(file);
    state.status = "ready";
    setMessage(
      "読み込み完了。設定を確認して「変換する」を押してください。",
      "success",
    );
  } catch (e) {
    state.status = "error";
    setMessage(e.message, "error");
  }
  renderAll();
}
function revokeImages() {
  state.images.forEach((i) => URL.revokeObjectURL(i.url));
  state.images = [];
}
async function convert() {
  if (!state.pdf) return;
  readUiSettings();
  revokeImages();
  state.cancel = false;
  state.status = "converting";
  renderAll();
  try {
    const pages =
      state.settings.mode === "normal"
        ? parsePageRange(state.settings.normal.range, state.pdf.numPages)
        : Array.from({ length: state.pdf.numPages }, (_, i) => i + 1);
    if (
      pages.length > 20 &&
      !confirm(
        `${pages.length}ページを変換します。スマホでは時間がかかる場合があります。続行しますか？`,
      )
    ) {
      state.status = "ready";
      renderAll();
      return;
    }
    for (let idx = 0; idx < pages.length; idx++) {
      const p = pages[idx];
      setMessage(
        `変換中 ${idx + 1} / ${pages.length}ページ 現在：${p}ページ目を画像化しています`,
      );
      const opt =
        state.settings.mode === "x"
          ? {
              scale: state.settings.x.quality === "high" ? 3 : 2,
              format: "png",
              quality: 92,
              background: "white",
              trim: state.settings.x.trim === "on",
              width: state.settings.x.width,
            }
          : {
              scale: Number(state.settings.normal.scale),
              format: state.settings.normal.format,
              quality: state.settings.normal.quality,
              background: state.settings.normal.background,
              trim: state.settings.normal.trim === "on",
              width: "original",
            };
      const r = await renderPage(state.pdf, p, opt);
      const fileName = fileNameFor(p, opt.format);
      state.images.push({
        ...r,
        pageNumber: p,
        fileName,
        url: URL.createObjectURL(r.blob),
        setNumber: Math.ceil(p / 4),
        alt: makeAlt(p),
      });
      setProgress(((idx + 1) / pages.length) * 100);
      await new Promise(requestAnimationFrame);
      if (state.cancel) {
        state.status = "cancelled";
        setMessage("変換をキャンセルしました。途中まで保存できます。", "warn");
        renderAll();
        return;
      }
    }
    state.status = "converted";
    setMessage(`${state.images.length}ページを変換しました。`, "success");
    toast("変換が完了しました");
  } catch (e) {
    console.error(e);
    state.status = "error";
    setMessage(
      e.message ||
        "変換中にエラーが発生しました。倍率を下げて再度お試しください。",
      "error",
    );
  }
  renderAll();
}
function fileNameFor(page, fmt) {
  const ext = fmt === "jpeg" ? "jpg" : "png";
  const base = safeBaseName(state.file?.name);
  if (state.settings.mode === "x")
    return `${base}_xset${String(Math.ceil(page / 4)).padStart(2, "0")}_page-${String(page).padStart(2, "0")}.${ext}`;
  return `${base}_page-${String(page).padStart(2, "0")}.${ext}`;
}
function makeDraft(set) {
  const imgs = state.images.filter((i) => i.setNumber === set);
  const first = imgs[0]?.pageNumber || 1,
    last = imgs.at(-1)?.pageNumber || first;
  const d = state.settings.draft;
  return `${d.title ? `${d.title}を更新しました。\n\n` : ""}画像は${first}〜${last}ページ目です。\n${d.note || "詳細は添付画像をご確認ください。"}\n\n${d.date || ""}${d.date && d.tags ? "\n" : ""}${d.tags || ""}`.trim();
}
function makeAlt(page) {
  return (
    state.settings.draft.altTemplate ||
    "PDF資料の{page}ページ目を画像化したものです。"
  ).replaceAll("{page}", page);
}
function showZipComplete() {
  clearTimeout(zipCompleteTimer);
  setMessage("ZIP保存が完了しました", "success");
  toast("ZIP保存が完了しました");
  setProgress(100);
  zipCompleteTimer = setTimeout(() => {
    if (state.images.length) {
      setMessage(`${state.images.length}ページを変換しました。`, "success");
      setProgress(0);
    }
  }, 3000);
}
async function downloadAll() {
  if (!state.images.length) return;
  const base = safeBaseName(state.file?.name);
  setMessage("ZIP作成中…");
  setProgress(0);
  await zipImages(
    state.images,
    `${base}_${state.settings.mode === "x" ? "xpost_all" : "png"}.zip`,
    setProgress,
  )
    .then(showZipComplete)
    .catch((e) => {
      console.error("ZIP作成に失敗しました。", e);
      setMessage(`ZIP作成に失敗しました。${e.message}`, "error");
    });
}
async function downloadSet(set) {
  const imgs = state.images.filter((i) => i.setNumber === set);
  if (!imgs.length) return;
  setMessage(`ZIP作成中…（X投稿セット${set}）`);
  setProgress(0);
  await zipImages(
    imgs,
    `${safeBaseName(state.file?.name)}_xset${String(set).padStart(2, "0")}.zip`,
    setProgress,
  )
    .then(showZipComplete)
    .catch((e) => {
      console.error("ZIP作成に失敗しました。", e);
      setMessage(`ZIP作成に失敗しました。${e.message}`, "error");
    });
}
async function copyDraft(set) {
  if (await copyText(makeDraft(set))) toast("本文をコピーしました");
}
async function copyAlts(set) {
  const text = state.images
    .filter((i) => i.setNumber === set)
    .map((i) => `ページ${i.pageNumber}\n${i.alt}`)
    .join("\n---\n");
  if (await copyText(text)) toast("ALTをまとめてコピーしました");
}
function renderMode() {
  const m = state.settings.mode;
  $("#modeBadge").textContent = names[m];
  $("#selectedModeText").textContent = names[m];
  $("#modeHelp").textContent =
    m === "x"
      ? "4ページごとにX投稿セットを作り、白背景PNGで出力します。横幅は設定から選択できます。"
      : "ページ範囲、形式、倍率、背景色を選べる汎用変換モードです。";
  $("#xSettings").classList.toggle("hidden", m !== "x");
  $("#normalSettings").classList.toggle("hidden", m !== "normal");
  $("#recommendText").textContent =
    m === "x" ? "4枚ごとに投稿セット化" : "ページ範囲と形式を選んで変換";
}
function renderAll() {
  renderMode();
  const has = !!state.file;
  $("#pdfInfoCard").classList.toggle("hidden", !has);
  if (has) {
    $("#fileNameText").textContent = state.file.name;
    $("#fileSizeText").textContent = formatBytes(state.file.size);
    $("#pageCountText").textContent = state.pdf
      ? `${state.pdf.numPages}ページ`
      : "読み込み中";
    const warn =
      state.pdf && state.pdf.numPages > 20
        ? "ページ数が多いため、スマホでは分割変換や低倍率設定をおすすめします。"
        : "";
    $("#pdfWarning").textContent = warn;
    $("#pdfWarning").classList.toggle("hidden", !warn);
  }
  const conv = state.status === "converting",
    converted = state.images.length > 0;
  $("#cancelBtn").classList.toggle("hidden", !conv);
  $("#convertBtn").classList.toggle("hidden", !has || converted);
  $("#convertBtn").disabled = !state.pdf || conv;
  $("#bottomSelectBtn").classList.toggle("hidden", has);
  $("#downloadZipBtn").classList.toggle("hidden", !converted);
  $("#downloadZipBtn").disabled = !converted || conv;
  $("#changePdfBtn").disabled = conv;
  $("#reconvertBtn").classList.toggle("hidden", !converted);
  renderPreviews();
}
function renderPreviews() {
  const root = $("#previewContainer");

  if (!state.images.length) {
    root.className = "preview-container empty";
    root.innerHTML =
      "<p>変換後、ページごとのプレビューと保存ボタンが表示されます。</p>";
    return;
  }

  root.className = "preview-container";
  root.innerHTML = "";

  if (state.settings.mode === "x") {
    const max = Math.max(...state.images.map((i) => i.setNumber));
    for (let s = 1; s <= max; s++) {
      root.append(setCard(s));
    }
  } else {
    state.images.forEach((img, i) => root.append(pageCard(img, i)));
  }
}
function setCard(s) {
  const imgs = state.images.filter((i) => i.setNumber === s);
  const sec = document.createElement("section");
  sec.className = "post-set card";
  const first = imgs[0].pageNumber,
    last = imgs.at(-1).pageNumber;
  sec.innerHTML = `<details ${s === 1 ? "open" : ""}><summary><strong>X投稿セット ${s}</strong><span>対象：${first}〜${last}ページ / ${imgs.length}枚</span></summary><div class="set-actions"><button type="button">セットをZIP保存</button><button type="button">本文をコピー</button><button type="button">ALTをまとめてコピー</button><button type="button">セット名をコピー</button></div><p class="counter">通常投稿目安：${makeDraft(s).length}/280文字</p><div class="page-grid"></div></details>`;
  const b = $$("button", sec);
  b[0].onclick = () => downloadSet(s);
  b[1].onclick = () => copyDraft(s);
  b[2].onclick = () => copyAlts(s);
  b[3].onclick = async () => {
    if (await copyText(`X投稿セット${s} ${first}〜${last}ページ`))
      toast("セット名をコピーしました");
  };
  const grid = $(".page-grid", sec);
  imgs.forEach((img) => grid.append(pageCard(img, state.images.indexOf(img))));
  return sec;
}
function pageCard(img, index) {
  const a = document.createElement("article");
  a.className = "page-card";
  a.innerHTML = `<h3>ページ ${img.pageNumber}</h3><button class="image-button" type="button" aria-label="ページ${img.pageNumber}を拡大表示"><img loading="lazy" alt="ページ${img.pageNumber}の変換プレビュー" src="${img.url}"></button><p class="page-meta">サイズ：${img.width} × ${img.height}px / 容量：${formatBytes(img.blob.size)}</p><div class="card-actions"><button type="button">保存</button><button type="button">情報</button></div><label class="alt-field">ALT下書き</label><button class="copy-alt" type="button">ALTをコピー</button>`;
  const textarea = document.createElement("textarea");
  textarea.rows = 2;
  textarea.value = img.alt;
  $(".alt-field", a).append(textarea);
  $(".image-button", a).onclick = () => openDialog(index);
  const buttons = $$("button", a);
  buttons[1].onclick = () => downloadBlob(img.blob, img.fileName);
  buttons[2].onclick = () =>
    alert(`ファイル名: ${img.fileName}
ページ: ${img.pageNumber}
サイズ: ${img.width} × ${img.height}px
容量: ${formatBytes(img.blob.size)}
形式: ${img.fileName.endsWith(".jpg") ? "JPEG" : "PNG"}${
      state.settings.mode === "x" ? `
X投稿セット: ${img.setNumber}` : ""
    }`);
  $(".alt-field textarea", a).oninput = (e) => (img.alt = e.target.value);
  $(".copy-alt", a).onclick = async () => {
    if (await copyText(img.alt)) toast("ALTをコピーしました");
  };
  return a;
}
function openDialog(index) {
  if (index < 0 || index >= state.images.length) return;
  state.dialogIndex = index;
  const img = state.images[index];
  $("#dialogTitle").textContent =
    `ページ ${img.pageNumber} / ${state.images.length}`;
  $("#dialogImage").src = img.url;
  $("#previewDialog").showModal();
}
init();
import("./pwa-service.js").catch(debugWarn);
