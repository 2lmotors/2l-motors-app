package com.motors2l.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    private static final int PERMISSION_REQ_CODE = 1001;
    private static final String PREFS_NAME = "Motors2LPrefs";
    private static final String KEY_SERVER_URL = "server_url";
    public static final String DEFAULT_SERVER_URL = "https://192.168.1.51:3443";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        checkAndRequestPermissions();
    }

    @Override
    protected void load() {
        super.load();
        configureWebView();
    }

    private void checkAndRequestPermissions() {
        String[] requiredPermissions = new String[] {
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.MODIFY_AUDIO_SETTINGS,
                Manifest.permission.VIBRATE
        };

        List<String> toRequest = new ArrayList<>();
        for (String perm : requiredPermissions) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                toRequest.add(perm);
            }
        }

        if (!toRequest.isEmpty()) {
            ActivityCompat.requestPermissions(this, toRequest.toArray(new String[0]), PERMISSION_REQ_CODE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
            @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQ_CODE) {
            boolean allGranted = true;
            for (int res : grantResults) {
                if (res != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    break;
                }
            }
            if (!allGranted) {
                Toast.makeText(this, "Pour les appels vidéo en direct, activez les autorisations caméra et micro.",
                        Toast.LENGTH_SHORT).show();
            }
        }
    }

    @SuppressLint({ "SetJavaScriptEnabled", "JavascriptInterface" })
    private void configureWebView() {
        if (this.bridge == null || this.bridge.getWebView() == null) {
            return;
        }

        final WebView webView = this.bridge.getWebView();
        WebSettings settings = webView.getSettings();

        // Optimisations WebView pour WebRTC et PWA
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        // BridgeWebChromeClient avec acceptation automatique des permissions WebRTC
        webView.setWebChromeClient(new BridgeWebChromeClient(this.bridge) {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    try {
                        request.grant(request.getResources());
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                });
            }
        });

        // BridgeWebViewClient avec gestion SSL pour certificats auto-signés
        this.bridge.setWebViewClient(new BridgeWebViewClient(this.bridge) {
            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                // Accepte le certificat HTTPS auto-signé du serveur local
                handler.proceed();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request != null && request.isForMainFrame()) {
                    showFallbackConnectionPage(view, request.getUrl().toString());
                }
            }
        });

        // Interface JavaScript pour persister et basculer l'URL du serveur
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void saveServerUrl(String newUrl) {
                if (newUrl != null && !newUrl.trim().isEmpty()) {
                    SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                    prefs.edit().putString(KEY_SERVER_URL, newUrl.trim()).apply();
                }
            }

            @JavascriptInterface
            public void showConfig() {
                runOnUiThread(() -> showFallbackConnectionPage(webView, webView.getUrl()));
            }
        }, "Motors2LNative");

        // Charger l'URL configurée (persistance utilisateur ou valeur par défaut)
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String targetUrl = prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL);
        if (targetUrl != null && !targetUrl.isEmpty()) {
            webView.loadUrl(targetUrl);
        }
    }

    private void showFallbackConnectionPage(WebView view, String failedUrl) {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String currentUrl = prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL);

        String html = "<!DOCTYPE html><html><head><meta charset='utf-8'>"
                + "<meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'>"
                + "<title>MOTORS 2L - Connexion</title>"
                + "<style>"
                + "body{background:#0d1117;color:#c9d1d9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:95vh;box-sizing:border-box;text-align:center;}"
                + ".card{background:#161b22;border:1px solid #30363d;border-radius:16px;padding:24px 20px;max-width:380px;width:100%;box-shadow:0 8px 30px rgba(0,0,0,0.6);}"
                + ".logo-badge{display:inline-block;padding:6px 14px;border-radius:20px;background:rgba(245,158,11,0.15);color:#f59e0b;font-weight:bold;font-size:14px;margin-bottom:12px;letter-spacing:1px;}"
                + "h2{color:#f59e0b;margin:0 0 10px;font-size:22px;letter-spacing:0.5px;}"
                + "p{color:#8b949e;font-size:13px;line-height:1.5;margin:0 0 18px;}"
                + "input{width:100%;box-sizing:border-box;padding:14px;border-radius:10px;border:1px solid #30363d;background:#0d1117;color:#fff;font-size:15px;margin-bottom:12px;outline:none;text-align:center;}"
                + "input:focus{border-color:#f59e0b;}"
                + ".btn{width:100%;padding:13px;border-radius:10px;border:none;font-size:15px;font-weight:bold;cursor:pointer;margin-bottom:10px;transition:0.15s;}"
                + ".btn-primary{background:linear-gradient(135deg, #f59e0b, #d97706);color:#000;box-shadow:0 4px 14px rgba(245,158,11,0.3);}"
                + ".btn-secondary{background:#21262d;color:#c9d1d9;border:1px solid #30363d;}"
                + ".btn:active{transform:scale(0.98);opacity:0.9;}"
                + ".btn-row{display:flex;gap:8px;margin-bottom:10px;}"
                + ".btn-row .btn{flex:1;margin-bottom:0;font-size:13px;padding:10px;}"
                + ".hint{font-size:11px;color:#6e7681;margin-top:14px;line-height:1.4;}"
                + "</style></head><body>"
                + "<div class='card'>"
                + "<div class='logo-badge'>GARAGE 2L MOTORS</div>"
                + "<h2>Connexion Serveur</h2>"
                + "<p>Impossible de contacter le serveur distant.<br>Vérifiez votre connexion Wi-Fi ou ajustez l'adresse du serveur :</p>"
                + "<input id='urlInput' type='text' value='" + currentUrl
                + "' placeholder='https://192.168.1.51:3443' />"
                + "<button class='btn btn-primary' onclick='connectWithUrl()'>🚀 Se Connecter</button>"
                + "<div class='btn-row'>"
                + "<button class='btn btn-secondary' onclick='setAndConnect(\"https://192.168.1.51:3443\")'>HTTPS (3443)</button>"
                + "<button class='btn btn-secondary' onclick='setAndConnect(\"http://192.168.1.51:3000\")'>HTTP (3000)</button>"
                + "</div>"
                + "<div class='hint'>Pour le Wi-Fi de l'atelier, conservez le port sécurisé 3443 pour les appels vidéo en direct.</div>"
                + "</div>"
                + "<script>"
                + "function connectWithUrl(){"
                + "  var url = document.getElementById('urlInput').value.trim();"
                + "  if(url){"
                + "    if(!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;"
                + "    try{ if(window.Motors2LNative && window.Motors2LNative.saveServerUrl){ window.Motors2LNative.saveServerUrl(url); } }catch(e){}"
                + "    window.location.href = url;"
                + "  }"
                + "}"
                + "function setAndConnect(url){"
                + "  document.getElementById('urlInput').value = url;"
                + "  connectWithUrl();"
                + "}"
                + "</script></body></html>";

        view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    @Override
    public void onBackPressed() {
        if (this.bridge != null && this.bridge.getWebView() != null && this.bridge.getWebView().canGoBack()) {
            this.bridge.getWebView().goBack();
        } else {
            super.onBackPressed();
        }
    }
}
