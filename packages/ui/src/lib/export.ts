import { CORNER_LOGO_DATA_URL } from '../assets/corner-logo-data';
import { translate } from '../i18n/dictionaries';
import { getActiveLanguage } from './language';

export type ExportValue = string | number | null | undefined;

function escapeCsv(value: ExportValue): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

export function downloadCsv(fileName: string, rows: ExportValue[][]): void {
  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export interface ExportSheet {
  name: string;
  /** The first row is rendered bold and highlighted. */
  rows: ExportValue[][];
  widths?: number[];
}

export async function downloadExcel(fileName: string, sheets: ExportSheet[]): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const payload = sheets.map((sheet) => ({
    sheet: sheet.name.slice(0, 31),
    data: sheet.rows.map((row, rowIndex) =>
      row.map((cell) => {
        if (cell === null || cell === undefined) return null;
        if (rowIndex === 0 && typeof cell === 'string') {
          return { value: cell, fontWeight: 'bold' as const, backgroundColor: '#F4EDE4' };
        }
        return cell;
      }),
    ),
    ...(sheet.widths ? { columns: sheet.widths.map((width) => ({ width })) } : {}),
  }));
  await writeXlsxFile(payload, {}).toFile(
    fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`,
  );
}

export interface PdfSection {
  heading?: string;
  headers: string[];
  rows: ExportValue[][];
  /** Per-column alignment, defaulting to left. Use `right` for numeric columns. */
  columnAlign?: Array<'left' | 'right' | 'center'>;
}

export interface PdfDocument {
  title: string;
  subtitle?: string;
  meta?: Array<{ label: string; value: string }>;
  sections: PdfSection[];
  footer?: string;
}

function escapeHtml(value: ExportValue): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
}

function buildPdfHtml(doc: PdfDocument): string {
  const language = getActiveLanguage();
  const rtl = language === 'ar';
  const direction = rtl ? 'rtl' : 'ltr';
  const startSide = rtl ? 'right' : 'left';
  const endSide = rtl ? 'left' : 'right';
  const fontStack = rtl
    ? "'IBM Plex Sans Arabic','Segoe UI',Arial,sans-serif"
    : "'Segoe UI','Inter',Arial,sans-serif";
  const brandName = escapeHtml(translate(language, 'app.fullName'));

  const brandStyle = rtl
    ? 'margin:2px 0 0;font-size:12px;font-weight:700;color:#9C1C21;'
    : 'margin:2px 0 0;font-size:10.5px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#9C1C21;';

  // Arabic must not get letter-spacing/uppercase: html2canvas then draws it
  // glyph-by-glyph in visual (reversed, disconnected) order.
  const headerTextStyle = `text-transform:${rtl ? 'none' : 'uppercase'};letter-spacing:${rtl ? '0' : '0.06em'};`;

  const align = (value: 'left' | 'right' | 'center' | undefined): string => {
    const column = value ?? 'left';
    return rtl && column === 'left' ? 'right' : column;
  };

  const meta = (doc.meta ?? [])
    .map(
      (row) =>
        `<tr>
          <td style="padding:3px 0;font-size:10.5px;color:#8B8178;text-align:${startSide};vertical-align:top;">${escapeHtml(row.label)}</td>
          <td style="padding:3px 0;font-size:11.5px;font-weight:600;color:#2F2A26;text-align:${endSide};vertical-align:top;">${escapeHtml(row.value)}</td>
        </tr>`,
    )
    .join('');

  const sections = doc.sections
    .map((section) => {
      const headers = section.headers
        .map(
          (header, index) =>
            `<th style="padding:7px 9px;background:#F2E9DF;color:#5A4F45;font-size:9.5px;font-weight:700;border-bottom:1px solid #E1D3C4;text-align:${align(section.columnAlign?.[index])};${headerTextStyle}">${escapeHtml(header)}</th>`,
        )
        .join('');
      const body = section.rows.length
        ? section.rows
            .map(
              (row, rowIndex) =>
                `<tr style="break-inside:avoid;background:${rowIndex % 2 === 0 ? '#FFFFFF' : '#FCFAF7'};">${row
                  .map(
                    (cell, index) =>
                      `<td style="padding:6px 9px;border-bottom:1px solid #EFE5DA;font-size:10.5px;text-align:${align(section.columnAlign?.[index])};">${escapeHtml(cell)}</td>`,
                  )
                  .join('')}</tr>`,
            )
            .join('')
        : `<tr><td colspan="${Math.max(section.headers.length, 1)}" style="padding:12px;text-align:center;color:#8B8178;font-size:10.5px;">—</td></tr>`;
      return `${section.heading ? `<h2 style="margin:20px 0 0;padding:7px 10px;background:#FAF5EF;border-${startSide}:3px solid #9C1C21;border-radius:2px;font-size:11.5px;font-weight:700;color:#3A322B;">${escapeHtml(section.heading)}</h2>` : ''}<table style="width:100%;border-collapse:collapse;">${headers ? `<thead><tr>${headers}</tr></thead>` : ''}<tbody>${body}</tbody></table>`;
    })
    .join('');

  return `
    <div dir="${direction}" style="font-family:${fontStack};color:#2F2A26;padding:2px 4px;background:#FFFFFF;">
      <div style="height:5px;background:#9C1C21;"></div>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <tr>
          <td style="width:56px;vertical-align:top;padding-${endSide}:14px;">
            <img src="${CORNER_LOGO_DATA_URL}" alt="" style="display:block;width:56px;height:56px;" />
          </td>
          <td style="vertical-align:top;padding-${endSide}:18px;">
            <p style="${brandStyle}">${brandName}</p>
            <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;line-height:1.2;color:#2F2A26;">${escapeHtml(doc.title)}</h1>
            ${doc.subtitle ? `<p style="margin:5px 0 0;font-size:11px;color:#8B8178;">${escapeHtml(doc.subtitle)}</p>` : ''}
          </td>
          <td style="width:232px;vertical-align:top;">
            <div style="background:#FBF7F1;border:1px solid #EDE0D2;border-radius:8px;padding:9px 11px;">
              <table style="width:100%;border-collapse:collapse;"><tbody>${meta}</tbody></table>
            </div>
          </td>
        </tr>
      </table>
      <div style="margin-top:16px;border-top:2px solid #9C1C21;"></div>
      ${sections}
    </div>`;
}

interface PdfJs {
  internal: {
    getNumberOfPages(): number;
    pageSize: { getWidth(): number; getHeight(): number };
  };
  setPage(page: number): void;
  setFont(family: string, style?: string): void;
  setFontSize(size: number): void;
  setTextColor(red: number, green?: number, blue?: number): void;
  setDrawColor(red: number, green?: number, blue?: number): void;
  setLineWidth(width: number): void;
  line(x1: number, y1: number, x2: number, y2: number): void;
  addImage(
    imageData: string,
    format: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void;
  text(
    text: string,
    x: number,
    y: number,
    options?: { align?: 'left' | 'center' | 'right' },
  ): void;
  save(filename: string): void;
}

export async function downloadPdf(fileName: string, doc: PdfDocument): Promise<void> {
  const { default: html2pdf } = await import('html2pdf.js');
  const pdfName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  const options = {
    margin: [12, 10, 16, 10] as [number, number, number, number],
    filename: pdfName,
    image: { type: 'jpeg' as const, quality: 0.96 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
    pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'h2'] },
  };
  const worker = html2pdf().set(options).from(buildPdfHtml(doc));

  const pdf = (await worker.toPdf().get('pdf')) as PdfJs;
  const totalPages = pdf.internal.getNumberOfPages();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const stamp = new Date().toLocaleString('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    const footerY = pageHeight - 11;
    pdf.setDrawColor(225, 211, 196);
    pdf.setLineWidth(0.3);
    pdf.line(10, footerY - 5, pageWidth - 10, footerY - 5);
    try {
      pdf.addImage(CORNER_LOGO_DATA_URL, 'PNG', 10, footerY - 8.5, 5.4, 5.4);
    } catch {
      // Footer branding is optional; never fail the export over it.
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(156, 28, 33);
    pdf.text('Corner Pizza', 17.5, footerY - 4.1);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(139, 129, 120);
    pdf.text(stamp, pageWidth / 2, footerY - 4.1, { align: 'center' });
    pdf.text(`${page} / ${totalPages}`, pageWidth - 10, footerY - 4.1, { align: 'right' });
  }

  pdf.save(pdfName);
}
