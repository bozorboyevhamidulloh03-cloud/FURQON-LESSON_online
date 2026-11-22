package uz.fur.platform;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.WebResourceResponse;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Dars yozuvlari: telefonning "Movies/FURQON Recordings" papkasiga AVTOMATIK saqlanadi (ruxsat so'ralmaydi — Android 10+ da MediaStore,
 * eski Androidlarda ilovaning o'z "Movies" papkasi). Ilova faqat o'zi yaratgan yozuvlarni ko'radi va o'chira oladi.
 */
final class RecStore {
    static final String DIR = "FURQON Recordings";
    static final String REL = Environment.DIRECTORY_MOVIES + "/" + DIR;
    private final Context ctx;
    private final Map<String, Object[]> open = new HashMap<>(); // token -> {OutputStream, Uri|File}

    RecStore(Context c) { ctx = c; }

    private ContentResolver cr() { return ctx.getContentResolver(); }
    private File legacyDir() {
        File base = ctx.getExternalFilesDir(Environment.DIRECTORY_MOVIES);
        File d = new File(base, DIR); //noinspection ResultOfMethodCallIgnored
        d.mkdirs(); return d;
    }
    static String mimeFor(String name, String mime) {
        if (mime != null && mime.startsWith("video/")) return mime.contains(";") ? mime.substring(0, mime.indexOf(';')) : mime;
        return name.toLowerCase().endsWith(".mp4") ? "video/mp4" : "video/webm";
    }

    synchronized String begin(String name, String mime) {
        try {
            String m = mimeFor(name, mime), tok = UUID.randomUUID().toString();
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Video.Media.DISPLAY_NAME, name); cv.put(MediaStore.Video.Media.MIME_TYPE, m);
                cv.put(MediaStore.Video.Media.RELATIVE_PATH, REL); cv.put(MediaStore.Video.Media.IS_PENDING, 1);
                Uri u = cr().insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, cv); if (u == null) return "";
                OutputStream o = cr().openOutputStream(u, "w"); if (o == null) return "";
                open.put(tok, new Object[]{ o, u });
            } else {
                File f = new File(legacyDir(), name);
                open.put(tok, new Object[]{ new FileOutputStream(f), f });
            }
            return tok;
        } catch (Throwable e) { return ""; }
    }

    synchronized boolean chunk(String tok, String b64) {
        Object[] o = open.get(tok); if (o == null) return false;
        try { ((OutputStream) o[0]).write(Base64.decode(b64, Base64.DEFAULT)); return true; } catch (Throwable e) { return false; }
    }

    /** ok=true: yozuvni yakunlaydi va {"id","size"} qaytaradi; ok=false: yarim faylni o'chiradi. */
    synchronized String end(String tok, boolean ok) {
        Object[] o = open.remove(tok); if (o == null) return "";
        try { ((OutputStream) o[0]).flush(); ((OutputStream) o[0]).close(); } catch (Throwable ignored) { }
        try {
            if (o[1] instanceof Uri) {
                Uri u = (Uri) o[1];
                if (!ok) { cr().delete(u, null, null); return ""; }
                ContentValues cv = new ContentValues(); cv.put(MediaStore.Video.Media.IS_PENDING, 0); cr().update(u, cv, null, null);
                JSONObject j = new JSONObject(); j.put("id", u.toString()); j.put("size", sizeOf(u)); return j.toString();
            }
            File f = (File) o[1];
            if (!ok) { //noinspection ResultOfMethodCallIgnored
                f.delete(); return ""; }
            JSONObject j = new JSONObject(); j.put("id", "file://" + f.getAbsolutePath()); j.put("size", f.length()); return j.toString();
        } catch (Throwable e) { return ""; }
    }

    private long sizeOf(Uri u) {
        try (Cursor c = cr().query(u, new String[]{ MediaStore.Video.Media.SIZE }, null, null, null)) { if (c != null && c.moveToFirst()) return c.getLong(0); } catch (Throwable ignored) { }
        return 0;
    }

    synchronized String list() {
        JSONArray a = new JSONArray();
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                String[] pr = { MediaStore.Video.Media._ID, MediaStore.Video.Media.DISPLAY_NAME, MediaStore.Video.Media.SIZE, MediaStore.Video.Media.DATE_ADDED, MediaStore.Video.Media.MIME_TYPE };
                try (Cursor c = cr().query(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, pr, MediaStore.Video.Media.RELATIVE_PATH + " LIKE ? AND " + MediaStore.Video.Media.IS_PENDING + "=0", new String[]{ REL + "%" }, MediaStore.Video.Media.DATE_ADDED + " DESC")) {
                    while (c != null && c.moveToNext()) {
                        JSONObject j = new JSONObject();
                        j.put("id", ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, c.getLong(0)).toString()); j.put("name", c.getString(1));
                        j.put("size", c.getLong(2)); j.put("date", c.getLong(3) * 1000L); j.put("mime", c.getString(4)); a.put(j);
                    }
                }
            } else {
                File[] fs = legacyDir().listFiles();
                if (fs != null) for (File f : fs) { if (!f.isFile()) continue; JSONObject j = new JSONObject(); j.put("id", "file://" + f.getAbsolutePath()); j.put("name", f.getName()); j.put("size", f.length()); j.put("date", f.lastModified()); j.put("mime", mimeFor(f.getName(), null)); a.put(j); }
            }
        } catch (Throwable ignored) { }
        return a.toString();
    }

    /** Yozuvni telefondan butunlay o'chiradi. */
    synchronized boolean delete(String id) {
        try {
            if (!own(id)) return false;
            if (id.startsWith("file://")) return new File(Uri.parse(id).getPath()).delete();
            return cr().delete(Uri.parse(id), null, null) > 0;
        } catch (Throwable e) { return false; }
    }

    /** Faqat "FURQON Recordings" papkasidagi (o'zimiz yaratgan) fayllarga ruxsat — boshqa fayllarni o'qitib/o'chirib bo'lmaydi. */
    boolean own(String id) {
        try {
            Uri u = Uri.parse(id);
            if ("file".equals(u.getScheme())) { File f = new File(u.getPath()).getCanonicalFile(); return f.getPath().startsWith(legacyDir().getCanonicalPath() + File.separator); }
            if (!"content".equals(u.getScheme()) || !"media".equals(u.getAuthority()) || Build.VERSION.SDK_INT < 29) return false;
            try (Cursor c = cr().query(u, new String[]{ MediaStore.Video.Media.RELATIVE_PATH }, null, null, null)) {
                return c != null && c.moveToFirst() && c.getString(0) != null && c.getString(0).startsWith(REL);
            }
        } catch (Throwable e) { return false; }
    }

    String mimeOf(String id) {
        try { Uri u = Uri.parse(id); if ("file".equals(u.getScheme())) return mimeFor(u.getPath(), null); String t = cr().getType(u); return t != null ? t : "video/webm"; } catch (Throwable e) { return "video/webm"; }
    }

    /** Ilova ichidagi pleyer uchun: diapazonli (Range) javob — video oldinga-orqaga surilishi uchun kerak. */
    WebResourceResponse serve(String id, String range) {
        try {
            if (!own(id)) return resp(403, "Forbidden", "text/plain", null, new HashMap<>());
            Uri u = Uri.parse(id); long total; InputStream in;
            if ("file".equals(u.getScheme())) { File f = new File(u.getPath()); total = f.length(); in = new FileInputStream(f); }
            else { AssetFileDescriptor fd = cr().openAssetFileDescriptor(u, "r"); if (fd == null) return resp(404, "Not Found", "text/plain", null, new HashMap<>()); total = fd.getLength(); in = fd.createInputStream(); }
            long start = 0, end = total - 1; boolean part = false;
            if (range != null && range.startsWith("bytes=") && total > 0) {
                String[] p = range.substring(6).split(",")[0].trim().split("-", -1);
                try {
                    if (p[0].isEmpty()) { long n = Long.parseLong(p[1]); start = Math.max(0, total - n); }
                    else { start = Long.parseLong(p[0]); if (p.length > 1 && !p[1].isEmpty()) end = Math.min(end, Long.parseLong(p[1])); }
                    part = start <= end && start < total;
                } catch (Exception e) { part = false; start = 0; end = total - 1; }
            }
            if (part && start > 0) { long s = start; while (s > 0) { long k = in.skip(s); if (k <= 0) break; s -= k; } }
            Map<String, String> h = new HashMap<>(); h.put("Accept-Ranges", "bytes"); h.put("Cache-Control", "no-store");
            long len = part ? end - start + 1 : total;
            h.put("Content-Length", String.valueOf(len));
            if (part) h.put("Content-Range", "bytes " + start + "-" + end + "/" + total);
            return resp(part ? 206 : 200, part ? "Partial Content" : "OK", mimeOf(id), new Limited(in, len), h);
        } catch (Throwable e) { return resp(500, "Error", "text/plain", null, new HashMap<>()); }
    }

    private static WebResourceResponse resp(int code, String why, String mime, InputStream in, Map<String, String> h) {
        h.put("Access-Control-Allow-Origin", "*");
        return new WebResourceResponse(mime, null, code, why, h, in != null ? in : new java.io.ByteArrayInputStream(new byte[0]));
    }

    private static final class Limited extends FilterInputStream {
        private long left;
        Limited(InputStream in, long n) { super(in); left = n; }
        @Override public int read() throws IOException { if (left <= 0) return -1; int b = super.read(); if (b >= 0) left--; return b; }
        @Override public int read(byte[] b, int o, int l) throws IOException { if (left <= 0) return -1; int n = super.read(b, o, (int) Math.min(l, left)); if (n > 0) left -= n; return n; }
    }
}
