package uz.fur.platform;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.security.MessageDigest;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** Android'ga bog'liq bo'lmagan sof mantiq (kompyuterda ham sinaladi). */
public final class OtaCore {
    private OtaCore() { }

    public static String sha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[65536]; int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        }
        StringBuilder sb = new StringBuilder();
        for (byte b : md.digest()) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    /** Yo'l xavfsizmi: bo'sh emas, "..", teskari slesh, mutlaq yo'l yoki NUL yo'q. */
    public static boolean isSafeRel(String p) {
        if (p == null || p.isEmpty() || p.startsWith("/") || p.indexOf('\\') >= 0 || p.indexOf('\0') >= 0) return false;
        for (String s : p.split("/")) if (s.equals("..") || s.equals(".")) return false;
        return true;
    }

    public static boolean isHttps(String u) {
        try { URI x = new URI(u); return "https".equalsIgnoreCase(x.getScheme()) && x.getHost() != null; } catch (Exception e) { return false; }
    }

    /** latest.json manzili asosida nisbiy yoki mutlaq zip manzilini hal qiladi. */
    public static String resolve(String base, String rel) throws Exception {
        return new URI(base).resolve(new URI(rel.replace(" ", "%20"))).toString();
    }

    /** ZIP'ni dest ichiga ochadi: zip-slip, fayl soni va umumiy hajm cheklovlari bilan. */
    public static void unzip(InputStream in, File dest, long maxTotal, int maxEntries) throws IOException {
        if (!dest.mkdirs() && !dest.isDirectory()) throw new IOException("Papka ochilmadi");
        String root = dest.getCanonicalPath() + File.separator;
        long total = 0; int count = 0;
        try (ZipInputStream z = new ZipInputStream(in)) {
            ZipEntry e;
            while ((e = z.getNextEntry()) != null) {
                if (++count > maxEntries) throw new IOException("ZIP'da fayllar juda ko'p");
                String name = e.getName();
                if (!isSafeRel(name.endsWith("/") ? name.substring(0, name.length() - 1) : name)) throw new IOException("Xavfli yo'l: " + name);
                File out = new File(dest, name);
                if (!out.getCanonicalPath().startsWith(root)) throw new IOException("Xavfli yo'l: " + name);
                if (e.isDirectory()) { out.mkdirs(); continue; }
                File parent = out.getParentFile(); if (parent != null) parent.mkdirs();
                try (FileOutputStream fo = new FileOutputStream(out)) {
                    byte[] buf = new byte[65536]; int n;
                    while ((n = z.read(buf)) > 0) { total += n; if (total > maxTotal) throw new IOException("ZIP juda katta"); fo.write(buf, 0, n); }
                }
            }
        }
    }

    public static void deleteTree(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }

    public static String mime(String path) {
        String p = path.toLowerCase();
        int i = p.lastIndexOf('.'); String e = i < 0 ? "" : p.substring(i + 1);
        switch (e) {
            case "html": case "htm": return "text/html";
            case "js": case "mjs": return "text/javascript";
            case "css": return "text/css";
            case "json": case "map": return "application/json";
            case "webmanifest": return "application/manifest+json";
            case "svg": return "image/svg+xml";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "webp": return "image/webp";
            case "gif": return "image/gif";
            case "ico": return "image/x-icon";
            case "wasm": return "application/wasm";
            case "woff2": return "font/woff2";
            case "woff": return "font/woff";
            case "txt": return "text/plain";
            default: return "application/octet-stream";
        }
    }

    public static boolean isText(String mime) { return mime.startsWith("text/") || mime.contains("json") || mime.contains("javascript") || mime.contains("svg") || mime.contains("manifest"); }
}
