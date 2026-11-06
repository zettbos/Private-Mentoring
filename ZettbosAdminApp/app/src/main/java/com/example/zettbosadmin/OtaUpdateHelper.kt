package com.example.zettbosadmin

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedReader
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

object OtaUpdateHelper {
    private const val TAG = "ZettbosOTA"

    sealed class OtaOutcome {
        data class UpToDate(
            val currentVersion: String,
            val isUsingOta: Boolean
        ) : OtaOutcome()

        data class WebOtaReady(
            val currentVersion: String,
            val newVersion: String,
            val releaseNotes: String,
            val forceUpdate: Boolean
        ) : OtaOutcome()

        data class NativeApkAvailable(
            val currentVersion: String,
            val newVersionName: String,
            val newVersionCode: Int,
            val apkUrl: String,
            val releaseNotes: String,
            val forceUpdate: Boolean
        ) : OtaOutcome()

        data class Error(val message: String) : OtaOutcome()
    }

    enum class InstallLaunchStatus {
        LAUNCHED,
        NEEDS_UNKNOWN_SOURCES_PERMISSION,
        FAILED
    }

    fun compareVersions(v1: String?, v2: String?): Int {
        if (v1.isNullOrBlank() || v2.isNullOrBlank()) return 0
        val p1 = v1.trim().removePrefix("v").removePrefix("V")
            .split(".")
            .map { it.filter { ch -> ch.isDigit() }.toIntOrNull() ?: 0 }
        val p2 = v2.trim().removePrefix("v").removePrefix("V")
            .split(".")
            .map { it.filter { ch -> ch.isDigit() }.toIntOrNull() ?: 0 }
        val maxLen = maxOf(p1.size, p2.size)
        for (i in 0 until maxLen) {
            val a = p1.getOrElse(i) { 0 }
            val b = p2.getOrElse(i) { 0 }
            if (a > b) return 1
            if (a < b) return -1
        }
        return 0
    }

    private fun getOtaDir(context: Context): File {
        return File(context.filesDir, "ota").apply {
            if (!exists()) mkdirs()
        }
    }

    fun getActiveOtaFile(context: Context): File? {
        return try {
            val prefs = context.getSharedPreferences(AppConfig.PREFS_NAME, Context.MODE_PRIVATE)
            val otaVer = prefs.getString(AppConfig.KEY_OTA_WEB_VERSION, "") ?: ""
            val otaFile = File(getOtaDir(context), "index.html")
            if (otaVer.isNotBlank() &&
                compareVersions(otaVer, AppConfig.BUNDLED_WEB_VERSION) > 0 &&
                otaFile.exists() &&
                otaFile.length() > 20_000L
            ) {
                otaFile
            } else {
                if (otaFile.exists()) {
                    try { otaFile.delete() } catch (_: Exception) {}
                }
                if (otaVer.isNotBlank()) {
                    prefs.edit().remove(AppConfig.KEY_OTA_WEB_VERSION).apply()
                }
                null
            }
        } catch (e: Exception) {
            Log.w(TAG, "getActiveOtaFile warning: ${e.message}")
            null
        }
    }

    fun getActiveWebVersion(context: Context): String {
        val otaFile = getActiveOtaFile(context)
        if (otaFile != null) {
            val prefs = context.getSharedPreferences(AppConfig.PREFS_NAME, Context.MODE_PRIVATE)
            val v = prefs.getString(AppConfig.KEY_OTA_WEB_VERSION, "") ?: ""
            if (v.isNotBlank()) return v
        }
        return AppConfig.BUNDLED_WEB_VERSION
    }

    fun getStatusJson(context: Context): String {
        val otaFile = getActiveOtaFile(context)
        val activeVer = getActiveWebVersion(context)
        return JSONObject()
            .put("activeWebVersion", activeVer)
            .put("bundledWebVersion", AppConfig.BUNDLED_WEB_VERSION)
            .put("nativeVersionCode", AppConfig.NATIVE_VERSION_CODE)
            .put("isUsingOtaBundle", otaFile != null)
            .toString()
    }

