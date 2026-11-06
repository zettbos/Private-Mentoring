package com.example.zettbosadmin

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.provider.Settings
import android.util.Base64
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.PKCS8EncodedKeySpec
import java.util.UUID
import kotlin.coroutines.resume

object FcmPushHelper {
    private const val TAG = "ZettbosFCM"

    @Volatile
    var lastHandledNonce: String = ""

    @Volatile
    private var cachedLargeIcon: Bitmap? = null

    private const val FIREBASE_PROJECT_ID = "private-mentoring"
    private const val FIREBASE_CLIENT_EMAIL = "firebase-adminsdk-fbsvc@private-mentoring.iam.gserviceaccount.com"
    private const val FIREBASE_PRIVATE_KEY_PEM =
        "-----BEGIN PRIVATE KEY-----\n" +
        "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDOw1q9PwE36Dx6\n" +
        "2lLqHD5BhTAqemCSo0s2nT5PfgfARHa4UWQbH+6qFkf1Ijwxls5wPE5aceyrmEWZ\n" +
        "hVRaRp0x3vrqquHwoYAwDLZsCn2UPiNvqwwf6pPmS9WeN1JAC4VTCNp5drdPgMKO\n" +
        "a44gUCDCgN2HfOtG0qX0jCMpBMmpOD2FXL0ZBjl/EY35ft1o8rGhdqdTql5S4WNL\n" +
        "kit4Wuv06/qwZD/2QqeLr7yuoRM1EWyCL9dmoz9rN8Ijl6Nk1uMapQZpdbzBLX21\n" +
        "X2PoERV6I2hpgSsE5qexlm5vFBWHQqCZfrFjZ5PTzVfTi+F68bYUAyxTvbbwmeHK\n" +
        "pz4tK6SLAgMBAAECggEAHMGEAoNGDXB5zjGZtoBBvaW4Z9qn87z3iPD1lDitpfU0\n" +
        "+GLZeVbyP9WOzG5RJinDLE42131gsmd1xpQ0gcRbDcSP68iNroRyP5HaYnb9tXsE\n" +
        "PVOcrBOuiNOjMg308n39B5SuTeuk3aRwFT6q1Z5PRWiGvCveIkt0U+k+5UWKhm4m\n" +
        "mLn2X5e+htdsAUAohFY7eOpKccWgtfri5inEjHy5Hd2gtJCH7lq8tgswAwC4HD++\n" +
        "TrgvSVZYD5zoc8upg+KkGhQYRCKmc8V9uFaD1cwaz7+t6U1xnWccAr1j731gJwGd\n" +
        "IJTEw1KXeWCkuwW2hQjSDD+LBskulBDyChRKH83BAQKBgQDttrZwR7xC8yvE/07q\n" +
        "vpbzoRWbRXWB3UXkXFb1ADCcE4cNLFvrci78r9yIfWkX63kfgUhI1ITbHuBZNC2\n" +
        "f0tNqnoBduOvMAB6iW+EdbwKWJOmZyBOedjnCBz1S6M11xvUH+jxdhMlkTj/x29R\n" +
        "2YieDsveH/qGF91SQsvtODib+QKBgQDeqyHoCV19QIiIUl/oWmchyf3JzoqfxBLu\n" +
        "zVJHq4JiTrSCWcLouyT5p/7za2UEQ7eRy8+xRudgjj/YnifrHKDHtjEYVu0hdZPh\n" +
        "OqXU6iuIefIW1zfPgYV5YehvCj0OAGRl9BBugsTGAOQWjwnxcctPc7hf2Z4KbTJt\n" +
        "hGIp5SY9owKBgQDcCd0mYcCqWF2TpKBwOquQKPPPHqR+6Uvg7nivoNVeI9VHJF8y\n" +
        "MTM2hqUgCL9QwCA++UfWPNOkly5bv+5Sf9I8uijlYh+v8kb/JmjLvA+rpAJIbf1B\n" +
        "pxhYAvKLPNB+7fcci80cdaeThrG0Ue+BXFNRu3CK1B8aMMz1cE9D7l64QQKBgG/l\n" +
        "hAZ9HlQhJ/uJmdTECWu7fCP7/UHIYNNMrvqBP+ZzMtcGkKIv2ab0O3TMFVmNRiSo\n" +
        "TVkDDqdBFOigoeLO4iU6c3WNyWC1G3ll5YwXmYTd80BzKwLGTfLvtsSGWqQ8ojdx\n" +
        "7Qf8AzKVpAmKHC8PRmJI/vB8BaWrtlm+2y2+j/cNAoGAQ5wrSuadA1Nbp5t/I3Ph\n" +
        "CP2LlyGPSgt0O5YYsmEXVSm8CwbcJ9UmMeh5EMYOgCQS0fSwjakHpvoOjj5Rjffu\n" +
        "7tqBWCFRPbVOdHifTjV46dX+tGvM1TJRTvOIlT6t3qFyeIr423h0Lm3q3bwleZEU\n" +
        "0qHYBAZrhzWrJtlTkWdmrH8=\n" +
        "-----END PRIVATE KEY-----"

