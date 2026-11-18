# Jonli dars (Classroom) — protokol va sozlash

**Model.** O'qituvchi darsni ochadi, o'quvchilar kod bilan qo'shiladi va o'qituvchining joriy sahifasini real vaqtda ko'radi (faqat ko'rish). O'quvchi "qo'l ko'tarishi" mumkin.

**Transport.** Bepul MQTT-over-WebSocket server (ro'yxatdan o'tish yo'q). Ommaviy ro'yxat `app/src/room.ts` → `BROKERS` (HiveMQ, EMQX, Mosquitto test serveri — bu sandboxda haqiqiy serverlar bilan sinalmagan).
**O'z serveringiz:** `node tools/fur-relay.cjs 8883` (bir marta `npm i ws`), keyin ilovada "Server" maydoniga `ws://<IP>:8883`. Internetsiz LAN darsi uchun ham ishlaydi. Eslatma: https sahifadan `ws://` bloklanadi — ilovani fayl (file://) yoki http orqali oching.

**Kod:** `D-XXXX-XXXX-XXXX`: D = server raqami (0..2 ommaviy, 9 = o'z serveringiz), 12 belgi = sir. Kalit: PBKDF2(SHA-256, 100k) → AES-GCM-256. Mavzu nomi: SHA-256(sir) dan olinadi. Server faqat shifrlangan baytlarni ko'radi. Kodni bilgan har kim yoza oladi (o'qituvchi/o'quvchi ajratilmaydi) — 3-4 kishilik shaxsiy sinf uchun.

**Xabarlar (shifrlangan JSON, >28k belgi bo'laklanadi):**
- o'quvchi → `hello{name,first}`, `hand{name,up}`, `need{ids}`, `bye`
- o'qituvchi → `page{i,n,title,page,layout}`, `ops{i,del,upd,add[{at,o}]}`, `asset{id,mime,i,n,d(base64)}`, `laser{u,v,on}`, `ink{pts|null}`, `hb{i,n}` (4 s), `end`
Lazer/qalam koordinatalari sahifa koordinatasida (doska: dunyo, hujjat: qog'oz kengligiga nisbatan), shuning uchun turli ekranlarda to'g'ri joyga tushadi.
