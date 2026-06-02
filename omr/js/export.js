/* ============================================================
   export.js — Unduh rekap nilai: Excel / DOCX / PDF
   ------------------------------------------------------------
   Library di-load lokal dari /lib:
     XLSX (SheetJS), window.jspdf.jsPDF + autoTable, window.docx
   ============================================================ */

const OMRExport = (function () {

  const HEAD = ['No', 'Nama', 'Kelas', 'Benar', 1/2 + '', 'Salah', 'Skor', 'Maks', 'Nilai (%)', 'Waktu'];
  const HEAD_LABEL = ['No', 'Nama', 'Kelas', 'Benar', 'Setengah', 'Salah', 'Skor', 'Maks', 'Nilai (%)', 'Waktu'];

  function rows(students) {
    return students.map((s, i) => {
      const c = s.counts || {};
      const benar = c.benar || 0, setengah = c.setengah || 0;
      const salah = (c.salah || 0) + (c.kosong || 0) + (c.ganda || 0);
      return [
        i + 1, s.name || '-', s.kelas || '-',
        benar, setengah, salah,
        s.score, s.maxScore, s.percent,
        s.ts ? new Date(s.ts).toLocaleString('id-ID') : '-'
      ];
    });
  }

  function fname(ext) {
    const t = (OMR.cfg.examTitle || 'rekap').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const d = new Date().toISOString().slice(0, 10);
    return `rekap_nilai_${t}_${d}.${ext}`;
  }

  /* ---------- Excel ---------- */
  function toExcel(students) {
    const aoa = [
      [OMR.cfg.examTitle || 'Rekap Nilai'],
      ['Diekspor', new Date().toLocaleString('id-ID')],
      [],
      HEAD_LABEL,
      ...rows(students)
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 4 }, { wch: 24 }, { wch: 10 }, { wch: 7 }, { wch: 9 }, { wch: 7 }, { wch: 7 }, { wch: 6 }, { wch: 10 }, { wch: 20 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Nilai');
    // sheet kunci jawaban
    const keyAoa = [['No', 'Kunci', 'Setengah (opsional)', 'Bobot'],
      ...OMR.state.answerKey.map((k, i) => [i + 1, k.correct, k.half || '-', k.weight ?? 1])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(keyAoa), 'Kunci');
    XLSX.writeFile(wb, fname('xlsx'));
  }

  /* ---------- PDF ---------- */
  function toPDF(students) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text(OMR.cfg.examTitle || 'Rekap Nilai', 40, 40);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120);
    doc.text('Diekspor: ' + new Date().toLocaleString('id-ID'), 40, 56);

    const opts = {
      head: [HEAD_LABEL], body: rows(students), startY: 70,
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [37, 51, 64], textColor: 255 },
      alternateRowStyles: { fillColor: [244, 246, 248] },
      margin: { left: 40, right: 40 }
    };
    if (typeof doc.autoTable === 'function') doc.autoTable(opts);
    else if (typeof window.autoTable === 'function') window.autoTable(doc, opts);
    doc.save(fname('pdf'));
  }

  /* ---------- DOCX ---------- */
  async function toDOCX(students) {
    const D = window.docx;
    const headerCells = HEAD_LABEL.map(t => cell(t, true));
    const bodyRows = rows(students).map(r =>
      new D.TableRow({ children: r.map((v, i) => cell(String(v), false, i === 1 ? 'left' : 'center')) })
    );
    const table = new D.Table({
      width: { size: 100, type: D.WidthType.PERCENTAGE },
      rows: [new D.TableRow({ children: headerCells, tableHeader: true }), ...bodyRows]
    });
    const doc = new D.Document({
      sections: [{
        children: [
          new D.Paragraph({ children: [new D.TextRun({ text: OMR.cfg.examTitle || 'Rekap Nilai', bold: true, size: 30 })] }),
          new D.Paragraph({ children: [new D.TextRun({ text: 'Diekspor: ' + new Date().toLocaleString('id-ID'), italics: true, size: 18, color: '777777' })] }),
          new D.Paragraph({ text: '' }),
          table
        ]
      }]
    });
    const blob = await D.Packer.toBlob(doc);
    saveBlob(blob, fname('docx'));

    function cell(text, isHead, align) {
      return new D.TableCell({
        shading: isHead ? { fill: '253340' } : undefined,
        margins: { top: 60, bottom: 60, left: 80, right: 80 },
        children: [new D.Paragraph({
          alignment: align === 'left' ? D.AlignmentType.LEFT : D.AlignmentType.CENTER,
          children: [new D.TextRun({ text, bold: isHead, color: isHead ? 'FFFFFF' : '222222', size: isHead ? 20 : 18 })]
        })]
      });
    }
  }

  function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  return { toExcel, toPDF, toDOCX };
})();