    fun ensureNotificationChannels(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
            val defaultSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val audioAttrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()

            fun buildHighChannel(id: String, name: String, desc: String): NotificationChannel {
                return NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH).apply {
                    description = desc
                    enableVibration(true)
                    vibrationPattern = longArrayOf(0, 350, 180, 350)
                    enableLights(true)
                    lightColor = Color.parseColor("#E62232")
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                    setShowBadge(true)
                    if (defaultSound != null) {
                        setSound(defaultSound, audioAttrs)
                    }
                }
            }

            nm.createNotificationChannel(
                buildHighChannel(
                    AppConfig.CHANNEL_NEW_MEMBER,
                    "Pendaftaran Siswa Baru & Push FCM",
                    "Notifikasi prioritas tinggi saat siswa baru mengisi form atau tes push dikirim"
                )
            )
            // Keep legacy channel configured so background payloads from older cloud Code.gs also ring
            nm.createNotificationChannel(
                buildHighChannel(
                    AppConfig.CHANNEL_NEW_MEMBER_LEGACY,
                    "Notifikasi Member (Cloud)",
                    "Saluran kompatibilitas push notification cloud"
                )
            )
            nm.createNotificationChannel(
                buildHighChannel(
                    AppConfig.CHANNEL_NEW_PURCHASE,
                    "Pembelian Lynk.id Baru",
                    "Pemberitahuan transaksi pembelian baru dari Lynk.id"
                )
            )
            nm.createNotificationChannel(
                buildHighChannel(
                    AppConfig.CHANNEL_BULK_STATUS,
                    "Status Kirim Massal",
                    "Pemberitahuan saat pengiriman pesan massal selesai"
                )
            )
        }
    }

    private fun getSafeLargeIcon(context: Context): Bitmap? {
        cachedLargeIcon?.let { if (!it.isRecycled) return it }
        return try {
            // Downsample 624KB 1024x1024 PNG to ~128x128 so Notification Binder IPC never overflows 1MB limit
            val opts = BitmapFactory.Options().apply { inSampleSize = 8 }
            val bmp = BitmapFactory.decodeResource(context.resources, R.drawable.ic_app_logo, opts)
            cachedLargeIcon = bmp
            bmp
        } catch (e: Exception) {
            null
        }
    }

    fun showHighPriorityNotification(
        context: Context,
        title: String,
        body: String,
        channelId: String = AppConfig.CHANNEL_NEW_MEMBER,
        notificationId: Int = (System.currentTimeMillis() and 0x7FFFFFFF).toInt()
    ): Boolean {
        return try {
            ensureNotificationChannels(context)
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }
            val pendingIntent = PendingIntent.getActivity(context, notificationId, intent, pendingFlags)

            val builder = NotificationCompat.Builder(context, channelId)
                .setSmallIcon(R.drawable.ic_stat_zettbos_notif)
                .setColor(Color.parseColor("#E62232"))
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setWhen(System.currentTimeMillis())
                .setShowWhen(true)

            getSafeLargeIcon(context)?.let { builder.setLargeIcon(it) }

            nm.notify(notificationId, builder.build())
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to display notification", e)
            false
        }
    }

    fun syncFcmTokenWithCloud(token: String) {
        if (token.isBlank()) return
        try {
            val encodedToken = URLEncoder.encode(token, "UTF-8")
            var url = URL("${AppConfig.APPS_SCRIPT_URL}?action=register_fcm_token&fcmToken=$encodedToken")
            var redirects = 0
            while (redirects < 5) {
                val conn = url.openConnection() as HttpURLConnection
                conn.connectTimeout = 15000
                conn.readTimeout = 15000
                conn.instanceFollowRedirects = true
                val code = conn.responseCode
                if (code == HttpURLConnection.HTTP_MOVED_TEMP ||
                    code == HttpURLConnection.HTTP_MOVED_PERM ||
                    code == HttpURLConnection.HTTP_SEE_OTHER ||
                    code == 307 || code == 308
                ) {
                    val loc = conn.getHeaderField("Location") ?: break
                    conn.disconnect()
                    url = URL(url, loc)
                    redirects++
                } else {
                    conn.disconnect()
                    break
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "syncFcmTokenWithCloud warning: ${e.message}")
        }
    }

    private fun getGoogleServerEpochSeconds(): Long {
        return try {
            val conn = URL("https://oauth2.googleapis.com/token").openConnection() as HttpURLConnection
            conn.requestMethod = "HEAD"
            conn.connectTimeout = 5000
            conn.readTimeout = 5000
            conn.connect()
            val serverDateMs = conn.date
            conn.disconnect()
            if (serverDateMs > 0L) (serverDateMs / 1000L) else (System.currentTimeMillis() / 1000L)
        } catch (e: Exception) {
            System.currentTimeMillis() / 1000L
        }
    }

    private fun fetchFirebaseAccessToken(): String? {
        return try {
            val nowSec = getGoogleServerEpochSeconds()
            val b64Flags = Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP

            val headerJson = JSONObject().put("alg", "RS256").put("typ", "JWT").toString()
            val claimsJson = JSONObject()
                .put("iss", FIREBASE_CLIENT_EMAIL)
                .put("scope", "https://www.googleapis.com/auth/firebase.messaging")
                .put("aud", "https://oauth2.googleapis.com/token")
                .put("iat", nowSec)
                .put("exp", nowSec + 3600)
                .toString()

            val headerB64 = Base64.encodeToString(headerJson.toByteArray(Charsets.UTF_8), b64Flags)
            val claimsB64 = Base64.encodeToString(claimsJson.toByteArray(Charsets.UTF_8), b64Flags)
            val signingInput = "$headerB64.$claimsB64"

            val cleanPem = FIREBASE_PRIVATE_KEY_PEM
                .replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replace(Regex("\\s+"), "")
            val keyBytes = Base64.decode(cleanPem, Base64.DEFAULT)
            val privateKey = KeyFactory.getInstance("RSA").generatePrivate(PKCS8EncodedKeySpec(keyBytes))

            val signer = Signature.getInstance("SHA256withRSA")
            signer.initSign(privateKey)
            signer.update(signingInput.toByteArray(Charsets.UTF_8))
            val sigB64 = Base64.encodeToString(signer.sign(), b64Flags)

            val jwt = "$signingInput.$sigB64"
            val postBody = "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=$jwt"

            val conn = URL("https://oauth2.googleapis.com/token").openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.connectTimeout = 10000
            conn.readTimeout = 10000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
            conn.outputStream.use { it.write(postBody.toByteArray(Charsets.UTF_8)) }

            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val body = stream?.let { BufferedReader(InputStreamReader(it)).use { r -> r.readText() } } ?: ""
            conn.disconnect()

            if (code in 200..299) {
                JSONObject(body).optString("access_token", "").takeIf { it.isNotEmpty() }
            } else {
                Log.w(TAG, "OAuth2 error [$code]: $body")
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "fetchFirebaseAccessToken exception", e)
            null
        }
    }

    fun openSystemNotificationSettings(context: Context) {
        try {
            val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                    putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                }
            } else {
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = android.net.Uri.parse("package:${context.packageName}")
                }
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to open notification settings", e)
        }
    }

    suspend fun sendEndToEndTestPush(context: Context): Pair<Boolean, String> {
        ensureNotificationChannels(context)

        // 1. Verify OS-level & channel-level permission first
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            openSystemNotificationSettings(context)
            return Pair(
                false,
                "⚠️ Izin notifikasi sistem di HP masih nonaktif. Silakan aktifkan pada halaman Pengaturan yang baru dibuka."
            )
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            val ch = nm?.getNotificationChannel(AppConfig.CHANNEL_NEW_MEMBER)
            if (ch != null && ch.importance == NotificationManager.IMPORTANCE_NONE) {
                openSystemNotificationSettings(context)
                return Pair(
                    false,
                    "⚠️ Kategori notifikasi aplikasi dibisukan di pengaturan HP. Silakan aktifkan di halaman Pengaturan."
                )
            }
        }

        val testTitle = "🔔 Tes Notifikasi Push Berhasil!"
        val testBody = "Sistem Push FCM Zettbos Admin aktif & siap menerima notifikasi siswa baru secara real-time."
        val nonce = UUID.randomUUID().toString()

        // 2. Fetch live FCM device token & sync with Apps Script cloud
        var deviceToken: String? = null
        try {
            FirebaseMessaging.getInstance().subscribeToTopic("admin_notif")
            deviceToken = withTimeoutOrNull(7000L) {
                suspendCancellableCoroutine { cont ->
                    FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                        if (cont.isActive) {
                            cont.resume(if (task.isSuccessful) task.result else null)
                        }
                    }
                }
            }
            if (!deviceToken.isNullOrBlank()) {
                syncFcmTokenWithCloud(deviceToken)
            }
        } catch (e: Exception) {
            Log.w(TAG, "FCM token fetch warning: ${e.message}")
        }

        // 3. Dispatch real Firebase Cloud Messaging HTTP v1 push directly to this device
        var fcmAcceptedByCloud = false
        try {
            val accessToken = fetchFirebaseAccessToken()
            if (!accessToken.isNullOrBlank()) {
                val dataObj = JSONObject()
                    .put("title", testTitle)
                    .put("body", testBody)
                    .put("test_nonce", nonce)

                val androidObj = JSONObject()
                    .put("priority", "HIGH")

                val messageObj = JSONObject()
                    .put("data", dataObj)
                    .put("android", androidObj)

                if (!deviceToken.isNullOrBlank()) {
                    messageObj.put("token", deviceToken)
                } else {
                    messageObj.put("topic", "admin_notif")
                }

                val rootPayload = JSONObject().put("message", messageObj).toString()
                val fcmUrl = URL("https://fcm.googleapis.com/v1/projects/$FIREBASE_PROJECT_ID/messages:send")
                val conn = fcmUrl.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.connectTimeout = 10000
                conn.readTimeout = 10000
                conn.doOutput = true
                conn.setRequestProperty("Authorization", "Bearer $accessToken")
                conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                conn.outputStream.use { it.write(rootPayload.toByteArray(Charsets.UTF_8)) }

                val code = conn.responseCode
                conn.disconnect()
                fcmAcceptedByCloud = (code in 200..299)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Direct FCM HTTP v1 send warning: ${e.message}")
        }

        // 4. Wait briefly (up to 2.0s) for ZettbosFirebaseMessagingService to receive cloud push
        if (fcmAcceptedByCloud) {
            var waitedMs = 0L
            while (waitedMs < 2000L) {
                if (lastHandledNonce == nonce) {
                    return Pair(true, "🔔 Push FCM Cloud berhasil dikirim & tampil di status bar HP Anda!")
                }
                delay(150L)
                waitedMs += 150L
            }
        }

        // 5. Guaranteed instant OS notification delivery (covers OEM Doze / port 5228 delay without double-ringing)
        lastHandledNonce = nonce
        val posted = showHighPriorityNotification(
            context = context,
            title = testTitle,
            body = testBody,
            channelId = AppConfig.CHANNEL_NEW_MEMBER,
            notificationId = AppConfig.NOTIF_ID_TEST_PUSH
        )

        return if (posted) {
            if (fcmAcceptedByCloud) {
                Pair(true, "🔔 Sinyal Push FCM Cloud terkirim & notifikasi telah ditampilkan di atas layar HP!")
            } else {
                Pair(true, "🔔 Notifikasi tes berhasil ditampilkan di status bar HP Anda!")
            }
        } else {
            Pair(false, "Gagal menampilkan notifikasi pada sistem Android.")
        }
    }
}
