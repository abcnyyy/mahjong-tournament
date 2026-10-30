package com.mahjong.tournament;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.Charset;

public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setLoadWithOverviewMode(false);
        s.setUseWideViewPort(true);
        s.setTextZoom(100);
        web.setBackgroundColor(0xFFF5F6F8);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(this), "MTTBridge");
        web.setWebViewClient(new WebViewClient());
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    public static class Bridge {
        private final Context ctx;

        Bridge(Context c) { this.ctx = c; }

        private File dataFile() { return new File(ctx.getFilesDir(), "data.json"); }

        @JavascriptInterface
        public String load() {
            try {
                File f = dataFile();
                if (!f.exists()) return null;
                FileInputStream in = new FileInputStream(f);
                byte[] buf = new byte[(int) f.length()];
                int read = 0;
                while (read < buf.length) {
                    int n = in.read(buf, read, buf.length - read);
                    if (n <= 0) break;
                    read += n;
                }
                in.close();
                return new String(buf, 0, read, Charset.forName("UTF-8"));
            } catch (Exception e) {
                return null;
            }
        }

        @JavascriptInterface
        public boolean save(String json) {
            try {
                File f = dataFile();
                File tmp = new File(ctx.getFilesDir(), "data.json.tmp");
                writeText(tmp, json);
                if (f.exists()) {
                    try { copy(f, new File(ctx.getFilesDir(), "data.bak.json")); } catch (Exception ignore) {}
                }
                if (tmp.renameTo(f)) return true;
                writeText(f, json);
                tmp.delete();
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public String saveFile(String name, String base64) {
            try {
                byte[] bytes = Base64.decode(base64 == null ? "" : base64, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    v.put(MediaStore.Downloads.MIME_TYPE, mimeOf(name));
                    v.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri uri = ctx.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri != null) {
                        OutputStream os = ctx.getContentResolver().openOutputStream(uri);
                        if (os != null) {
                            os.write(bytes);
                            os.close();
                        }
                        v.clear();
                        v.put(MediaStore.Downloads.IS_PENDING, 0);
                        ctx.getContentResolver().update(uri, v, null, null);
                        toast("已保存到「下载」：" + name);
                        return "Downloads/" + name;
                    }
                }
                File dir = ctx.getExternalFilesDir(null);
                if (dir == null) dir = ctx.getFilesDir();
                File out = new File(dir, name);
                FileOutputStream fos = new FileOutputStream(out);
                fos.write(bytes);
                fos.close();
                toast("已保存：" + out.getAbsolutePath());
                return out.getAbsolutePath();
            } catch (Exception e) {
                toast("保存失败：" + e.getMessage());
                return null;
            }
        }

        private void toast(final String msg) {
            try {
                final Context app = ctx.getApplicationContext();
                ((Activity) ctx).runOnUiThread(new Runnable() {
                    public void run() { Toast.makeText(app, msg, Toast.LENGTH_LONG).show(); }
                });
            } catch (Exception ignore) {}
        }

        private static String mimeOf(String name) {
            String n = name.toLowerCase();
            if (n.endsWith(".json")) return "application/json";
            if (n.endsWith(".csv")) return "text/csv";
            if (n.endsWith(".html")) return "text/html";
            if (n.endsWith(".txt")) return "text/plain";
            return "application/octet-stream";
        }

        private static void writeText(File f, String s) throws Exception {
            FileOutputStream out = new FileOutputStream(f);
            out.write(s.getBytes("UTF-8"));
            out.flush();
            out.close();
        }

        private static void copy(File from, File to) throws Exception {
            InputStream in = new FileInputStream(from);
            OutputStream out = new FileOutputStream(to);
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            in.close();
            out.close();
        }
    }
}
