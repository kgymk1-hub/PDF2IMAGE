export async function canvasToBlob(canvas, format = 'png', quality = 0.8) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('画像Blobの生成に失敗しました。'));
      },
      format === 'jpeg' ? 'image/jpeg' : 'image/png',
      quality,
    );
  });
}

export function resizeCanvas(src, targetWidth, bg = '#fff') {
  if (targetWidth === 'original' || !targetWidth) return src;

  const width = Number(targetWidth);
  if (!width || src.width <= width) return src;

  const height = Math.round(src.height * (width / src.width));
  return copyCanvas(src, width, height, false, bg);
}

export function copyCanvas(
  src,
  width = src.width,
  height = src.height,
  alpha = false,
  bg = '#fff',
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { alpha });
  if (!alpha) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, width, height);
  return canvas;
}

export function trimWhitespace(
  src,
  { threshold = 18, padding = 16, background = '#fff', mode = 'white' } = {},
) {
  const ctx = src.getContext('2d');
  const { width: w, height: h } = src;
  if (!w || !h) return src;

  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  const isMargin = (i) => {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3] ?? 255;

    if (a === 0) return true;
    if (mode === 'black') {
      return r <= threshold && g <= threshold && b <= threshold;
    }
    return r >= 255 - threshold && g >= 255 - threshold && b >= 255 - threshold;
  };

  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      if (!isMargin(i)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return src;

  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(w - 1, maxX + padding);
  maxY = Math.min(h - 1, maxY + padding);

  const nw = maxX - minX + 1;
  const nh = maxY - minY + 1;

  if (nw > w * 0.94 && nh > h * 0.94) return src;
  if (nw < Math.max(64, w * 0.12) || nh < Math.max(64, h * 0.12)) {
    return src;
  }

  const canvas = document.createElement('canvas');
  canvas.width = nw;
  canvas.height = nh;

  const out = canvas.getContext('2d', { alpha: false });
  out.fillStyle = background;
  out.fillRect(0, 0, nw, nh);
  out.drawImage(src, minX, minY, nw, nh, 0, 0, nw, nh);
  return canvas;
}
