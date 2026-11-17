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
  const rtl = getActiveLanguage() === 'ar';
  const direction = rtl ? 'rtl' : 'ltr';
  const alignStart = rtl ? 'right' : 'left';
  const meta = (doc.meta ?? [])
    .map(
      (row) =>
        `<div style="display:flex;justify-content:space-between;gap:12px;padding:3px 0;font-size:12px;"><span style="color:#8B8178;">${escapeHtml(row.label)}</span><span style="font-weight:600;">${escapeHtml(row.value)}</span></div>`,
    )
    .join('');
  const sections = doc.sections
    .map((section) => {
      const headers = section.headers
        .map((header, index) => {
          const align = section.columnAlign?.[index] ?? 'left';
          return `<th style="padding:6px 8px;border-bottom:1px solid #d9cfc5;background:#F7F2EC;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;text-align:${align};">${escapeHtml(header)}</th>`;
        })
        .join('');
      const body = section.rows
        .map(
          (row, rowIndex) =>
            `<tr style="background:${rowIndex % 2 === 0 ? '#ffffff' : '#FBF8F4'};">${row
              .map((cell, index) => {
                const align = section.columnAlign?.[index] ?? 'left';
                return `<td style="padding:5px 8px;border-bottom:1px solid #EEDFD3;font-size:11px;text-align:${align};">${escapeHtml(cell)}</td>`;
              })
              .join('')}</tr>`,
        )
        .join('');
      return `${section.heading ? `<h2 style="margin:18px 0 6px;font-size:13px;font-weight:700;">${escapeHtml(section.heading)}</h2>` : ''}<table style="width:100%;border-collapse:collapse;margin-top:8px;">${headers ? `<thead><tr>${headers}</tr></thead>` : ''}<tbody>${body}</tbody></table>`;
    })
    .join('');
  return `
    <div dir="${direction}" style="font-family:'Inter','Segoe UI',Arial,sans-serif;color:#2F2A26;padding:4px 6px;background:#ffffff;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid #9C1C21;padding-bottom:10px;">
        <div>
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#9C1C21;">Corner Pizza</p>
          <h1 style="margin:4px 0 0;font-size:22px;font-weight:800;">${escapeHtml(doc.title)}</h1>
          ${doc.subtitle ? `<p style="margin:4px 0 0;font-size:12px;color:#8B8178;">${escapeHtml(doc.subtitle)}</p>` : ''}
        </div>
        <div style="min-width:200px;text-align:${alignStart};">${meta}</div>
      </div>
      ${sections}
      <p style="margin-top:18px;border-top:1px solid #EEDFD3;padding-top:8px;font-size:10px;color:#8B8178;">
        ${escapeHtml(doc.footer ?? `Generated ${new Date().toLocaleString()}`)}
      </p>
    </div>`;
}

export async function downloadPdf(fileName: string, doc: PdfDocument): Promise<void> {
  const { default: html2pdf } = await import('html2pdf.js');
  await html2pdf()
    .set({
      margin: [10, 10, 12, 10],
      filename: fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(buildPdfHtml(doc))
    .save();
}
