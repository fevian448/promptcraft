// Contoh prompt — dipakai oleh index.html melalui klik chip.
//
// Struktur: kunci = id STABIL chip (data-chip="..." dalam index.html),
// bukan teks label. Sebab: label diterjemah oleh i18n.js, jadi kalau kita
// guna teks label sebagai kunci, tukar bahasa = chip tak dapat cari prompt.
//
// Setiap entri ada empat bahasa — sama seperti DICT dalam i18n.js.
// Tambah bahasa baru: tambah satu medan baharu pada SETIAP entri di sini
// dan satu blok bahasa dalam i18n.js.
window.PROMPT_CHIPS = {

  "sneaker": {
    en: "Landing page for a limited sneaker drop: countdown to release time, product photo grid, email waitlist, and a dark theme with neon green accents.",
    ms: "Halaman pendaratan untuk pelancaran sneaker terhad: kira detik ke waktu siar, grid foto produk, senarai tunggu e-mel, dan tema gelap dengan aksen hijau neon.",
    id: "Halaman landing untuk drop sepatu sneaker terbatas: hitung mundur ke waktu rilis, grid foto produk, daftar tunggu email, dan tema gelap dengan aksen neon hijau.",
    "zh-CN": "限量球鞋发布的落地页：发售倒计时、商品照片网格、邮件候补名单，以及带霓虹绿点缀的深色主题。"
  },

  "expense": {
    en: "Monthly expense tracker: add-transaction form (category, amount, date), a deletable transaction list, per-category totals, and a simple bar chart from that data. Data is stored in localStorage.",
    ms: "Penjejak perbelanjaan bulanan: borang tambah transaksi (kategori, jumlah, tarikh), senarai transaksi yang boleh dipadam, jumlah setiap kategori, dan carta bar mudah daripada data itu. Data disimpan dalam localStorage.",
    id: "Aplikasi pencatat pengeluaran bulanan: form tambah transaksi (kategori, jumlah, tanggal), daftar transaksi yang bisa dihapus, total per kategori, dan grafik batang sederhana dari data tersebut. Data disimpan di localStorage.",
    "zh-CN": "月度记账应用：添加交易表单（分类、金额、日期）、可删除的交易列表、按分类汇总，以及基于数据的简单柱状图。数据保存在 localStorage。"
  },

  "sourdough": {
    en: "Sourdough timer with several stages (autolyse, bulk ferment, fold, proof), each skippable and repeatable, a progress bar, and a sound alarm via the Web Audio API. Comfortable to use on a phone.",
    ms: "Pemasa sourdough dengan beberapa peringkat (autolyse, perapian pukal, lipat, proof), boleh dilewati dan diulang, bar kemajuan, dan penggera bunyi melalui Web Audio API. Selesa digunakan di telefon.",
    id: "Timer sourdough dengan beberapa tahap (autolyse, bulk ferment, fold, proof), bisa dilewati dan diulang, progress bar, dan alarm suara via Web Audio API. Nyaman dipakai di HP.",
    "zh-CN": "酸面团计时器，包含多个阶段（自解、主发酵、折叠、醒发），可跳过可重做，带进度条，并通过 Web Audio API 发出提示音。手机上也好用。"
  },

  "team": {
    en: "Team chat app simulation: channel list in the sidebar, a message area with differently coloured chat bubbles per user, and a message input that actually posts to the view (dummy responses are fine).",
    ms: "Simulasi sembang pasukan: senarai saluran di bar tepi, ruang mesej dengan gelembung berwarna berbeza setiap pengguna, dan input mesej yang benar-benar menghantar mesej ke paparan (respons dummy boleh).",
    id: "Simulasi aplikasi chat tim: daftar channel di sidebar, area pesan dengan bubble chat berbeda warna per user, dan input pesan yang benar-benar mengirim pesan ke tampilan (dummy responses boleh).",
    "zh-CN": "团队聊天应用模拟：侧边栏频道列表、按用户区分气泡颜色的消息区，以及真正能把消息发到界面上的输入框（允许假回复）。"
  },

  "beat": {
    en: "4x16 grid drum machine with kick, snare, hihat and clap, play/stop transport, a tempo slider, and synth sounds made with the Web Audio API. Add step lights that glow while playing.",
    ms: "Mesin dram grid 4x16 dengan kick, snare, hihat dan clap, pengangkut main/henti, gelangsar tempo, dan bunyi sintesis melalui Web Audio API. Tambah lampu langkah yang menyala semasa main.",
    id: "Drum machine 4x16 grid dengan kick, snare, hihat, dan clap, transport play/stop, tempo slider, dan suara synth yang dibuat lewat Web Audio API. Tambahkan lampu step yang menyala saat play.",
    "zh-CN": "4x16 网格鼓机，包含底鼓、军鼓、踩镲和拍手，播放/停止控件、速度滑块，以及用 Web Audio API 合成的声音。播放时步骤灯会亮起。"
  },

  "palette": {
    en: "Colour palette generator: one button to generate 5 harmonious colours, each colour can be locked then re-randomised, click to copy the hex, and a CSS variables export button.",
    ms: "Penjana palet warna: satu butang untuk menjana 5 warna selaras, setiap warna boleh dikunci kemudian dirawak semula, klik untuk salin hex, dan butang eksport CSS variables.",
    id: "Generator palet warna: satu tombol untuk membangkitkan 5 warna harmonis, tiap warna bisa dikunci lalu diacak lagi, klik untuk salin hex, dan tombol ekspor CSS variables.",
    "zh-CN": "配色生成器：一个按钮生成 5 种协调的颜色，每种颜色可锁定后再随机，点击复制十六进制值，并提供导出 CSS 变量的按钮。"
  }
};
