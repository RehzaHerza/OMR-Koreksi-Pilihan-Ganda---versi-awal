/* ============================================================
   config.js — State, penyimpanan, & GEOMETRI BERSAMA
   ------------------------------------------------------------
   Ini modul paling penting. Fungsi cellNormPos() dipakai DUA kali:
   - sheet-generator.js  -> untuk MENGGAMBAR kotak saat cetak
   - scanner.js          -> untuk MEMBACA kotak dari foto
   Karena keduanya pakai rumus yang sama, posisi pasti sinkron.
   ============================================================ */

const OMR = (function () {

  /* ---------- Penyimpanan (localStorage, 1 user offline) ---------- */
  const STORAGE_KEY = 'omr_state_v1';

  const defaultState = () => ({
    config: {
      examTitle: 'Ulangan Harian',
      numQuestions: 20,
      numOptions: 5,      // A..E
      columns: 2,
      defaultWeight: 1
    },
    answerKey: [],        // [{correct:'B', half:null, weight:1}, ...]
    students: []          // [{id,name,kelas,answers:[],score,maxScore,percent,detail:[],ts}]
  });

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const s = JSON.parse(raw);
      // jaga-jaga struktur lama
      const d = defaultState();
      return Object.assign(d, s, { config: Object.assign(d.config, s.config || {}) });
    } catch (e) {
      console.warn('State korup, reset.', e);
      return defaultState();
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function resetAll() {
    state = defaultState();
    save();
  }

  /* ---------- Util huruf opsi ---------- */
  const LETTERS = 'ABCDEFGHIJ';
  function optionLetters(n) { return LETTERS.slice(0, n).split(''); }

  /* ---------- GEOMETRI LAYOUT (normalized 0..1) ----------
     Sistem koordinat (u,v) berada DI DALAM persegi yang dibentuk
     oleh 4 marker pojok:
       (0,0)=kiri-atas  (1,0)=kanan-atas
       (0,1)=kiri-bawah (1,1)=kanan-bawah
     Generator memetakan (u,v) -> halaman cetak.
     Scanner memetakan (u,v) -> foto via homography.
  ------------------------------------------------------------ */
  const LAYOUT = {
    marginX: 0.05,        // margin kiri/kanan area soal (dlm ruang marker)
    marginTop: 0.16,      // ruang header (judul + nama)
    marginBottom: 0.04,
    qLabelFrac: 0.18,     // porsi lebar kolom untuk nomor soal
    optAreaFrac: 0.80,    // porsi lebar kolom untuk deretan kotak opsi
    boxFillW: 0.62,       // ukuran sampling relatif lebar 1 kotak
    boxFillH: 0.52        // ukuran sampling relatif tinggi 1 baris
  };

  function rowsPerColumn(cfg) {
    return Math.ceil(cfg.numQuestions / cfg.columns);
  }

  /* Posisi pusat kotak opsi untuk (soal ke-q [0-based], opsi ke-o [0-based]).
     Mengembalikan {u, v, w, h} dalam ruang normalized marker. */
  function cellNormPos(q, o, cfg) {
    const L = LAYOUT;
    const rpc = rowsPerColumn(cfg);
    const col = Math.floor(q / rpc);
    const row = q % rpc;

    const availW = 1 - 2 * L.marginX;
    const availH = 1 - L.marginTop - L.marginBottom;
    const colW = availW / cfg.columns;

    const colX0 = L.marginX + col * colW;
    const rowH = availH / rpc;
    const vCenter = L.marginTop + rowH * (row + 0.5);

    const optAreaX0 = colX0 + colW * L.qLabelFrac;
    const optAreaW = colW * L.optAreaFrac;
    const boxW = optAreaW / cfg.numOptions;
    const uCenter = optAreaX0 + boxW * (o + 0.5);

    return {
      u: uCenter,
      v: vCenter,
      w: boxW * L.boxFillW,
      h: rowH * L.boxFillH,
      colX0, colW, rowH, vCenter, optAreaX0, optAreaW, boxW
    };
  }

  /* Posisi nomor soal (kiri tiap baris) */
  function labelNormPos(q, cfg) {
    const L = LAYOUT;
    const rpc = rowsPerColumn(cfg);
    const col = Math.floor(q / rpc);
    const row = q % rpc;
    const availW = 1 - 2 * L.marginX;
    const availH = 1 - L.marginTop - L.marginBottom;
    const colW = availW / cfg.columns;
    const colX0 = L.marginX + col * colW;
    const rowH = availH / rpc;
    return { u: colX0 + colW * 0.02, v: L.marginTop + rowH * (row + 0.5) };
  }

  /* ---------- API publik ---------- */
  return {
    get state() { return state; },
    get cfg() { return state.config; },
    save, resetAll, load,
    optionLetters, LETTERS,
    LAYOUT, rowsPerColumn, cellNormPos, labelNormPos,

    /* sinkronkan panjang answerKey dengan numQuestions */
    syncAnswerKey() {
      const n = state.config.numQuestions;
      const w = state.config.defaultWeight;
      const ak = state.answerKey;
      while (ak.length < n) ak.push({ correct: 'A', half: null, weight: w });
      ak.length = n;
      ak.forEach(e => { if (e.weight == null) e.weight = w; });
      save();
    }
  };
})();
