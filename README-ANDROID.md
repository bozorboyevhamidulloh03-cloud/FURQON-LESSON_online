# FUR Platform — yangilanadigan APK

## Qanday ishlaydi
- APK = WebView "qobiq" + ichida veb-paket. Ilova ishga tushganda `latest.json` ni tekshiradi.
- Yangi versiya bo'lsa ilova "Yangilanish bor" deydi → bosasiz → zip yuklanadi, sha256 tekshiriladi, almashtiriladi. **Yangi APK shart emas.**
- Yangilanish buzilsa (ilova ochilmasa) avtomatik oldingi versiyaga qaytadi.
- Yangi APK faqat qobiq (Java/manifest) kodi o‘zgarganda kerak (`android/gradle.properties` da `furApkLevel` ni oshiring). `furApkLevel=2` — mikrofon/kamera ruxsatlari qo‘shilgan; `latest.json` da `minApk` ni 1 qoldiring, shunda eski APK ham veb‑yangilanishni oladi.

## Bir martalik sozlash
1. GitHub'da **public** repo oching (public bo'lsa Pages bepul), masalan `fur-platform`.
2. Shu papkadagi hamma narsani push qiling (`main` shoxiga). `keys/` ni QO'SHMANG.
3. Repo → Settings → Pages → Source: **GitHub Actions**.
4. Repo → Settings → Secrets and variables → Actions → 4 ta secret (qiymatlari `keys/SECRETS-SHAXSIY.txt` da): `KEYSTORE_B64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.
5. Actions → "FUR build" tugashini kuting (~5–8 daqiqa). Tugagach:
   - APK: Actions run → Artifacts → `FUR-Platform-apk`, yoki Releases → `latest-apk`.
   - Brauzer versiyasi: `https://<foydalanuvchi>.github.io/<repo>/`
6. APK ni telefonga o'rnating ("noma'lum manba"ga ruxsat bering).

## Har bir stage'dan keyin
Kodni `main` ga push qiling → Actions veb-paketni Pages'ga chiqaradi → ilovalar ochilganda yoki "Yangilanishni tekshirish" tugmasida yangilanishni ko'radi.

## Muhim
- Kalit (`fur-release.jks`) yo'qolsa — eski o'rnatilgan APK ustiga yangi APK qo'yib bo'lmaydi. Nusxasini saqlang.
- Yangilanish faqat veb-qismni almashtiradi.
- Jonli dars: `wss://` brokerlar ishlaydi; `ws://` faqat ilovada.
