/* ============================================================
   sheet-generator.js — Buat lembar jawaban printable
   ------------------------------------------------------------
   Menggambar ke <canvas> resolusi cetak (A4), memakai layout
   yang SAMA dgn scanner (OMR.cellNormPos). Lalu bisa dicetak
   (window.print pd halaman khusus) atau diunduh sbg PNG/PDF.
   - Marker pojok: kotak hitam pekat (acuan scanner)
   - Struktur (kotak opsi, huruf, garis) digambar ABU-ABU terang
     supaya hanya silang ballpoint siswa yg terbaca gelap.
   ============================================================ */

const OMRSheet = (function () {

  // A4 @ ~150 DPI portrait
  const PAGE_W = 1240, PAGE_H = 1754;
  const FID_MARGIN_X = 0.07;   // posisi marker dari tepi (porsi halaman)
  const FID_MARGIN_Y = 0.05;
  const FID_SIZE = 34;         // sisi marker (px)
  const GRAY = '#9a9a9a';      // warna struktur (terang -> tak terbaca sbg tinta)
  const GRAY_LINE = '#c4c4c4';

  /* normalized marker-space (u,v) -> piksel halaman */
  function toPage(u, v) {
    const x0 = PAGE_W * FID_MARGIN_X, y0 = PAGE_H * FID_MARGIN_Y;
    const x1 = PAGE_W * (1 - FID_MARGIN_X), y1 = PAGE_H * (1 - FID_MARGIN_Y);
    return [x0 + u * (x1 - x0), y0 + v * (y1 - y0)];
  }

  function render(canvas, cfg) {
    canvas.width = PAGE_W; canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, PAGE_W, PAGE_H);

    // --- Marker pojok (hitam pekat) ---
    const corners = [[0, 0], [1, 0], [0, 1], [1, 1]];
    ctx.fillStyle = '#000000';
    corners.forEach(([u, v]) => {
      const [x, y] = toPage(u, v);
      ctx.fillRect(x - FID_SIZE / 2, y - FID_SIZE / 2, FID_SIZE, FID_SIZE);
    });

    // --- Header ---
    const [hx, hy] = toPage(0.5, 0.03);
    ctx.fillStyle = '#222'; ctx.textAlign = 'center';
    ctx.font = 'bold 30px Georgia, serif';
    ctx.fillText(cfg.examTitle || 'Lembar Jawaban', hx, hy + 10);
    ctx.font = '16px Georgia, serif'; ctx.fillStyle = '#666';
    ctx.fillText(`${cfg.numQuestions} soal · opsi A–${OMR.LETTERS[cfg.numOptions - 1]} · silang (X) dengan ballpoint`, hx, hy + 34);

    // garis isian Nama / Kelas
    ctx.textAlign = 'left'; ctx.fillStyle = '#333'; ctx.font = '16px Georgia, serif';
    const [nx, ny] = toPage(0.05, 0.09);
    const [nx2] = toPage(0.62, 0.09);
    ctx.fillText('Nama :', nx, ny);
    ctx.strokeStyle = GRAY_LINE; ctx.lineWidth = 1;
    line(ctx, nx + 55, ny + 4, nx2 - 20, ny + 4);
    ctx.fillText('Kelas :', nx2, ny);
    line(ctx, nx2 + 55, ny + 4, toPage(0.95, 0.09)[0], ny + 4);

    // --- Grid opsi ---
    const letters = OMR.optionLetters(cfg.numOptions);
    ctx.textAlign = 'center';
    for (let q = 0; q < cfg.numQuestions; q++) {
      // nomor soal
      const lp = OMR.labelNormPos(q, cfg);
      const [lx, ly] = toPage(lp.u, lp.v);
      ctx.fillStyle = '#333'; ctx.font = 'bold 18px Georgia, serif'; ctx.textAlign = 'left';
      ctx.fillText(String(q + 1).padStart(2, '0'), lx, ly + 6);

      for (let o = 0; o < cfg.numOptions; o++) {
        const cell = OMR.cellNormPos(q, o, cfg);
        const [cx, cy] = toPage(cell.u, cell.v);
        const [cxw] = toPage(cell.u + cell.w, cell.v);
        const [, cyh] = toPage(cell.u, cell.v + cell.h);
        const bw = Math.abs(cxw - cx) * 1.1, bh = Math.abs(cyh - cy) * 1.05;
        // kotak abu-abu
        ctx.strokeStyle = GRAY; ctx.lineWidth = 1.4;
        ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);
        // huruf opsi (kecil, abu) di pojok kiri-atas kotak
        ctx.fillStyle = GRAY; ctx.font = '11px Georgia, serif'; ctx.textAlign = 'left';
        ctx.fillText(letters[o], cx - bw / 2 + 3, cy - bh / 2 + 12);
      }
    }

    // footer
    ctx.fillStyle = '#aaa'; ctx.font = '12px Georgia, serif'; ctx.textAlign = 'center';
    ctx.fillText('Pastikan ke-4 kotak hitam di sudut tidak tertutup saat difoto.', PAGE_W / 2, PAGE_H * (1 - FID_MARGIN_Y) + 26);
  }

  function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }

  /* Cetak: buka window berisi gambar canvas lalu print */
  function print(canvas) {
    const data = canvas.toDataURL('image/png');
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Cetak Lembar Jawaban</title>
      <style>@page{size:A4 portrait;margin:0}body{margin:0}img{width:100%;display:block}</style>
      </head><body><img src="${data}" onload="window.print()"></body></html>`);
    w.document.close();
  }

  /* Unduh PDF lembar jawaban (jsPDF) */
  function downloadPDF(canvas, cfg) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pw, ph);
    pdf.save(`lembar_jawaban_${slug(cfg.examTitle)}.pdf`);
  }

  function slug(s) { return (s || 'lembar').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }

  return { render, print, downloadPDF, PAGE_W, PAGE_H };
})();
