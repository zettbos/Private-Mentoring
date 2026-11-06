package com.example.zettbosadmin

object AppConfig {
    const val APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby7miPrJ_PePiTNktn88Zm-z1DSPBzaJ_V-RmtcmFPopS8DlC-UDyllKZBpZiN130sA/exec"
    const val STATS_URL = "$APPS_SCRIPT_URL?action=get_stats"
    const val LIVE_WEB_URL = "https://ourstory-udel.github.io/zettbos-admin-mentoring/"
    const val LOCAL_ASSET_URL = "file:///android_asset/index.html"
    const val PRIMARY_ADMIN_PHONE = "6282195277812"

    // OTA & In-App Self-Updater Configuration (Powered by Supabase Database 3)
    const val BUNDLED_WEB_VERSION = "3.9.17"
    const val NATIVE_VERSION_CODE = 11
    const val SUPABASE_DB3_URL = "https://anshbrwbtoxgvnyrrnfn.supabase.co"
    const val OTA_BUCKET_PUBLIC_BASE = "$SUPABASE_DB3_URL/storage/v1/object/public/app-ota"
    const val OTA_MANIFEST_URL = "$OTA_BUCKET_PUBLIC_BASE/ota-manifest.json"

    // Shared Preferences Keys
    const val PREFS_NAME = "ZettbosAppPrefs"
    const val KEY_LAST_MEMBER_EMAIL = "LastNotifiedMemberEmail"
    const val KEY_LAST_BUYER_EMAIL = "LastNotifiedBuyerEmail"
    const val KEY_OTA_WEB_VERSION = "OtaActiveWebVersion"
    const val KEY_OTA_RELEASE_NOTES = "OtaActiveReleaseNotes"

    // Notification Channel IDs (v2 guarantees fresh IMPORTANCE_HIGH heads-up banner on OEM ROMs)
    const val CHANNEL_BG_SERVICE = "zettbos_bg_service_channel"
    const val CHANNEL_NEW_MEMBER = "zettbos_push_high_v2"
    const val CHANNEL_NEW_MEMBER_LEGACY = "zettbos_member_channel"
    const val CHANNEL_NEW_PURCHASE = "zettbos_purchase_high_v2"
    const val CHANNEL_BULK_STATUS = "zettbos_bulk_high_v2"

    // Notification IDs
    const val NOTIF_ID_BG_SERVICE = 2002
    const val NOTIF_ID_MEMBER = 1001
    const val NOTIF_ID_PURCHASE = 1002
    const val NOTIF_ID_TEST_PUSH = 7777
}
