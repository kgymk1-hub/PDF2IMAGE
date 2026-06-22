const pdfFileInput = document.querySelector('#pdfFile');
const fileInfo = document.querySelector('#fileInfo');
const convertBtn = document.querySelector('#convertBtn');
const downloadZipBtn = document.querySelector('#downloadZipBtn');
const message = document.querySelector('#message');
const progressBar = document.querySelector('#progressBar');
const progressText = document.querySelector('#progressText');
const previewContainer = document.querySelector('#previewContainer');
const setTemplate = document.querySelector('#setTemplate');
const pageTemplate = document.querySelector('#pageTemplate');

let selectedFile = null;
let convertedPages = [];

const setMessage = (text, type = '') => {
  message.textContent = text;
  message.className = `message ${type}`.trim();
};

const setProgress = (current, total) => {
  const value = total ? Math.round((current / total) * 100) : 0;
  progressBar.value = value;
  progressText.textContent = `${value}%`;
};

const getSelectedValue = (name) => document.querySelector(`input[name="${name}"]:checked`).value;

const safeBaseName = (name) => name.replace(/\.pdf$/i, '').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'converted_pdf';
const pageFileName = (baseName, pageNumber) => `${baseName}_page-${String(pageNumber).padStart(2, '0')}.png`;

pdfFileInput.addEventListener('change', () => {
  selectedFile = pdfFileInput.files?.[0] ?? null;
  convertedPages.forEach((page) => URL.revokeObjectURL(page.url));
  convertedPages = [];
  renderPreviews();
  downloadZipBtn.disabled = true;
  setProgress(0, 0);

  if (!selectedFile) {
    fileInfo.textContent = 'ファイルは選択されていません。';
    convertBtn.disabled = true;
    setMessage('PDFを選択すると変換できます。');
    return;
  }

  if (selectedFile.type !== 'application/pdf' && !selectedFile.name.toLowerCase().endsWith('.pdf')) {
    selectedFile = null;
    convertBtn.disabled = true;
    fileInfo.textContent = 'PDFファイルを選択してください。';
    setMessage('選択されたファイルはPDFではありません。', 'error');
    return;
  }

  fileInfo.textContent = `${selectedFile.name}（${(selectedFile.size / 1024 / 1024).toFixed(2)} MB）`;
  convertBtn.disabled = false;
  setMessage('設定を選んで「PNGに変換」を押してください。');
});

convertBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  convertBtn.disabled = true;
  downloadZipBtn.disabled = true;
  convertedPages.forEach((page) => URL.revokeObjectURL(page.url));
  convertedPages = [];
  renderPreviews();
  setProgress(0, 1);
  setMessage('PDFを読み込んでいます…');

  try {
    const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

    const bytes = await selectedFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const scale = Number(getSelectedValue('scale'));
    const resizeWidth = getSelectedValue('resizeWidth');
    const baseName = safeBaseName(selectedFile.name);

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      setMessage(`${pageNumber}/${pdf.numPages}ページ目を変換中…`);
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const renderCanvas = document.createElement('canvas');
      const renderContext = renderCanvas.getContext('2d', { alpha: false });
      renderCanvas.width = Math.ceil(viewport.width);
      renderCanvas.height = Math.ceil(viewport.height);
      renderContext.fillStyle = '#ffffff';
      renderContext.fillRect(0, 0, renderCanvas.width, renderCanvas.height);
      await page.render({ canvasContext: renderContext, viewport, background: 'white' }).promise;

      const outputCanvas = resizeCanvas(renderCanvas, resizeWidth);
      const blob = await canvasToPngBlob(outputCanvas);
      const fileName = pageFileName(baseName, pageNumber);
      convertedPages.push({ pageNumber, fileName, blob, url: URL.createObjectURL(blob), width: outputCanvas.width, height: outputCanvas.height });
      setProgress(pageNumber, pdf.numPages);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    renderPreviews();
    downloadZipBtn.disabled = convertedPages.length === 0;
    setMessage(`${convertedPages.length}ページをPNGに変換しました。`, 'success');
  } catch (error) {
    console.error(error);
    setMessage(`変換できませんでした。PDFが破損していないか、別のファイルでお試しください。（${error.message}）`, 'error');
    setProgress(0, 1);
  } finally {
    convertBtn.disabled = !selectedFile;
  }
});

downloadZipBtn.addEventListener('click', async () => {
  if (!convertedPages.length || !window.JSZip) return;
  downloadZipBtn.disabled = true;
  setMessage('ZIPファイルを作成中…');

  try {
    const zip = new JSZip();
    convertedPages.forEach((page) => zip.file(page.fileName, page.blob));
    const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
      progressBar.value = Math.round(metadata.percent);
      progressText.textContent = `${Math.round(metadata.percent)}%`;
    });
    const url = URL.createObjectURL(zipBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeBaseName(selectedFile?.name ?? 'converted_pdf')}_png_pages.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('ZIPファイルを保存しました。', 'success');
  } catch (error) {
    console.error(error);
    setMessage(`ZIPを作成できませんでした。（${error.message}）`, 'error');
  } finally {
    downloadZipBtn.disabled = false;
  }
});

function resizeCanvas(sourceCanvas, resizeWidth) {
  if (resizeWidth === 'original') return sourceCanvas;
  const targetWidth = Number(resizeWidth);
  const ratio = targetWidth / sourceCanvas.width;
  const targetHeight = Math.round(sourceCanvas.height * ratio);
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = targetWidth;
  outputCanvas.height = targetHeight;
  const ctx = outputCanvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
  return outputCanvas;
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNGの生成に失敗しました')), 'image/png');
  });
}

function renderPreviews() {
  previewContainer.innerHTML = '';
  previewContainer.classList.toggle('empty', convertedPages.length === 0);
  if (!convertedPages.length) {
    previewContainer.innerHTML = '<p>変換後、ページごとのプレビューとダウンロードボタンが表示されます。</p>';
    return;
  }

  for (let index = 0; index < convertedPages.length; index += 4) {
    const setNode = setTemplate.content.firstElementChild.cloneNode(true);
    const setNumber = Math.floor(index / 4) + 1;
    setNode.querySelector('h3').textContent = `X投稿セット${setNumber}`;
    const grid = setNode.querySelector('.page-grid');

    convertedPages.slice(index, index + 4).forEach((page) => {
      const pageNode = pageTemplate.content.firstElementChild.cloneNode(true);
      const img = pageNode.querySelector('img');
      img.src = page.url;
      img.alt = `${page.fileName} のプレビュー`;
      pageNode.querySelector('strong').textContent = `ページ ${page.pageNumber}`;
      pageNode.querySelector('span').textContent = `${page.width}×${page.height}px`;
      const link = pageNode.querySelector('.download-link');
      link.href = page.url;
      link.download = page.fileName;
      grid.append(pageNode);
    });

    previewContainer.append(setNode);
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch((error) => console.warn('Service worker registration failed:', error));
  });
}
