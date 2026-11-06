package com.example.zettbosadmin

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

class NotificationService : Service() {
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var pollingJob: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        try {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            notificationManager?.cancel(AppConfig.NOTIF_ID_BG_SERVICE)
        } catch (e: Exception) {
            e.printStackTrace()
        }
        stopSelf()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            notificationManager?.cancel(AppConfig.NOTIF_ID_BG_SERVICE)
        } catch (e: Exception) {
            e.printStackTrace()
        }
        stopSelf()
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        pollingJob?.cancel()
        serviceScope.cancel()
    }

    private fun startForegroundServiceSafe() {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        )

        val iconRes = R.drawable.ic_stat_zettbos_notif

        val notification = NotificationCompat.Builder(this, AppConfig.CHANNEL_BG_SERVICE)
            .setSmallIcon(if (iconRes != 0) iconRes else android.R.drawable.ic_dialog_info)
            .setContentTitle("Zettbos Monitor Aktif 🔔")
            .setContentText("Memantau pendaftaran & pembelian Lynk.id secara real-time...")
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceCompat.startForeground(
                    this,
                    AppConfig.NOTIF_ID_BG_SERVICE,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                )
            } else {
                startForeground(AppConfig.NOTIF_ID_BG_SERVICE, notification)
            }
        } catch (e: Exception) {
            e.printStackTrace()
            try {
                startForeground(AppConfig.NOTIF_ID_BG_SERVICE, notification)
            } catch (ignored: Exception) {}
        }
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            // 1. Channel Background Service Monitor
            val bgChannel = NotificationChannel(
                AppConfig.CHANNEL_BG_SERVICE,
                "Zettbos Background Monitor",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Saluran status monitor pendaftaran dan transaksi real-time"
                setShowBadge(false)
            }
            manager.createNotificationChannel(bgChannel)

            // 2. Channel Siswa Isi Form
            val memberChannel = NotificationChannel(
                AppConfig.CHANNEL_NEW_MEMBER,
                "Pendaftaran Siswa Baru",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Pemberitahuan saat ada siswa baru selesai mengisi form pendaftaran"
                enableVibration(true)
                enableLights(true)
            }
            manager.createNotificationChannel(memberChannel)

            // 3. Channel Pembelian Lynk.id
            val purchaseChannel = NotificationChannel(
                AppConfig.CHANNEL_NEW_PURCHASE,
                "Pembelian Lynk.id Baru",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Pemberitahuan saat ada transaksi pembelian baru di Lynk.id"
                enableVibration(true)
                enableLights(true)
            }
            manager.createNotificationChannel(purchaseChannel)
        }
    }

    private fun startPolling() {
        pollingJob = serviceScope.launch {
            while (isActive) {
                try {
                    checkNewEvents()
                } catch (e: Exception) {
                    e.printStackTrace()
                }
                delay(30000) // Polling setiap 30 detik untuk kenyamanan real-time
            }
        }
    }

    private fun checkNewEvents() {
        val response = fetchUrlWithRedirects(AppConfig.STATS_URL) ?: return
        val jsonObject = JSONObject(response)
        if (!jsonObject.optBoolean("success", false)) return

        val sharedPreferences = getSharedPreferences(AppConfig.PREFS_NAME, Context.MODE_PRIVATE)

        // 1. Event Siswa Baru Mengisi Form (Rekap Ringkas & Deteksi Data Kembar)
        val needsActionCount = jsonObject.optInt("needsActionCount", 0)
        val newestMember = jsonObject.optString("newestMember", "")
        val lastNotifiedMemberEmail = jsonObject.optString("lastNotifiedMemberEmail", "")
        val summaryTitle = jsonObject.optString("summaryTitle", "")
        val summaryBody = jsonObject.optString("summaryBody", "")
        val duplicateCount = jsonObject.optInt("duplicateCount", 0)

        if (needsActionCount > 0 && newestMember.isNotEmpty() && lastNotifiedMemberEmail.isNotEmpty()) {
            val lastSavedMemberEmail = sharedPreferences.getString(AppConfig.KEY_LAST_MEMBER_EMAIL, "")
            if (lastSavedMemberEmail != lastNotifiedMemberEmail) {
                showMemberNotification(needsActionCount, newestMember, summaryTitle, summaryBody, duplicateCount)
                sharedPreferences.edit().putString(AppConfig.KEY_LAST_MEMBER_EMAIL, lastNotifiedMemberEmail).apply()
            }
        }

        // 2. Event Pembelian Lynk.id Baru
        val unfilledBuyerCount = jsonObject.optInt("unfilledBuyerCount", 0)
        val newestBuyerName = jsonObject.optString("newestBuyerName", "")
        val newestBuyerEmail = jsonObject.optString("newestBuyerEmail", "")
        val newestBuyerProduct = jsonObject.optString("newestBuyerProduct", "Private Mentoring")

        if (unfilledBuyerCount > 0 && newestBuyerName.isNotEmpty() && newestBuyerEmail.isNotEmpty()) {
            val lastSavedBuyerEmail = sharedPreferences.getString(AppConfig.KEY_LAST_BUYER_EMAIL, "")
            if (lastSavedBuyerEmail != newestBuyerEmail) {
                showPurchaseNotification(unfilledBuyerCount, newestBuyerName, newestBuyerProduct)
                sharedPreferences.edit().putString(AppConfig.KEY_LAST_BUYER_EMAIL, newestBuyerEmail).apply()
            }
        }
    }

    private fun showMemberNotification(
        needsActionCount: Int,
        newestMemberName: String,
        summaryTitle: String,
        summaryBody: String,
        duplicateCount: Int
    ) {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        )

        val iconRes = R.drawable.ic_stat_zettbos_notif

        val title = if (summaryTitle.isNotEmpty()) summaryTitle else {
            if (needsActionCount > 1) "🔔 Rekap: $needsActionCount Siswa Baru Masuk"
            else "📝 1 Siswa Baru: $newestMemberName"
        }

        val body = if (summaryBody.isNotEmpty()) summaryBody else {
            if (needsActionCount > 1) "$needsActionCount pendaftar baru masuk antrean. Buka aplikasi untuk tindakan."
            else "$newestMemberName baru saja mengisi form pendaftaran."
        }

        val notification = NotificationCompat.Builder(this, AppConfig.CHANNEL_NEW_MEMBER)
            .setSmallIcon(if (iconRes != 0) iconRes else android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(AppConfig.NOTIF_ID_MEMBER, notification)
    }

    private fun showPurchaseNotification(unfilledCount: Int, buyerName: String, productName: String) {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        )

        val iconRes = R.drawable.ic_stat_zettbos_notif

        val notification = NotificationCompat.Builder(this, AppConfig.CHANNEL_NEW_PURCHASE)
            .setSmallIcon(if (iconRes != 0) iconRes else android.R.drawable.ic_dialog_info)
            .setContentTitle("💰 Ada Pembelian Lynk.id Baru!")
            .setContentText("$buyerName baru saja membeli $productName. Total $unfilledCount pembeli belum isi form.")
            .setStyle(NotificationCompat.BigTextStyle()
                .bigText("$buyerName baru saja membeli $productName.\nTotal ada $unfilledCount transaksi Lynk.id yang belum mengisi form pendaftaran."))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(AppConfig.NOTIF_ID_PURCHASE, notification)
    }

    private fun fetchUrlWithRedirects(urlString: String): String? {
        var url = URL(urlString)
        var redirects = 0
        val maxRedirects = 5

        while (redirects < maxRedirects) {
            val connection = url.openConnection() as HttpURLConnection
            connection.connectTimeout = 15000
            connection.readTimeout = 15000
            connection.instanceFollowRedirects = true

            val status = connection.responseCode
            if (status == HttpURLConnection.HTTP_MOVED_TEMP || 
                status == HttpURLConnection.HTTP_MOVED_PERM || 
                status == HttpURLConnection.HTTP_SEE_OTHER ||
                status == 307 || status == 308) {
                val newUrl = connection.getHeaderField("Location")
                connection.disconnect()
                url = URL(newUrl)
                redirects++
            } else if (status == HttpURLConnection.HTTP_OK) {
                val reader = BufferedReader(InputStreamReader(connection.inputStream))
                val response = StringBuilder()
                var line: String?
                while (reader.readLine().also { line = it } != null) {
                    response.append(line)
                }
                reader.close()
                connection.disconnect()
                return response.toString()
            } else {
                connection.disconnect()
                return null
            }
        }
        return null
    }
}
