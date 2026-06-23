export const $ = (selector, root = document) => root.querySelector(selector);

export const $$ = (selector, root = document) => [
  ...root.querySelectorAll(selector),
];

let toastTimer;

export function toast(text, type = "success") {
  const el = $("#toast");
  el.textContent = text;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.className = "toast";
  }, 2200);
}

export function setMessage(text, type = "") {
  const el = $("#message");
  el.textContent = text;
  el.className = `message ${type}`;
}

export function setProgress(value) {
  $("#progressBar").value = value;
  $("#progressText").textContent = `${Math.round(value)}%`;
}

export function confirmDiscard() {
  return confirm("変換済み画像を破棄して続行しますか？");
}
