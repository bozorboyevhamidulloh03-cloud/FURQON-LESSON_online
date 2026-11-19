# Onlayn (jonli) dars — qanday ishlatiladi

## 1-yo'l: hech narsa sozlamasdan (avval shuni sinang)
1. O'qituvchi: hujjatni oching → **Jonli dars** → **Server** maydonini **BO'SH qoldiring** → **Boshlash**.
2. Ekranda kod chiqadi, masalan `0-K7M2-Q9XA-4TDP`. Uni o'quvchilarga yuboring.
3. O'quvchi: bosh sahifada **Darsga qo'shilish** → kodni va ismini yozadi → **Qo'shilish**. **Server maydoni bo'sh** qoladi.

Bo'sh qoldirilsa ilova bepul ommaviy serverlarni (HiveMQ, EMQX, Mosquitto) o'zi sinab ko'radi. Ro'yxatdan o'tish yo'q, xabarlar kod bilan shifrlangan.
Shart: o'qituvchi va o'quvchilarda internet bo'lishi kerak.
> Ommaviy serverlar bepul va nazoratimizda emas: ba'zan band yoki sekin bo'lishi mumkin. Muhim darsdan oldin 2 ta telefon bilan sinab ko'ring.

## 2-yo'l: o'z serveringiz (ommaviy serverlar ishlamasa) — Render.com, bepul
Fayllar tayyor: loyihadagi `relay/` papkasi (GitHub repoga loyiha bilan birga ketgan).
1. render.com → **New +** → **Web Service** → GitHub repongizni tanlang.
2. Sozlamalar: **Root Directory** = `relay` · **Build Command** = `npm install` · **Start Command** = `npm start` · **Instance Type** = **Free**.
3. **Create Web Service**. 2–3 daqiqadan keyin manzil chiqadi: `https://fur-relay-xxxx.onrender.com`. Shu manzilni brauzerda oching: "FUR relay ishlayapti" yozuvi chiqsa, tayyor.
4. Ilovada **Jonli dars → Server** maydoniga yozing (https o'rniga **wss**):
   `wss://fur-relay-xxxx.onrender.com`
5. Kod **9** bilan boshlanadi. **Kodni nusxalash** tugmasi kod bilan serverni birga nusxalaydi. O'quvchi ikkalasini ham **Dars kodi** maydoniga qo'yib yuborsa bo'ladi (server avtomatik ajratiladi), yoki **Server** maydoniga alohida yozadi.

Muhim:
- Render bepul rejasida server ~15 daqiqa foydalanilmasa uxlaydi; birinchi ulanish 30–60 soniya kechikadi. Dars boshlashdan 2–3 daqiqa oldin manzilni brauzerda oching.
- Server dars mazmunini ko'rmaydi: u faqat shifrlangan baytlarni uzatadi.

## 3-yo'l: internetsiz (bitta Wi-Fi / hotspot)
Kompyuterda: `cd relay && npm install && node server.js 8883`. Ilovada Server: `ws://<kompyuter IP>:8883` (masalan `ws://192.168.1.5:8883`). `ws://` faqat Android ilovada ishlaydi (brauzer https sahifasida bloklanadi).

## Qo'shilish tugmalari
- O'qituvchi doskaga yozsa/ko'rsatsa, o'quvchilar real vaqtda ko'radi (faqat ko'rish).
- O'quvchi qo'l ko'tarishi mumkin. Taqdimotda lazer va qalam ham ko'rinadi.

## Ovoz, kamera, birga yozish va yozib olish (yangi)

**Ovoz va kamera.** Jonli dars oynasida (“Jonli dars” tugmasi yoki ekran burchagidagi yashil “Jonli” belgisi):
- **🎤 Mening mikrofonim / 📷 Mening kamerám** — ustoz o‘z ovozi/videosini yoqadi; hamma o‘quvchi eshitadi/ko‘radi. Taqdimot panelida ham shu tugmalar bor.
- Ro‘yxatda har bir o‘quvchi yonida **🎤 📷 ✎** tugmalari — faqat shu o‘quvchiga mikrofon / kamera / doskaga yozish ruxsati. “Hammaga …” va “Hammadan olish” tugmalari ham bor. Ruxsatni istalgan payt qaytarib olasiz — o‘quvchi mikrofoni darrov o‘chadi.
- O‘quvchi ruxsat bo‘lmasa mikrofon tugmasini bossa “Ustoz hali ruxsat bermagan” deb chiqadi; ruxsatdan keyin tugmani bosib o‘zi yoqadi (qurilmaning ruxsat so‘rovi bir marta chiqadi).
- Ovoz/video faqat ustoz ↔ o‘quvchi o‘rtasida (o‘quvchilar bir-birini eshitmaydi). Shifrlangan dars kanali faqat “signal” uchun, ovoz bevosita qurilmalar orasida o‘tadi. Bepul STUN serveridan foydalaniladi; juda qattiq tarmoqlarda (ba’zi operator NAT’lari) ulanmasligi mumkin — TURN server kerak bo‘ladi (bepul emas).
- **Android:** bu uchun yangi APK (`furApkLevel=2`) kerak — mikrofon/kamera ruxsatlari APK ichida. Eski APK’da veb‑yangilanish ishlayveradi, faqat mikrofon/kamera “ruxsat berilmadi” deydi.

**Doskaga birga yozish.** Ro‘yxatdagi ✎ ruxsati bo‘lgan o‘quvchi taqdimot panelida ✎ tugmasini bosadi, rang tanlaydi va barmoq bilan chizadi. Chiziq ustozning doskasiga yoziladi va hammaga ko‘rinadi; “↶” faqat o‘zining oxirgi chizgani uchun. Yozish paytida ko‘rinish (masshtab) qotiriladi — chizgan sari ekran siljimaydi. Faqat doska sahifalarida.

**Darsni yozib olish (taqdimotda ● tugmasi).** Telefon ekranini emas, faqat **taqdimotdagi sahifaning o‘zini** (qalam, lazer, zoom bilan) va **ustoz ovozini** yozadi — boshqa ilovaga chiqsangiz yoki qidirsangiz yozuvga tushmaydi. Qayta bosilganda `.webm` fayl saqlanadi (taxminan 6–7 MB/daqiqa). Mikrofon yo‘q bo‘lsa ovozsiz yoziladi (ogohlantirish chiqadi).
