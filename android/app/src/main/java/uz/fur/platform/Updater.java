package uz.fur.platform;

import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.widget.ProgressBar;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Veb paketni (ilovaning o'zi) APK'ni qayta o'rnatmasdan yangilaydi.
 * Tartib: latest.json -> zip yuklash -> SHA-256 tekshirish -> files/www/vN ga ochish -> almashtirish -> sog'lik tekshiruvi (ishlamasa orqaga).
 */
final class Updater {
    private final MainActivity act;
    private final SharedPreferences sp;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private int baseline = 0;

    Updater(MainActivity a) { act = a; sp = a.getSharedPreferences("ota", 0); }

    // ---------- versiya va fayllar ----------
    void init() {
        baseline = readBaseline();
        int active = sp.getInt("active", 0);
        // APK yangilangan va uning ichidagi veb paket OTA'dan yangiroq/teng bo'lsa — OTA'ni tashlaymiz
        if (active != 0 && (active <= baseline || !new File(act.getFilesDir(), "www/v" + active + "/index.html").exists())) {
            sp.edit().putInt("active", 0).remove("prev").remove("pending").apply();
            active = 0;
        }
        cleanup(active);
    }

    private int readBaseline() {
        try (InputStream in = act.getAssets().open("www/version.json")) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] b = new byte[512]; int n;
            while ((n = in.read(b)) > 0) bo.write(b, 0, n);
            Matcher m = Pattern.compile("\"web\"\\s*:\\s*(\\d+)").matcher(bo.toString("UTF-8"));
            return m.find() ? Integer.parseInt(m.group(1)) : 0;
        } catch (Exception e) { return 0; }
    }

    int current() { int a = sp.getInt("active", 0); return a != 0 ? a : baseline; }

    /** Yo'l bo'yicha fayl oqimi (OTA papka yoki APK assets). null = topilmadi. */
    InputStream open(String path) {
        try {
            int a = sp.getInt("active", 0);
            if (a != 0) {
                File f = new File(act.getFilesDir(), "www/v" + a + "/" + path);
                return f.isFile() ? new FileInputStream(f) : null;
            }
            return act.getAssets().open("www/" + path);
        } catch (IOException e) { return null; }
    }

    private void cleanup(int keepActive) {
        File root = new File(act.getFilesDir(), "www"); File[] kids = root.listFiles(); if (kids == null) return;
        int prev = sp.getInt("prev", 0);
        for (File k : kids) {
            String n = k.getName();
            if (n.equals("v" + keepActive) || (prev != 0 && n.equals("v" + prev))) continue;
            OtaCore.deleteTree(k);
        }
    }

    // ---------- tekshirish ----------
    String updateUrl() { String u = sp.getString("url", ""); return u.isEmpty() ? BuildConfig.UPDATE_URL : u; }
    void setUpdateUrl(String u) { sp.edit().putString("url", u == null ? "" : u.trim()).apply(); }

    void autoCheck() {
        if (updateUrl().isEmpty()) return;
        long last = sp.getLong("lastCheck", 0);
        if (System.currentTimeMillis() - last > 3L * 3600 * 1000) check(false);
    }

    void check(final boolean manual) {
        new Thread(() -> {
            try {
                String url = updateUrl();
                if (url.isEmpty()) { if (manual) toast("Yangilanish manzili sozlanmagan"); return; }
                if (!OtaCore.isHttps(url)) throw new IOException("Faqat https manzil ruxsat etiladi");
                JSONObject o = new JSONObject(httpGetText(url, 1 << 16));
                sp.edit().putLong("lastCheck", System.currentTimeMillis()).apply();
                final int web = o.getInt("web"), minApk = o.optInt("minApk", 1);
                final String notes = o.optString("notes", ""), apk = o.optString("apk", "");
                if (minApk > BuildConfig.APK_LEVEL) { ui.post(() -> dialogApk(apk, notes)); return; }
                if (web <= current()) { if (manual) toast("Eng so‘nggi versiya (web " + current() + ")"); return; }
                final String zip = OtaCore.resolve(url, o.getString("zip")), sha = o.optString("sha256", "").toLowerCase();
                if (!OtaCore.isHttps(zip)) throw new IOException("Paket manzili https emas");
                if (sha.length() != 64) throw new IOException("latest.json ichida sha256 yo‘q");
                ui.post(() -> dialogUpdate(web, notes, zip, sha, o.optLong("size", 0)));
            } catch (Exception e) { if (manual) toast("Tekshirib bo‘lmadi: " + e.getMessage()); }
        }).start();
    }

    private void dialogApk(String apkUrl, String notes) {
        AlertDialog.Builder b = new AlertDialog.Builder(act).setTitle("Yangi APK kerak")
            .setMessage("Bu yangilanish uchun ilovaning o‘zini (APK) yangilash kerak." + (notes.isEmpty() ? "" : "\n\n" + notes))
            .setNegativeButton("Keyinroq", null);
        if (OtaCore.isHttps(apkUrl)) b.setPositiveButton("Yuklab olish", (d, w) -> act.openUrl(apkUrl));
        b.show();
    }

    private void dialogUpdate(final int web, String notes, final String zipUrl, final String sha, final long size) {
        new AlertDialog.Builder(act).setTitle("Yangilanish bor")
            .setMessage("Yangi versiya: " + web + " (hozir " + current() + ")" + (notes.isEmpty() ? "" : "\n\n" + notes) + "\n\nDarslaringiz saqlanib qoladi.")
            .setPositiveButton("Yangilash", (d, w) -> install(web, zipUrl, sha))
            .setNegativeButton("Keyinroq", null).show();
    }

    // ---------- o'rnatish ----------
    private void install(final int web, final String zipUrl, final String sha) {
        final ProgressBar pb = new ProgressBar(act, null, android.R.attr.progressBarStyleHorizontal); pb.setIndeterminate(false); pb.setMax(100);
        final AlertDialog dlg = new AlertDialog.Builder(act).setTitle("Yuklanmoqda…").setView(pb).setCancelable(false).create(); dlg.show();
        new Thread(() -> {
            File tmpZip = new File(act.getCacheDir(), "ota.zip"), tmpDir = new File(act.getFilesDir(), "www/v" + web + ".tmp"), finalDir = new File(act.getFilesDir(), "www/v" + web);
            try {
                OtaCore.deleteTree(tmpDir); OtaCore.deleteTree(finalDir);
                download(zipUrl, tmpZip, 200L << 20, pb);
                if (!OtaCore.sha256(tmpZip).equals(sha)) throw new IOException("Paket buzilgan (SHA-256 mos kelmadi)");
                try (InputStream in = new FileInputStream(tmpZip)) { OtaCore.unzip(in, tmpDir, 400L << 20, 5000); }
                if (!new File(tmpDir, "index.html").isFile() || !new File(tmpDir, "app.js").isFile()) throw new IOException("Paket to‘liq emas");
                if (!tmpDir.renameTo(finalDir)) throw new IOException("Papkani almashtirib bo‘lmadi");
                tmpZip.delete();
                int old = sp.getInt("active", 0);
                sp.edit().putInt("prev", old).putInt("active", web).putInt("pending", web).apply();
                ui.post(() -> { dlg.dismiss(); toast("Yangilandi: versiya " + web); act.reloadWeb(); });
            } catch (Exception e) {
                OtaCore.deleteTree(tmpDir); tmpZip.delete();
                ui.post(() -> { dlg.dismiss(); new AlertDialog.Builder(act).setTitle("Yangilanmadi").setMessage(String.valueOf(e.getMessage()) + "\n\nEski versiya o‘zgarishsiz qoldi.").setPositiveButton("OK", null).show(); });
            }
        }).start();
    }

    // ---------- yangilashdan keyingi sog'lik tekshiruvi ----------
    void onPageLoaded() {
        final int pending = sp.getInt("pending", 0); if (pending == 0 || pending != sp.getInt("active", 0)) return;
        ui.postDelayed(() -> healthCheck(pending, 1), 4000);
    }

    private void healthCheck(final int pending, final int attempt) {
        if (sp.getInt("pending", 0) != pending) return;
        act.evalJs("(function(){var a=document.getElementById('app');return !!(a&&a.children.length>0&&typeof window.__furBack==='function')})()", v -> {
            if ("true".equals(v)) { sp.edit().remove("pending").apply(); cleanup(pending); }
            else if (attempt < 3) ui.postDelayed(() -> healthCheck(pending, attempt + 1), 5000);
            else rollback(pending);
        });
    }

    private void rollback(int bad) {
        int prev = sp.getInt("prev", 0);
        sp.edit().putInt("active", prev).remove("prev").remove("pending").apply();
        OtaCore.deleteTree(new File(act.getFilesDir(), "www/v" + bad));
        toast("Yangilanish ishlamadi — eski versiyaga qaytildi");
        act.reloadWeb();
    }

    // ---------- tarmoq ----------
    private String httpGetText(String url, int max) throws IOException {
        HttpURLConnection c = connect(url);
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] b = new byte[4096]; int n;
            while ((n = in.read(b)) > 0) { bo.write(b, 0, n); if (bo.size() > max) throw new IOException("Javob juda katta"); }
            return bo.toString("UTF-8");
        } finally { c.disconnect(); }
    }

    private void download(String url, File out, long max, final ProgressBar pb) throws IOException {
        HttpURLConnection c = connect(url);
        try (InputStream in = c.getInputStream(); FileOutputStream fo = new FileOutputStream(out)) {
            long len = c.getContentLengthLong(), got = 0; byte[] b = new byte[65536]; int n, lastPct = -1;
            while ((n = in.read(b)) > 0) {
                got += n; if (got > max) throw new IOException("Paket juda katta");
                fo.write(b, 0, n);
                if (len > 0) { final int pct = (int) (got * 100 / len); if (pct != lastPct) { lastPct = pct; ui.post(() -> pb.setProgress(pct)); } }
            }
        } finally { c.disconnect(); }
    }

    private HttpURLConnection connect(String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(10000); c.setReadTimeout(20000); c.setInstanceFollowRedirects(true); c.setRequestProperty("Cache-Control", "no-cache");
        int code = c.getResponseCode(); if (code != 200) throw new IOException("Server javobi: " + code);
        return c;
    }

    private void toast(final String m) { ui.post(() -> Toast.makeText(act, m, Toast.LENGTH_LONG).show()); }
}
