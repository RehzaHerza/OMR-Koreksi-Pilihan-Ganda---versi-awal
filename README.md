# Koreksi Pilihan Ganda

Aplikasi web untuk mengoreksi lembar jawaban pilihan ganda pakai kamera. Siswa menyilang jawaban pakai ballpoint, lembarnya difoto, dan aplikasi yang menghitung nilainya.

Semuanya jalan di dalam browser. Tidak ada server, tidak ada database, tidak butuh internet setelah halaman kebuka, dan tidak ada AI yang menebak-nebak jawaban. Datanya disimpan di browser kamu sendiri. Jadi gratis, cepat, dan privat. Paling enak ditaruh di GitHub Pages.

## Idenya

Supaya kamera bisa membaca lembar dengan tepat, lembarnya harus dicetak dari aplikasi ini sendiri. Tiap lembar punya empat kotak hitam di sudut. Empat kotak itulah yang dipakai kamera untuk mengenali posisi lembar dan meluruskan foto, walau fotonya agak miring. Karena itu lembar polos bawaan sekolah (yang tanpa kotak sudut) tidak bisa dipakai — harus lembar yang dicetak dari sini.

Satu hal yang sering disalahpahami: aplikasi ini **tidak membaca tulisan tangan**. Kolom nama, kelas, dan nomor di lembar itu cuma garis kosong untuk diisi siswa, supaya kamu tahu ini lembar siapa. Yang dibaca aplikasi hanya kotak pilihan yang disilang.

## Cara pakai

Urutannya ikuti tab dari kiri ke kanan:

1. **Pengaturan** — atur judul ujian, jumlah soal, jumlah pilihan (A–E), berapa kolom di lembar, dan bobot tiap soal. Di bagian bawah halaman ini kamu juga bisa memasukkan daftar nama siswa: tinggal tempel dari Excel atau unggah file. Kalau belum punya formatnya, ada tombol unduh template.
2. **Kunci Jawaban** — isi jawaban benar untuk tiap nomor. Bobot bisa dibuat beda per soal kalau memang perlu.
3. **Lembar Jawaban** — cetak atau unduh lembarnya, lalu bagikan ke siswa. Mereka mengisi dengan cara menyilang pilihan pakai ballpoint.
4. **Scan & Koreksi** — foto lembar yang sudah diisi, atau pakai Mode Live (kamera dibiarkan menyala; begitu lembar terdeteksi dan diam sebentar, langsung dibaca otomatis). Hasil bacanya muncul lengkap dengan tanda di atas foto, dan bisa kamu betulkan kalau ada yang keliru. Pilih nama siswa dari daftar, lalu simpan.
5. **Rekap Nilai** — semua nilai terkumpul di sini, dan bisa diunduh jadi Excel, Word, atau PDF.

## Cara membaca silangnya

Singkatnya begini: aplikasi mencari empat kotak hitam di sudut, meluruskan foto berdasarkan posisi keempatnya, lalu melihat tiap kotak pilihan dan mengukur seberapa gelap. Kotak yang jelas lebih gelap dibanding kotak-kotak kosong di sebelahnya dianggap jawaban siswa.

Karena yang diukur cuma "seberapa gelap", bentuk coretannya tidak jadi soal — mau silang penuh, silang kecil, atau dilingkari, sama saja, asal cukup jelas. Yang dibandingkan adalah kotak terisi melawan kotak kosong di baris yang sama, jadi lembar yang agak kotor pun tidak gampang salah baca. Soal yang kosong atau disilang dua otomatis ditandai supaya kamu periksa sendiri.

Jujur saja: seberapa "jelas" sebuah coretan supaya dianggap sah itu masih perlu disesuaikan dengan gaya menulis siswamu yang sebenarnya. Angka penyetelnya ada di `js/scanner.js` (sudah diberi nama dan komentar). Itu sebabnya selalu ada langkah koreksi manual sebelum menyimpan — anggap itu jaring pengaman, bukan tanda aplikasinya kurang bagus.

## Kelas

Di bagian atas ada pilihan Kelas. Tiap kelas punya kunci jawaban, daftar nama, dan daftar nilai sendiri yang terpisah penuh. Ganti kelas lewat dropdown, datanya ikut berganti. Karena kamu mengajar beberapa mapel, paling praktis namai tiap kelas dengan kelas + mapel, misalnya "X TKR — RPL".

Perlu diingat datanya tersimpan per browser di satu perangkat, bukan akun online. Kalau dibuka di HP atau komputer lain, mulai dari kosong. Jadi anggap file Excel hasil unduhan sebagai arsip nilai yang sesungguhnya, dan rajin-rajin ekspor.

## Layar pembuka

Waktu dibuka, ada layar pembuka berisi logo dan nama sekolah dengan foto sekolah sebagai latar. Gambarnya ada di folder `assets/` — `logo-sekolah.png` dan `sekolah-bg.jpg`. Mau ganti? Tinggal timpa kedua file itu dengan nama yang sama. Nama sekolah diubah di `index.html`, dan lama tampilnya diatur di `js/app.js` (cari `SPLASH_MIN_MS`).

## Menjalankan di komputer sendiri

Kamera hanya jalan di `localhost` atau `https`, jadi tidak bisa cuma klik dua kali file html-nya. Jalankan server statis dulu:

```bash
python3 -m http.server 8000
```

lalu buka `http://localhost:8000`. Atau lebih gampang, pakai ekstensi "Live Server" di VSCode.

## Menaruh online (GitHub Pages)

Cara paling mudah lewat GitHub Pages: buat repo, push semua isi folder ini (termasuk `lib/` dan `assets/`), lalu masuk Settings → Pages dan pilih branch `main`. Nanti dapat alamat `https://namauser.github.io/namarepo/`. Pastikan alamatnya `https`, karena kamera tidak akan jalan kalau cuma `http`.

Mau pindah ke hosting lain juga bisa, prinsipnya sama: ini cuma kumpulan file statis, tinggal diunggah. Yang wajib cuma satu — host-nya harus mengaktifkan https.

## Isi folder

```
omr/
├── index.html              halaman utama
├── css/style.css           tampilan
├── js/
│   ├── config.js           pengaturan, penyimpanan, dan geometri lembar (paling inti)
│   ├── scanner.js          pembacaan kamera (deteksi sudut, luruskan, baca silang)
│   ├── scoring.js          hitung benar/salah
│   ├── sheet-generator.js  pembuat lembar jawaban
│   ├── export.js           ekspor Excel/Word/PDF
│   └── app.js              pengatur tampilan
├── lib/                    library ekspor (disimpan lokal, bukan dari internet)
└── assets/                 logo & foto sekolah untuk layar pembuka
```

## Yang perlu diingat

- Hasil baca tergantung kualitas foto. Ambil lurus dari atas, keempat sudut masuk frame, cahaya rata, hindari bayangan dan pantulan. Empat kotak hitam di sudut wajib ikut terfoto.
- Datanya cuma ada di browser ini. Membersihkan cache browser berarti menghapus datanya. Ekspor ke Excel secara rutin untuk berjaga-jaga.
- Aplikasi ini khusus pilihan ganda. Soal esai tetap dikoreksi manual.
