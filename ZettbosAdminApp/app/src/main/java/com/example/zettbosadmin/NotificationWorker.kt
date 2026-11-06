package com.example.zettbosadmin

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

class NotificationWorker(
    private val appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        try {

            val jsonResponse = fetchUrlWithRedirects(AppConfig.STATS_URL) ?: return Result.retry()

            val jsonObject = JSONObject(jsonResponse)
            if (!jsonObject.optBoolean("success", false)) {
                return Result.failure()
            }

            val sharedPreferences = appContext.getSharedPreferences(AppConfig.PREFS_NAME, Context.MODE_PRIVATE)

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

            return Result.success()
        } catch (e: Exception) {
            e.printStackTrace()
            return Result.retry()
        }
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
                url = URL(url, newUrl)
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

    private fun showMemberNotification(
        needsActionCount: Int,
        newestMemberName: String,
        summaryTitle: String,
        summaryBody: String,
        duplicateCount: Int
    ) {
        val title = if (summaryTitle.isNotEmpty()) summaryTitle else {
            if (needsActionCount > 1) "🔔 Rekap: $needsActionCount Siswa Baru Masuk"
            else "📝 1 Siswa Baru: $newestMemberName"
        }

        val body = if (summaryBody.isNotEmpty()) summaryBody else {
            if (needsActionCount > 1) "$needsActionCount pendaftar baru masuk antrean. Buka aplikasi untuk tindakan."
            else "$newestMemberName baru saja mengisi form pendaftaran."
        }

        FcmPushHelper.showHighPriorityNotification(
            context = appContext,
            title = title,
            body = body,
            channelId = AppConfig.CHANNEL_NEW_MEMBER,
            notificationId = AppConfig.NOTIF_ID_MEMBER
        )
    }

    private fun showPurchaseNotification(unfilledCount: Int, buyerName: String, productName: String) {
        val body = "$buyerName baru saja membeli $productName.\nTotal ada $unfilledCount transaksi Lynk.id yang belum mengisi form pendaftaran."
        FcmPushHelper.showHighPriorityNotification(
            context = appContext,
            title = "💰 Ada Pembelian Lynk.id Baru!",
            body = body,
            channelId = AppConfig.CHANNEL_NEW_PURCHASE,
            notificationId = AppConfig.NOTIF_ID_PURCHASE
        )
    }
}
