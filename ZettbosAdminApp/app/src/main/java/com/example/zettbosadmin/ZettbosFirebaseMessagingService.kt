package com.example.zettbosadmin

import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Service penerima push notification Firebase Cloud Messaging (FCM).
 * Memastikan notifikasi pendaftaran siswa baru & pembelian tetap masuk
 * meskipun aplikasi Zettbos Admin sedang ditutup atau dibersihkan dari RAM.
 */
class ZettbosFirebaseMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        try {
            FirebaseMessaging.getInstance().subscribeToTopic("admin_notif")
        } catch (e: Exception) {
            e.printStackTrace()
        }

        CoroutineScope(Dispatchers.IO).launch {
            FcmPushHelper.syncFcmTokenWithCloud(token)
        }
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        val incomingNonce = remoteMessage.data["test_nonce"] ?: ""
        if (incomingNonce.isNotEmpty()) {
            if (incomingNonce == FcmPushHelper.lastHandledNonce) {
                return
            }
            FcmPushHelper.lastHandledNonce = incomingNonce
        }

        val title = remoteMessage.notification?.title
            ?: remoteMessage.data["title"]
            ?: "📝 Siswa Baru Selesai Isi Form!"

        val body = remoteMessage.notification?.body
            ?: remoteMessage.data["body"]
            ?: "Ada data siswa baru yang perlu tindakan."

        val notifId = if (incomingNonce.isNotEmpty()) {
            AppConfig.NOTIF_ID_TEST_PUSH
        } else {
            (System.currentTimeMillis() and 0x7FFFFFFF).toInt()
        }

        FcmPushHelper.showHighPriorityNotification(
            context = this,
            title = title,
            body = body,
            channelId = AppConfig.CHANNEL_NEW_MEMBER,
            notificationId = notifId
        )
    }
}
