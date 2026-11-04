import type { KccInput } from '../../lib/kcc';
import { topSectionBottom } from '../../lib/kcc-pdf-layout';
import { kccFileName, kccReport } from '../../lib/kcc-report';

type Color = [number, number, number];
const green: Color = [0, 89, 42];
const deep: Color = [0, 69, 35];
const leaf: Color = [30, 157, 58];
const ink: Color = [18, 28, 22];
const pale: Color = [231, 247, 231];
const line: Color = [208, 221, 212];

async function pdfAsset(path: string) {
  try {
    const response = await fetch(path);
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/** DejaVu Sans includes the rupee glyph. Built-in Helvetica remains the offline fallback. */
async function loadFonts() {
  const [normal, bold] = await Promise.all([
    pdfAsset('/fonts/DejaVuSans-subset.ttf'),
    pdfAsset('/fonts/DejaVuSans-Bold-subset.ttf'),
  ]);
  if (!normal || !bold) return null;
  const encode = (bytes: Uint8Array) => {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  };
  return { normal: encode(normal), bold: encode(bold) };
}

/** Builds the KCC calculation as an A4 PDF and downloads it. */
export async function downloadKccPdf(input: KccInput, borrower: string) {
  const [{ jsPDF }, { autoTable }, fonts, landscape] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    loadFonts(),
    pdfAsset('/kcc-report-landscape.png'),
  ]);
  const now = new Date();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let font = 'helvetica';
  if (fonts) {
    doc.addFileToVFS('DejaVuSans.ttf', fonts.normal);
    doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
    doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.bold);
    doc.addFont('DejaVuSans-Bold.ttf', 'DejaVuSans', 'bold');
    font = 'DejaVuSans';
  }
  const report = kccReport(input, borrower, fonts ? '₹' : 'Rs.');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const amount = (value: string) => value.replace(/^(₹|Rs\.)\s*/, '');
  const text = (value: string, x: number, y: number, size: number, color: Color = ink, bold = false) => {
    doc.setFont(font, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(value, x, y);
  };
  const fittedText = (
    value: string,
    x: number,
    y: number,
    size: number,
    maxWidth: number,
    color: Color,
    bold = true,
  ) => {
    doc.setFont(font, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const fittedSize = Math.min(size, (size * maxWidth) / doc.getTextWidth(value));
    text(value, x, y, fittedSize, color, bold);
  };
  const card = (x: number, y: number, w: number, h: number, color: Color = pale) => {
    doc.setFillColor(...color);
    doc.roundedRect(x, y, w, h, 3, 3, 'F');
  };
  const sprout = (x: number, y: number, color: Color = green, scale = 1) => {
    doc.setDrawColor(...color);
    doc.setFillColor(...color);
    doc.setLineWidth(0.65);
    const point = (dx: number, dy: number) => [x + dx * scale, y + dy * scale];
    doc.line(...(point(4, 8) as [number, number]), ...(point(4, 2.5) as [number, number]));
    doc
      .path([
        { op: 'm', c: point(3.8, 4.7) },
        { op: 'c', c: [...point(1.8, 4.8), ...point(0.3, 2.6), ...point(0.4, 0.8)] },
        { op: 'c', c: [...point(2.2, 0.9), ...point(3.5, 2.3), ...point(3.8, 4.7)] },
        { op: 'h', c: [] },
      ])
      .fill();
    doc
      .path([
        { op: 'm', c: point(4.1, 3.9) },
        { op: 'c', c: [...point(4.2, 1.4), ...point(5.8, 0.2), ...point(7.7, 0.2)] },
        { op: 'c', c: [...point(7.8, 2.5), ...point(6.8, 3.7), ...point(4.1, 3.9)] },
        { op: 'h', c: [] },
      ])
      .fill();
  };
  const icon = (
    kind: 'person' | 'pin' | 'field' | 'coins' | 'calendar' | 'info' | 'layers',
    x: number,
    y: number,
    color: Color = green,
  ) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.55);
    if (kind === 'person') {
      doc.circle(x + 4, y + 2, 1.5, 'S');
      doc.roundedRect(x + 0.6, y + 4.4, 6.8, 4, 2, 2, 'S');
    } else if (kind === 'pin') {
      doc.circle(x + 4, y + 3, 2.5, 'S');
      doc.circle(x + 4, y + 3, 0.6, 'S');
      doc.line(x + 2.2, y + 4.8, x + 4, y + 8);
      doc.line(x + 5.8, y + 4.8, x + 4, y + 8);
    } else if (kind === 'field') {
      doc.line(x, y + 8, x + 8, y + 8);
      for (const dx of [1, 3.5, 6]) {
        doc.line(x + dx, y + 7.7, x + dx + 0.5, y + 2.8);
        doc.line(x + dx + 0.5, y + 2.8, x + dx - 0.5, y + 4.5);
        doc.line(x + dx + 0.5, y + 2.8, x + dx + 1.5, y + 4.5);
      }
    } else if (kind === 'coins') {
      doc.ellipse(x + 2.5, y + 5.7, 2.4, 0.9, 'S');
      doc.ellipse(x + 5.6, y + 3.6, 2.4, 0.9, 'S');
      doc.ellipse(x + 2.5, y + 7.3, 2.4, 0.9, 'S');
      doc.line(x + 0.1, y + 5.7, x + 0.1, y + 7.3);
      doc.line(x + 4.9, y + 5.7, x + 4.9, y + 7.3);
      doc.line(x + 3.2, y + 3.6, x + 3.2, y + 5.1);
      doc.line(x + 8, y + 3.6, x + 8, y + 5.1);
    } else if (kind === 'calendar') {
      doc.roundedRect(x + 0.5, y + 1.5, 7, 6.3, 0.5, 0.5, 'S');
      doc.line(x + 0.5, y + 3.4, x + 7.5, y + 3.4);
      doc.line(x + 2, y + 0.3, x + 2, y + 2.4);
      doc.line(x + 6, y + 0.3, x + 6, y + 2.4);
    } else if (kind === 'layers') {
      for (const dy of [0, 2.6, 5.2]) {
        doc.line(x, y + dy + 2, x + 4, y + dy);
        doc.line(x + 4, y + dy, x + 8, y + dy + 2);
        doc.line(x + 8, y + dy + 2, x + 4, y + dy + 4);
        doc.line(x + 4, y + dy + 4, x, y + dy + 2);
      }
    } else {
      doc.circle(x + 4, y + 4, 3.5, 'S');
      doc.line(x + 4, y + 3.5, x + 4, y + 6);
      doc.circle(x + 4, y + 2.2, 0.2, 'S');
    }
  };
  const stamp = now.toLocaleString('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const header = () => {
    doc.setFillColor(...deep);
    doc.rect(0, 0, pageWidth, 23, 'F');
    doc.setFillColor(...green);
    doc.triangle(153, 0, pageWidth, 0, pageWidth, 14, 'F');
    sprout(6, 4, [203, 227, 57], 1.3);
    text('KCC Limit Calculation', 25, 11.2, 18, [255, 255, 255], true);
    text('AMCC Paonta Sahib   |   Scale of Finance FY 2026-27   |   Himachal Pradesh', 25, 18.1, 7.6, [255, 255, 255]);
    doc.setFont(font, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(`Generated ${stamp} IST`, pageWidth - 6, 18.1, { align: 'right' });
  };
  header();

  // The crop table determines the height of the entire two-column section.
  autoTable(doc, {
    startY: 41,
    margin: { left: 61, right: 7, top: 31, bottom: 14 },
    tableWidth: 142,
    head: [
      [
        '#',
        'Season',
        'Crop',
        'Recorded area\n(B-Bi-Bs)',
        'Acres',
        `SOF / acre (${fonts ? '₹' : 'Rs.'})`,
        `Finance (${fonts ? '₹' : 'Rs.'})`,
      ],
    ],
    body: report.crops.length
      ? report.crops.map((row) => row.map((value, index) => (index >= 5 ? amount(value) : value)))
      : [['', '', 'No crops added', '', '', '', '']],
    theme: 'grid',
    styles: {
      font,
      fontSize: 7.35,
      textColor: ink,
      cellPadding: { top: 0.48, bottom: 0.48, left: 0.6, right: 0.6 },
      lineColor: line,
      lineWidth: 0.15,
      minCellHeight: 4.2,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: green,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.15,
      minCellHeight: 8.2,
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 7, halign: 'center' },
      1: { cellWidth: 15 },
      2: { cellWidth: 33 },
      3: { cellWidth: 26, halign: 'center' },
      4: { cellWidth: 14, halign: 'right' },
      5: { cellWidth: 23, halign: 'right' },
      6: { cellWidth: 24, halign: 'right' },
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        header();
        text('Crop Pattern (continued)', 61, 28.5, 7.5, green, true);
      }
    },
  });
  const afterTable = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const tablePageCount = doc.getNumberOfPages();
  const totalLand = report.details.find(([label]) => label === 'Total land');
  const panelBottom = tablePageCount === 1 ? topSectionBottom(afterTable(), !!totalLand) : 111;
  doc.setPage(1);
  card(6, 31, 50, panelBottom - 31);
  card(7, 45, 48, 17, [243, 251, 243]);
  icon('person', 9, 34);
  text('Borrower & Land', 19, 39, 11.4, ink, true);
  const details = report.details.filter(([label]) => label !== 'Total land');
  const detailIcons = { Borrower: 'person', District: 'pin', 'Cultivated land': 'field' } as const;
  const detailGap = Math.min(19.8, (panelBottom - (totalLand ? 21 : 14) - 47) / Math.max(1, details.length - 1));
  details.forEach(([label, value], index) => {
    const detailY = 47 + index * detailGap;
    icon(detailIcons[label as keyof typeof detailIcons] || 'field', 9.5, detailY + 3, leaf);
    text(label, 22, detailY + 3.5, 8.15);
    doc.setFont(font, 'bold');
    doc.setFontSize(10.8);
    const lines = doc.splitTextToSize(value, 31);
    fittedText(lines[0] || '-', 22, detailY + 9.3, 10.8, 31, ink);
    if (lines[1]) text(lines[1], 22, detailY + 13.6, 8.3, ink, true);
    if (index < details.length - 1) {
      doc.setDrawColor(...line);
      doc.line(10, detailY + detailGap - 1, 52, detailY + detailGap - 1);
    }
  });
  if (totalLand) text(`Total land: ${totalLand[1]}`, 10, panelBottom - 4, 7.25);
  doc.setDrawColor(...line);
  doc.roundedRect(60, 31, 144, panelBottom - 31, 3, 3, 'S');
  sprout(63, 31.5);
  text('Crop Pattern', 73, 38, 12.3, ink, true);
  doc.setPage(tablePageCount);
  let y = tablePageCount === 1 ? panelBottom + 5 : afterTable() + 5;
  if (y > 124 || tablePageCount > 1) {
    doc.addPage();
    header();
    y = 32;
  }

  // Finance strip, KCC cards, and horizontal five-year schedule.
  card(6, y, 198, 17);
  const slot = report.seasons.length ? 128 / report.seasons.length : 128;
  report.seasons.forEach(([label, value], index) => {
    const x = 10 + index * slot;
    sprout(x, y + 4, leaf);
    text(label, x + 12, y + 6.3, 8);
    fittedText(value, x + 12, y + 13.2, 12.1, slot - 17, ink);
    if (index < report.seasons.length - 1) {
      doc.setDrawColor(...line);
      doc.line(x + slot - 3, y + 3, x + slot - 3, y + 14);
    }
  });
  card(134, y, 70, 17, green);
  icon('coins', 140, y + 4, [255, 255, 255]);
  text('Total crop finance', 154, y + 6.2, 8, [255, 255, 255]);
  fittedText(report.totalFinance, 154, y + 13.2, 13.4, 46, [255, 255, 255]);
  doc.setDrawColor(...line);
  doc.line(6, y + 23, 204, y + 23);
  icon('layers', 7, y + 26);
  text('KCC Limit', 21, y + 33, 14, green, true);
  const cardY = y + 38;
  card(6, cardY, 97, 25);
  card(107, cardY, 97, 25);
  sprout(13, cardY + 8, leaf);
  icon('coins', 113, cardY + 8);
  text('Year 1 limit', 33, cardY + 7, 8.5);
  fittedText(report.yearOne, 33, cardY + 16.2, 19.5, 65, green);
  text('Includes 30% additional finance', 33, cardY + 21.5, 7.5);
  text('MPL (max. permissible limit)', 134, cardY + 7, 8.5);
  fittedText(report.mpl, 134, cardY + 16.2, 19.5, 65, green);
  text('Year 5 limit', 134, cardY + 21.5, 7.5);
  const scheduleY = cardY + 33;
  icon('calendar', 7, scheduleY - 6);
  text('5-Year Schedule', 21, scheduleY, 13.3, green, true);
  autoTable(doc, {
    startY: scheduleY + 5,
    margin: { left: 6, right: 6 },
    tableWidth: 198,
    head: [['Year', ...report.schedule.map(([label]) => label)]],
    body: [[`Calculated limit (${fonts ? '₹' : 'Rs.'})`, ...report.schedule.map(([, value]) => amount(value))]],
    theme: 'grid',
    styles: {
      font,
      fontSize: 9.25,
      textColor: ink,
      cellPadding: 2.05,
      lineColor: line,
      lineWidth: 0.2,
      fontStyle: 'bold',
    },
    headStyles: { fillColor: green, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 45, fillColor: pale } },
  });
  const notes = [
    'Method: within each season, recorded areas set each crop share of the cultivated land. Crop finance = borrower crop acres × district SOF.',
    'Year 1 = total crop finance × 1.30. Each later year = previous year × 1.10.',
    'Beta estimate for review. Verify inputs against the Jamabandi and the current Scale of Finance before sanction. This document is not a sanction letter.',
  ];
  if (!report.ready)
    notes.unshift(`Calculation incomplete: ${report.errors.join(' ') || 'complete the land and crop details.'}`);
  doc.setFont(font, 'normal');
  doc.setFontSize(7.45);
  const noteLines = notes.flatMap((note) => doc.splitTextToSize(note, 176));
  const noteY = afterTable() + 6;
  const noteHeight = Math.max(18, 7 + noteLines.length * 3.6);
  card(6, noteY, 198, noteHeight, [238, 248, 244]);
  icon('info', 10, noteY + 5);
  noteLines.forEach((note, index) => text(note, 23, noteY + 5.5 + index * 3.6, 7.45));

  const artworkY = Math.max(239, noteY + noteHeight + 1);
  if (landscape && artworkY < pageHeight - 12)
    doc.addImage(landscape, 'PNG', 0, artworkY, pageWidth, pageHeight - artworkY, undefined, 'FAST');
  const pages = doc.getNumberOfPages();
  if (pages > 1)
    for (let index = 1; index <= pages; index++) {
      doc.setPage(index);
      text(`Page ${index} of ${pages}`, pageWidth - 26, pageHeight - 5, 6.5);
    }
  doc.save(kccFileName(borrower, now));
}
