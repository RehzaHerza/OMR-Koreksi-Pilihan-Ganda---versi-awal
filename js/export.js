/* ============================================================
   export.js — Unduh rekap nilai: Excel / DOCX / PDF
   ------------------------------------------------------------
   Library di-load lokal dari /lib:
     XLSX (SheetJS), window.jspdf.jsPDF + autoTable, window.docx
   ============================================================ */

const OMRExport = (function () {

  const HEAD_LABEL = ['No', 'Nama', 'Kelas', 'Benar', 'Salah', 'Skor', 'Maks', 'Nilai (%)', 'Waktu'];

  function rows(students) {
    return students.map((s, i) => {
      const c = s.counts || {};
      const benar = c.benar || 0;
      const salah = (c.salah || 0) + (c.kosong || 0) + (c.ganda || 0);
      return [
        i + 1, s.name || '-', s.kelas || '-',
        benar, salah,
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

  /* Kop diambil otomatis dari Pengaturan (sama spt lembar cetak) */
  function kopInfo() {
    const c = OMR.cfg;
    const titles = String(c.titleLines || 'REKAP NILAI')
      .split('\n').map(s => s.trim()).filter(Boolean);
    let kelas = '';
    try { kelas = (OMR.activeProfile() && OMR.activeProfile().name) || ''; } catch (e) { kelas = ''; }
    const ident = [];
    if (c.mapel) ident.push(['Mata Pelajaran', c.mapel]);
    if (kelas) ident.push(['Kelas', kelas]);
    if (c.hariTanggal) ident.push(['Hari/Tanggal', c.hariTanggal]);
    if (c.waktu) ident.push(['Waktu', c.waktu]);
    return { titles, ident };
  }

  /* ---------- Excel ---------- */
  function toExcel(students) {
    const { titles, ident } = kopInfo();
    const lastCol = HEAD_LABEL.length - 1; // 8
    const aoa = [];
    const merges = [];
    titles.forEach(t => { merges.push({ s: { r: aoa.length, c: 0 }, e: { r: aoa.length, c: lastCol } }); aoa.push([t]); });
    ident.forEach(([k, v]) => aoa.push([k, v]));
    aoa.push(['Diekspor', new Date().toLocaleString('id-ID')]);
    aoa.push([]);
    aoa.push(HEAD_LABEL);
    rows(students).forEach(r => aoa.push(r));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 4 }, { wch: 24 }, { wch: 10 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 6 }, { wch: 10 }, { wch: 20 }];
    ws['!merges'] = merges;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Nilai');
    // sheet kunci jawaban
    const keyAoa = [['No', 'Kunci', 'Bobot'],
      ...OMR.state.answerKey.map((k, i) => [i + 1, k.correct, k.weight ?? 1])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(keyAoa), 'Kunci');
    XLSX.writeFile(wb, fname('xlsx'));
  }

  /* ---------- PDF ---------- */
  function toPDF(students) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const { titles, ident } = kopInfo();
    const pageW = doc.internal.pageSize.getWidth();
    const cx = pageW / 2;
    let y = 42;
    doc.setFont('helvetica', 'bold'); doc.setTextColor(33);
    titles.forEach((t, i) => { doc.setFontSize(i === 0 ? 14 : 11); doc.text(t, cx, y, { align: 'center' }); y += (i === 0 ? 18 : 15); });
    if (ident.length) {
      y += 2;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(55);
      doc.text(ident.map(([k, v]) => `${k}: ${v}`).join('     '), cx, y, { align: 'center' }); y += 14;
    }
    doc.setFontSize(8); doc.setTextColor(130);
    doc.text('Diekspor: ' + new Date().toLocaleString('id-ID'), cx, y, { align: 'center' }); y += 4;
    doc.setDrawColor(200); doc.line(40, y, pageW - 40, y); y += 6;

    const opts = {
      head: [HEAD_LABEL], body: rows(students), startY: y + 6,
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
    const { titles, ident } = kopInfo();
    const head = [];
    titles.forEach((t, i) => head.push(new D.Paragraph({
      alignment: D.AlignmentType.CENTER,
      children: [new D.TextRun({ text: t, bold: true, size: i === 0 ? 30 : 24 })]
    })));
    if (ident.length) head.push(new D.Paragraph({
      alignment: D.AlignmentType.CENTER,
      children: [new D.TextRun({ text: ident.map(([k, v]) => `${k}: ${v}`).join('      '), size: 20 })]
    }));
    head.push(new D.Paragraph({
      alignment: D.AlignmentType.CENTER,
      children: [new D.TextRun({ text: 'Diekspor: ' + new Date().toLocaleString('id-ID'), italics: true, size: 16, color: '777777' })]
    }));
    head.push(new D.Paragraph({ text: '' }));
    const doc = new D.Document({
      sections: [{
        children: [...head, table]
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
