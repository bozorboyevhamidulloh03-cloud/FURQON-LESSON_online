package uz.fur.platform;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
    static final String HOST = "fur.local";
    private static final int REQ_FILE = 1, REQ_SAVE = 2;

    private WebView web;
    private FrameLayout root;
    private Updater up;
    private View customView;
    private WebChromeClient.CustomViewCallback customCb;
    private ValueCallback<Uri[]> fileCb;
    private ByteArrayOutputStream saveBuf;
    private byte[] saveBytes;
    // "Ochish"/"Ulashish" orqali kelgan fayllar (veb-qism ularni incomingList/Chunk orqali oladi)
    private RecStore recs;
    private final ArrayList<Object[]> incoming = new ArrayList<>(); // {Integer id, String name, byte[] data}
    private int incomingSeq = 0;
    private boolean pageReady = false;
    private static final int MAX_INCOMING = 200 << 20;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW); // mahalliy ws:// relay uchun
        s.setSupportZoom(false);
        s.setTextZoom(100);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setKeepScreenOn(true);
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true);

        up = new Updater(this);
        up.init();
        recs = new RecStore(this);
        web.addJavascriptInterface(new Bridge(), "FurNative");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.loadUrl("https://" + HOST + "/index.html");
        up.autoCheck();
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        handleIntent(i);
    }

    // ---------- tashqaridan kelgan fayllar (.fur ni "Ochish") ----------
    private void handleIntent(Intent it) {
        if (it == null) return;
        final ArrayList<Uri> uris = new ArrayList<>();
        String act = it.getAction();
        try {
            if (Intent.ACTION_VIEW.equals(act) && it.getData() != null) uris.add(it.getData());
            else if (Intent.ACTION_SEND.equals(act)) { Uri u = it.getParcelableExtra(Intent.EXTRA_STREAM); if (u != null) uris.add(u); }
            else if (Intent.ACTION_SEND_MULTIPLE.equals(act)) { ArrayList<Uri> l = it.getParcelableArrayListExtra(Intent.EXTRA_STREAM); if (l != null) uris.addAll(l); }
        } catch (Exception e) { return; }
        if (uris.isEmpty()) return;
        it.setAction(null); it.setData(null); // aylantirilganda (rotation) qayta ochilmasin
        new Thread(() -> {
            for (Uri u : uris) {
                try {
                    String name = displayName(u);
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    try (InputStream in = getContentResolver().openInputStream(u)) {
                        if (in == null) throw new java.io.IOException("ochilmadi");
                        byte[] buf = new byte[65536]; int n;
                        while ((n = in.read(buf)) > 0) { bo.write(buf, 0, n); if (bo.size() > MAX_INCOMING) throw new java.io.IOException("fayl juda katta"); }
                    }
                    synchronized (incoming) { incoming.add(new Object[]{ ++incomingSeq, name, bo.toByteArray() }); }
                } catch (Throwable e) {
                    final String m = String.valueOf(e.getMessage());
                    runOnUiThread(() -> Toast.makeText(this, "Faylni o‘qib bo‘lmadi: " + m, Toast.LENGTH_LONG).show());
                }
            }
            runOnUiThread(this::notifyIncoming);
        }).start();
    }

    private String displayName(Uri u) {
        String name = null;
        if ("content".equals(u.getScheme())) {
            try (Cursor c = getContentResolver().query(u, new String[]{ OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                if (c != null && c.moveToFirst()) name = c.getString(0);
            } catch (Exception ignored) { }
        }
        if (name == null || name.isEmpty()) { name = u.getLastPathSegment(); if (name != null && name.contains("/")) name = name.substring(name.lastIndexOf('/') + 1); }
        return name == null || name.isEmpty() ? "fayl.fur" : name;
    }

    private void notifyIncoming() {
        if (pageReady && web != null) web.evaluateJavascript("(function(){try{window.__furIncoming&&window.__furIncoming()}catch(e){}})()", null);
    }

    // ---------- yordamchilar (Updater ishlatadi) ----------
    void reloadWeb() { web.clearCache(true); web.loadUrl("https://" + HOST + "/index.html"); }
    void evalJs(String js, ValueCallback<String> cb) { web.post(() -> web.evaluateJavascript(js, cb)); }
    void openUrl(String u) {
        try { Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(u)); i.addCategory(Intent.CATEGORY_BROWSABLE); startActivity(i); }
        catch (Exception e) { Toast.makeText(this, "Ochib bo‘lmadi", Toast.LENGTH_SHORT).show(); }
    }

    // ---------- fayllarni mahalliy tizimdan berish ----------
    private final class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl();
            if (!HOST.equals(u.getHost())) return null;
            String p = u.getPath();
            if (p != null && p.startsWith("/__rec/")) { // ilova ichidagi yozuv pleyeri
                try { String t = p.substring(7); int dot = t.indexOf('.'); if (dot > 0) t = t.substring(0, dot); String id = new String(Base64.decode(t, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP), "UTF-8"); return recs.serve(id, r.getRequestHeaders().get("Range")); }
                catch (Throwable e) { return new WebResourceResponse("text/plain", "utf-8", 400, "Bad Request", new HashMap<String, String>(), new java.io.ByteArrayInputStream(new byte[0])); }
            }
            if (p == null || p.equals("/")) p = "/index.html";
            p = p.substring(1);
            Map<String, String> h = new HashMap<>();
            h.put("Access-Control-Allow-Origin", "*");
            h.put("Cache-Control", "no-cache");
            if (!OtaCore.isSafeRel(p)) return new WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", h, null);
            InputStream in = up.open(p);
            if (in == null) return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", h, new java.io.ByteArrayInputStream(new byte[0]));
            String mime = OtaCore.mime(p);
            return new WebResourceResponse(mime, OtaCore.isText(mime) ? "utf-8" : null, 200, "OK", h, in);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl();
            if (HOST.equals(u.getHost())) return false;
            String sc = u.getScheme();
            if ("http".equals(sc) || "https".equals(sc) || "mailto".equals(sc)) openUrl(u.toString());
            return true;
        }

        @Override
        public void onPageFinished(WebView v, String url) { up.onPageLoaded(); pageReady = true; notifyIncoming(); }
    }

    private final class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
            if (fileCb != null) fileCb.onReceiveValue(null);
            fileCb = cb;
            Intent i = new Intent(Intent.ACTION_GET_CONTENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            try { startActivityForResult(Intent.createChooser(i, "Fayl tanlang"), REQ_FILE); }
            catch (Exception e) { fileCb = null; return false; }
            return true;
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback cb) { // Fullscreen API (taqdimot)
            if (customView != null) { cb.onCustomViewHidden(); return; }
            customView = view; customCb = cb;
            web.setVisibility(View.GONE);
            root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            immersive(true);
        }

        @Override
        public void onHideCustomView() { hideCustom(); }

        @Override
        public void onPermissionRequest(final PermissionRequest r) { runOnUiThread(() -> mediaRequest(r)); }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest r) { if (pendingPerm == r) pendingPerm = null; }
    }

    // ---------- mikrofon / kamera (jonli dars, yozib olish) — faqat o'z sahifamiz uchun ----------
    private static final int REQ_MEDIA = 77;
    private PermissionRequest pendingPerm;

    private void mediaRequest(PermissionRequest r) {
        if (!r.getOrigin().toString().startsWith("https://" + HOST)) { r.deny(); return; }
        java.util.ArrayList<String> need = new java.util.ArrayList<>();
        for (String res : r.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)) need.add(Manifest.permission.RECORD_AUDIO);
            else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)) need.add(Manifest.permission.CAMERA);
        }
        if (need.isEmpty()) { r.deny(); return; }
        boolean all = true;
        for (String p : need) if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) all = false;
        if (all) { r.grant(r.getResources()); return; }
        if (pendingPerm != null) pendingPerm.deny();
        pendingPerm = r;
        requestPermissions(need.toArray(new String[0]), REQ_MEDIA);
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] results) {
        super.onRequestPermissionsResult(req, perms, results);
        if (req != REQ_MEDIA || pendingPerm == null) return;
        PermissionRequest r = pendingPerm; pendingPerm = null;
        java.util.ArrayList<String> ok = new java.util.ArrayList<>();
        for (String res : r.getResources()) {
            String need = PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res) ? Manifest.permission.RECORD_AUDIO : PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res) ? Manifest.permission.CAMERA : null;
            if (need != null && checkSelfPermission(need) == PackageManager.PERMISSION_GRANTED) ok.add(res);
        }
        if (ok.isEmpty()) r.deny(); else r.grant(ok.toArray(new String[0]));
    }

    private void hideCustom() {
        if (customView == null) return;
        root.removeView(customView); customView = null;
        web.setVisibility(View.VISIBLE); immersive(false);
        if (customCb != null) { customCb.onCustomViewHidden(); customCb = null; }
    }

    @SuppressWarnings("deprecation")
    private void immersive(boolean on) {
        getWindow().getDecorView().setSystemUiVisibility(on
            ? View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            : View.SYSTEM_UI_FLAG_VISIBLE);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_FILE && fileCb != null) {
            Uri[] out = null;
            if (res == RESULT_OK && data != null) {
                ClipData cd = data.getClipData();
                if (cd != null) { out = new Uri[cd.getItemCount()]; for (int i = 0; i < out.length; i++) out[i] = cd.getItemAt(i).getUri(); }
                else if (data.getData() != null) out = new Uri[]{data.getData()};
            }
            fileCb.onReceiveValue(out); fileCb = null;
        } else if (req == REQ_SAVE) {
            byte[] bytes = saveBytes; saveBytes = null;
            if (res == RESULT_OK && data != null && data.getData() != null && bytes != null) {
                try (OutputStream o = getContentResolver().openOutputStream(data.getData(), "w")) {
                    o.write(bytes); Toast.makeText(this, "Saqlandi", Toast.LENGTH_SHORT).show();
                } catch (Exception e) { Toast.makeText(this, "Saqlab bo‘lmadi: " + e.getMessage(), Toast.LENGTH_LONG).show(); }
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (customView != null) { hideCustom(); return; }
        web.evaluateJavascript("(function(){try{return window.__furBack?window.__furBack():false}catch(e){return false}})()", v -> {
            if (!"true".equals(v)) moveTaskToBack(true); // jonli dars uzilmasligi uchun yopmaymiz
        });
    }

    // ---------- JavaScript ko'prigi (faqat fur.local sahifasi uchun) ----------
    private final class Bridge {
        @JavascriptInterface public String version() { return "{\"web\":" + up.current() + ",\"apk\":" + BuildConfig.APK_LEVEL + "}"; }
        @JavascriptInterface public void checkUpdate() { up.check(true); }
        @JavascriptInterface public void setUpdateUrl(String u) { up.setUpdateUrl(u); }
        // ---- dars yozuvlari ("Movies/FURQON Recordings") ----
        @JavascriptInterface public String recSaveBegin(String name, String mime) { return recs.begin(name, mime); }
        @JavascriptInterface public boolean recSaveChunk(String tok, String b64) { return recs.chunk(tok, b64); }
        @JavascriptInterface public String recSaveEnd(String tok, boolean ok) { return recs.end(tok, ok); }
        @JavascriptInterface public String recList() { return recs.list(); }
        @JavascriptInterface public boolean recDelete(String id) { return recs.delete(id); }
        @JavascriptInterface public String recWhere() { return RecStore.REL; }
        @JavascriptInterface
        public void recShare(final String id) {
            if (!recs.own(id)) return;
            runOnUiThread(() -> {
                try {
                    Uri u = Uri.parse(id); if ("file".equals(u.getScheme())) { Toast.makeText(MainActivity.this, "Fayl: " + u.getPath(), Toast.LENGTH_LONG).show(); return; }
                    Intent s = new Intent(Intent.ACTION_SEND); s.setType(recs.mimeOf(id)); s.putExtra(Intent.EXTRA_STREAM, u); s.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(s, "Yozuvni ulashish"));
                } catch (Throwable e) { Toast.makeText(MainActivity.this, "Ulashib bo‘lmadi", Toast.LENGTH_SHORT).show(); }
            });
        }
        @JavascriptInterface
        public String incomingList() {
            org.json.JSONArray a = new org.json.JSONArray();
            synchronized (incoming) {
                try { for (Object[] o : incoming) { org.json.JSONObject j = new org.json.JSONObject(); j.put("id", (Integer) o[0]); j.put("name", (String) o[1]); j.put("size", ((byte[]) o[2]).length); a.put(j); } } catch (Exception ignored) { }
            }
            return a.toString();
        }
        @JavascriptInterface
        public String incomingChunk(int id, int off, int len) {
            synchronized (incoming) {
                for (Object[] o : incoming) if ((Integer) o[0] == id) {
                    byte[] d = (byte[]) o[2]; if (off < 0 || off >= d.length) return "";
                    int n = Math.min(len, d.length - off); return Base64.encodeToString(d, off, n, Base64.NO_WRAP);
                }
            }
            return "";
        }
        @JavascriptInterface
        public void incomingDone(int id) { synchronized (incoming) { for (int i = 0; i < incoming.size(); i++) if ((Integer) incoming.get(i)[0] == id) { incoming.remove(i); break; } } }
        @JavascriptInterface public void openExternal(String u) { if (u != null && (u.startsWith("https://") || u.startsWith("http://"))) runOnUiThread(() -> openUrl(u)); }

        @JavascriptInterface
        public synchronized void saveFile(String name, String mime, String b64, boolean last) {
            try {
                if (saveBuf == null) saveBuf = new ByteArrayOutputStream();
                if (b64 != null && !b64.isEmpty()) saveBuf.write(Base64.decode(b64, Base64.DEFAULT));
                if (saveBuf.size() > (512 << 20)) { saveBuf = null; return; }
                if (!last) return;
                saveBytes = saveBuf.toByteArray(); saveBuf = null;
                final String title = name == null || name.isEmpty() ? "dars.fur" : name.replaceAll("[\\\\/:*?\"<>|]", "_");
                runOnUiThread(() -> {
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE); i.setType("application/octet-stream"); i.putExtra(Intent.EXTRA_TITLE, title);
                    try { startActivityForResult(i, REQ_SAVE); } catch (Exception e) { Toast.makeText(MainActivity.this, "Saqlash oynasi ochilmadi", Toast.LENGTH_LONG).show(); }
                });
            } catch (Exception e) { saveBuf = null; }
        }
    }
}