    fun loadBestBundleIntoWebView(webView: WebView, context: Context) {
        val otaFile = getActiveOtaFile(context)
        if (otaFile != null) {
            try {
                val htmlContent = otaFile.readText(Charsets.UTF_8)
                if (htmlContent.length > 20_000 && htmlContent.contains("<!DOCTYPE html", ignoreCase = true)) {
                    Log.i(TAG, "Loading live OTA bundle v${getActiveWebVersion(context)} (${htmlContent.length} chars)")
                    webView.loadDataWithBaseURL(
                        AppConfig.LOCAL_ASSET_URL,
                        htmlContent,
                        "text/html",
                        "UTF-8",
                        AppConfig.LOCAL_ASSET_URL
                    )
                    return
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed reading OTA bundle, falling back to bundled asset", e)
            }
        }
        webView.loadUrl(AppConfig.LOCAL_ASSET_URL)
    }

    fun interceptAssetIndexIfOtaActive(context: Context, requestUrl: String): WebResourceResponse? {
        if (!requestUrl.startsWith(AppConfig.LOCAL_ASSET_URL)) return null
        val otaFile = getActiveOtaFile(context) ?: return null
        return try {
            WebResourceResponse("text/html", "UTF-8", FileInputStream(otaFile))
        } catch (e: Exception) {
            null
        }
    }

    fun resetToFactoryAsset(context: Context) {
        try {
            val dir = getOtaDir(context)
            File(dir, "index.html").takeIf { it.exists() }?.delete()
            File(dir, "index.html.tmp").takeIf { it.exists() }?.delete()
            context.getSharedPreferences(AppConfig.PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .remove(AppConfig.KEY_OTA_WEB_VERSION)
                .remove(AppConfig.KEY_OTA_RELEASE_NOTES)
                .apply()
        } catch (e: Exception) {
            Log.w(TAG, "resetToFactoryAsset warning: ${e.message}")
        }
    }

    private fun openConnectionFollowingRedirects(urlString: String, timeoutMs: Int = 12_000): HttpURLConnection? {
        var currentUrl = URL(urlString)
        var redirects = 0
        while (redirects < 5) {
            val conn = (currentUrl.openConnection() as HttpURLConnection).apply {
                connectTimeout = timeoutMs
                readTimeout = timeoutMs
                instanceFollowRedirects = true
                useCaches = false
                setRequestProperty("Cache-Control", "no-cache, no-store, must-revalidate")
                setRequestProperty("Pragma", "no-cache")
            }
            val code = conn.responseCode
            if (code == HttpURLConnection.HTTP_MOVED_TEMP ||
                code == HttpURLConnection.HTTP_MOVED_PERM ||
                code == HttpURLConnection.HTTP_SEE_OTHER ||
                code == 307 || code == 308
            ) {
                val loc = conn.getHeaderField("Location")
                conn.disconnect()
                if (loc.isNullOrBlank()) return null
                currentUrl = URL(currentUrl, loc)
                redirects++
            } else {
                return conn
            }
        }
        return null
    }

    private fun fetchStringUrl(urlString: String, timeoutMs: Int = 12_000): String? {
        val conn = openConnectionFollowingRedirects(urlString, timeoutMs) ?: return null
        return try {
            if (conn.responseCode in 200..299) {
                BufferedReader(InputStreamReader(conn.inputStream, Charsets.UTF_8)).use { it.readText() }
            } else {
                null
            }
        } finally {
            conn.disconnect()
        }
    }

    fun checkAndSyncOta(context: Context): OtaOutcome {
        return try {
            val cacheBuster = System.currentTimeMillis()
            val manifestStr = fetchStringUrl("${AppConfig.OTA_MANIFEST_URL}?t=$cacheBuster", 10_000)
                ?: return OtaOutcome.Error("Manifest OTA belum tersedia atau koneksi internet sedang terputus.")

            val json = JSONObject(manifestStr)
            val webVersion = json.optString("web_version", json.optString("version", "")).trim()
            val nativeVersionCode = json.optInt("native_version_code", AppConfig.NATIVE_VERSION_CODE)
            val nativeVersionName = json.optString(
                "native_version_name",
                webVersion.ifBlank { AppConfig.BUNDLED_WEB_VERSION }
            ).trim()
            val htmlUrl = json.optString("html_url", "${AppConfig.OTA_BUCKET_PUBLIC_BASE}/index.html").trim()
            val apkUrl = json.optString("apk_url", "${AppConfig.OTA_BUCKET_PUBLIC_BASE}/ZettbosAdmin-Latest.apk").trim()
            val forceUpdate = json.optBoolean("force_update", false)
            val releaseNotes = json.optString(
                "release_notes",
                "Pembaruan sistem & peningkatan performa aplikasi Zettbos Admin."
            )

            val currentVer = getActiveWebVersion(context)

            // Layer 2: Native APK Self-Update (jika ada penambahan fitur native Kotlin / AndroidManifest)
            if (nativeVersionCode > AppConfig.NATIVE_VERSION_CODE && apkUrl.isNotBlank()) {
                return OtaOutcome.NativeApkAvailable(
                    currentVersion = currentVer,
                    newVersionName = nativeVersionName,
                    newVersionCode = nativeVersionCode,
                    apkUrl = apkUrl,
                    releaseNotes = releaseNotes,
                    forceUpdate = forceUpdate
                )
            }

            // Layer 1: Instant Web OTA Bundle (otomatis unduh ke penyimpanan internal agar siap pakai <0.2 detik)
            if (webVersion.isNotBlank() && compareVersions(webVersion, currentVer) > 0 && htmlUrl.isNotBlank()) {
                val sep = if (htmlUrl.contains("?")) "&" else "?"
                val htmlContent = fetchStringUrl("$htmlUrl${sep}t=$cacheBuster", 20_000)
                    ?: return OtaOutcome.Error("Gagal mengunduh paket OTA v$webVersion.")

                if (htmlContent.length < 20_000 ||
                    !htmlContent.contains("<!DOCTYPE html", ignoreCase = true) ||
                    !htmlContent.contains("APP_VERSION")
                ) {
                    return OtaOutcome.Error("Paket OTA v$webVersion tidak lengkap, dibatalkan demi keamanan.")
                }

                val dir = getOtaDir(context)
                val tmpFile = File(dir, "index.html.tmp")
                val finalFile = File(dir, "index.html")
                tmpFile.writeText(htmlContent, Charsets.UTF_8)
                tmpFile.copyTo(finalFile, overwrite = true)
                try { tmpFile.delete() } catch (_: Exception) {}

                context.getSharedPreferences(AppConfig.PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putString(AppConfig.KEY_OTA_WEB_VERSION, webVersion)
                    .putString(AppConfig.KEY_OTA_RELEASE_NOTES, releaseNotes)
                    .apply()

                Log.i(TAG, "OTA bundle v$webVersion downloaded and staged (${finalFile.length()} bytes)")
                return OtaOutcome.WebOtaReady(
                    currentVersion = currentVer,
                    newVersion = webVersion,
                    releaseNotes = releaseNotes,
                    forceUpdate = forceUpdate
                )
            }

            OtaOutcome.UpToDate(
                currentVersion = currentVer,
                isUsingOta = getActiveOtaFile(context) != null
            )
        } catch (e: Exception) {
            Log.e(TAG, "checkAndSyncOta exception", e)
            OtaOutcome.Error("Gagal memeriksa update cloud: ${e.message ?: "Koneksi terputus"}")
        }
    }

    fun downloadApkUpdate(
        context: Context,
        apkUrl: String,
        onProgress: (Int) -> Unit
    ): Result<File> {
        return try {
            val sep = if (apkUrl.contains("?")) "&" else "?"
            val conn = openConnectionFollowingRedirects("${apkUrl}${sep}t=${System.currentTimeMillis()}", 25_000)
                ?: return Result.failure(IllegalStateException("Tidak dapat menghubungi server update APK."))

            try {
                if (conn.responseCode !in 200..299) {
                    return Result.failure(IllegalStateException("Server mengembalikan kode HTTP ${conn.responseCode}."))
                }

                val totalBytes = conn.contentLengthLong
                val cacheRoot = context.externalCacheDir ?: context.cacheDir
                val apkDir = File(cacheRoot, "ota").apply { if (!exists()) mkdirs() }
                val tmpApk = File(apkDir, "ZettbosAdmin-Update.apk.tmp")
                val finalApk = File(apkDir, "ZettbosAdmin-Update.apk")

                onProgress(2)
                var downloaded = 0L
                var lastReportedPct = 2

                BufferedInputStream(conn.inputStream).use { input ->
                    FileOutputStream(tmpApk).use { output ->
                        val buffer = ByteArray(16 * 1024)
                        var read: Int
                        while (input.read(buffer).also { read = it } != -1) {
                            output.write(buffer, 0, read)
                            downloaded += read
                            val pct = if (totalBytes > 0L) {
                                ((downloaded * 100L) / totalBytes).toInt().coerceIn(2, 99)
                            } else {
                                // Fallback estimasi ~14 MB jika Content-Length tidak dikirim
                                ((downloaded * 95L) / (14L * 1024L * 1024L)).toInt().coerceIn(5, 95)
                            }
                            if (pct >= lastReportedPct + 2) {
                                lastReportedPct = pct
                                onProgress(pct)
                            }
                        }
                        output.flush()
                    }
                }

                if (tmpApk.length() < 1_000_000L) {
                    tmpApk.delete()
                    return Result.failure(IllegalStateException("Ukuran file APK tidak valid (${tmpApk.length()} bytes)."))
                }

                // Verifikasi header ZIP/APK ('P' 'K')
                val header = ByteArray(2)
                FileInputStream(tmpApk).use { fis ->
                    if (fis.read(header) != 2 || header[0] != 0x50.toByte() || header[1] != 0x4B.toByte()) {
                        tmpApk.delete()
                        return Result.failure(IllegalStateException("File unduhan bukan paket APK Android yang valid."))
                    }
                }

                tmpApk.copyTo(finalApk, overwrite = true)
                try { tmpApk.delete() } catch (_: Exception) {}
                onProgress(100)
                Result.success(finalApk)
            } finally {
                conn.disconnect()
            }
        } catch (e: Exception) {
            Log.e(TAG, "downloadApkUpdate failed", e)
            Result.failure(e)
        }
    }

    fun installDownloadedApk(activity: ComponentActivity, apkFile: File): InstallLaunchStatus {
        return try {
            if (!apkFile.exists() || apkFile.length() < 1_000_000L) {
                return InstallLaunchStatus.FAILED
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!activity.packageManager.canRequestPackageInstalls()) {
                    val permIntent = Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:${activity.packageName}")
                    ).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    activity.startActivity(permIntent)
                    return InstallLaunchStatus.NEEDS_UNKNOWN_SOURCES_PERMISSION
                }
            }

            val apkUri = FileProvider.getUriForFile(
                activity,
                "${activity.packageName}.fileprovider",
                apkFile
            )
            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.startActivity(installIntent)
            InstallLaunchStatus.LAUNCHED
        } catch (e: Exception) {
            Log.e(TAG, "installDownloadedApk failed", e)
            InstallLaunchStatus.FAILED
        }
    }
}

