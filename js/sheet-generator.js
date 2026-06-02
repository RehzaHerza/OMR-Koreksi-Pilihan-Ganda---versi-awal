/* ============================================================
   sheet-generator.js — Lembar jawaban printable FORMAT RESMI
   ------------------------------------------------------------
   Halaman 1 (DISCAN): header resmi + tabel "A. PILIHAN GANDA"
     dengan 4 marker pojok. Geometri sel SAMA dgn scanner
     (OMR.cellNormPos) -> sinkron, mesin scan tak berubah.
   Halaman 2 (TIDAK discan, opsional): "B. ESSAY/URAIAN" + kotak Nilai.
   Catatan warna: hanya marker yang HITAM. Garis tabel & huruf opsi
     dibuat abu-abu; sampling scanner mengambil bagian TENGAH sel
     (inset), jadi garis tepi tak terbaca sebagai tinta.
   ============================================================ */

const OMRSheet = (function () {

  const PAGE_W = 1240, PAGE_H = 1754;          // A4 ~150 DPI portrait
  const FID_MARGIN_X = 0.07, FID_MARGIN_Y = 0.05;
  const FID_SIZE = 34;
  const INK = '#1a1a1a';
  const LINE = '#8a8a8a';      // garis tabel (di luar area sampling)
  const LETTER = '#b4b4b4';    // huruf opsi (di tengah sel -> harus terang)
  const LINE_FILL = '#cfcfcf'; // garis isian

  /* (u,v) ruang marker -> piksel halaman (marker di pojok halaman) */
  function toPage(u, v) {
    const x0 = PAGE_W * FID_MARGIN_X, y0 = PAGE_H * FID_MARGIN_Y;
    const x1 = PAGE_W * (1 - FID_MARGIN_X), y1 = PAGE_H * (1 - FID_MARGIN_Y);
    return [x0 + u * (x1 - x0), y0 + v * (y1 - y0)];
  }
  const px = (u, v) => toPage(u, v)[0];
  const py = (u, v) => toPage(u, v)[1];

  function line(ctx, x1, y1, x2, y2, color, w) {
    ctx.strokeStyle = color; ctx.lineWidth = w || 1;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function field(ctx, label, x, y, xEnd, value) {
    ctx.fillStyle = '#222'; ctx.textAlign = 'left'; ctx.font = '16px Georgia, serif';
    ctx.fillText(label, x, y);
    const lx = x + ctx.measureText(label + ' ').width + 6;
    if (value && String(value).trim()) {
      ctx.fillStyle = '#111'; ctx.fillText(': ' + value, lx, y);
    } else {
      ctx.fillStyle = '#111'; ctx.fillText(':', lx, y);
      line(ctx, lx + 10, y + 3, xEnd, y + 3, LINE_FILL, 1);
    }
  }

  /* ---------- Halaman 1: header + tabel pilihan ganda (DISCAN) ---------- */
  function drawPage1(canvas, cfg) {
    canvas.width = PAGE_W; canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PAGE_W, PAGE_H);

    // Marker pojok (HITAM) — acuan scanner
    ctx.fillStyle = '#000';
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([u, v]) => {
      const [x, y] = toPage(u, v);
      ctx.fillRect(x - FID_SIZE / 2, y - FID_SIZE / 2, FID_SIZE, FID_SIZE);
    });

    // --- Judul (multi-baris) ---
    const cx = PAGE_W / 2;
    const titleLines = String(cfg.titleLines || 'LEMBAR JAWABAN').split('\n');
    ctx.textAlign = 'center'; ctx.fillStyle = INK;
    let ty = PAGE_H * 0.045;
    titleLines.forEach((ln, i) => {
      ctx.font = (i === 0 ? 'bold 26px' : 'bold 17px') + ' Georgia, serif';
      ctx.fillText(ln.trim(), cx, ty);
      ty += (i === 0 ? 30 : 23);
    });

    // --- Identitas (dua kolom) ---
    const fy0 = PAGE_H * 0.115, dy = 26;
    const lx = PAGE_W * 0.08, lxEnd = PAGE_W * 0.46;
    const rx = PAGE_W * 0.56, rxEnd = PAGE_W * 0.93;
    field(ctx, 'Mata Pelajaran', lx, fy0, lxEnd, cfg.mapel);
    field(ctx, 'Hari/Tanggal', lx, fy0 + dy, lxEnd, cfg.hariTanggal);
    field(ctx, 'Waktu', lx, fy0 + 2 * dy, lxEnd, cfg.waktu);
    field(ctx, 'No. Peserta', rx, fy0, rxEnd, '');
    field(ctx, 'Nama', rx, fy0 + dy, rxEnd, '');
    field(ctx, 'Kelas', rx, fy0 + 2 * dy, rxEnd, '');

    // --- Sub-judul ---
    ctx.textAlign = 'center'; ctx.fillStyle = INK; ctx.font = 'bold 16px Georgia, serif';
    ctx.fillText('JAWABAN', cx, PAGE_H * 0.205);
    ctx.textAlign = 'left'; ctx.font = 'bold 15px Georgia, serif';
    ctx.fillText('A. PILIHAN GANDA', PAGE_W * FID_MARGIN_X + 6, PAGE_H * 0.232);

    // --- Tabel jawaban (per blok kolom) ---
    const L = OMR.LAYOUT, letters = OMR.optionLetters(cfg.numOptions);
    const rpc = OMR.rowsPerColumn(cfg);
    const availW = 1 - 2 * L.marginX, availH = 1 - L.marginTop - L.marginBottom;
    const colW = availW / cfg.columns, rowH = availH / rpc;
    const rectH = PAGE_H * (1 - 2 * FID_MARGIN_Y);   // tinggi persegi marker (px)
    const rowPx = rowH * rectH;
    const HEAD_H = 32;                                // tinggi header tabel (tetap)

    for (let col = 0; col < cfg.columns; col++) {
      const colX0 = L.marginX + col * colW;
      const optX0 = colX0 + colW * L.qLabelFrac;
      const optW = colW * L.optAreaFrac, boxW = optW / cfg.numOptions;
      const nRows = Math.min(rpc, cfg.numQuestions - col * rpc);
      if (nRows <= 0) continue;

      const xL = px(colX0, 0), xNo = px(optX0, 0), xR = px(colX0 + colW, 0);
      const yTop = py(0, L.marginTop);
      const headTop = yTop - HEAD_H;

      // header tabel: "No | Pilihan Jawaban"
      ctx.strokeStyle = LINE; ctx.lineWidth = 1.2;
      ctx.strokeRect(xL, headTop, xR - xL, HEAD_H);
      line(ctx, xNo, headTop, xNo, headTop + HEAD_H, LINE, 1.2);
      ctx.fillStyle = '#333'; ctx.textAlign = 'center'; ctx.font = 'bold 13px Georgia, serif';
      ctx.fillText('No', (xL + xNo) / 2, headTop + HEAD_H * 0.66);
      ctx.fillText('Pilihan Jawaban', (xNo + xR) / 2, headTop + HEAD_H * 0.66);

      for (let r = 0; r < nRows; r++) {
        const q = col * rpc + r;
        const yT = yTop + r * rowPx;
        ctx.strokeStyle = LINE; ctx.lineWidth = 1;
        ctx.strokeRect(xL, yT, xR - xL, rowPx);
        line(ctx, xNo, yT, xNo, yT + rowPx, LINE, 1);
        ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.font = 'bold 14px Georgia, serif';
        ctx.fillText(String(q + 1), (xL + xNo) / 2, yT + rowPx * 0.62);
        for (let o = 0; o < cfg.numOptions; o++) {
          const cxo = px(optX0 + boxW * o, 0), cxe = px(optX0 + boxW * (o + 1), 0);
          if (o > 0) line(ctx, cxo, yT, cxo, yT + rowPx, LINE, 1);
          ctx.fillStyle = LETTER; ctx.textAlign = 'center'; ctx.font = '15px Georgia, serif';
          ctx.fillText(letters[o], (cxo + cxe) / 2, yT + rowPx * 0.62);
        }
      }
    }

    // catatan + (jika tanpa esai) kotak Nilai di bawah
    if (!cfg.hasEssay) drawNilaiBox(ctx, PAGE_H * 0.9);
    ctx.fillStyle = '#999'; ctx.font = '11px Georgia, serif'; ctx.textAlign = 'center';
    ctx.fillText('Silang (X) satu opsi memakai ballpoint. Jaga ke-4 kotak hitam di sudut tetap terlihat & jelas saat difoto.',
      PAGE_W / 2, PAGE_H * (1 - FID_MARGIN_Y) + 24);
    return canvas;
  }

  function drawNilaiBox(ctx, top) {
    const x = PAGE_W * 0.55, w = PAGE_W * 0.38, h = 64, cols = ['Nilai', 'Paraf Guru', 'Paraf Ortu/Wali'];
    ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.strokeRect(x, top, w, h);
    line(ctx, x, top + 26, x + w, top + 26, LINE, 1);
    ctx.fillStyle = '#333'; ctx.font = 'bold 11px Georgia, serif'; ctx.textAlign = 'center';
    cols.forEach((c, i) => {
      const cw = w / cols.length;
      if (i > 0) line(ctx, x + cw * i, top, x + cw * i, top + h, LINE, 1);
      ctx.fillText(c, x + cw * (i + 0.5), top + 17);
    });
  }

  /* ---------- Halaman 2: esai (TIDAK discan) ---------- */
  function drawEssayPage(canvas, cfg) {
    canvas.width = PAGE_W; canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.font = 'bold 16px Georgia, serif';
    ctx.fillText('B. ESSAY / URAIAN', PAGE_W * 0.08, PAGE_H * 0.06);

    const x0 = PAGE_W * 0.08, x1 = PAGE_W * 0.92;
    let y = PAGE_H * 0.09;
    const lineGap = 34, perItem = 3;
    const n = Math.max(1, cfg.essayCount || 5);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = '#333'; ctx.font = '15px Georgia, serif';
      ctx.fillText((i + 1) + '.', x0, y + 4);
      for (let k = 0; k < perItem; k++) {
        line(ctx, x0 + (k === 0 ? 26 : 0), y + 6, x1, y + 6, LINE_FILL, 1);
        y += lineGap;
      }
      y += 8;
      if (y > PAGE_H * 0.85) break;
    }
    drawNilaiBox(ctx, PAGE_H * 0.9);
    return canvas;
  }

  /* ---------- API ---------- */
  function render(canvas, cfg) { return drawPage1(canvas, cfg); }

  function pages(cfg) {
    const p1 = drawPage1(document.createElement('canvas'), cfg);
    const out = [p1];
    if (cfg.hasEssay) out.push(drawEssayPage(document.createElement('canvas'), cfg));
    return out;
  }

  function print(cfg) {
    const imgs = pages(cfg).map(c => c.toDataURL('image/png'));
    const w = window.open('', '_blank');
    const body = imgs.map(d => `<img src="${d}">`).join('');
    w.document.write(`<html><head><title>Cetak Lembar Jawaban</title>
      <style>@page{size:A4 portrait;margin:0}body{margin:0}
      img{width:100%;display:block;page-break-after:always}</style>
      </head><body>${body}<script>window.onload=function(){window.print()}<\/script></body></html>`);
    w.document.close();
  }

  function downloadPDF(cfg) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
    pages(cfg).forEach((c, i) => {
      if (i > 0) pdf.addPage();
      pdf.addImage(c.toDataURL('image/png'), 'PNG', 0, 0, pw, ph);
    });
    pdf.save('lembar_jawaban_' + slug(cfg.examTitle) + '.pdf');
  }

  function slug(s) { return (s || 'lembar').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }

  return { render, pages, print, downloadPDF, PAGE_W, PAGE_H };
})();
