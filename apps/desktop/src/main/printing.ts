/**
 * Silent printing for the desktop terminal.
 *
 * - `printHtml` renders a self-contained receipt document in a hidden,
 *   sandboxed window and sends it to a named Windows printer (no dialog).
 * - `printRaw` streams ESC/POS bytes to a network printer on port 9100.
 *
 * Both validate their input: only installed printer names are accepted, and
 * raw jobs only go to private LAN addresses, so a compromised page cannot
 * use the terminal to reach arbitrary hosts.
 */
import { BrowserWindow, type WebContents } from 'electron';
import { Socket } from 'node:net';
import { isIP } from 'node:net';
import type {
  HtmlPrintJob,
  LocalPrinterInfo,
  PrintResult,
  RawPrintJob,
} from '@posshope/shared';

const MAX_HTML_BYTES = 2_000_000;
const MAX_RAW_BYTES = 512_000;

export async function listPrinters(contents: WebContents): Promise<LocalPrinterInfo[]> {
  const printers = await contents.getPrintersAsync();
  return printers.map((printer) => ({
    name: printer.name,
    displayName: printer.displayName || printer.name,
    isDefault: Boolean((printer as { isDefault?: boolean }).isDefault),
  }));
}

function failure(error: string): PrintResult {
  return { ok: false, cancelled: /cancel/iu.test(error), error };
}

export async function printHtml(contents: WebContents, job: HtmlPrintJob): Promise<PrintResult> {
  if (typeof job.html !== 'string' || job.html.length === 0 || job.html.length > MAX_HTML_BYTES) {
    return failure('The receipt document is empty or too large');
  }
  const width = job.paperWidthMm === 58 ? 58 : 80;
  const copies = Math.min(Math.max(Math.trunc(job.copies ?? 1), 1), 5);
  if (job.deviceName) {
    const installed = await contents.getPrintersAsync();
    if (!installed.some((printer) => printer.name === job.deviceName)) {
      return failure(`Printer "${job.deviceName}" is not installed on this computer`);
    }
  }

  const window = new BrowserWindow({
    show: false,
    width: 400,
    height: 800,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: true,
      offscreen: false,
    },
  });
  // The document never navigates or opens anything.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());

  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(job.html)}`);
    const heightPx = Number(
      await window.webContents.executeJavaScript('document.documentElement.scrollHeight', true),
    );
    // Page height follows the content so a thermal roll is not fed blank paper.
    const heightMicrons = Math.max(Math.ceil(((heightPx || 600) * 25.4 * 1000) / 96) + 4000, 50_000);
    return await new Promise<PrintResult>((resolve) => {
      window.webContents.print(
        {
          silent: job.silent && Boolean(job.deviceName),
          printBackground: true,
          copies,
          margins: { marginType: 'none' },
          pageSize: { width: width * 1000, height: heightMicrons },
          ...(job.deviceName ? { deviceName: job.deviceName } : {}),
        },
        (success, reason) => resolve(success ? { ok: true } : failure(reason || 'Printing failed')),
      );
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Printing failed');
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}

/** RFC 1918, link-local and loopback IPv4, or a bare LAN hostname. */
export function isLanTarget(host: string): boolean {
  const value = host.trim();
  if (isIP(value) === 4) {
    const [a = 0, b = 0] = value.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  // Hostnames without a dot (e.g. "KITCHEN-PRN") or *.local / *.lan resolve on the LAN.
  return /^[A-Za-z0-9-]{1,63}$/u.test(value) || /^[A-Za-z0-9.-]+\.(local|lan|home)$/u.test(value);
}

export function printRaw(job: RawPrintJob): Promise<PrintResult> {
  if (!isLanTarget(job.host)) {
    return Promise.resolve(failure('Network printers must be on the local network (e.g. 192.168.x.x)'));
  }
  const port = Math.trunc(job.port);
  if (!(port >= 1 && port <= 65_535)) return Promise.resolve(failure('Invalid printer port'));
  let data: Buffer;
  try {
    data = Buffer.from(job.dataBase64, 'base64');
  } catch {
    return Promise.resolve(failure('Invalid print data'));
  }
  if (data.length === 0 || data.length > MAX_RAW_BYTES) {
    return Promise.resolve(failure('The print job is empty or too large'));
  }

  return new Promise<PrintResult>((resolve) => {
    const socket = new Socket();
    let settled = false;
    const finish = (result: PrintResult): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(6000);
    socket.once('timeout', () => finish(failure(`Printer ${job.host}:${port} did not answer`)));
    socket.once('error', (error) => finish(failure(`Printer ${job.host}:${port}: ${error.message}`)));
    socket.connect(port, job.host, () => {
      socket.end(data, () => finish({ ok: true }));
    });
  });
}
