import { canvasToBlob, resizeCanvas, trimWhitespace } from './image-service.js';

let pdfjsPromise;

async function getPdfjs() {
  try {
    if (!pdfjsPromise) pdfjsPromise = import('../libs/pdf.min.js');

    const pdfjs = await pdfjsPromise;
    pdfjs.GlobalWorkerOptions.workerSrc =
      new URL('../libs/pdf.worker.min.js', import.meta.url).toString();
    return pdfjs;
  } catch (error) {
    console.error(
      'PDF.js本体の読み込みに失敗しました。libs/pdf.min.js を確認してください。',
      error,
    );
    throw new Error(
      'PDF変換ライブラリの読み込みに失敗しました。アプリを再読み込みしてください。',
    );
  }
}

export async function loadPdf(file) {
  const isPdfFile =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (file.type && !isPdfFile) {
    throw new Error('PDFファイルを選択してください。');
  }

  const pdfjs = await getPdfjs();

  try {
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    return await pdfjs.getDocument({ data }).promise;
  } catch (error) {
    console.error('PDFの読み込みに失敗しました。', error);

    if (error?.name === 'PasswordException') {
      throw new Error(
        'パスワード付きPDFには現在対応していません。パスワード解除後のPDFを選択してください。',
      );
    }

    if (/worker/i.test(error?.message || '')) {
      throw new Error(
        'PDF workerの読み込みに失敗しました。アプリを再読み込みしてください。',
      );
    }

    throw new Error(
      'PDFの読み込みに失敗しました。ファイルが破損しているか、パスワード付きPDF、または対応外形式の可能性があります。',
    );
  }
}

export async function renderPage(pdf, pageNumber, opts) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: opts.scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  const alpha = opts.background === 'transparent' && opts.format === 'png';
  const backgroundColor = opts.background === 'black' ? '#000' : '#fff';
  const ctx = canvas.getContext('2d', { alpha });

  if (!alpha) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  await page.render({
    canvasContext: ctx,
    viewport,
    background: alpha ? undefined : backgroundColor,
  }).promise;

  const trimMode = opts.background === 'black'
    ? 'black'
    : opts.background === 'white'
      ? 'white'
      : 'white-only';
  let output = opts.trim && opts.background !== 'transparent'
    ? trimWhitespace(canvas, { background: backgroundColor, mode: trimMode })
    : canvas;

  output = resizeCanvas(output, opts.width, backgroundColor);

  const blob = await canvasToBlob(output, opts.format, opts.quality / 100);
  return { blob, width: output.width, height: output.height };
}
