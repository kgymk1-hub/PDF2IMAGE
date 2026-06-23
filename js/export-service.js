import { $, toast } from './ui-service.js';

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function zipImages(images, zipName, onProgress) {
  if (!window.JSZip) throw new Error('JSZipを読み込めませんでした。');

  const zip = new JSZip();
  images.forEach((image) => {
    zip.file(image.fileName, image.blob, { binary: true });
  });

  const blob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      encodeFileName: (name) => new TextEncoder().encode(name),
    },
    (metadata) => {
      onProgress?.(Math.round(metadata.percent));
    },
  );

  downloadBlob(blob, zipName);
}

function showManualCopy(text) {
  const dialog = $('#manualCopyDialog');
  const textarea = $('#manualCopyText');
  textarea.value = text;

  if (dialog?.showModal) dialog.showModal();
  else textarea.focus();

  requestAnimationFrame(() => {
    textarea.focus();
    textarea.select();
  });
}

export async function copyText(text) {
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error('Clipboard API is unavailable.');
    }

    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.warn(
      'Clipboard APIでのコピーに失敗しました。手動コピーUIを表示します。',
      error,
    );
    showManualCopy(text);
    toast('コピーに失敗しました。手動でコピーしてください。', 'error');
    return false;
  }
}
