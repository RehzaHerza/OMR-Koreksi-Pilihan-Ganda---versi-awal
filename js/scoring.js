/* ============================================================
   scoring.js — Penilaian benar / setengah / salah
   ------------------------------------------------------------
   Aturan (sesuai pilihan: half custom per-soal):
     - jawaban == kunci.correct      -> BENAR   (poin = bobot)
     - kunci.half && jawaban==half    -> SETENGAH (poin = bobot/2)
     - selainnya / kosong / ganda     -> SALAH   (poin = 0)
   ============================================================ */

const OMRScore = (function () {

  function gradeOne(detected, key) {
    const w = key.weight ?? 1;
    if (detected === key.correct) return { status: 'benar', point: w, max: w };
    if (key.half && detected === key.half) return { status: 'setengah', point: w / 2, max: w };
    if (detected === '-') return { status: 'kosong', point: 0, max: w };
    if (detected === '?') return { status: 'ganda', point: 0, max: w };
    return { status: 'salah', point: 0, max: w };
  }

  /* answers: array huruf/'-'/'?'; key: state.answerKey */
  function gradeAll(answers, answerKey) {
    let score = 0, maxScore = 0;
    const detail = answers.map((a, i) => {
      const k = answerKey[i] || { correct: '', half: null, weight: 1 };
      const g = gradeOne(a, k);
      score += g.point; maxScore += g.max;
      return { no: i + 1, detected: a, correct: k.correct, half: k.half, ...g };
    });
    const percent = maxScore > 0 ? (score / maxScore) * 100 : 0;
    const counts = detail.reduce((c, d) => { c[d.status] = (c[d.status] || 0) + 1; return c; }, {});
    return { score: round2(score), maxScore: round2(maxScore), percent: round2(percent), detail, counts };
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  return { gradeOne, gradeAll };
})();
