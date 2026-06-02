/* ============================================================
   scanner.js — Computer Vision pipeline (JS murni, tanpa OpenCV)
   ------------------------------------------------------------
   Alur:
     1. Gambar foto ke canvas (diperkecil utk kecepatan)
     2. Grayscale + kalibrasi ambang (pakai marker hitam & kertas)
     3. Deteksi 4 marker pojok (komponen gelap terbesar tiap pojok)
     4. Homography: ruang marker (0..1) -> piksel foto
     5. Sampling tiap kotak opsi -> rasio piksel gelap
     6. Pilih opsi paling gelap (deteksi silang ballpoint)
   Output: { answers:[...], debug:{...} }
   Catatan: ambang mungkin perlu kalibrasi pd foto nyata; jaring
   pengaman adalah koreksi manual di UI setelah scan.
   ============================================================ */

const OMRCV = (function () {

  const PROC_MAX_W = 1000;     // lebar maksimum saat proses (kecepatan)
  const FID_WIN_X = 0.32;      // lebar jendela pencarian marker (porsi)
  const FID_WIN_Y = 0.24;     // tinggi jendela pencarian marker (porsi)

  /* Muat sumber gambar (Image/Video/Canvas) ke canvas proses */
  function toProcCanvas(src, srcW, srcH) {
    const scale = Math.min(1, PROC_MAX_W / srcW);
    const w = Math.round(srcW * scale);
    const h = Math.round(srcH * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(src, 0, 0, w, h);
    return c;
  }

  /* Konversi ke array grayscale (0..255) */
  function toGray(ctx, w, h) {
    const img = ctx.getImageData(0, 0, w, h).data;
    const g = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < img.length; i += 4, j++) {
      // luminance
      g[j] = (img[i] * 0.299 + img[i + 1] * 0.587 + img[i + 2] * 0.114) | 0;
    }
    return g;
  }

  /* Estimasi kecerahan kertas (persentil ~80) untuk kalibrasi ambang */
  function paperBrightness(gray) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    const target = gray.length * 0.80;
    let acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) return v; }
    return 255;
  }

  /* Komponen gelap terbesar dalam jendela -> centroid (koordinat full proc).
     thr = ambang gelap utk marker (lebih ketat, marker = hitam pekat). */
  function largestDarkCentroid(gray, w, h, x0, y0, x1, y1, thr) {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
    x1 = Math.min(w, x1 | 0); y1 = Math.min(h, y1 | 0);
    const ww = x1 - x0, hh = y1 - y0;
    if (ww <= 0 || hh <= 0) return null;

    const visited = new Uint8Array(ww * hh);
    const isDark = (gx, gy) => gray[gy * w + gx] < thr;

    let best = null;
    const stack = new Int32Array(ww * hh * 2);

    for (let ly = 0; ly < hh; ly++) {
      for (let lx = 0; lx < ww; lx++) {
        const li = ly * ww + lx;
        if (visited[li]) continue;
        const gx = x0 + lx, gy = y0 + ly;
        if (!isDark(gx, gy)) { visited[li] = 1; continue; }
        // BFS/DFS flood fill
        let sp = 0, sumX = 0, sumY = 0, cnt = 0;
        stack[sp++] = lx; stack[sp++] = ly;
        visited[li] = 1;
        while (sp > 0) {
          const cy = stack[--sp], cx = stack[--sp];
          const cgx = x0 + cx, cgy = y0 + cy;
          sumX += cgx; sumY += cgy; cnt++;
          // tetangga 4-arah
          const nb = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
          for (const [nx, ny] of nb) {
            if (nx < 0 || ny < 0 || nx >= ww || ny >= hh) continue;
            const ni = ny * ww + nx;
            if (visited[ni]) continue;
            visited[ni] = 1;
            if (isDark(x0 + nx, y0 + ny)) { stack[sp++] = nx; stack[sp++] = ny; }
          }
        }
        if (!best || cnt > best.cnt) best = { cnt, cx: sumX / cnt, cy: sumY / cnt };
      }
    }
    // tolak blob terlalu kecil (noise)
    if (!best || best.cnt < (ww * hh) * 0.004) return null;
    return { x: best.cx, y: best.cy, area: best.cnt };
  }

  /* Deteksi 4 marker pojok. Mengembalikan {tl,tr,bl,br} atau null. */
  function detectFiducials(gray, w, h, fidThr) {
    const wx = w * FID_WIN_X, wy = h * FID_WIN_Y;
    const tl = largestDarkCentroid(gray, w, h, 0, 0, wx, wy, fidThr);
    const tr = largestDarkCentroid(gray, w, h, w - wx, 0, w, wy, fidThr);
    const bl = largestDarkCentroid(gray, w, h, 0, h - wy, wx, h, fidThr);
    const br = largestDarkCentroid(gray, w, h, w - wx, h - wy, w, h, fidThr);
    if (!tl || !tr || !bl || !br) return null;
    return { tl, tr, bl, br };
  }

  /* Selesaikan A·x = b (n×n) dgn eliminasi Gauss + pivoting. */
  function solveLinear(A, b, n) {
    const M = A.map((row, i) => row.concat(b[i]));
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++)
        if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      if (Math.abs(M[piv][col]) < 1e-12) return null;
      [M[col], M[piv]] = [M[piv], M[col]];
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = M[r][col] / M[col][col];
        for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
      }
    }
    const x = new Array(n);
    for (let i = 0; i < n; i++) x[i] = M[i][n] / M[i][i];
    return x;
  }

  /* Homography dari titik src (ruang marker 0..1) ke dst (piksel foto). */
  function computeHomography(srcPts, dstPts) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = srcPts[i], [X, Y] = dstPts[i];
      A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
      A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
    }
    const hVec = solveLinear(A, b, 8);
    if (!hVec) return null;
    return hVec; // [h0..h7], h8 = 1
  }

  function mapPoint(H, u, v) {
    const den = H[6] * u + H[7] * v + 1;
    return [(H[0] * u + H[1] * v + H[2]) / den, (H[3] * u + H[4] * v + H[5]) / den];
  }

  /* Rasio piksel gelap dlm kotak (cx,cy) berukuran (bw,bh) px foto. */
  function darkRatio(gray, w, h, cx, cy, bw, bh, inkThr) {
    const x0 = Math.max(0, (cx - bw / 2) | 0), x1 = Math.min(w, (cx + bw / 2) | 0);
    const y0 = Math.max(0, (cy - bh / 2) | 0), y1 = Math.min(h, (cy + bh / 2) | 0);
    let dark = 0, total = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) { total++; if (gray[y * w + x] < inkThr) dark++; }
    return total ? dark / total : 0;
  }

  /* ---- Pipeline lengkap ---- */
  function process(src, srcW, srcH, cfg) {
    const canvas = toProcCanvas(src, srcW, srcH);
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const gray = toGray(ctx, w, h);

    const paper = paperBrightness(gray);
    const fidThr = Math.max(60, paper * 0.45);  // marker = hitam pekat
    const inkThr = Math.max(90, paper * 0.62);  // ballpoint = cukup gelap

    const fids = detectFiducials(gray, w, h, fidThr);
    if (!fids) {
      return { ok: false, reason: 'Marker pojok tidak terdeteksi. Pastikan ke-4 sudut terlihat & kontras cukup.', procCanvas: canvas };
    }

    // srcPts = sudut ruang marker; dstPts = centroid marker terdeteksi
    const srcPts = [[0, 0], [1, 0], [0, 1], [1, 1]];
    const dstPts = [[fids.tl.x, fids.tl.y], [fids.tr.x, fids.tr.y], [fids.bl.x, fids.bl.y], [fids.br.x, fids.br.y]];
    const H = computeHomography(srcPts, dstPts);
    if (!H) return { ok: false, reason: 'Gagal hitung perspektif.', procCanvas: canvas };

    const letters = OMR.optionLetters(cfg.numOptions);
    const answers = [];
    const samplePts = [];   // utk overlay debug
    const MIN_FILL = 0.045; // rasio min agar dianggap "ada coretan"
    const DOMINANCE = 1.6;  // teratas hrs > 1.6x kedua agar tak ambigu

    for (let q = 0; q < cfg.numQuestions; q++) {
      const ratios = [];
      for (let o = 0; o < cfg.numOptions; o++) {
        const cell = OMR.cellNormPos(q, o, cfg);
        const [px, py] = mapPoint(H, cell.u, cell.v);
        // ukuran kotak dlm px: estimasi dari skala lokal homography
        const [pxw] = mapPoint(H, cell.u + cell.w, cell.v);
        const [, pyh] = mapPoint(H, cell.u, cell.v + cell.h);
        const bw = Math.abs(pxw - px), bh = Math.abs(pyh - py);
        const r = darkRatio(gray, w, h, px, py, bw, bh, inkThr);
        ratios.push(r);
        samplePts.push({ px, py, bw, bh, q, o });
      }
      // tentukan jawaban
      let max1 = 0, idx1 = -1, max2 = 0;
      ratios.forEach((r, i) => {
        if (r > max1) { max2 = max1; max1 = r; idx1 = i; }
        else if (r > max2) { max2 = r; }
      });
      let ans;
      if (max1 < MIN_FILL) ans = '-';                 // kosong
      else if (max2 > 0 && max1 < max2 * DOMINANCE) ans = '?'; // ambigu/ganda
      else ans = letters[idx1];
      answers.push(ans);
    }

    return {
      ok: true,
      answers,
      debug: { fids, samplePts, paper, fidThr, inkThr, w, h },
      procCanvas: canvas
    };
  }

  /* Gambar overlay debug ke canvas tujuan (utk verifikasi visual) */
  function drawDebug(targetCanvas, result) {
    const { procCanvas, debug } = result;
    targetCanvas.width = procCanvas.width;
    targetCanvas.height = procCanvas.height;
    const ctx = targetCanvas.getContext('2d');
    ctx.drawImage(procCanvas, 0, 0);
    if (!debug) return;
    // marker
    ctx.strokeStyle = '#e8513a'; ctx.lineWidth = 2;
    Object.values(debug.fids).forEach(f => {
      ctx.beginPath(); ctx.arc(f.x, f.y, 8, 0, 7); ctx.stroke();
    });
    // titik sampling
    ctx.strokeStyle = 'rgba(40,120,220,0.85)'; ctx.lineWidth = 1;
    debug.samplePts.forEach(s => ctx.strokeRect(s.px - s.bw / 2, s.py - s.bh / 2, s.bw, s.bh));
  }

  return { process, drawDebug };
})();
