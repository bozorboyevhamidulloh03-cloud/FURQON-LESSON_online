package uz.fur.platform;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
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
        web.addJavascriptInterface(new Bridge(), "FurNative");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.loadUrl("https://" + HOST + "/index.html");
        up.autoCheck();
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
        public void onPageFinished(WebView v, String url) { up.onPageLoaded(); }
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
        public void onPermissionRequest(PermissionRequest r) { r.deny(); }
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
