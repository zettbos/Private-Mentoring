package com.example.zettbosadmin

import android.Manifest
import android.accounts.AccountManager
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.ContactsContract
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.work.*
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

class MainActivity : ComponentActivity() {
  private var wakeLock: android.os.PowerManager.WakeLock? = null
  private var pendingInstallApkFile: File? = null
  private var activeWebViewRef: WebView? = null

  @Volatile
  private var isDownloadingApkUpdate: Boolean = false

  private val requestPermissionLauncher = registerForActivityResult(
    ActivityResultContracts.RequestPermission()
  ) { isGranted: Boolean ->
    if (isGranted) {
      setupBackgroundNotifications()
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    createAppNotificationChannels()
    checkAndRequestNotificationPermission()
    setContent {
      var isLoading by remember { mutableStateOf(true) }
      var splashClosing by remember { mutableStateOf(false) }
      var loadProgress by remember { mutableStateOf(0.14f) }
      var loadingSubtitle by remember { mutableStateOf("接続中 • Sinkronisasi Data Realtime...") }
      val launchStartMs = remember { System.currentTimeMillis() }
      val mainScope = rememberCoroutineScope()
      var webViewInstance by remember { mutableStateOf<WebView?>(null) }

      fun finishSingleSplash() {
        if (splashClosing || !isLoading) return
        splashClosing = true
        mainScope.launch {
          val elapsed = System.currentTimeMillis() - launchStartMs
          val minSplashMs = 1550L
          if (elapsed < minSplashMs) {
            kotlinx.coroutines.delay(minSplashMs - elapsed)
          }
          loadProgress = 1.0f
          kotlinx.coroutines.delay(240)
          isLoading = false
        }
      }

      val animatedProgress by animateFloatAsState(
        targetValue = loadProgress,
        animationSpec = tween(durationMillis = 300, easing = FastOutSlowInEasing),
        label = "loadProgress"
      )

      // Satu-satunya loading screen di APK: animasi progres bertahap 0% -> 100% + auto-check OTA di background
      LaunchedEffect(Unit) {
        val steps = listOf(0.28f, 0.48f, 0.68f, 0.82f, 0.90f)
        for (target in steps) {
          kotlinx.coroutines.delay(300)
          if (!isLoading || splashClosing) break
          if (loadProgress < target) loadProgress = target
        }
        kotlinx.coroutines.delay(1200)
        // Auto-Check OTA & Self-Update di latar belakang setelah aplikasi terbuka
        dispatchOtaCheckAndNotifyJs(manual = false)
        kotlinx.coroutines.delay(1300)
        finishSingleSplash()
      }

      // Handle Android Back Button to navigate inside WebView history
      BackHandler(enabled = true) {
        if (webViewInstance?.canGoBack() == true) {
          webViewInstance?.goBack()
        } else {
          finish()
        }
      }

      // Infinite heartbeat pulsing scale animation for logo
      val infiniteTransition = rememberInfiniteTransition(label = "pulse")
      val logoScale by infiniteTransition.animateFloat(
        initialValue = 0.92f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(
          animation = tween(durationMillis = 1000, easing = FastOutSlowInEasing),
          repeatMode = RepeatMode.Reverse
        ),
        label = "scale"
      )

      Box(modifier = Modifier.fillMaxSize().background(Color(0xFF0C0C0E))) {
        // Full screen WebView container with safe status bar & navigation bar padding
        AndroidView(
          modifier = Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding(),
          factory = { context ->
            WebView(context).apply {
              layoutParams = android.view.ViewGroup.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT
              )
              webViewInstance = this
              activeWebViewRef = this

              webChromeClient = object : android.webkit.WebChromeClient() {
                override fun onConsoleMessage(consoleMessage: android.webkit.ConsoleMessage?): Boolean {
                  android.util.Log.d("ZettbosJS", "${consoleMessage?.message()} -- line: ${consoleMessage?.lineNumber()} (${consoleMessage?.sourceId()})")
                  return true
                }
              }

              webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                  view: WebView?,
                  request: WebResourceRequest?
                ): WebResourceResponse? {
                  val reqUrl = request?.url?.toString() ?: ""
                  val otaResponse = OtaUpdateHelper.interceptAssetIndexIfOtaActive(context, reqUrl)
                  if (otaResponse != null) return otaResponse
                  return super.shouldInterceptRequest(view, request)
                }

                override fun onReceivedSslError(
                  view: WebView?,
                  handler: android.webkit.SslErrorHandler?,
                  error: android.net.http.SslError?
                ) {
                  handler?.proceed()
                }

                @Deprecated("Deprecated in Java")
                override fun onReceivedError(view: WebView?, errorCode: Int, description: String?, failingUrl: String?) {
                  super.onReceivedError(view, errorCode, description, failingUrl)
                  android.util.Log.w("ZettbosWebView", "Resource warning [$errorCode]: $description on $failingUrl")
                  if (failingUrl?.startsWith(AppConfig.LIVE_WEB_URL) == true) {
                    android.util.Log.i("ZettbosWebView", "Offline detected! Switching to local/OTA bundle fallback...")
                    view?.let { OtaUpdateHelper.loadBestBundleIntoWebView(it, context) }
                  }
                }

                override fun onReceivedError(
                  view: WebView?,
                  request: WebResourceRequest?,
                  error: android.webkit.WebResourceError?
                ) {
                  super.onReceivedError(view, request, error)
                  val reqUrl = request?.url?.toString() ?: ""
                  android.util.Log.w("ZettbosWebView", "Resource warning on $reqUrl: ${error?.description}")
                  if (request?.isForMainFrame == true && reqUrl.startsWith(AppConfig.LIVE_WEB_URL)) {
                    android.util.Log.i("ZettbosWebView", "Offline main frame detected! Switching to local/OTA bundle fallback...")
                    view?.let { OtaUpdateHelper.loadBestBundleIntoWebView(it, context) }
                  }
                }

                @Deprecated("Deprecated in Java")
                override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                  if (url != null) {
                    return handleExternalUrl(context, url)
                  }
                  return false
                }

                override fun shouldOverrideUrlLoading(
                  view: WebView?,
                  request: WebResourceRequest?
                ): Boolean {
                  val url = request?.url?.toString()
                  if (url != null) {
                    return handleExternalUrl(context, url)
                  }
                  return false
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                  super.onPageFinished(view, url)
                  // Inject JavaScript to maximize Google's sandboxed iframe if loading online
                  view?.evaluateJavascript(
                    "(function() { " +
                    "  var sandboxIframe = document.querySelector('iframe.sandbox') || document.querySelector('iframe'); " +
                    "  if (sandboxIframe) { " +
                    "    sandboxIframe.style.position = 'fixed'; " +
                    "    sandboxIframe.style.top = '0'; " +
                    "    sandboxIframe.style.left = '0'; " +
                    "    sandboxIframe.style.width = '100%'; " +
                    "    sandboxIframe.style.height = '100%'; " +
                    "    sandboxIframe.style.border = 'none'; " +
                    "    sandboxIframe.style.zIndex = '999999'; " +
                    "  } " +
                    "  var topBar = document.querySelector('.apps-header') || document.querySelector('.docs-butterbar-container'); " +
                    "  if (topBar) topBar.style.display = 'none'; " +
                    "})();",
                    null
                  )
                }
              }

              // Solid dark background prevents Android Compose GPU surface black blank bug
              setBackgroundColor(android.graphics.Color.parseColor("#0C0C0E"))

              // Enable local asset file URL loading & DOM storage compatibility
              settings.allowFileAccess = true
              settings.allowContentAccess = true
              @Suppress("DEPRECATION")
              settings.allowFileAccessFromFileURLs = true
              @Suppress("DEPRECATION")
              settings.allowUniversalAccessFromFileURLs = true

              settings.javaScriptEnabled = true
              settings.domStorageEnabled = true
              settings.useWideViewPort = false
              settings.loadWithOverviewMode = false
              settings.databaseEnabled = true
              settings.cacheMode = WebSettings.LOAD_DEFAULT

              // Allow mixed content mode and iframe redirections
              settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW

              // Enable cookies and third-party cookies (Required for Google Apps Script session validation)
              val cookieManager = CookieManager.getInstance()
              cookieManager.setAcceptCookie(true)
              cookieManager.setAcceptThirdPartyCookies(this, true)

              // Hardware acceleration is handled automatically by Compose Activity window
              setLayerType(android.view.View.LAYER_TYPE_NONE, null)

              // Set Chrome Mobile user-agent to bypass Google Apps Script blocking/rendering blank WebView
              settings.userAgentString = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                settings.offscreenPreRaster = true
              }

              // Register JavaBridge interface to receive callbacks, OTA self-updater, background execution & notifications
              addJavascriptInterface(object {
                @JavascriptInterface
                fun pageLoaded() {
                  runOnUiThread {
                    finishSingleSplash()
                  }
                }

                @JavascriptInterface
                fun updateLoadingStatus(statusText: String) {
                  runOnUiThread {
                    if (isLoading && !splashClosing && statusText.isNotBlank()) {
                      loadingSubtitle = statusText
                    }
                  }
                }

                @JavascriptInterface
                fun getActiveOtaStatusJson(): String {
                  return OtaUpdateHelper.getStatusJson(this@MainActivity)
                }

                @JavascriptInterface
                fun checkOtaUpdate(manual: Boolean) {
                  dispatchOtaCheckAndNotifyJs(manual)
                }

                @JavascriptInterface
                fun applyReadyOtaUpdate() {
                  runOnUiThread {
                    activeWebViewRef?.let { wv ->
                      OtaUpdateHelper.loadBestBundleIntoWebView(wv, this@MainActivity)
                    }
                  }
                }

                @JavascriptInterface
                fun reloadActiveApp() {
                  runOnUiThread {
                    activeWebViewRef?.let { wv ->
                      OtaUpdateHelper.loadBestBundleIntoWebView(wv, this@MainActivity)
                    }
                  }
                }

                @JavascriptInterface
                fun resetOtaToFactory() {
                  runOnUiThread {
                    OtaUpdateHelper.resetToFactoryAsset(this@MainActivity)
                    activeWebViewRef?.loadUrl(AppConfig.LOCAL_ASSET_URL)
                  }
                }

                @JavascriptInterface
                fun downloadAndInstallApkUpdate(apkUrl: String) {
                  if (isDownloadingApkUpdate) return
                  isDownloadingApkUpdate = true
                  val targetUrl = apkUrl.ifBlank { "${AppConfig.OTA_BUCKET_PUBLIC_BASE}/ZettbosAdmin-Latest.apk" }
                  CoroutineScope(Dispatchers.IO).launch {
                    try {
                      val dlResult = OtaUpdateHelper.downloadApkUpdate(this@MainActivity, targetUrl) { pct ->
                        runOnUiThread {
                          activeWebViewRef?.evaluateJavascript(
                            "if (typeof window.onNativeApkDownloadProgress === 'function') { window.onNativeApkDownloadProgress($pct); }",
                            null
                          )
                        }
                      }
                      dlResult.onSuccess { apkFile ->
                        runOnUiThread {
                          val status = OtaUpdateHelper.installDownloadedApk(this@MainActivity, apkFile)
                          when (status) {
                            OtaUpdateHelper.InstallLaunchStatus.LAUNCHED -> {
                              activeWebViewRef?.evaluateJavascript(
                                "if (typeof window.onNativeApkInstallState === 'function') { window.onNativeApkInstallState('launched', 'Membuka pemasang update Android...'); }",
                                null
                              )
                            }
                            OtaUpdateHelper.InstallLaunchStatus.NEEDS_UNKNOWN_SOURCES_PERMISSION -> {
                              pendingInstallApkFile = apkFile
                              activeWebViewRef?.evaluateJavascript(
                                "if (typeof window.onNativeApkInstallState === 'function') { window.onNativeApkInstallState('permission_needed', 'Aktifkan izin \"Izinkan dari sumber ini\" sekali saja, lalu kembali ke aplikasi untuk otomatis menginstal.'); }",
                                null
                              )
                            }
                            OtaUpdateHelper.InstallLaunchStatus.FAILED -> {
                              activeWebViewRef?.evaluateJavascript(
                                "if (typeof window.onNativeApkInstallState === 'function') { window.onNativeApkInstallState('error', 'Gagal membuka installer APK Android.'); }",
                                null
                              )
                            }
                          }
                        }
                      }.onFailure { err ->
                        val qErr = JSONObject.quote(err.message ?: "Gagal mengunduh file APK.")
                        runOnUiThread {
                          activeWebViewRef?.evaluateJavascript(
                            "if (typeof window.onNativeApkInstallState === 'function') { window.onNativeApkInstallState('error', $qErr); }",
                            null
                          )
                        }
                      }
                    } finally {
                      isDownloadingApkUpdate = false
                    }
                  }
                }

                @JavascriptInterface
                fun sendTestPushNotification() {
                  CoroutineScope(Dispatchers.IO).launch {
                    val (ok, msg) = FcmPushHelper.sendEndToEndTestPush(this@MainActivity)
                    runOnUiThread {
                      val quotedMsg = JSONObject.quote(msg)
                      webViewInstance?.evaluateJavascript(
                        "if (typeof window.onAndroidPushTestResult === 'function') { window.onAndroidPushTestResult($ok, $quotedMsg); }",
                        null
                      )
                    }
                  }
                }

                @JavascriptInterface
                fun openExternalBrowser(url: String) {
                  handleExternalUrl(context, url)
                }

                @JavascriptInterface
                fun startBackgroundExecution(taskName: String) {
                  runOnUiThread {
                    try {
                      val powerManager = getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
                      if (wakeLock == null) {
                        wakeLock = powerManager?.newWakeLock(
                          android.os.PowerManager.PARTIAL_WAKE_LOCK,
                          "ZettbosAdmin::BulkingTaskWakeLock"
                        )
                      }
                      wakeLock?.let {
                        if (!it.isHeld) {
                          it.acquire(45 * 60 * 1000L) // 45 menit max safe timeout
                        }
                      }
                    } catch (e: Exception) {
                      e.printStackTrace()
                    }
                  }
                }

                @JavascriptInterface
                fun stopBackgroundExecution() {
                  runOnUiThread {
                    try {
                      wakeLock?.let {
                        if (it.isHeld) it.release()
                      }
                    } catch (e: Exception) {
                      e.printStackTrace()
                    }
                  }
                }

                @JavascriptInterface
                fun showLocalNotification(title: String, message: String) {
                  runOnUiThread {
                    FcmPushHelper.showHighPriorityNotification(
                      context = this@MainActivity,
                      title = title,
                      body = message,
                      channelId = AppConfig.CHANNEL_BULK_STATUS,
                      notificationId = 3001
                    )
                  }
                }

                @JavascriptInterface
                fun forceSyncContacts(): String {
                  return try {
                    val bundle = Bundle().apply {
                      putBoolean(ContentResolver.SYNC_EXTRAS_MANUAL, true)
                      putBoolean(ContentResolver.SYNC_EXTRAS_EXPEDITED, true)
                    }

                    // 1. Trigger universal Contacts sync
                    ContentResolver.requestSync(null, ContactsContract.AUTHORITY, bundle)

                    // 2. Scan and trigger expedited sync on all Google and WhatsApp accounts
                    try {
                      val accountManager = AccountManager.get(this@MainActivity)
                      val accounts = accountManager.accounts
                      for (account in accounts) {
                        if (account.type.equals("com.google", ignoreCase = true) ||
                            account.type.contains("whatsapp", ignoreCase = true)) {
                          ContentResolver.requestSync(account, ContactsContract.AUTHORITY, bundle)
                        }
                      }
                    } catch (eAcc: Exception) {
                      eAcc.printStackTrace()
                    }

                    "SUCCESS"
                  } catch (e: Exception) {
                    "ERROR: " + (e.message ?: e.toString())
                  }
                }

                @JavascriptInterface
                fun openWhatsAppBusiness() {
                  runOnUiThread {
                    try {
                      val pm = packageManager
                      val intent = pm.getLaunchIntentForPackage("com.whatsapp.w4b")
                        ?: pm.getLaunchIntentForPackage("com.whatsapp")
                      if (intent != null) {
                        startActivity(intent)
                      } else {
                        val webIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://api.whatsapp.com"))
                        startActivity(webIntent)
                      }
                    } catch (e: Exception) {
                      e.printStackTrace()
                    }
                  }
                }

                @JavascriptInterface
                fun openDeviceSyncSettings() {
                  runOnUiThread {
                    try {
                      val intent = Intent(android.provider.Settings.ACTION_SYNC_SETTINGS)
                      intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                      startActivity(intent)
                    } catch (e: Exception) {
                      try {
                        val fallback = Intent(android.provider.Settings.ACTION_SETTINGS)
                        startActivity(fallback)
                      } catch (e2: Exception) {}
                    }
                  }
                }
              }, "Android")

              // Instant Offline-First + Live OTA Launch: Memuat bundle OTA terbaru (<5ms) atau aset bawaan APK
              OtaUpdateHelper.loadBestBundleIntoWebView(this, context)
            }
          }
        )
        
        // Splash Loading Screen Overlay
        AnimatedVisibility(
          visible = isLoading,
          exit = fadeOut(animationSpec = tween(durationMillis = 380))
        ) {
          Box(
            modifier = Modifier
              .fillMaxSize()
              .background(
                brush = Brush.radialGradient(
                  colors = listOf(Color(0xFF242424), Color(0xFF0C0C0E))
                )
              ),
            contentAlignment = Alignment.Center
          ) {
            Column(
              horizontalAlignment = Alignment.CenterHorizontally,
              verticalArrangement = Arrangement.Center
            ) {
              // Spinner ring and Pulsing Red Hinomaru Sun Logo
              Box(
                modifier = Modifier.size(160.dp),
                contentAlignment = Alignment.Center
              ) {
                CircularProgressIndicator(
                  modifier = Modifier.size(160.dp),
                  color = Color(0xFFE62232),
                  strokeWidth = 2.dp
                )
                
                Box(
                  modifier = Modifier
                    .size(140.dp)
                    .scale(logoScale)
                    .background(
                      brush = Brush.radialGradient(
                        colors = listOf(Color(0xFFE62232), Color(0xFFBC002D))
                      ),
                      shape = CircleShape
                    ),
                  contentAlignment = Alignment.Center
                ) {
                  Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                  ) {
                    Text(text = "個", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Black)
                    Text(text = "別", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Black)
                    Text(text = "指", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Black)
                    Text(text = "導", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Black)
                  }
                }
              }
              Spacer(modifier = Modifier.height(28.dp))
              Text(
                text = "個別指導 (Private Mentoring)",
                color = Color.White,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 3.sp
              )
              Spacer(modifier = Modifier.height(8.dp))
              Text(
                text = loadingSubtitle,
                color = Color(0xFF94A3B8),
                fontSize = 11.sp,
                letterSpacing = 1.sp
              )
              Spacer(modifier = Modifier.height(18.dp))
              Box(
                modifier = Modifier
                  .width(220.dp)
                  .height(6.dp)
                  .clip(RoundedCornerShape(999.dp))
                  .background(Color(0x1FFFFFFF))
              ) {
                Box(
                  modifier = Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(animatedProgress.coerceIn(0.05f, 1.0f))
                    .clip(RoundedCornerShape(999.dp))
                    .background(
                      brush = Brush.horizontalGradient(
                        colors = listOf(Color(0xFFE62232), Color(0xFFFF4D5A), Color(0xFFFF8088))
                      )
                    )
                )
              }
            }
          }
        }
      }
    }
  }

  override fun onResume() {
    super.onResume()
    val pendingApk = pendingInstallApkFile
    if (pendingApk != null && pendingApk.exists()) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || packageManager.canRequestPackageInstalls()) {
        pendingInstallApkFile = null
        OtaUpdateHelper.installDownloadedApk(this, pendingApk)
      }
    }
  }

  private fun dispatchOtaCheckAndNotifyJs(manual: Boolean) {
    CoroutineScope(Dispatchers.IO).launch {
      val outcome = OtaUpdateHelper.checkAndSyncOta(this@MainActivity)
      val payload = JSONObject().put("manual", manual)
      when (outcome) {
        is OtaUpdateHelper.OtaOutcome.UpToDate -> {
          payload.put("type", "up_to_date")
          payload.put("currentVersion", outcome.currentVersion)
          payload.put("isUsingOta", outcome.isUsingOta)
        }
        is OtaUpdateHelper.OtaOutcome.WebOtaReady -> {
          payload.put("type", "web_ota_ready")
          payload.put("currentVersion", outcome.currentVersion)
          payload.put("newVersion", outcome.newVersion)
          payload.put("releaseNotes", outcome.releaseNotes)
          payload.put("forceUpdate", outcome.forceUpdate)
        }
        is OtaUpdateHelper.OtaOutcome.NativeApkAvailable -> {
          payload.put("type", "native_apk_available")
          payload.put("currentVersion", outcome.currentVersion)
          payload.put("newVersion", outcome.newVersionName)
          payload.put("nativeVersionCode", outcome.newVersionCode)
          payload.put("apkUrl", outcome.apkUrl)
          payload.put("releaseNotes", outcome.releaseNotes)
          payload.put("forceUpdate", outcome.forceUpdate)
        }
        is OtaUpdateHelper.OtaOutcome.Error -> {
          payload.put("type", "error")
          payload.put("message", outcome.message)
          payload.put("currentVersion", OtaUpdateHelper.getActiveWebVersion(this@MainActivity))
        }
      }
      val jsonStr = payload.toString()
      runOnUiThread {
        activeWebViewRef?.evaluateJavascript(
          "if (typeof window.onNativeOtaStatusPayload === 'function') { window.onNativeOtaStatusPayload($jsonStr); }",
          null
        )
      }
    }
  }

  private fun handleExternalUrl(context: Context, url: String): Boolean {
    if (url.startsWith("whatsapp://") || url.contains("wa.me") || url.contains("api.whatsapp.com") || url.startsWith("intent://")) {
      // 1. Coba buka via WhatsApp Business (Prioritas Utama Admin)
      try {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        intent.setPackage("com.whatsapp.w4b")
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        return true
      } catch (eW4b: Exception) {
        // 2. Coba buka via WhatsApp Standard jika WA Business tidak tersedia
        try {
          val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
          if (url.startsWith("whatsapp://")) {
            intent.setPackage("com.whatsapp")
          }
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(intent)
          return true
        } catch (eWa: Exception) {
          // 3. Fallback ke Web WhatsApp Browser jika aplikasi tidak terinstall
          val webFallback = if (url.startsWith("whatsapp://send?")) {
            url.replace("whatsapp://send?", "https://api.whatsapp.com/send?")
          } else {
            url
          }
          try {
            val fallbackIntent = Intent(Intent.ACTION_VIEW, Uri.parse(webFallback))
            fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(fallbackIntent)
            return true
          } catch (e2: Exception) {
            e2.printStackTrace()
          }
        }
      }
    }

    // Whitelist internal app URLs: tetap berjalan di dalam WebView (bukan di browser luar!)
    val isInternalAppUrl = url.contains("ourstory-udel.github.io") ||
                           url.contains("script.google.com") ||
                           url.contains("script.googleusercontent.com") ||
                           url.contains("supabase.co") ||
                           url.startsWith("file://")
    if (isInternalAppUrl) {
      return false
    }

    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("tel:") || url.startsWith("mailto:")) {
      try {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        return true
      } catch (e: Exception) {
        e.printStackTrace()
      }
    }
    return false
  }

  private fun createAppNotificationChannels() {
    FcmPushHelper.ensureNotificationChannels(this)
  }

  private fun checkAndRequestNotificationPermission() {
    setupBackgroundNotifications()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      if (ContextCompat.checkSelfPermission(
          this,
          Manifest.permission.POST_NOTIFICATIONS
        ) != PackageManager.PERMISSION_GRANTED
      ) {
        requestPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
      }
    }
  }

  private fun setupBackgroundNotifications() {
    // 0. Subscribe to Firebase topic and register FCM token (supports multiple admin devices)
    try {
      com.google.firebase.messaging.FirebaseMessaging.getInstance().subscribeToTopic("admin_notif")
      com.google.firebase.messaging.FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
        if (task.isSuccessful) {
          val token = task.result
          if (!token.isNullOrEmpty()) {
            kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
              FcmPushHelper.syncFcmTokenWithCloud(token)
            }
          }
        }
      }
    } catch (e: Exception) {
      e.printStackTrace()
    }

    // Stop ongoing polling foreground service (Replaced completely by Firebase Cloud Messaging HTTP v1 push notifications)
    try {
      val serviceIntent = Intent(this, NotificationService::class.java)
      stopService(serviceIntent)
      val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as? android.app.NotificationManager
      notificationManager?.cancel(AppConfig.NOTIF_ID_BG_SERVICE)
    } catch (e: Exception) {
      e.printStackTrace()
    }

    // 1. Immediate check as soon as app opens
    val immediateRequest = OneTimeWorkRequestBuilder<NotificationWorker>().build()
    WorkManager.getInstance(this).enqueue(immediateRequest)

    // 2. Periodic background check every 15 minutes
    val workRequest = PeriodicWorkRequestBuilder<NotificationWorker>(
      15, TimeUnit.MINUTES
    )
      .setConstraints(
        Constraints.Builder()
          .setRequiredNetworkType(NetworkType.CONNECTED)
          .build()
      )
      .build()

    WorkManager.getInstance(this).enqueueUniquePeriodicWork(
      "ZettbosNotificationWork",
      ExistingPeriodicWorkPolicy.UPDATE,
      workRequest
    )
  }

  override fun onDestroy() {
    super.onDestroy()
    try {
      wakeLock?.let {
        if (it.isHeld) it.release()
      }
    } catch (e: Exception) {
      e.printStackTrace()
    }
  }
}
