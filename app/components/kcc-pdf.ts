import type { KccInput } from '../../lib/kcc';
import { kccFileName, kccReport } from '../../lib/kcc-report';

const green: [number, number, number] = [0, 84, 63];
const ink: [number, number, number] = [22, 33, 27];
const muted: [number, number, number] = [95, 107, 100];
const tint: [number, number, number] = [227, 243, 233];
const danger: [number, number, number] = [160, 78, 67];

/** Builds the KCC calculation as an A4 PDF and downloads it. The PDF library loads only when this runs. */
export async function downloadKccPdf(input: KccInput, borrower: string) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const report = kccReport(input, borrower);
  const now = new Date();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const page = doc.internal.pageSize;
  const margin = 14;
  const width = page.getWidth() - margin * 2;
  const after = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  doc.setFillColor(...green);
  doc.rect(0, 0, page.getWidth(), 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('KCC Limit Calculation', margin, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('AMCC Paonta Sahib  |  Scale of Finance FY 2026-27  |  Himachal Pradesh', margin, 19);
  const stamp = now.toLocaleString('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.text(`Generated ${stamp} IST`, page.getWidth() - margin, 19, { align: 'right' });

  const section = (title: string, y: number) => {
    doc.setTextColor(...green);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(title, margin, y);
    return y + 2;
  };
  const plain = {
    theme: 'plain' as const,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, textColor: ink, cellPadding: 1.6 },
  };

  autoTable(doc, {
    ...plain,
    startY: section('Borrower & land', 35),
    body: report.details,
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40, textColor: muted } },
  });

  autoTable(doc, {
    startY: section('Crop pattern', after() + 8),
    margin: { left: margin, right: margin },
    head: [['#', 'Season', 'Crop', 'Recorded area', 'Acres', 'SOF / acre', 'Finance']],
    body: report.crops.length ? report.crops : [['', '', 'No crops added', '', '', '', '']],
    foot: [
      ...report.seasons.map(([label, value]) => ['', '', label, '', '', '', value]),
      ['', '', 'Total crop finance', '', '', '', report.totalFinance],
    ],
    theme: 'grid',
    styles: { fontSize: 8, textColor: ink, cellPadding: 1.1, lineColor: [215, 221, 216], lineWidth: 0.2 },
    headStyles: { fillColor: green, textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: tint, textColor: ink, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 7, halign: 'center' },
      1: { cellWidth: 18 },
      4: { halign: 'right', cellWidth: 16 },
      5: { halign: 'right', cellWidth: 26 },
      6: { halign: 'right', cellWidth: 28 },
    },
  });

  let y = after() + 8;
  if (y > page.getHeight() - 80) {
    doc.addPage();
    y = 20;
  }
  y = section('KCC limit', y) + 3;
  const box = (x: number, label: string, value: string, note: string) => {
    doc.setFillColor(...tint);
    doc.setDrawColor(211, 231, 218);
    doc.roundedRect(x, y, width / 2 - 3, 22, 2, 2, 'FD');
    doc.setTextColor(...muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(label, x + 4, y + 6);
    doc.setTextColor(...green);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(value, x + 4, y + 13.5);
    doc.setTextColor(...muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(note, x + 4, y + 18.5);
  };
  box(margin, 'Year 1 limit', report.yearOne, 'Includes 30% additional finance');
  box(margin + width / 2 + 3, 'MPL (max. permissible limit)', report.mpl, 'Year 5 limit');

  autoTable(doc, {
    startY: section('5-year schedule', y + 31),
    margin: { left: margin, right: margin },
    head: [['Year', 'Calculated limit']],
    body: report.schedule,
    theme: 'grid',
    tableWidth: width / 2 + 10,
    styles: { fontSize: 9, textColor: ink, cellPadding: 1.3, lineColor: [215, 221, 216], lineWidth: 0.2 },
    headStyles: { fillColor: green, textColor: 255 },
    columnStyles: { 1: { halign: 'right' } },
  });

  y = after() + 8;
  const notes = [
    'Method: within each season, recorded areas set each crop share of the cultivated land. Crop finance = borrower crop acres x district Scale of Finance. Long-term crops count in both seasons at half their annual rate.',
    'Year 1 = total crop finance x 1.30. Each later year = previous year x 1.10.',
    'Beta estimate for review. Verify inputs against the Jamabandi and the current Scale of Finance before sanction. This document is not a sanction letter.',
  ];
  if (!report.ready)
    notes.unshift(`Calculation incomplete: ${report.errors.join(' ') || 'complete the land and crop details.'}`);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  for (const note of notes) {
    const lines = doc.splitTextToSize(note, width);
    if (y + lines.length * 3.5 > page.getHeight() - 14) {
      doc.addPage();
      y = 20;
    }
    doc.setTextColor(...(note.startsWith('Calculation incomplete') ? danger : muted));
    doc.text(lines, margin, y);
    y += lines.length * 3.5 + 1.5;
  }

  const pages = doc.getNumberOfPages();
  for (let index = 1; index <= pages; index++) {
    doc.setPage(index);
    doc.setTextColor(...muted);
    doc.setFontSize(7.5);
    doc.text(`Page ${index} of ${pages}`, page.getWidth() - margin, page.getHeight() - 8, { align: 'right' });
    doc.text('AMCC Paonta Sahib - KCC calculator', margin, page.getHeight() - 8);
  }
  doc.save(kccFileName(borrower, now));
}
