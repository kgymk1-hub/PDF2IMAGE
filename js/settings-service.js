export const DEFAULTS = {
  mode: "x",
  x: {
    width: "1600",
    trim: "on",
    quality: "standard",
  },
  normal: {
    format: "png",
    scale: "2",
    range: "",
    background: "white",
    trim: "off",
    quality: 80,
  },
  draft: {
    title: "",
    date: "",
    note: "詳細は添付画像をご確認ください。",
    tags: "",
    altTemplate:
      "PDF資料の{page}ページ目を画像化したものです。タイトル、表、注記が含まれています。",
  },
};

const KEY = "postpng-maker-settings-v2";

export function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(defaults, saved) {
  const out = clone(defaults);
  if (!isPlainObject(saved)) return out;

  for (const [key, value] of Object.entries(saved)) {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key], value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }

  return out;
}

export function loadSettings() {
  try {
    return deepMerge(DEFAULTS, JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch (error) {
    console.warn(
      "保存済み設定を読み込めないため、初期設定を使用します。",
      error,
    );
    return clone(DEFAULTS);
  }
}

export function saveSettings(settings) {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      mode: settings.mode,
      x: settings.x,
      normal: settings.normal,
      draft: settings.draft,
    }),
  );
}

export function parsePageRange(input, total) {
  const raw = (input || "").trim();
  if (!raw || raw === "全ページ") {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const out = [];
  for (const part of raw.split(",")) {
    const p = part.trim();
    if (!p) continue;

    if (p.includes("-")) {
      const [a, b] = p.split("-").map((v) => Number(v.trim()));
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < a) {
        throw new Error("ページ範囲の指定が正しくありません。例: 1-4,8");
      }
      for (let n = a; n <= b; n++) out.push(n);
    } else {
      const n = Number(p);
      if (!Number.isInteger(n) || n < 1) {
        throw new Error("ページ番号は1以上の数字で指定してください。");
      }
      out.push(n);
    }
  }

  const uniq = [...new Set(out)];
  if (uniq.some((n) => n > total)) {
    throw new Error(`ページ範囲がPDFのページ数（${total}ページ）を超えています。`);
  }
  return uniq;
}

export const safeBaseName = (name = "converted") =>
  name
    .replace(/\.pdf$/i, "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_")
    .replace(/[\s.]+$/g, "")
    .replace(/^_+|_+$/g, "") || "converted";

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0B";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${Math.ceil(bytes / 1024)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}
