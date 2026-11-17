/*
 * Rasterizes the Corner Pizza logo into the desktop app icons:
 *   build/icon.png  1024px master, loaded by the BrowserWindow
 *   build/icon.ico  multi-size Windows icon, used by packager and Squirrel
 *
 * Run with: pnpm --filter @posshope/desktop icons
 * Uses Electron's own Chromium to render the SVG, so no extra tooling is needed.
 */
const { app, BrowserWindow, nativeImage } = require('electron');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');

const appRoot = resolve(__dirname, '..');
const svgPath = resolve(appRoot, '../../packages/ui/src/assets/corner-logo.svg');
const outDir = join(appRoot, 'build');
const MASTER = 1024;
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);

  let offset = 6 + pngs.length * 16;
  const entries = pngs.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...pngs.map(({ data }) => data)]);
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const svg = readFileSync(svgPath, 'utf8');
  const svgUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const inset = Math.round(MASTER * 0.06);

  // Draw through a canvas: a window capture would be clamped to the screen.
  const win = new BrowserWindow({
    width: 400,
    height: 300,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  await win.loadURL('about:blank');

  const dataUrl = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = ${MASTER};
    canvas.height = ${MASTER};
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, ${inset}, ${inset}, ${MASTER - inset * 2}, ${MASTER - inset * 2});
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Could not load the logo SVG'));
    img.src = ${JSON.stringify(svgUrl)};
  })`);

  const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  const shot = nativeImage.createFromBuffer(png);
  if (shot.getSize().width !== MASTER) throw new Error('Logo did not render at master size');

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'icon.png'), png);

  const pngs = ICO_SIZES.map((size) => ({
    size,
    data: shot.resize({ width: size, height: size, quality: 'best' }).toPNG(),
  }));
  writeFileSync(join(outDir, 'icon.ico'), buildIco(pngs));

  console.log(`Wrote ${join(outDir, 'icon.png')} and icon.ico (${ICO_SIZES.join(', ')}px)`);
  app.quit();
});
