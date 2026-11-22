# FURQON Online — Windows 10 / 11 (x64)

Electron asosidagi ilova: veb-versiyadagi hamma imkoniyat + Windows'ga xos ishlar.
Windows 8.1 va undan eskisi qo'llab-quvvatlanmaydi (yangi Electron ularni qo'llamaydi).

## O'rnatish (administrator shart emas)
1. `FURQON-Online-Windows-x64.zip` ni oching (papkaga chiqaring).
2. `ORNATISH.bat` ni ikki marta bosing → ilova `%LocalAppData%\Programs\FURQON Online` ga o'rnatiladi, ish stoli va Start menyuda yorliq paydo bo'ladi, `.fur` fayllar FURQON bilan bog'lanadi.
3. Endi istalgan `.fur` faylni ikki marta bossangiz (yoki sichqonchaning o'ng tugmasi → "Open with" → FURQON) ilovada ochiladi.

Ilova imzolanmagan, shuning uchun birinchi ishga tushirishda Windows SmartScreen "Windows protected your PC" deb chiqishi mumkin: **More info → Run anyway**.
O'chirish: Sozlamalar → Ilovalar → FURQON Online (yoki papkadagi `uninstall.ps1`).

## Yozuvlar
Dars yozuvlari avtomatik `Videolar\FURQON Recordings` papkasiga saqlanadi va ilovaning "Yozuvlar" bo'limida ko'rinadi (ichki pleyer, tezlik, o'chirish). "Papkada ko'rsatish" tugmasi Explorer'da faylni ochadi.

## Yangilanish
Veb qismi yangilanganda (GitHub Pages `latest.json`) ilova uni o'zi yuklab oladi — qayta o'rnatish shart emas. Qo'lda: "Yangilanishni tekshirish".
`desktop/config.json` dagi `updateUrl` — yangilanish sayti manzili (workflow uni avtomatik yozadi).

## Yig'ish
- Linux/Mac/Windows'da ko'chma `.zip`: `bash scripts/build-win.sh` (natija: `desktop/dist-win/`).
- To'liq o'rnatuvchi (`Setup.exe`, NSIS): GitHub → Actions → **FURQON Windows** → Run workflow (Windows kompyuterda `WIN_TARGETS="nsis zip" bash scripts/build-win.sh` ham ishlaydi).
