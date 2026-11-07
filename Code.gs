// --- KONFIGURASI ZETTBOS ---
const FONNTE_TOKEN_DEFAULT = 'eSNkqCpQRVxy2HSBnyR2';
const FONNTE_TOKEN = (function() {
  try {
    const prop = PropertiesService.getScriptProperties().getProperty('FONNTE_TOKEN');
    const cleanProp = (prop && prop.trim()) ? prop.trim() : '';
    // Abaikan token lama yang sudah tidak valid (5V42u7r6R7J7cHMbK72c)
    if (cleanProp && cleanProp !== '5V42u7r6R7J7cHMbK72c') {
      return cleanProp;
    }
    return FONNTE_TOKEN_DEFAULT;
  } catch(e) {
    return FONNTE_TOKEN_DEFAULT;
  }
})();
const URL_FONNTE = 'https://api.fonnte.com/send';
const CONTACT_SUFFIX = '- Member #4'; // <--- SETUP NAMA BELAKANG DI SINI (Ubah jika member naik tingkat, e.g. #4, #5)
const PRIMARY_ADMIN_PHONE_DEFAULT = '6282195277812';
const PRIMARY_ADMIN_PHONE = (function() {
  try {
    const prop = PropertiesService.getScriptProperties().getProperty('PRIMARY_ADMIN_PHONE');
    return (prop && prop.trim()) ? prop.trim() : PRIMARY_ADMIN_PHONE_DEFAULT;
  } catch(e) {
    return PRIMARY_ADMIN_PHONE_DEFAULT;
  }
})();

const DEFAULT_MENTORING_DB_URL = 'https://anshbrwbtoxgvnyrrnfn.supabase.co';
const DEFAULT_MENTORING_DB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuc2hicndidG94Z3ZueXJybmZuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MzI2MjMyMSwiZXhwIjoyMTA4ODM4MzIxfQ.x0AxM0og19Nr7tnEN5HZWvNuWW6XpTLAapAFu9rb2uE';

const CLOUD_APP_VERSION = '3.9.19'; // <--- Versi Sistem Cloud Terbaru
const CLOUD_RELEASE_NOTES = 'Pembaruan v3.9.19: Monitor TikTok LIVE Otomatis dengan notifikasi ringkas waktu mulai & durasi siaran, serta tautan langsung siaran langsung vt.tiktok.com.';

/**
 * Router API Web App (Mendukung GET dan POST untuk REST API & HTML View)
 */
function handleApiRequest(e) {
  let params = {};
  if (e) {
    if (typeof e === 'object' && !e.parameter && !e.postData && e.action) {
      params = e;
    } else {
      if (e.parameter) {
        params = Object.assign({}, params, e.parameter);
      }
      if (e.postData && e.postData.contents) {
        try {
          const parsedBody = JSON.parse(e.postData.contents);
          params = Object.assign({}, params, parsedBody);
        } catch (err) {
          // Body bukan JSON valid, pertahankan e.parameter
        }
      }
    }
  }

  const action = params.action;
  let responseData = null;

  if (action === 'get_all_data' || action === 'get_dashboard_all') {
    responseData = getAllDashboardData(params.force_fresh === true || params.force_fresh === 'true');
  } else if (action === 'check_app_version') {
    responseData = {
      success: true,
      currentVersion: CLOUD_APP_VERSION,
      releaseNotes: CLOUD_RELEASE_NOTES
    };
  } else if (action === 'get_app_bundle') {
    try {
      const htmlContent = HtmlService.createHtmlOutputFromFile('Index').getContent();
      responseData = {
        success: true,
        version: CLOUD_APP_VERSION,
        releaseNotes: CLOUD_RELEASE_NOTES,
        html: htmlContent
      };
    } catch (errBundle) {
      responseData = {
        success: false,
        message: 'Gagal membaca bundle Index: ' + errBundle.toString()
      };
    }
  } else if (action === 'get_data') {
    responseData = getMemberData(params.force_fresh === true || params.force_fresh === 'true');
  } else if (action === 'get_stats') {
    try {
      const memberResult = getMemberData();
      let needsActionCount = 0;
      let newestMember = '';
      let lastNotifiedMemberEmail = '';
      let duplicateCount = 0;
      let duplicateDetails = [];
      
      if (memberResult.success && memberResult.needsAction && memberResult.needsAction.length > 0) {
        needsActionCount = memberResult.needsAction.length;
        newestMember = memberResult.needsAction[0].nama;
        lastNotifiedMemberEmail = memberResult.needsAction[0].email;
        
        memberResult.needsAction.forEach(m => {
          if (m.hasDuplicate) {
            duplicateCount++;
            let dReason = [];
            if (m.isDuplicateEmail) dReason.push('Email ' + m.countEmail + 'x');
            if (m.isDuplicateWa) dReason.push('WA ' + m.countWa + 'x');
            duplicateDetails.push(m.nama + ' (' + dReason.join(', ') + ')');
          }
        });
      }

      // Format judul dan rekap notifikasi ringkas sesuai permintaan Admin
      let summaryTitle = '';
      let summaryBody = '';
      if (needsActionCount === 1) {
        if (duplicateCount > 0) {
          summaryTitle = '⚠️ 1 Pendaftar: ' + newestMember + ' (Data Kembar!)';
          summaryBody = newestMember + ' mendaftar, namun data Email/WA terdeteksi kembar di Sheet (Kolom F/G).';
        } else {
          summaryTitle = '📝 1 Pendaftar Baru: ' + newestMember;
          summaryBody = newestMember + ' baru saja mengisi form pendaftaran (Data baru unik).';
        }
      } else if (needsActionCount > 1) {
        if (duplicateCount > 0) {
          summaryTitle = '⚠️ Rekap: ' + needsActionCount + ' Siswa Baru (' + duplicateCount + ' Kembar)';
          summaryBody = needsActionCount + ' pendaftar baru masuk. Ada ' + duplicateCount + ' data kembar di Sheet (Kolom F/G). Buka aplikasi untuk cek.';
        } else {
          summaryTitle = '🔔 Rekap: ' + needsActionCount + ' Siswa Baru Masuk';
          summaryBody = needsActionCount + ' pendaftar baru masuk (Semua data unik, tidak ada data kembar). Total ' + needsActionCount + ' antrean aktif.';
        }
      }

      // 2. Cek data transaksi pembelian Lynk.id terbaru yang belum isi form
      let unfilledBuyerCount = 0;
      let newestBuyerName = '';
      let newestBuyerEmail = '';
      let newestBuyerProduct = '';

      try {
        const sharedContext = (memberResult && memberResult._registeredEmails) ? {
          registeredFormEmails: memberResult._registeredEmails,
          registeredFormNames: memberResult._registeredNames
        } : null;
        const unfilledResult = getUnfilledFormsData(sharedContext);
        if (unfilledResult && unfilledResult.success && unfilledResult.unfilledList && unfilledResult.unfilledList.length > 0) {
          unfilledBuyerCount = unfilledResult.totalUnfilled || unfilledResult.unfilledList.length;
          const firstBuyer = unfilledResult.unfilledList[0];
          newestBuyerName = firstBuyer.nama || '';
          newestBuyerEmail = firstBuyer.email || '';
          newestBuyerProduct = firstBuyer.jenisMentoring || firstBuyer.addon || 'Private Mentoring';
        }
      } catch (errUnfilled) {
        // Fallback jika sheet transaksi belum terisi
      }
      
      responseData = {
        success: true,
        needsActionCount: needsActionCount,
        newestMember: newestMember,
        lastNotifiedMemberEmail: lastNotifiedMemberEmail,
        duplicateCount: duplicateCount,
        duplicateDetails: duplicateDetails,
        summaryTitle: summaryTitle,
        summaryBody: summaryBody,
        unfilledBuyerCount: unfilledBuyerCount,
        newestBuyerName: newestBuyerName,
        newestBuyerEmail: newestBuyerEmail,
        newestBuyerProduct: newestBuyerProduct
      };
    } catch (err) {
      responseData = { success: false, error: err.toString() };
    }
  } else if (action === 'save_templates') {
    let templates = params.templates;
    if (typeof templates === 'string') {
      try { templates = JSON.parse(templates); } catch(err) {}
    }
    responseData = saveTemplates(templates);
  } else if (action === 'get_templates') {
    let templates = [];
    try {
      const templatesStr = PropertiesService.getScriptProperties().getProperty('WA_TEMPLATES');
      templates = templatesStr ? JSON.parse(templatesStr) : [
        { id: 't1', title: 'Sambutan', text: dapatkanTemplatePesanDefault() }
      ];
    } catch(e) {
      templates = [{ id: 't1', title: 'Sambutan', text: dapatkanTemplatePesanDefault() }];
    }
    responseData = { success: true, templates: templates };
  } else if (action === 'simpan_kontak') {
    const forceSave = params.forceSave === true || params.forceSave === 'true';
    responseData = simpanKontakManual(params.nama, params.email, params.wa, forceSave);
  } else if (action === 'kirim_wa') {
    responseData = kirimWaManual(params.target, params.pesan);
  } else if (action === 'invite_group_member') {
    responseData = inviteMemberToGroupFonnte(params.nama, params.target);
  } else if (action === 'fetch_fonnte_groups') {
    responseData = fetchFonnteGroupList();
  } else if (action === 'catat_aksi') {
    responseData = catatAksiSukses(params.email, params.tipeAksi, params.rowNumber, params.wa);
  } else if (action === 'catat_gemini_copied_massal') {
    let emails = params.emails;
    if (typeof emails === 'string') {
      try { emails = JSON.parse(emails); } catch(err) {}
    }
    responseData = catatGeminiCopiedMassal(emails);
  } else if (action === 'edit_pendaftar') {
    responseData = editPendaftar(params.rowNumber, params.nama, params.email, params.wa, params.batasMentoring, params.emailBaru);
  } else if (action === 'hapus_pendaftar') {
    responseData = hapusPendaftar(params.rowNumber);
  } else if (action === 'get_unfilled_forms') {
    responseData = getUnfilledFormsData(null, params.force_fresh === true || params.force_fresh === 'true');
  } else if (action === 'mark_isi_form') {
    responseData = markIsiFormManual(params.email, params.rowNumber, params.formEmail, params.phone, params.name);
  } else if (action === 'unmark_isi_form') {
    responseData = unmarkIsiFormManual(params.email, params.rowNumber);
  } else if (action === 'bulk_mark_member_done') {
    let emails = [];
    if (Array.isArray(params.emails)) emails = params.emails;
    else if (typeof params.emails === 'string') {
      try { emails = JSON.parse(params.emails); } catch(e) { emails = [params.emails]; }
    }
    responseData = bulkMarkMemberDoneManual(emails);
  } else if (action === 'bulk_unmark_member_done') {
    let emails = [];
    if (Array.isArray(params.emails)) emails = params.emails;
    else if (typeof params.emails === 'string') {
      try { emails = JSON.parse(params.emails); } catch(e) { emails = [params.emails]; }
    }
    responseData = bulkUnmarkMemberDoneManual(emails);
  } else if (action === 'mark_member_done') {
    responseData = markMemberDoneManual(params.email);
  } else if (action === 'unmark_member_done') {
    responseData = unmarkMemberDoneManual(params.email);
  } else if (action === 'bulk_remark_transactions') {
    let rowNumbers = params.rowNumbers;
    if (typeof rowNumbers === 'string') {
      try { rowNumbers = JSON.parse(rowNumbers); } catch(err) {}
    }
    let emails = params.emails;
    if (typeof emails === 'string') {
      try { emails = JSON.parse(emails); } catch(err) {}
    }
    let phones = params.phones;
    if (typeof phones === 'string') {
      try { phones = JSON.parse(phones); } catch(err) {}
    }
    let names = params.names;
    if (typeof names === 'string') {
      try { names = JSON.parse(names); } catch(err) {}
    }
    responseData = bulkRemarkTransactions({ rowNumbers: rowNumbers, emails: emails, phones: phones, names: names });
  } else if (action === 'bulk_unmark_transactions') {
    let rowNumbers = params.rowNumbers;
    if (typeof rowNumbers === 'string') {
      try { rowNumbers = JSON.parse(rowNumbers); } catch(err) {}
    }
    let emails = params.emails;
    if (typeof emails === 'string') {
      try { emails = JSON.parse(emails); } catch(err) {}
    }
    responseData = bulkUnmarkTransactions({ rowNumbers: rowNumbers, emails: emails });
  } else if (action === 'reset_all_lynk_remarks') {
    responseData = resetAllLynkRemarks();
  } else if (action === 'confirm_whitelist') {
    responseData = confirmWhitelistMember(params.email, params.rowNumber);
  } else if (action === 'bulk_confirm_whitelist') {
    let rowNumbers = params.rowNumbers;
    if (typeof rowNumbers === 'string') {
      try { rowNumbers = JSON.parse(rowNumbers); } catch(err) {}
    }
    let emails = params.emails;
    if (typeof emails === 'string') {
      try { emails = JSON.parse(emails); } catch(err) {}
    }
    responseData = bulkConfirmWhitelist({ rowNumbers: rowNumbers, emails: emails });
  } else if (action === 'unconfirm_whitelist') {
    responseData = unconfirmWhitelistMember(params.email, params.rowNumber);
  } else if (action === 'bulk_unconfirm_whitelist') {
    let rowNumbers = params.rowNumbers;
    if (typeof rowNumbers === 'string') {
      try { rowNumbers = JSON.parse(rowNumbers); } catch(err) {}
    }
    let emails = params.emails;
    if (typeof emails === 'string') {
      try { emails = JSON.parse(emails); } catch(err) {}
    }
    responseData = bulkUnconfirmWhitelist({ rowNumbers: rowNumbers, emails: emails });
  } else if (action === 'send_to_supabase') {
    let members = params.members;
    if (typeof members === 'string') {
      try { members = JSON.parse(members); } catch(err) {}
    }
    responseData = sendMembersToSupabase(members, params.supabaseUrl, params.supabaseKey, params.tableName, params.colEmail, params.colName);
  } else if (action === 'update_supabase_email') {
    responseData = updateSupabaseMemberEmail(params.oldEmail, params.newEmail, params.supabaseUrl, params.supabaseKey, params.tableName, params.colEmail);
  } else if (action === 'catat_supabase_sent') {
    responseData = catatSupabaseSent(params.email, params.id);
  } else if (action === 'register_fcm_token') {
    if (params.fcmToken) {
      PropertiesService.getScriptProperties().setProperty('FCM_DEVICE_TOKEN', params.fcmToken);
      responseData = { success: true, message: 'FCM Device Token berhasil didaftarkan.' };
    } else {
      responseData = { success: false, message: 'fcmToken tidak boleh kosong.' };
    }
  } else if (action === 'send_test_fcm') {
    testSendFcmNotification();
    responseData = { success: true, message: 'Tes notifikasi FCM telah dikirim ke perangkat.' };
  } else if (action === 'setup_trigger') {
    const msg = setupFormSubmitTrigger();
    responseData = { success: true, message: msg };
  } else if (action === 'test_auto_save_contact') {
    responseData = testAutoSaveContact();
  } else if (action === 'check_contact_system') {
    responseData = cekStatusSistemKontak();
  } else if (action === 'check_tiktok_live') {
    responseData = checkTikTokLiveStatusServer(params.username || 'zettbos');
  } else if (!action) {
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('Zettbos Private Mentoring - Admin Dashboard')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
  }

  if (responseData === null) {
    responseData = { success: false, message: 'Action "' + action + '" tidak dikenal.' };
  }

  // Jika dipanggil via google.script.run, kembalikan Objek JavaScript polos (Direct Object Return)
  if (e && typeof e === 'object' && !e.parameter && !e.postData && e.action) {
    return responseData;
  }

  // Jika dipanggil via REST API HTTP (fetch/doGet/doPost), kembalikan ContentService JSON TextOutput
  return ContentService.createTextOutput(JSON.stringify(responseData))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return handleApiRequest(e);
}

function doPost(e) {
  return handleApiRequest(e);
}

/**
 * Konfigurasi Akun Layanan Firebase Resmi (HTTP v1 API)
 */
const DEFAULT_FIREBASE_SERVICE_ACCOUNT = {
  "type": "service_account",
  "project_id": "private-mentoring",
  "private_key_id": "7a3671a12b8179ba51b0dfef2e35d41f18e9e833",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDOw1q9PwE36Dx6\n2lLqHD5BhTAqemCSo0s2nT5PfgfARHa4UWQbH+6qFkf1Ijwxls5wPE5aceyrmEWZ\nhVRaRp0x3vrqquHwoYAwDLZsCn2UPiNvqwwf6pPmS9WeN1JAC4VTCNp5drdPgMKO\na44gUCDCgN2HfOtG0qX0jCMpBMmpOD2FXL0ZBjl/EY35ft1o8rGhdqdTql5S4WNL\nkit4Wuv06/qwZD/2QqeLr7yuoRM1EWyCL9dmoz9rN8Ijl6Nk1uMapQZpdbzBLX21\nX2PoERV6I2hpgSsE5qexlm5vFBWHQqCZfrFjZ5PTzVfTi+F68bYUAyxTvbbwmeHK\npz4tK6SLAgMBAAECggEAHMGEAoNGDXB5zjGZtoBBvaW4Z9qn87z3iPD1lDitpfU0\n+GLZeVbyP9WOzG5RJinDLE42131gsmd1xpQ0gcRbDcSP68iNroRyP5HaYnb9tXsE\nPVOcrBOuiNOjMg308n39B5SuTeuk3aRwFT6q1Z5PRWiGvCveIkt0U+k+5UWKhm4m\nmLn2X5e+htdsAUAohFY7eOpKccWgtfri5inEjHy5Hd2gtJCH7lq8tgswAwC4HD++\nTrgvSVZYD5zoc8upg+KkGhQYRCKmc8V9uFaD1cwaz7+t6U1xnWccAr1j731gJwGd\nIJTEw1KXeWCkuwW2hQjSDD+LBskulBDyChRKH83BAQKBgQDttrZwR7xC8yvE/07q\nvpbzoRWbRXWB3UXkXFb1ADCcE4cNLFvrci78r9yIfWkX63kfgUhI1ITbHuBZNC2\nf0tNqnoBduOvMAB6iW+EdbwKWJOmZyBOedjnCBz1S6M11xvUH+jxdhMlkTj/x29R\n2YieDsveH/qGF91SQsvtODib+QKBgQDeqyHoCV19QIiIUl/oWmchyf3JzoqfxBLu\nzVJHq4JiTrSCWcLouyT5p/7za2UEQ7eRy8+xRudgjj/YnifrHKDHtjEYVu0hdZPh\nOqXU6iuIefIW1zfPgYV5YehvCj0OAGRl9BBugsTGAOQWjwnxcctPc7hf2Z4KbTJt\nhGIp5SY9owKBgQDcCd0mYcCqWF2TpKBwOquQKPPPHqR+6Uvg7nivoNVeI9VHJF8y\nMTM2hqUgCL9QwCA++UfWPNOkly5bv+5Sf9I8uijlYh+v8kb/JmjLvA+rpAJIbf1B\npxhYAvKLPNB+7fcci80cdaeThrG0Ue+BXFNRu3CK1B8aMMz1cE9D7l64QQKBgG/l\nhAZ9HlQhJ/uJmdTECWu7fCP7/UHIYNNMrvqBP+ZzMtcGkKIv2ab0O3TMFVmNRiSo\nTVkDDqdBFOigoeLO4iU6c3WNyWC1G3ll5YwXmYTd80BzKwLGTfLvtsSGWqQ8ojdx\n7Qf8AzKVpAmKHC8PRmJI/vB8BaWrtlm+2y2+j/cNAoGAQ5wrSuadA1Nbp5t/I3Ph\nCP2LlyGPSgt0O5YYsmEXVSm8CwbcJ9UmMeh5EMYOgCQS0fSwjakHpvoOjj5Rjffu\n7tqBWCFRPbVOdHifTjV46dX+tGvM1TJRTvOIlT6t3qFyeIr423h0Lm3q3bwleZEU\n0qHYBAZrhzWrJtlTkWdmrH8=\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@private-mentoring.iam.gserviceaccount.com",
  "client_id": "102885705737128909094"
};

/**
 * Mendapatkan Access Token OAuth2 untuk Firebase Cloud Messaging API (HTTP v1)
 * Menggunakan JWT Signature native Google Apps Script (Utilities.computeRsaSha256Signature)
 */
function getFirebaseV1AccessToken(sa) {
  try {
    const cache = CacheService.getScriptCache();
    const cachedToken = cache.get('FCM_V1_ACCESS_TOKEN');
    if (cachedToken) {
      return cachedToken;
    }

    const now = Math.floor(Date.now() / 1000);
    const header = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claimSet = Utilities.base64EncodeWebSafe(JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now
    }));

    const privateKey = (sa.private_key || '').replace(/\\n/g, '\n');
    const toSign = header + "." + claimSet;
    const signature = Utilities.computeRsaSha256Signature(toSign, privateKey);
    const jwt = toSign + "." + Utilities.base64EncodeWebSafe(signature);

    const tokenResponse = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
      method: "post",
      contentType: "application/x-www-form-urlencoded",
      payload: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + jwt,
      muteHttpExceptions: true
    });

    const resJson = JSON.parse(tokenResponse.getContentText());
    if (resJson && resJson.access_token) {
      // Cache token selama 50 menit (3000 detik)
      cache.put('FCM_V1_ACCESS_TOKEN', resJson.access_token, 3000);
      return resJson.access_token;
    } else {
      Logger.log("Gagal membuat OAuth2 token dari Service Account: " + tokenResponse.getContentText());
      return null;
    }
  } catch (err) {
    Logger.log("Error getFirebaseV1AccessToken: " + err.toString());
    return null;
  }
}

/**
 * Mengirim notifikasi Push FCM ke perangkat Android
 * Menggunakan Firebase HTTP v1 API (Standar Resmi Google)
 */
function sendFcmNotification(title, body, dataPayload) {
  const scriptProps = PropertiesService.getScriptProperties();
  const saString = scriptProps.getProperty('FIREBASE_SERVICE_ACCOUNT');
  let sa = null;
  if (saString) {
    try { sa = JSON.parse(saString); } catch(e) {}
  }
  if (!sa) {
    sa = DEFAULT_FIREBASE_SERVICE_ACCOUNT;
  }

  const fcmServerKey = scriptProps.getProperty('FCM_SERVER_KEY');
  const fcmDeviceToken = scriptProps.getProperty('FCM_DEVICE_TOKEN');

  const cleanData = {};
  if (dataPayload && typeof dataPayload === 'object') {
    for (const k in dataPayload) {
      cleanData[k] = String(dataPayload[k] || '');
    }
  }

  // JALUR 1: FIREBASE HTTP V1 API (Modern & Didukung Penuh Google)
  if (sa && sa.client_email && sa.private_key) {
    try {
      const accessToken = getFirebaseV1AccessToken(sa);
      if (accessToken) {
        const projectId = sa.project_id || 'private-mentoring';
        const url = 'https://fcm.googleapis.com/v1/projects/' + projectId + '/messages:send';

        const messageObj = {
          notification: {
            title: title,
            body: body
          },
          data: Object.assign({}, cleanData, { title: title, body: body }),
          android: {
            priority: 'high',
            notification: {
              channel_id: 'zettbos_member_channel',
              sound: 'default'
            }
          }
        };

        if (cleanData.url) {
          messageObj.webpush = {
            fcm_options: {
              link: cleanData.url
            }
          };
        }

        if (false) {
          // Topic admin_notif delivers to all installed devices
        } else {
          messageObj.topic = 'admin_notif';
        }

        const options = {
          method: 'post',
          contentType: 'application/json',
          headers: {
            'Authorization': 'Bearer ' + accessToken
          },
          payload: JSON.stringify({ message: messageObj }),
          muteHttpExceptions: true
        };

        const res = UrlFetchApp.fetch(url, options);
        Logger.log("FCM v1 Response: " + res.getContentText());
        return res.getContentText();
      }
    } catch (e1) {
      Logger.log("FCM v1 Error: " + e1.toString());
    }
  }

  // JALUR 2: LEGACY API (Fallback jika menggunakan server key)
  if (fcmServerKey) {
    try {
      const targetRecipient = fcmDeviceToken || '/topics/admin_notif';
      const url = 'https://fcm.googleapis.com/fcm/send';
      const payload = {
        to: targetRecipient,
        priority: 'high',
        notification: {
          title: title,
          body: body,
          sound: 'default'
        },
        data: cleanData
      };
      const options = {
        method: 'post',
        contentType: 'application/json',
        headers: {
          'Authorization': 'key=' + fcmServerKey
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      };
      const res = UrlFetchApp.fetch(url, options);
      Logger.log("Legacy FCM Response: " + res.getContentText());
      return res.getContentText();
    } catch (e2) {
      Logger.log("Legacy FCM Error: " + e2.toString());
    }
  }

  Logger.log("Peringatan: Belum ada konfigurasi FCM.");
}

/**
 * Tes pengiriman Push Notification FCM ke HP admin
 */
function testSendFcmNotification() {
  sendFcmNotification(
    "🔔 Tes Push Notifikasi Zettbos",
    "Koneksi FCM aktif! Notifikasi ini akan masuk meskipun aplikasi sedang ditutup.",
    { type: "test", timestamp: new Date().toISOString() }
  );
  return "Tes FCM telah dikirim.";
}

/**
 * Otomatisasi pendaftaran Trigger onFormSubmit dari Spreadsheet
 * Jalankan fungsi ini 1x di editor Apps Script agar form pendaftaran memicu notifikasi otomatis
 */
function setupFormSubmitTrigger() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      return "Peringatan: Spreadsheet aktif tidak ditemukan. Pastikan project Apps Script terhubung ke Google Sheets formulir Anda.";
    }

    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'onFormSubmit') {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }

    ScriptApp.newTrigger('onFormSubmit')
      .forSpreadsheet(ss)
      .onFormSubmit()
      .create();

    Logger.log("Trigger onFormSubmit berhasil dibuat otomatis.");
    return "Sukses: Trigger onFormSubmit telah terpasang di Spreadsheet.";
  } catch (err) {
    Logger.log("Gagal membuat trigger: " + err.toString());
    return "Error: " + err.toString();
  }
}

/**
 * Trigger otomatis ketika form disubmit
 */
function onFormSubmit(e) {
  let nama = '';
  let email = '';
  let waRaw = '';

  if (e && e.values && Array.isArray(e.values)) {
    const rowData = e.values;
    nama = rowData[1] || ''; 
    email = rowData[2] || ''; 
    waRaw = rowData[3] || '';  
  } else if (e && e.namedValues) {
    // Fallback jika event object menggunakan namedValues (Google Forms linked)
    for (const key in e.namedValues) {
      const k = key.toLowerCase();
      const val = Array.isArray(e.namedValues[key]) ? (e.namedValues[key][0] || '') : (e.namedValues[key] || '');
      if (k.includes('nama') || k.includes('name')) nama = val;
      else if (k.includes('email')) email = val;
      else if (k.includes('wa') || k.includes('whatsapp') || k.includes('telepon') || k.includes('hp') || k.includes('phone') || k.includes('nomor')) waRaw = val;
    }
  } else if (e && e.range) {
    // Fallback jika hanya e.range yang dikirim
    try {
      const vals = e.range.getValues();
      if (vals && vals[0]) {
        nama = vals[0][1] || '';
        email = vals[0][2] || '';
        waRaw = vals[0][3] || '';
      }
    } catch(errRange) {}
  }

  if (!nama && !email && !waRaw) {
    Logger.log("Trigger onFormSubmit dipanggil tanpa event data yang valid (kemungkinan diuji secara manual tanpa payload). Jalankan testAutoSaveContact() untuk tes simulasi.");
    return;
  }

  // Bersihkan format nomor WA
  const targetNo = cleanPhone(waRaw);

  Logger.log('Trigger Form Submit - Nama: ' + nama + ' | WA Input: ' + waRaw + ' -> WA Cleaned: ' + targetNo);

  // Simpan Kontak Otomatis (People API dengan fallback ContactsApp) jika nomor valid
  if (targetNo) {
    simpanKontakKeGoogle(nama, email, targetNo);
  }

  // Ambil template pesan pertama dari Settings jika ada, atau gunakan default
  let pesan = dapatkanTemplatePesanDefault();
  try {
    const templatesStr = PropertiesService.getScriptProperties().getProperty('WA_TEMPLATES');
    if (templatesStr) {
      const templates = JSON.parse(templatesStr);
      if (templates.length > 0 && templates[0].text) {
        pesan = templates[0].text;
      }
    }
  } catch (err) {
    Logger.log("Gagal membaca template: " + err.toString());
  }

  // Kirim WhatsApp sambutan otomatis jika nomor valid
  if (targetNo) {
    kirimKeFonnte(targetNo, pesan);
    if (email) {
      catatAksiSukses(email, 'template_0', null, targetNo);
    }
  }

  // Cek duplikasi data dari Sheet Kolom F (countif email) dan Kolom G (countif WA)
  let countEmail = 1;
  let countWa = 1;
  let isDupEmail = false;
  let isDupWa = false;
  let hasDuplicate = false;
  let targetRow = 0;
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Form Responses 1") || ss.getActiveSheet();
    if (e && e.range) {
      targetRow = e.range.getRow();
    } else {
      targetRow = sheet.getLastRow();
    }
    if (targetRow > 1) {
      const rowVals = sheet.getRange(targetRow, 1, 1, 7).getValues()[0];
      countEmail = Number(rowVals[5]) || 1; // Kolom F =countif(C:C;C...)
      countWa = Number(rowVals[6]) || 1;    // Kolom G =countif(D:D;D...)
      isDupEmail = countEmail > 1;
      isDupWa = countWa > 1;
      hasDuplicate = isDupEmail || isDupWa;
    }
  } catch (errCheck) {
    Logger.log("Gagal cek duplikat di Kolom F/G: " + errCheck.toString());
  }

  // Push otomatis pendaftar baru langsung ke Supabase Database 3 (<100ms untuk APK)
  try {
    syncNewFormMemberToDb3(targetRow, nama, email, waRaw, targetNo, countEmail, countWa, hasDuplicate);
  } catch (errDb3) {
    Logger.log("Gagal auto-push ke Supabase DB 3: " + errDb3.toString());
  }

  // Format Notifikasi Ringkas & Padat ke APK
  let notifTitle = '';
  let notifBody = '';
  const namaSiswa = nama || 'Siswa Baru';

  if (hasDuplicate) {
    const dupParts = [];
    if (isDupEmail) dupParts.push('Email ' + countEmail + 'x');
    if (isDupWa) dupParts.push('WA ' + countWa + 'x');
    notifTitle = '⚠️ Pendaftar (Data Kembar!): ' + namaSiswa;
    notifBody = namaSiswa + ' mendaftar. Terdeteksi data kembar (' + dupParts.join(', ') + ') di Sheet. Cek aplikasi.';
  } else {
    notifTitle = '📝 1 Siswa Baru: ' + namaSiswa;
    notifBody = namaSiswa + ' baru saja mengisi form pendaftaran (Data baru unik).';
  }

  // Kirim Notifikasi Push Real-Time ke APK HP
  sendFcmNotification(
    notifTitle,
    notifBody,
    { email: email, nama: nama, hasDuplicate: String(hasDuplicate) }
  );

  // Bersihkan cache dashboard agar pendaftar baru seketika tampil (<100ms) di APK
  invalidateDashboardDataCache();
}

/**
 * Push otomatis baris pendaftar form terbaru ke Supabase Database 3 (mentoring_members)
 */
function syncNewFormMemberToDb3(rowId, nama, email, waRaw, waClean, countEmail, countWa, hasDuplicate) {
  const idVal = Number(rowId) > 1 ? Number(rowId) : Date.now();
  const now = new Date();
  const batas = new Date(now.getTime() + 90 * 86400000);
  const cleanEmail = (email || '').toString().trim().toLowerCase() || ('row-' + idVal + '@mentoring.local');
  const dupReasons = [];
  if (countEmail > 1) dupReasons.push('Email ' + countEmail + 'x');
  if (countWa > 1) dupReasons.push('WA ' + countWa + 'x');

  const payload = [{
    id: idVal,
    nama: (nama || '').toString().trim() || cleanEmail.split('@')[0],
    email: cleanEmail,
    wa: (waRaw || waClean || '').toString().trim() || null,
    wa_clean: waClean || null,
    batch: CONTACT_SUFFIX || '- Member #4',
    timestamp_form: now.toISOString(),
    timestamp_ms: now.getTime(),
    is_done: false,
    contact_saved: true,
    action_status: {
      contactSaved: true,
      geminiCopied: false,
      templates: { '0': true, 'template_0': true },
      batasMentoring: formatDateTimeFast(batas),
      countEmail: countEmail || 1,
      countWa: countWa || 1,
      emailBaru: '',
      isWhitelisted: false,
      manualDone: false,
      origEmail: cleanEmail,
      rowNumber: idVal
    },
    has_duplicate: Boolean(hasDuplicate),
    duplicate_reason: dupReasons.length > 0 ? dupReasons.join(', ') : null,
    updated_at: now.toISOString()
  }];

  UrlFetchApp.fetch(DEFAULT_MENTORING_DB_URL + '/rest/v1/mentoring_members?on_conflict=id', {
    method: 'post',
    headers: {
      'apikey': DEFAULT_MENTORING_DB_KEY,
      'Authorization': 'Bearer ' + DEFAULT_MENTORING_DB_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

/**
 * Pembersih dan Normalisasi Nomor Telepon WhatsApp Komprehensif
 * Mendukung nomor Indonesia (08xx, 628xx) & Internasional (Korea +82, Malaysia +60, Singapura +65, Brunei +673, dll)
 */
function cleanPhone(waRaw) {
  if (!waRaw) return '';
  if (waRaw instanceof Date) return '';
  let str = waRaw.toString().trim().replace(/\\u003a/gi, ':');
  if (!str) return '';

  // Abaikan teks tanggal/jam murni
  if (/^\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,4}/.test(str)) {
    return '';
  }

  // Jika berupa JSON atau ada kurung, ambil nomor HP dari dalamnya
  try {
    if (str.includes('{') || str.includes('[')) {
      const digitMatches = str.match(/\+?\d{8,16}/g);
      if (digitMatches && digitMatches.length > 0) {
        str = digitMatches[0];
      }
    }
  } catch (e) {}

  const hadPlus = str.startsWith('+');
  let digits = str.replace(/\D/g, '');
  if (!digits || digits.length < 8 || digits.length > 16) return '';

  // 0. KOREKSI KHUSUS INTERNASIONAL SEBELUM PENGECEKAN LAIN
  // Di Indonesia TIDAK ADA nomor HP berawalan 6210. 
  // Nomor seperti +621097879920 atau 621097879920 adalah nomor Korea Selatan (010) yang salah diberi awalan 62.
  if (digits.startsWith('6210') && digits.length === 12) {
    return '8210' + digits.substring(4);
  }

  // Koreksi nomor Malaysia yang salah diberi awalan 6201 (misal 620123456789 -> 60123456789)
  if (digits.startsWith('6201') && digits.length >= 11 && digits.length <= 12) {
    return '601' + digits.substring(4);
  }

  // 1. Jika pengguna menginput awalan + (misal +821097879920, +60123456789, +628123456789)
  if (hadPlus) {
    if (digits.startsWith('6208')) return '628' + digits.substring(4);
    return digits;
  }

  // 2. Awalan 00 (dial internasional)
  if (digits.startsWith('00')) {
    digits = digits.substring(2);
  }

  // 3. Nomor Indonesia standar: 08xx -> 628xx
  if (digits.startsWith('08')) {
    return '628' + digits.substring(2);
  }

  // 4. Nomor Korea Selatan: lokal 010-xxxx-xxxx (11 digit: 010 + 8 digit)
  if (digits.startsWith('010') && digits.length === 11) {
    return '8210' + digits.substring(3);
  }

  // 5. Nomor Malaysia: lokal 01x-xxxxxxx (10-11 digit, misal 011, 012, 014, 016, 017, 018, 019)
  if (digits.startsWith('01') && digits.length >= 10 && digits.length <= 11) {
    return '60' + digits.substring(1);
  }

  // 6. Nomor yang sebelumnya keliru di-replace dengan awalan 6210 (12 digit, misal 621097879920)
  // Di Indonesia tidak ada awalan HP 6210. Ini adalah nomor Korea 010 yang salah diubah jadi 6210.
  if (digits.startsWith('6210') && digits.length === 12) {
    return '8210' + digits.substring(4);
  }

  // 7. Jika berawalan kode negara internasional sah
  const intlPrefixes = ['62', '60', '65', '673', '82', '81', '886', '852', '61', '1', '44', '966', '971', '974'];
  for (let i = 0; i < intlPrefixes.length; i++) {
    const p = intlPrefixes[i];
    if (digits.startsWith(p) && digits.length >= (p.length + 6)) {
      if (p === '62' && digits.startsWith('6208')) return '628' + digits.substring(4);
      return digits;
    }
  }

  // 8. Awalan 8xx Indonesia (tanpa 0 di depan, misal 8123456789)
  if (digits.startsWith('8') && !digits.startsWith('82026') && digits.length >= 9 && digits.length <= 13) {
    return '62' + digits;
  }

  // 9. Awalan 0 biasa (fallback Indonesia)
  if (digits.startsWith('0')) {
    return '62' + digits.substring(1);
  }

  return digits;
}

/**
 * Helper untuk parsing tanggal format Indonesia (DD/MM/YYYY, nama bulan teks, ISO, atau Date Object) secara presisi
 */
function parseIndonesianDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    // Jika user menginput tanggal hari ini tanpa jam (jam 00:00:00), gunakan waktu sekarang agar langsung tampil di antrean Perlu Tindakan!
    const nowD = new Date();
    if (val.getFullYear() === nowD.getFullYear() && val.getMonth() === nowD.getMonth() && val.getDate() === nowD.getDate()) {
      if (val.getHours() === 0 && val.getMinutes() === 0 && val.getSeconds() === 0) {
        return nowD;
      }
    }
    return val;
  }
  const str = val.toString().trim();
  if (!str) return null;

  // Kamus bulan bahasa Indonesia
  const indoMonths = {
    'januari': 0, 'jan': 0,
    'februari': 1, 'feb': 1,
    'maret': 2, 'mar': 2,
    'april': 3, 'apr': 3,
    'mei': 4, 'may': 4,
    'juni': 5, 'jun': 5,
    'juli': 6, 'jul': 6,
    'agustus': 7, 'agu': 7, 'agt': 7,
    'september': 8, 'sep': 8,
    'oktober': 9, 'okt': 9, 'oct': 9,
    'november': 10, 'nov': 10,
    'desember': 11, 'des': 11, 'dec': 11
  };

  // 1. Cek format dengan nama bulan teks (e.g. "09 Februari 2026 14:30:00" atau "9-Feb-2026")
  const textMonthMatch = str.match(/(\d{1,2})[\s\-]+([a-zA-Z]+)[\s\-]+(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (textMonthMatch) {
    const day = parseInt(textMonthMatch[1], 10);
    const mName = textMonthMatch[2].toLowerCase();
    if (indoMonths.hasOwnProperty(mName)) {
      const monthNum = indoMonths[mName];
      const year = parseInt(textMonthMatch[3], 10);
      const hr = textMonthMatch[4] ? parseInt(textMonthMatch[4], 10) : 0;
      const min = textMonthMatch[5] ? parseInt(textMonthMatch[5], 10) : 0;
      const sec = textMonthMatch[6] ? parseInt(textMonthMatch[6], 10) : 0;
      return new Date(year, monthNum, day, hr, min, sec);
    }
  }

  // 2. Pola standard DD/MM/YYYY atau DD-MM-YYYY
  const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);
    const hasTime = match[4] !== undefined;
    const hr = match[4] ? parseInt(match[4], 10) : 0;
    const min = match[5] ? parseInt(match[5], 10) : 0;
    const sec = match[6] ? parseInt(match[6], 10) : 0;

    // Jika user menginput tanggal hari ini tanpa jam ATAU jam 00:00:00 (misal 22/10/2026 atau 22/10/2026 00:00:00), gunakan waktu sekarang agar langsung tampil di Perlu Tindakan
    const nowD = new Date();
    if (nowD.getFullYear() === year && nowD.getMonth() === month && nowD.getDate() === day) {
      if (!hasTime || (hr === 0 && min === 0 && sec === 0)) {
        return nowD;
      }
    }
    return new Date(year, month, day, hr, min, sec);
  }

  // 3. Pola ISO YYYY-MM-DD atau YYYY/MM/DD
  const mIso = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (mIso) {
    const year = parseInt(mIso[1], 10);
    const month = parseInt(mIso[2], 10) - 1;
    const day = parseInt(mIso[3], 10);
    const hr = mIso[4] ? parseInt(mIso[4], 10) : 0;
    const min = mIso[5] ? parseInt(mIso[5], 10) : 0;
    const sec = mIso[6] ? parseInt(mIso[6], 10) : 0;
    return new Date(year, month, day, hr, min, sec);
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Normalisasi tanggal transaksi Lynk.id agar selalu berformat DD/MM/YYYY HH:mm (WIB)
 * dan memperbaiki bug salah baca bulan/hari akibat US Locale (misal 06-11-2026 terbaca Jun 11 2026).
 */
function normalizeLynkDateString(rawVal) {
  if (!rawVal) return '';
  const pad = n => (n < 10 ? '0' : '') + n;

  if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    let d = rawVal.getDate();
    let m = rawVal.getMonth() + 1;
    const y = rawVal.getFullYear();
    const hh = pad(rawVal.getHours());
    const mm = pad(rawVal.getMinutes());
    // Jika Google Sheets US Locale menukar DD-MM (contoh: 06/11/2026 jadi 11 Juni 2026 -> d=11, m=6)
    if (y === 2026 && d === 11 && m >= 1 && m <= 10) {
      return pad(m) + '/11/' + y + ' ' + hh + ':' + mm;
    }
    return pad(d) + '/' + pad(m) + '/' + y + ' ' + hh + ':' + mm;
  }

  const str = rawVal.toString().trim();
  // 1. Jika sudah berformat DD-MM-YYYY HH:mm atau DD/MM/YYYY HH:mm
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmyMatch) {
    const day = pad(parseInt(dmyMatch[1], 10));
    const month = pad(parseInt(dmyMatch[2], 10));
    const year = dmyMatch[3];
    const hh = dmyMatch[4] !== undefined ? pad(parseInt(dmyMatch[4], 10)) : '00';
    const mm = dmyMatch[5] !== undefined ? pad(parseInt(dmyMatch[5], 10)) : '00';
    return day + '/' + month + '/' + year + ' ' + hh + ':' + mm;
  }

  // 2. Jika berformat Date.toString() (contoh: "Thu Jun 11 2026 10:52:00 GMT+0700")
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    let d = parsed.getDate();
    let m = parsed.getMonth() + 1;
    const y = parsed.getFullYear();
    const hh = pad(parsed.getHours());
    const mm = pad(parsed.getMinutes());
    if (y === 2026 && d === 11 && m >= 1 && m <= 10) {
      return pad(m) + '/11/' + y + ' ' + hh + ':' + mm;
    }
    return pad(d) + '/' + pad(m) + '/' + y + ' ' + hh + ':' + mm;
  }

  return str;
}

/**
 * Mengubah string DD/MM/YYYY HH:mm menjadi epoch milliseconds (WIB)
 */
function parseNormalizedLynkDateMs(normStr) {
  if (!normStr) return 0;
  const m = normStr.toString().trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2}))?/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const year = parseInt(m[3], 10);
    const hh = m[4] !== undefined ? parseInt(m[4], 10) : 0;
    const mm = m[5] !== undefined ? parseInt(m[5], 10) : 0;
    return new Date(year, month, day, hh, mm, 0).getTime();
  }
  const d = new Date(normStr);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Helper untuk memeriksa apakah transaksi di Sheet UPDATE / Transactions dianggap "Sudah Isi Form / Remarked".
 * ATURAN BARU:
 * - Pembeli historis s/d 06/11/2026 10:52 tetap berstatus Remarked (kecuali di-unmark manual oleh Admin).
 * - Pembeli baru (setelah 06/11/2026 10:52) TIDAK AKAN PERNAH otomatis Remarked dari rumus Kolom L (Isi Form)
 *   maupun pergeseran nomor baris (row_2), melainkan HANYA jika dikonfirmasi manual oleh Admin!
 */
function isTransactionFilled(row, cleanEmail, cleanNama, registeredFormEmails, registeredFormNames, remarkedEmails, rowNumber, markedMap, colIsiForm, normTimestamp) {
  const normTs = normTimestamp || normalizeLynkDateString(row ? row[0] : '');
  const txKey = 'tx_' + (cleanEmail || cleanNama || rowNumber) + '_' + normTs;

  // 1. Jika Admin secara eksplisit membatalkan remark (unmark) untuk transaksi ini
  if (markedMap) {
    if (markedMap[txKey] === false || (cleanEmail && markedMap['unmark_' + cleanEmail] === true)) {
      return false;
    }
    // 2. Jika Admin secara eksplisit menandai remark manual untuk transaksi ini
    if (markedMap[txKey] === true || (cleanEmail && markedMap['manual_email_' + cleanEmail] === true)) {
      return true;
    }
  }

  // 3. Batas waktu cutoff 60 transaksi historis yang sudah selesai: 06/11/2026 10:52 WIB
  const txMs = parseNormalizedLynkDateMs(normTs);
  const cutoffHistoricalMs = new Date(2026, 10, 6, 10, 52, 59).getTime(); // 06 Nov 2026 10:52:59
  if (txMs > 0 && txMs <= cutoffHistoricalMs) {
    return true;
  }

  // 4. Untuk pembeli baru (next pembeli setelah 06/11/2026 10:52), JANGAN auto-remark!
  return false;
}

/**
 * Helper pemformat tanggal super cepat dalam memori JavaScript V8 (WIB / UTC+7)
 * Menggantikan Utilities.formatDate Java-bridge yang lambat (100x lebih cepat)
 */
function formatDateTimeFast(d) {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
  const pad = n => (n < 10 ? '0' : '') + n;
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' +
         pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

function formatWibDateFast(d) {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
  const pad = n => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/**
 * Mengambil data member pendaftar dari spreadsheet dengan Akselerasi Ekstrim (<500ms)
 * Menyaring data Perlu Tindakan vs Arsip secara presisi
 */
function getMemberData(forceFresh) {
  // 1. Baca dari Script Cache super cepat (<150ms) jika tidak dipaksa refresh
  if (!forceFresh) {
    const cachedJson = getFromScriptCacheChunked('MEMBER_DATA_CACHE_V2');
    if (cachedJson) {
      try {
        const parsed = JSON.parse(cachedJson);
        if (parsed && parsed.success) {
          return parsed;
        }
      } catch (eCacheParse) {}
    }
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // Cari sheet berdasarkan nama atau gunakan sheet aktif
    const sheet = ss.getSheetByName("Form Responses 1") || ss.getActiveSheet();
    const data = sheet.getDataRange().getValues();
    
    const now = new Date();
    const needsAction = [];
    const archived = [];
    
    // Muat template WA kustom
    let templates = [];
    try {
      const templatesStr = PropertiesService.getScriptProperties().getProperty('WA_TEMPLATES');
      templates = templatesStr ? JSON.parse(templatesStr) : [
        { id: 't1', title: 'Sambutan', text: dapatkanTemplatePesanDefault() }
      ];
    } catch (e) {
      templates = [{ id: 't1', title: 'Sambutan', text: dapatkanTemplatePesanDefault() }];
    }
    const totalTemplatesCount = templates.length;
    
    // Muat peta status aksi (kontak + kirim template)
    const properties = PropertiesService.getScriptProperties();
    const mapStr = getScriptPropertySafe('ACTION_STATUS_MAP') || '{}';
    let statusMap = {};
    try { statusMap = JSON.parse(mapStr); } catch (eMap) {}
    
    // Ambil data kontak tersimpan dari Google Contacts zettbos2025@gmail.com (HP, Email, Nama)
    const savedGoogleContacts = getAllSavedGoogleContactsData();

    // Map status Whitelist LMS yang sudah dikonfirmasi
    const whitelistMapStr = getScriptPropertySafe('WHITELIST_CONFIRMED_MAP') || '{}';
    let whitelistMap = {};
    try { whitelistMap = JSON.parse(whitelistMapStr); } catch (eWl) {}

    // Map data transaksi Lynk.id yang SUDAH DI-REMARK dari Script Properties
    const remarkedEmails = new Set();
    const remarkedLynkEmails = new Set();
    const remarkedLynkPhones = new Set();
    const remarkedLynkPhoneSuffixes = new Set();
    const remarkedLynkNames = new Set();

    let markedMap = {};
    try {
      const markedStr = getScriptPropertySafe('MARKED_FILLED_MAP') || '{}';
      markedMap = JSON.parse(markedStr);
      for (const k in markedMap) {
        if (markedMap[k] === true) {
          const kLower = k.toLowerCase().trim();
          remarkedEmails.add(kLower);
          if (kLower.includes('@')) {
            remarkedLynkEmails.add(kLower);
          }
        }
      }
    } catch (err) {}

    // PASS 1: Kumpulkan registeredFormEmails/Names & Hitung Dashboard Stats dalam 1 putaran cepat
    const todayWibStr = formatWibDateFast(now);
    const currentMonthWibStr = todayWibStr.substring(0, 7);
    const currentDayWib = Math.max(1, now.getDate());

    const registeredFormEmails = new Set();
    const registeredFormNames = new Set();
    let totalRegisteredMembers = 0;
    let registeredTodayCount = 0;
    let registeredThisMonthCount = 0;

    for (let f = 1; f < data.length; f++) {
      const rowF = data[f];
      const e = rowF[2] ? rowF[2].toString().trim().toLowerCase() : '';
      const n = rowF[1] ? rowF[1].toString().trim().toLowerCase() : '';
      if (e || n) {
        totalRegisteredMembers++;
        if (e) registeredFormEmails.add(e);
        if (n) registeredFormNames.add(n);

        const tVal = parseIndonesianDate(rowF[0]) || parseIndonesianDate(rowF[4]);
        if (tVal && !isNaN(tVal.getTime())) {
          const tWibStr = formatWibDateFast(tVal);
          if (tWibStr === todayWibStr) {
            registeredTodayCount++;
          }
          if (tWibStr.substring(0, 7) === currentMonthWibStr) {
            registeredThisMonthCount++;
          }
        }
      }
    }

    const avgRegistrationsPerDay = parseFloat((registeredThisMonthCount / currentDayWib).toFixed(1));

    // PASS 2: Pindai Sheet Transaksi Lynk.id 1x saja (mengumpulkan remarked + statistik transaksi)
    let totalLynkTransactions = 0;
    let filledTotalCount = 0;
    let unfilledTotalCount = 0;
    let filledTodayCount = 0;
    let unfilledTodayCount = 0;

    const sheetTarget = ss.getSheetByName("UPDATE") || ss.getSheetByName("Private Mentoring - Lynk.id - Transactions");
    const sheetTransRaw = ss.getSheetByName("Private Mentoring - Lynk.id - Transactions");
    const rawLynkPhoneMap = {};
    if (sheetTransRaw) {
      try {
        const rawTransData = sheetTransRaw.getDataRange().getValues();
        if (rawTransData.length > 1) {
          for (let r = 1; r < rawTransData.length; r++) {
            const rEmail = rawTransData[r][16] ? rawTransData[r][16].toString().trim().toLowerCase() : '';
            const rNama = rawTransData[r][17] ? rawTransData[r][17].toString().trim().toLowerCase() : '';
            const rPhone = extractPhoneFromRowData(rawTransData[r]);
            if (rPhone && rPhone.length >= 10) {
              if (rEmail) rawLynkPhoneMap[rEmail] = rPhone;
              if (rNama) rawLynkPhoneMap[rNama] = rPhone;
            }
          }
        }
      } catch (eRaw) {}
    }

    if (sheetTarget) {
      try {
        const transData = sheetTarget.getDataRange().getValues();
        if (transData.length > 1) {
          const isSheetUpdate = sheetTarget.getName() === "UPDATE";
          const headers = transData[0].map(h => h ? h.toString().trim().toLowerCase() : '');
          let colTanggal = headers.findIndex(h => h.includes('tanggal') || h.includes('time') || h.includes('date'));
          let colEmail = headers.findIndex(h => h.includes('email'));
          let colNama = headers.findIndex(h => h.includes('nama') || h.includes('name'));
          let colIsiForm = headers.findIndex(h => h.includes('isi form') || h.includes('remark'));
          if (colTanggal === -1) colTanggal = isSheetUpdate ? 0 : 14;
          if (colEmail === -1) colEmail = isSheetUpdate ? 1 : 16;
          if (colNama === -1) colNama = isSheetUpdate ? 2 : 17;
          const startRow = (isSheetUpdate && transData[0][0] && transData[0][0].toString().toLowerCase().includes('tgl')) ? 1 : (isSheetUpdate ? 1 : 2);

          for (let r = startRow; r < transData.length; r++) {
            const rowT = transData[r];
            const rawE = rowT[colEmail] ? rowT[colEmail].toString().trim().toLowerCase() : '';
            const rawN = rowT[colNama] ? rowT[colNama].toString().trim().toLowerCase() : '';
            if (!rawE && !rawN) continue;
            if (rawE.includes('email') || rawN.includes('nama')) continue;

            totalLynkTransactions++;
            const isFilled = isTransactionFilled(rowT, rawE, rawN, registeredFormEmails, registeredFormNames, remarkedEmails, r + 1, markedMap, colIsiForm);

            if (isFilled) {
              filledTotalCount++;
              if (rawE) remarkedLynkEmails.add(rawE);
              if (rawN) {
                remarkedLynkNames.add(rawN);
                remarkedLynkNames.add(rawN.replace(/\s+/g, ' ').trim());
              }
              let pCleaned = extractPhoneFromRowData(rowT);
              if (!pCleaned && (rawE || rawN)) {
                pCleaned = rawLynkPhoneMap[rawE] || rawLynkPhoneMap[rawN] || '';
              }
              if (pCleaned && pCleaned.length >= 8) {
                remarkedLynkPhones.add(pCleaned);
                remarkedLynkPhoneSuffixes.add(pCleaned.slice(-8));
              }
            } else {
              unfilledTotalCount++;
            }

            const txDateRaw = rowT[colTanggal];
            if (txDateRaw) {
              const txDate = parseIndonesianDate(txDateRaw);
              if (txDate && !isNaN(txDate.getTime())) {
                const txWibStr = formatWibDateFast(txDate);
                if (txWibStr === todayWibStr) {
                  if (isFilled) filledTodayCount++;
                  else unfilledTodayCount++;
                }
              }
            }
          }
        }
      } catch (eTrans) {
        Logger.log("Gagal memuat remarked Lynk transactions di getMemberData: " + eTrans.toString());
      }
    }

    let anyAutoSaved = false;

    // PASS 3: Bangun Objek Member (NeedsAction vs Archived Slimmed)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const timestampRaw = row[0];
      const nama = row[1];
      const email = row[2];
      const waRaw = row[3];
      
      let batasMentoring = '';
      if (row[4]) {
        if (row[4] instanceof Date) {
          batasMentoring = formatDateTimeFast(row[4]);
        } else {
          const str = row[4].toString();
          if (str.includes('GMT') || str.includes('Waktu')) {
            const d = new Date(str);
            batasMentoring = (!isNaN(d.getTime())) ? formatDateTimeFast(d) : str;
          } else {
            batasMentoring = str;
          }
        }
      }
      
      const emailBaru = row[7] ? row[7].toString().trim() : '';
      const emailClean = email ? email.toString().trim() : '';
      if (!emailClean) continue; // Lewati HANYA jika Email benar-benar kosong

      // Nama fallback: Jika nama kosong, gunakan username dari email
      const namaDisplay = nama && nama.toString().trim() !== '' 
        ? nama.toString().trim() 
        : emailClean.split('@')[0];

      let timestamp = parseIndonesianDate(timestampRaw) || parseIndonesianDate(row[4]);
      if (!timestamp || isNaN(timestamp.getTime())) {
        timestamp = now;
      }
      
      const timestampMs = timestamp.getTime();
      const diffMs = now.getTime() - timestampMs;
      const diffHours = diffMs / (1000 * 60 * 60);
      const timestampFormatted = formatDateTimeFast(timestamp);
      
      const cleanE = emailClean.toLowerCase();
      const cleanN = namaDisplay.toLowerCase();
      const rowKey = 'row_' + (i + 1);
      const waCleaned = cleanPhone(waRaw);
      const waKey = waCleaned ? ('wa_' + waCleaned) : '';
      const emailBaruClean = emailBaru ? emailBaru.toLowerCase().trim() : '';

      // Multi-key status lookup
      const status = statusMap[cleanE] || statusMap[emailClean] || (emailBaruClean && statusMap[emailBaruClean]) || statusMap[rowKey] || (waKey && statusMap[waKey]) || { contactSaved: false, templates: {}, geminiCopied: false };
      if (!status.templates) status.templates = {};

      let isSavedInGoogle = (waCleaned && (savedGoogleContacts.phones.has(waCleaned) || (waCleaned.length >= 8 && savedGoogleContacts.phones.has(waCleaned.slice(-8)))))
        || (cleanE && savedGoogleContacts.emails.has(cleanE))
        || (cleanN && savedGoogleContacts.names.has(cleanN))
        || (status.contactSaved === true);

      // Status selesai form pendaftar (kontak + template + gemini atau manual selesai)
      const isProcessed = isMemberFullyProcessed(emailClean, statusMap, totalTemplatesCount);

      // Cek apakah pendaftar ini cocok dengan transaksi Lynk.id yang SUDAH DI-REMARK (Strict Email & WA Only, Anti-Salah Cocok Nama)
      const isLynkRemarked = (cleanE && remarkedLynkEmails.has(cleanE))
        || (emailBaruClean && remarkedLynkEmails.has(emailBaruClean))
        || (waCleaned && (remarkedLynkPhones.has(waCleaned) || (waCleaned.length >= 8 && remarkedLynkPhoneSuffixes.has(waCleaned.slice(-8)))))
        || (status.manualDone === true);

      const isForceAction = status.forceAction === true;
      // ATURAN KETAT PERLU TINDAKAN:
      // Semua data yang masuk ke tab Perlu Tindakan TIDAK BISA HILANG kecuali:
      // 1. Sudah 24 jam berlalu (diffHours >= 24), ATAU
      // 2. Sudah dikonfirmasi selesai secara eksplisit oleh Admin (status.manualDone === true).
      // Remark di tab Lynk.id atau simpan kontak/template TIDAK mengarsipkan otomatis sebelum 24 jam!
      const isHistorical = (diffHours >= 24);
      const isManualConfirmed = (status.manualDone === true);
      const isDone = !isForceAction && (isManualConfirmed || isHistorical);

      if (isSavedInGoogle && !status.contactSaved) {
        status.contactSaved = true;
        statusMap[emailClean] = status;
        statusMap[cleanE] = status;
      }

      const processedAt = (statusMap[cleanE] || statusMap[emailClean]) ? ((statusMap[cleanE] || statusMap[emailClean]).processedAt || 0) : 0;

      const rowStr = row.join(' ').toLowerCase();
      const hasGeminiPro = rowStr.includes('gemini pro') || rowStr.includes('gemini');

      const countEmail = (row[5] !== undefined && row[5] !== null && row[5] !== '') ? Number(row[5]) : 1;
      const countWa = (row[6] !== undefined && row[6] !== null && row[6] !== '') ? Number(row[6]) : 1;
      const isDuplicateEmail = countEmail > 1;
      const isDuplicateWa = countWa > 1;
      const hasDuplicate = isDuplicateEmail || isDuplicateWa;
      const isMemberLama = isDuplicateEmail || isDuplicateWa;
      const isWhitelisted = !!(whitelistMap['row_' + (i + 1)] || (!isDuplicateEmail && (whitelistMap[emailClean] || (emailBaru && whitelistMap[emailBaru.toLowerCase()]))));

      if (!isDone) {
        // Objek lengkap untuk antrean Perlu Tindakan (~10 member)
        needsAction.push({
          rowNumber: i + 1,
          timestamp: (timestampRaw || '09/02/2026 00:00:00').toString(),
          timestampFormatted: timestampFormatted,
          timestampMs: timestampMs,
          nama: namaDisplay,
          email: emailClean,
          emailBaru: emailBaru,
          waRaw: waRaw,
          waCleaned: waCleaned,
          batasMentoring: batasMentoring,
          hoursAgo: diffHours.toFixed(1),
          hoursRemaining: diffHours.toFixed(1),
          isProcessed: isProcessed,
          isLynkRemarked: isLynkRemarked,
          isDone: isDone,
          processedAt: processedAt,
          contactSaved: isSavedInGoogle,
          geminiCopied: status.geminiCopied || false,
          templatesStatus: status.templates || {},
          isMemberLama: isMemberLama,
          hasGeminiPro: hasGeminiPro,
          countEmail: countEmail,
          countWa: countWa,
          isDuplicateEmail: isDuplicateEmail,
          isDuplicateWa: isDuplicateWa,
          hasDuplicate: hasDuplicate,
          isWhitelisted: isWhitelisted
        });
      } else {
        // Objek Ringkas Terkompresi untuk Arsip (Menghemat >70% Payload Data & Mengaktifkan CacheService)
        const archivedMember = {
          rowNumber: i + 1,
          timestamp: (timestampRaw || '09/02/2026 00:00:00').toString(),
          timestampFormatted: timestampFormatted,
          timestampMs: timestampMs,
          nama: namaDisplay,
          email: emailClean,
          waRaw: waRaw ? waRaw.toString() : '',
          waCleaned: waCleaned,
          hoursAgo: diffHours.toFixed(1),
          isDone: true,
          isWhitelisted: isWhitelisted
        };
        if (emailBaru) archivedMember.emailBaru = emailBaru;
        if (batasMentoring) archivedMember.batasMentoring = batasMentoring;
        if (hasGeminiPro) archivedMember.hasGeminiPro = true;
        if (countEmail > 1) {
          archivedMember.countEmail = countEmail;
          archivedMember.isDuplicateEmail = true;
          archivedMember.hasDuplicate = true;
        }
        if (countWa > 1) {
          archivedMember.countWa = countWa;
          archivedMember.isDuplicateWa = true;
          archivedMember.hasDuplicate = true;
        }
        archived.push(archivedMember);
      }
    }
    
    // Simpan statusMap terbaru ke ScriptProperties HANYA jika terjadi auto-save kontak
    if (anyAutoSaved) {
      try {
        setScriptPropertySafe('ACTION_STATUS_MAP', JSON.stringify(statusMap));
      } catch(eProp) {}
    }

    // Urutkan yang terbaru di atas secara super cepat dengan timestampMs
    needsAction.sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
    archived.sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));

    const dashboardStats = {
      totalRegisteredMembers: totalRegisteredMembers,
      registeredTodayCount: registeredTodayCount,
      avgRegistrationsPerDay: avgRegistrationsPerDay,
      totalLynkTransactions: totalLynkTransactions,
      filledTotalCount: filledTotalCount,
      unfilledTotalCount: unfilledTotalCount,
      filledTodayCount: filledTodayCount,
      unfilledTodayCount: unfilledTodayCount
    };

    const sentMapStr = getScriptPropertySafe('SUPABASE_SENT_MAP') || '{}';
    let supabaseSentMap = {};
    try { supabaseSentMap = JSON.parse(sentMapStr); } catch(eS) {}

    const result = {
      success: true,
      needsAction: needsAction,
      archived: archived,
      contactSuffix: CONTACT_SUFFIX,
      templates: templates,
      dashboardStats: dashboardStats,
      whitelistConfirmedMap: whitelistMap,
      supabaseSentMap: supabaseSentMap,
      _registeredEmails: registeredFormEmails,
      _registeredNames: registeredFormNames
    };

    // Simpan ke CacheService (600 detik / 10 menit) untuk akselerasi instan (<150ms)
    try {
      saveToScriptCacheChunked('MEMBER_DATA_CACHE_V2', JSON.stringify(result), 600);
    } catch(eCache) {}

    return result;
  } catch (error) {
    return {
      success: false,
      message: 'Gagal memuat data: ' + error.toString()
    };
  }
}

/**
 * Menyimpan daftar template kustom dari dashboard ke Script Properties
 */
function saveTemplates(templates) {
  try {
    PropertiesService.getScriptProperties().setProperty('WA_TEMPLATES', JSON.stringify(templates));
    return {
      success: true,
      message: 'Template pesan berhasil disimpan!'
    };
  } catch (error) {
    return {
      success: false,
      message: 'Gagal menyimpan template: ' + error.toString()
    };
  }
}

/**
 * Menyimpan kontak secara manual ke Google Contacts via People API (dengan fallback ContactsApp)
 */
function simpanKontakManual(nama, email, wa, forceSave) {
  try {
    const waCleaned = cleanPhone(wa);
    if (!waCleaned) {
      return {
        success: false,
        message: 'Nomor WhatsApp tidak valid.'
      };
    }
    const targetNoInternational = '+' + waCleaned;
    const cleanE = email ? email.toString().trim().toLowerCase() : '';
    const namaKontak = (nama && nama.toString().trim()) ? nama.toString().trim() : (cleanE ? cleanE.split('@')[0] : 'Member');

    // Cek duplikat secara presisi dengan data kontak tersimpan (hanya jika bukan forceSave)
    if (!forceSave) {
      const savedContacts = getAllSavedGoogleContactsData();
      const isAlreadySaved = (savedContacts.phones.has(waCleaned) || (waCleaned.startsWith('628') && savedContacts.phones.has('0' + waCleaned.substring(2))))
        || (cleanE && savedContacts.emails.has(cleanE));

      if (isAlreadySaved) {
        if (cleanE) {
          catatAksiSukses(cleanE, 'contact');
        }
        return {
          success: true,
          message: 'Kontak ' + namaKontak + ' (' + targetNoInternational + ') sudah terdaftar di Google Contacts.',
          isDuplicate: true
        };
      }
    }
    
    let savedSuccessfully = false;
    let lastErrorMsg = '';

    // 1. Coba simpan via Google People API (Modern)
    if (typeof People !== 'undefined' && People.People) {
      try {
        const person = {
          names: [{
            givenName: namaKontak,
            familyName: CONTACT_SUFFIX
          }],
          memberships: [{
            contactGroupMembership: {
              contactGroupResourceName: 'contactGroups/myContacts'
            }
          }],
          phoneNumbers: [{
            value: targetNoInternational,
            type: 'mobile'
          }]
        };
        
        if (cleanE) {
          person.emailAddresses = [{
            value: cleanE,
            type: 'home'
          }];
        }
        
        People.People.createContact(person);
        savedSuccessfully = true;
        Logger.log("Simpan kontak manual sukses via People API: " + namaKontak + " " + CONTACT_SUFFIX);
      } catch (errPeople) {
        lastErrorMsg = errPeople.toString();
        Logger.log("Gagal simpan kontak manual via People API: " + lastErrorMsg);
      }
    }

    // 2. Fallback via ContactsApp (Bawaan Google Apps Script)
    if (!savedSuccessfully && typeof ContactsApp !== 'undefined') {
      try {
        const c = ContactsApp.createContact(namaKontak, CONTACT_SUFFIX, cleanE || '');
        if (c) {
          c.addPhone(ContactsApp.Field.MOBILE_PHONE, targetNoInternational);
          savedSuccessfully = true;
        }
      } catch (errContactsApp) {
        if (!lastErrorMsg) lastErrorMsg = errContactsApp.toString();
        Logger.log("Gagal simpan kontak manual via ContactsApp fallback: " + errContactsApp.toString());
      }
    }

    if (savedSuccessfully) {
      try {
        CacheService.getScriptCache().remove('SAVED_GOOGLE_CONTACTS_V2');
      } catch(e) {}
      
      if (cleanE) {
        catatAksiSukses(cleanE, 'contact');
      }

      return {
        success: true,
        message: 'Berhasil menyimpan kontak: ' + namaKontak + ' ' + CONTACT_SUFFIX
      };
    } else {
      return {
        success: false,
        message: 'Gagal simpan kontak ke Google Contacts: ' + (lastErrorMsg || 'People API tidak merespons.')
      };
    }
  } catch (error) {
    return {
      success: false,
      message: 'Gagal menyimpan kontak: ' + error.toString()
    };
  }
}

/**
 * Menyimpan kontak secara otomatis (dipakai trigger onFormSubmit)
 * Mendukung Google People API dengan memberships contactGroups/myContacts
 */
function simpanKontakKeGoogle(nama, email, waCleaned, forceSave) {
  try {
    if (!waCleaned) {
      Logger.log("Auto-save kontak dibatalkan: Nomor WA tidak valid.");
      return { success: false, message: 'Nomor WA tidak valid.' };
    }
    const targetNoInternational = '+' + waCleaned;
    const cleanE = email ? email.toString().trim().toLowerCase() : '';
    const namaKontak = (nama && nama.toString().trim()) ? nama.toString().trim() : (cleanE ? cleanE.split('@')[0] : 'Member');

    // Cek duplikat secara presisi dengan data kontak tersimpan (hanya jika bukan forceSave)
    if (!forceSave) {
      const savedContacts = getAllSavedGoogleContactsData();
      const isAlreadySaved = (savedContacts.phones.has(waCleaned) || (waCleaned.startsWith('628') && savedContacts.phones.has('0' + waCleaned.substring(2))))
        || (cleanE && savedContacts.emails.has(cleanE));

      if (isAlreadySaved) {
        Logger.log("Kontak " + namaKontak + " (" + targetNoInternational + ") sudah ada di Google Contacts. Skip simpan duplikat.");
        if (cleanE) {
          catatAksiSukses(cleanE, 'contact');
        }
        return { success: true, message: 'Kontak sudah ada di Google Contacts.', isDuplicate: true };
      }
    }
    
    let savedSuccessfully = false;
    let lastErrorMsg = '';

    // 1. Coba simpan kontak via Google People API (Modern)
    if (typeof People !== 'undefined' && People.People) {
      try {
        const person = {
          names: [{
            givenName: namaKontak,
            familyName: CONTACT_SUFFIX
          }],
          memberships: [{
            contactGroupMembership: {
              contactGroupResourceName: 'contactGroups/myContacts'
            }
          }],
          phoneNumbers: [{
            value: targetNoInternational,
            type: 'mobile'
          }]
        };
        
        if (cleanE) {
          person.emailAddresses = [{
            value: cleanE,
            type: 'home'
          }];
        }
        
        People.People.createContact(person);
        savedSuccessfully = true;
        Logger.log("Auto-Save Kontak Sukses (People API): " + namaKontak + " " + CONTACT_SUFFIX);
      } catch (errPeople) {
        lastErrorMsg = errPeople.toString();
        Logger.log("Gagal simpan via People API: " + lastErrorMsg);
      }
    }

    // 2. Fallback via ContactsApp (Layanan bawaan Google Apps Script)
    if (!savedSuccessfully && typeof ContactsApp !== 'undefined') {
      try {
        const c = ContactsApp.createContact(namaKontak, CONTACT_SUFFIX, cleanE || '');
        if (c) {
          c.addPhone(ContactsApp.Field.MOBILE_PHONE, targetNoInternational);
          savedSuccessfully = true;
          Logger.log("Auto-Save Kontak Sukses (ContactsApp Fallback): " + namaKontak + " " + CONTACT_SUFFIX);
        }
      } catch (errContactsApp) {
        if (!lastErrorMsg) lastErrorMsg = errContactsApp.toString();
        Logger.log("Gagal simpan via ContactsApp fallback: " + errContactsApp.toString());
      }
    }

    if (savedSuccessfully) {
      try {
        CacheService.getScriptCache().remove('SAVED_GOOGLE_CONTACTS_V2');
      } catch(e) {}
      
      // Catat status aksi sukses agar Dashboard & Antrean otomatis hijau / sinkron
      if (cleanE) {
        catatAksiSukses(cleanE, 'contact');
      }

      return {
        success: true,
        message: 'Berhasil auto-save kontak: ' + namaKontak + ' ' + CONTACT_SUFFIX
      };
    } else {
      Logger.log("Gagal auto-save kontak: " + (lastErrorMsg || 'Layanan kontak tidak tersedia.'));
      return {
        success: false,
        message: 'Gagal auto-save kontak: ' + (lastErrorMsg || 'Layanan People API dan ContactsApp tidak aktif/gagal.')
      };
    }
  } catch (error) {
    Logger.log("Gagal auto-save kontak: " + error.toString());
    return {
      success: false,
      message: 'Error auto-save kontak: ' + error.toString()
    };
  }
}

/**
 * Mengambil daftar seluruh data kontak yang sudah tersimpan di Google Contacts
 * Menggunakan CacheService (10 menit) agar pembacaan sangat cepat (<5ms vs 3000ms)
 * Mendukung People API Connections list dengan fallback ContactsApp
 */
function getAllSavedGoogleContactsData() {
  const cache = CacheService.getScriptCache();
  try {
    const cachedStr = cache.get('SAVED_GOOGLE_CONTACTS_V2');
    if (cachedStr) {
      const parsed = JSON.parse(cachedStr);
      return {
        phones: new Set(parsed.phones || []),
        emails: new Set(parsed.emails || []),
        names: new Set(parsed.names || [])
      };
    }
  } catch (e) {}

  const savedPhones = new Set();
  const savedEmails = new Set();
  const savedNames = new Set();
  try {
    // 1. Coba baca cepat dari Google People API jika aktif (1 Request Super Cepat <500ms)
    if (typeof People !== 'undefined' && People.People) {
      try {
        const response = People.People.Connections.list('people/me', {
          personFields: 'names,phoneNumbers,emailAddresses',
          pageSize: 1000
        });
        const connections = response.connections || [];
        connections.forEach(function(person) {
          const phones = person.phoneNumbers || [];
          phones.forEach(function(p) {
            if (p.value) {
              const cleaned = cleanPhone(p.value);
              if (cleaned) {
                savedPhones.add(cleaned);
                if (cleaned.startsWith('628')) {
                  savedPhones.add('0' + cleaned.substring(2));
                }
              }
            }
          });
          const emails = person.emailAddresses || [];
          emails.forEach(function(e) {
            if (e.value) savedEmails.add(e.value.toString().trim().toLowerCase());
          });
          const names = person.names || [];
          names.forEach(function(n) {
            if (n.displayName) savedNames.add(n.displayName.toString().trim().toLowerCase());
          });
        });
      } catch (errPeople) {
        Logger.log("Info People API connections: " + errPeople.toString());
      }
    } else {
      // PERFORMA TINGGI: Jangan panggil ContactsApp.getContacts() secara massal di sini!
      // Iterasi ribuan kontak di Apps Script memakan waktu 20-30 detik sehingga menyebabkan APK hang.
      // Status kontak tersimpan telah dicatat dengan sangat andal dan instan (<1ms) di ACTION_STATUS_MAP.
    }

    // Simpan ke CacheService selama 1800 detik (30 menit) dengan batas aman < 90KB agar tidak melebihi kuota
    try {
      if (savedPhones.size > 0 || savedEmails.size > 0) {
        const dataToCache = {
          phones: Array.from(savedPhones).slice(0, 1000),
          emails: Array.from(savedEmails).slice(0, 1000),
          names: Array.from(savedNames).slice(0, 300)
        };
        const strCache = JSON.stringify(dataToCache);
        if (strCache.length < 90000) {
          cache.put('SAVED_GOOGLE_CONTACTS_V2', strCache, 1800);
        }
      }
    } catch (errCache) {}
  } catch (e) {
    Logger.log("Gagal membaca Google Contacts: " + e.toString());
  }
  return { phones: savedPhones, emails: savedEmails, names: savedNames };
}

/**
 * Fungsi uji coba untuk mengetes simpan kontak ke Google Contacts
 * Jalankan fungsi ini dari Apps Script Editor untuk memastikan koneksi Google Contacts bekerja
 */
function testAutoSaveContact() {
  let effectiveEmail = '';
  try {
    effectiveEmail = Session.getEffectiveUser().getEmail();
  } catch (e) {}

  const testNama = "Tes Kontak Zettbos";
  const testEmail = "test_kontak_zettbos@example.com";
  const testWa = "081299998888";
  
  // forceSave = true agar tes selalu mencoba createContact langsung ke Google Contacts
  const res = simpanKontakKeGoogle(testNama, testEmail, cleanPhone(testWa), true);
  res.targetAccount = effectiveEmail;
  Logger.log("Hasil testAutoSaveContact (" + effectiveEmail + "): " + JSON.stringify(res));
  return res;
}

/**
 * Diagnosa komprehensif sistem auto-save kontak dan People API
 */
function cekStatusSistemKontak() {
  let effectiveEmail = '';
  try {
    effectiveEmail = Session.getEffectiveUser().getEmail();
  } catch (e) {}

  let activeEmail = '';
  try {
    activeEmail = Session.getActiveUser().getEmail();
  } catch (e) {}

  const isCorrectAccount = effectiveEmail ? (effectiveEmail.toLowerCase() === 'zettbos2025@gmail.com') : false;

  const result = {
    timestamp: new Date().toISOString(),
    effectiveEmail: effectiveEmail,
    activeEmail: activeEmail,
    targetEmail: 'zettbos2025@gmail.com',
    isCorrectAccount: isCorrectAccount,
    contactSuffix: CONTACT_SUFFIX,
    peopleApiActive: false,
    contactsAppActive: false,
    formSubmitTriggerActive: false,
    activeTriggers: [],
    savedContactsCount: 0,
    recommendations: []
  };

  // Cek apakah akun yang menjalankan script adalah zettbos2025@gmail.com
  if (effectiveEmail && !isCorrectAccount) {
    result.recommendations.push(
      "PERINGATAN AKUN GOOGLE: Script saat ini berjalan menggunakan akun: " + effectiveEmail + ". Seluruh kontak tersimpan di akun tersebut, BUKAN di zettbos2025@gmail.com! Untuk menyimpan ke zettbos2025@gmail.com, silakan buka Google Sheets menggunakan akun zettbos2025@gmail.com lalu deploy ulang Web App."
    );
  }

  // 1. Cek People API
  if (typeof People !== 'undefined' && People.People) {
    result.peopleApiActive = true;
  } else {
    result.recommendations.push("People API belum aktif di menu Services Google Apps Script. Tambahkan layanan 'Google People API'.");
  }

  // 2. Cek ContactsApp (Fallback bawaan Apps Script)
  if (typeof ContactsApp !== 'undefined') {
    result.contactsAppActive = true;
  }

  // 3. Cek Triggers
  try {
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      const fn = triggers[i].getHandlerFunction();
      result.activeTriggers.push(fn);
      if (fn === 'onFormSubmit') {
        result.formSubmitTriggerActive = true;
      }
    }
  } catch (errTrig) {
    result.triggerError = errTrig.toString();
  }

  if (!result.formSubmitTriggerActive) {
    result.recommendations.push("Trigger onFormSubmit belum aktif. Jalankan setupFormSubmitTrigger() dari editor Apps Script atau klik tombol pasang trigger di dashboard.");
  }

  // 4. Hitung Kontak Tersimpan
  try {
    const saved = getAllSavedGoogleContactsData();
    result.savedContactsCount = saved.phones ? saved.phones.size : 0;
  } catch (errContacts) {
    result.savedContactsError = errContacts.toString();
  }

  return {
    success: true,
    data: result
  };
}

/**
 * Mengirim pesan WhatsApp manual via Fonnte (dengan validasi status respon JSON Fonnte)
 */
function kirimWaManual(target, pesan) {
  try {
    const targetNo = cleanPhone(target);
    if (!targetNo) {
      return { success: false, message: 'Nomor tujuan WhatsApp tidak valid: ' + target };
    }
    // Tetap gunakan simulasi typing: 'true' & delay random (15-25 detik) untuk keamanan anti-banned
    const rawResult = kirimKeFonnte(targetNo, pesan);
    let parsed = null;
    try {
      parsed = JSON.parse(rawResult);
    } catch (eJson) {}

    if (parsed && parsed.status === false) {
      return {
        success: false,
        message: 'Fonnte menolak pengiriman: ' + (parsed.reason || rawResult),
        response: parsed
      };
    }

    return {
      success: true,
      message: 'Pesan berhasil dikirim via Fonnte ke ' + targetNo + '!',
      response: parsed || rawResult
    };
  } catch (error) {
    return {
      success: false,
      message: 'Gagal mengirim pesan: ' + error.toString()
    };
  }
}

/**
 * Mengambil daftar grup WhatsApp dari Fonnte
 */
function fetchFonnteGroupList() {
  try {
    const options = {
      method: 'post',
      headers: { 'Authorization': FONNTE_TOKEN },
      muteHttpExceptions: true
    };
    const response = UrlFetchApp.fetch('https://api.fonnte.com/get-whatsapp-group', options);
    const resJson = JSON.parse(response.getContentText());
    return {
      success: true,
      data: resJson
    };
  } catch (error) {
    return {
      success: false,
      message: 'Gagal mengambil grup Fonnte: ' + error.toString()
    };
  }
}

/**
 * Mengundang member ke grup WhatsApp via Fonnte
 */
function inviteMemberToGroupFonnte(nama, target) {
  try {
    const targetNo = cleanPhone(target);
    if (!targetNo) {
      return { success: false, message: 'Nomor WhatsApp tidak valid.' };
    }
    const pesan = 'Halo ' + (nama || 'Kak') + ',\n\nBerikut link untuk bergabung ke grup WhatsApp:\n' + WA_GROUP_LINK + '\n\nTerima kasih!';
    const res = kirimKeFonnte(targetNo, pesan);
    return {
      success: true,
      message: 'Undangan grup berhasil dikirim ke ' + targetNo,
      response: res
    };
  } catch (error) {
    return {
      success: false,
      message: 'Gagal mengirim undangan grup: ' + error.toString()
    };
  }
}

/**
 * Template Pesan Default Zettbos
 */
function dapatkanTemplatePesanDefault() {
  return `Halo, Selamat Datang di Zettbos👋

❗*WAJIB DITONTON*❗️

Silahkan tonton video untuk tutorial akses:
🔗 bit.ly/WelcomeZettbos

Link Pendaftaran : 
🔗 bit.ly/ZettLink
_*Gunakan username & password sederhana, jangan pakai data pribadi._

Silahkan daftar untuk mengakses:
• Modul Pembelajaran
• Zettbos Library
• Zettbot
• Zettprompt
• dll

⚠️ Aturan Penting:
• Link ini pribadi, dilarang dibagikan.
• Semua aktivitas tercatat. Pelanggaran → suspend.`;
}

/**
 * Fungsi Pengirim HTTP Request ke API Fonnte dengan Simulasi Typing & Delay Random (15-25 Detik)
 * Mendukung nomor Indonesia (62) dan nomor Internasional (Korea 82, Malaysia 60, Singapura 65, Brunei 673, dll)
 */
function kirimKeFonnte(target, message, delaySeconds) {
  const cleanTarget = cleanPhone(target);
  if (!cleanTarget) {
    return JSON.stringify({ status: false, reason: 'Nomor WhatsApp tujuan kosong atau tidak valid: ' + target });
  }

  const safeDelay = (delaySeconds !== null && delaySeconds !== undefined) 
    ? String(delaySeconds) 
    : String(Math.floor(Math.random() * 11) + 15);
  const zwChars = ['\u200B', '\u200C', '\u200D'];
  const antiSpamSuffix = zwChars[Math.floor(Math.random() * zwChars.length)] + zwChars[Math.floor(Math.random() * zwChars.length)];

  // Set countryCode '0' dengan target nomor internasional lengkap (tanpa '+')
  // agar Fonnte mengirim langsung ke nomor tujuan tanpa merusak/memaksa kode negara 62
  const payload = {
    'target': cleanTarget,
    'message': String(message || '').trim() + antiSpamSuffix,
    'countryCode': '0',
    'delay': safeDelay,
    'typing': 'true'
  };

  const options = {
    'method': 'post',
    'headers': { 'Authorization': FONNTE_TOKEN },
    'payload': payload,
    'muteHttpExceptions': true
  };

  const response = UrlFetchApp.fetch(URL_FONNTE, options);
  Logger.log('Fonnte Response Status: ' + response.getContentText());
  return response.getContentText();
}

/**
 * Memantau Status LIVE TikTok (@zettbos) & Mengirimkan Push Notification FCM saat Mulai / Selesai Live
 */
function checkTikTokLiveStatusServer(username) {
  const cleanUser = String(username || 'zettbos').trim().replace(/^@+/, '') || 'zettbos';
  try {
    let isNowLive = false;
    let roomId = '';
    let liveTitle = '';

    // 1. Cek via TikTok Official Webcast API Endpoint (Bypass WAF Anti-Bot Challenge)
    try {
      const apiUrl = 'https://www.tiktok.com/api-live/user/room?aid=1988&uniqueId=' + encodeURIComponent(cleanUser) + '&sourceType=54';
      const apiResp = UrlFetchApp.fetch(apiUrl, {
        method: 'get',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': 'https://www.tiktok.com/'
        },
        muteHttpExceptions: true
      });
      const apiText = apiResp.getContentText() || '';
      if (apiText && apiText.trim().startsWith('{')) {
        const parsed = JSON.parse(apiText);
        const user = parsed && parsed.data ? parsed.data.user : null;
        const liveRoom = parsed && parsed.data ? parsed.data.liveRoom : null;
        roomId = (user && user.roomId) ? String(user.roomId) : '';
        const userStatus = (user && user.status !== undefined) ? Number(user.status) : 0;
        const roomStatus = (liveRoom && liveRoom.status !== undefined) ? Number(liveRoom.status) : 0;
        // Status 2 di Webcast menandakan sedang Live aktif
        isNowLive = (roomStatus === 2 || userStatus === 2) && Boolean(roomId && roomId !== '0');
        liveTitle = (liveRoom && liveRoom.title) ? liveRoom.title : '';
      }
    } catch (eApi) {
      Logger.log("API check failed, trying HTML fallback: " + eApi.toString());
    }

    // 2. Fallback ke HTML scraping jika API gagal
    if (!roomId) {
      try {
        const pageUrl = 'https://www.tiktok.com/@' + encodeURIComponent(cleanUser) + '/live';
        const pageResp = UrlFetchApp.fetch(pageUrl, {
          method: 'get',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8'
          },
          followRedirects: true,
          muteHttpExceptions: true
        });
        const html = pageResp.getContentText() || '';
        const roomMatch = html.match(/"roomId"\s*:\s*"(\d+)"/);
        const statusMatch = html.match(/"status"\s*:\s*(\d+)/);
        if (roomMatch) roomId = roomMatch[1];
        const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 0;
        if (roomId && statusCode === 2) isNowLive = true;
      } catch (eHtml) {}
    }

    const scriptProps = PropertiesService.getScriptProperties();
    const prevLiveStr = scriptProps.getProperty('TIKTOK_IS_LIVE_' + cleanUser.toUpperCase()) || 'false';
    const wasLive = (prevLiveStr === 'true');

    if (!wasLive && isNowLive) {
      const nowMs = Date.now();
      scriptProps.setProperty('TIKTOK_IS_LIVE_' + cleanUser.toUpperCase(), 'true');
      scriptProps.setProperty('TIKTOK_LIVE_START_' + cleanUser.toUpperCase(), String(nowMs));
      let startTimeStr = '';
      try {
        startTimeStr = Utilities.formatDate(new Date(nowMs), "Asia/Jakarta", "HH:mm") + " WIB";
      } catch (eTime) {
        startTimeStr = new Date(nowMs).toLocaleTimeString('id-ID') + ' WIB';
      }
      sendFcmNotification(
        '🔴 @' + cleanUser + ' Mulai LIVE',
        'Mulai: ' + startTimeStr,
        {
          type: 'tiktok_live_start',
          username: cleanUser,
          roomId: roomId,
          startTime: startTimeStr,
          url: 'https://vt.tiktok.com/ZS9f8qEThx6Mv-Zc8fJ/'
        }
      );
    } else if (wasLive && !isNowLive) {
      scriptProps.setProperty('TIKTOK_IS_LIVE_' + cleanUser.toUpperCase(), 'false');
      const startMs = Number(scriptProps.getProperty('TIKTOK_LIVE_START_' + cleanUser.toUpperCase()) || 0);
      const nowMs = Date.now();
      let durationStr = 'Beberapa menit';
      if (startMs > 0) {
        const totalMin = Math.max(1, Math.round((nowMs - startMs) / 60000));
        const hours = Math.floor(totalMin / 60);
        const mins = totalMin % 60;
        if (hours > 0 && mins > 0) {
          durationStr = hours + ' jam ' + mins + ' menit';
        } else if (hours > 0) {
          durationStr = hours + ' jam';
        } else {
          durationStr = mins + ' menit';
        }
      }
      sendFcmNotification(
        '⏹️ @' + cleanUser + ' LIVE Selesai',
        'Durasi: ' + durationStr,
        {
          type: 'tiktok_live_end',
          username: cleanUser,
          duration: durationStr,
          url: 'https://vt.tiktok.com/ZS9f8qEThx6Mv-Zc8fJ/'
        }
      );
    }

    return {
      success: true,
      username: cleanUser,
      isLive: isNowLive,
      roomId: roomId,
      title: liveTitle,
      checkedAt: new Date().toISOString()
    };
  } catch (err) {
    return {
      success: false,
      username: cleanUser,
      isLive: false,
      message: err.toString()
    };
  }
}

/**
 * Mencatat status aksi sukses (kontak/template) ke Script Properties
 */
function catatAksiSukses(email, tipeAksi, rowNumber, wa) {
  if ((!email || email === 'A') && !rowNumber && !wa) return { success: false, message: 'Identitas member tidak valid' };
  
  try {
    const cleanEmail = email ? email.toString().trim().toLowerCase() : '';
    const rawEmail = email ? email.toString().trim() : '';
    const rowKey = rowNumber ? ('row_' + rowNumber) : '';
    const cleanW = wa ? cleanPhone(wa) : '';
    const waKey = cleanW ? ('wa_' + cleanW) : '';

    const properties = PropertiesService.getScriptProperties();
    const mapStr = getScriptPropertySafe('ACTION_STATUS_MAP') || '{}';
    const map = JSON.parse(mapStr);
    
    const entry = (cleanEmail && map[cleanEmail]) || (rawEmail && map[rawEmail]) || (rowKey && map[rowKey]) || (waKey && map[waKey]) || { contactSaved: false, templates: {}, geminiCopied: false };
    if (!entry.templates) entry.templates = {};
    
    if (tipeAksi === 'contact') {
      entry.contactSaved = true;
    } else if (tipeAksi === 'unmark_contact') {
      entry.contactSaved = false;
    } else if (tipeAksi === 'gemini_copied') {
      entry.geminiCopied = true;
    } else if (tipeAksi === 'unmark_gemini_copied') {
      entry.geminiCopied = false;
    } else if (tipeAksi.startsWith('toggle_template_')) {
      const idx = tipeAksi.replace('toggle_template_', '');
      const isSent = !!(entry.templates[idx] || entry.templates[String(idx)]);
      if (isSent) {
        delete entry.templates[idx];
        delete entry.templates[String(idx)];
      } else {
        entry.templates[idx] = true;
        entry.templates[String(idx)] = true;
      }
    } else if (tipeAksi.startsWith('unmark_template_')) {
      const idx = tipeAksi.replace('unmark_template_', '');
      delete entry.templates[idx];
      delete entry.templates[String(idx)];
    } else if (tipeAksi.startsWith('mark_template_') || tipeAksi.startsWith('template_')) {
      const idx = tipeAksi.replace(/^(mark_template_|template_)/, '');
      entry.templates[idx] = true;
      entry.templates[String(idx)] = true;
    }
    
    // Periksa apakah seluruh template, kontak, & gemini copy sudah selesai
    const templatesStr = properties.getProperty('WA_TEMPLATES') || '[]';
    const templates = JSON.parse(templatesStr);
    let isFullyProcessed = entry.contactSaved && entry.geminiCopied;
    for (let i = 0; i < templates.length; i++) {
      if (!entry.templates[i] && !entry.templates[String(i)]) {
        isFullyProcessed = false;
        break;
      }
    }
    
    if (isFullyProcessed && !entry.processedAt) {
      entry.processedAt = new Date().getTime(); // Simpan timestamp selesai
    }
    
    if (cleanEmail) map[cleanEmail] = entry;
    if (rawEmail) map[rawEmail] = entry;
    if (rowKey) map[rowKey] = entry;
    if (waKey) map[waKey] = entry;
    
    setScriptPropertySafe('ACTION_STATUS_MAP', JSON.stringify(map));
    invalidateDashboardDataCache();
    
    return {
      success: true,
      message: 'Status aksi berhasil diperbarui.',
      isFullyProcessed: isFullyProcessed,
      entry: entry
    };
  } catch (error) {
    return {
      success: false,
      message: 'Gagal mencatat status aksi: ' + error.toString()
    };
  }
}

/**
 * Helper untuk memeriksa status selesai member
 */
function isMemberFullyProcessed(email, statusMap, totalTemplatesCount) {
  if (!email || email === 'A') return false;
  const status = statusMap[email];
  if (!status) return false;
  if (status.manualDone === true) return true; // Ditandai selesai secara manual oleh Admin
  if (!status.contactSaved) return false;
  if (!status.geminiCopied) return false; // Gemini copy is now required
  for (let i = 0; i < totalTemplatesCount; i++) {
    if (!status.templates[i]) return false;
  }
  return true;
}

/**
 * Menandai member aktif selesai secara manual oleh Admin
 */
function markMemberDoneManual(email) {
  if (!email) return { success: false, message: 'Email tidak valid.' };
  try {
    const properties = PropertiesService.getScriptProperties();
    const mapStr = getScriptPropertySafe('ACTION_STATUS_MAP') || '{}';
    const map = JSON.parse(mapStr);
    const cleanE = email.toString().trim().toLowerCase();
    if (!map[cleanE]) {
      map[cleanE] = { contactSaved: false, templates: {}, geminiCopied: false };
    }
    map[cleanE].manualDone = true;
    map[cleanE].processedAt = new Date().getTime();
    delete map[cleanE].forceAction;
    if (map[email]) {
      map[email].manualDone = true;
      map[email].processedAt = new Date().getTime();
      delete map[email].forceAction;
    }
    setScriptPropertySafe('ACTION_STATUS_MAP', JSON.stringify(map));
    invalidateDashboardDataCache();
    return {
      success: true,
      message: 'Member berhasil ditandai selesai dan dipindahkan ke Arsip!'
    };
  } catch (err) {
    return { success: false, message: 'Gagal menandai member: ' + err.toString() };
  }
}

/**
 * Membatalkan tanda selesai manual member aktif (Kembalikan ke antrean Perlu Tindakan)
 */
function unmarkMemberDoneManual(email) {
  if (!email) return { success: false, message: 'Email tidak valid.' };
  try {
    const properties = PropertiesService.getScriptProperties();
    const mapStr = getScriptPropertySafe('ACTION_STATUS_MAP') || '{}';
    const map = JSON.parse(mapStr);
    const cleanE = email.toString().trim().toLowerCase();
    if (!map[cleanE]) {
      map[cleanE] = { contactSaved: false, templates: {}, geminiCopied: false };
    }
    map[cleanE].manualDone = false;
    map[cleanE].forceAction = true; // Paksa tetap muncul di Perlu Tindakan
    delete map[cleanE].processedAt;
    if (map[email]) {
      map[email].manualDone = false;
      map[email].forceAction = true;
      delete map[email].processedAt;
    }
    setScriptPropertySafe('ACTION_STATUS_MAP', JSON.stringify(map));
    invalidateDashboardDataCache();
    return {
      success: true,
      message: 'Status tanda selesai dibatalkan. Member kembali ke Perlu Tindakan.'
    };
  } catch (err) {
    return { success: false, message: 'Gagal membatalkan status member: ' + err.toString() };
  }
}

/**
 * Mencatat aksi gemini_copied massal untuk email-email yang disalin
 */
function catatGeminiCopiedMassal(emails) {
  try {
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return { success: true };
    }
    
    const properties = PropertiesService.getScriptProperties();
    const mapStr = getScriptPropertySafe('ACTION_STATUS_MAP') || '{}';
    const map = JSON.parse(mapStr);
    const now = new Date().getTime();
    
    const templatesStr = properties.getProperty('WA_TEMPLATES') || '[]';
    const templates = JSON.parse(templatesStr);
    const totalTemplatesCount = templates.length;
    
    emails.forEach(email => {
      if (!email || email === 'A') return;
      const cleanEmail = email.trim();
      if (!map[cleanEmail]) {
        map[cleanEmail] = { contactSaved: false, templates: {}, geminiCopied: false };
      }
      map[cleanEmail].geminiCopied = true;
      
      // Hitung apakah sudah komplit
      let isFully = map[cleanEmail].contactSaved && map[cleanEmail].geminiCopied;
      for (let i = 0; i < totalTemplatesCount; i++) {
        if (!map[cleanEmail].templates[i]) {
          isFully = false;
          break;
        }
      }
      if (isFully && !map[cleanEmail].processedAt) {
        map[cleanEmail].processedAt = now;
      }
    });
    
    setScriptPropertySafe('ACTION_STATUS_MAP', JSON.stringify(map));
    invalidateDashboardDataCache();
    return { success: true };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

const WA_GROUP_LINK = 'https://chat.whatsapp.com/J3dfCNUH5XM16SKqVuzIRM?s=cl&p=a&ilr=1&amv=3';
const GEMINI_SHARE_LINK = 'https://gemini.google.com/u/0/gems/view';

/**
 * Mengedit data pendaftar di spreadsheet
 */
function editPendaftar(rowNumber, nama, email, wa, batasMentoring, emailBaru) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Form Responses 1") || ss.getActiveSheet();
    
    const row = parseInt(rowNumber, 10);
    if (isNaN(row) || row < 2) {
      return { success: false, message: 'Baris tidak valid' };
    }
    
    const oldEmail = sheet.getRange(row, 3).getValue() ? sheet.getRange(row, 3).getValue().toString().trim().toLowerCase() : '';
    const oldWa = sheet.getRange(row, 4).getValue() ? cleanPhone(sheet.getRange(row, 4).getValue()) : '';

    // 1. Update Kolom B (Nama Lengkap) tanpa merusak format
    if (nama !== undefined && nama !== null) {
      sheet.getRange(row, 2).setValue(nama.toString().trim());
    }

    // 2. Update Kolom C (Alamat Email)
    if (email !== undefined && email !== null) {
      sheet.getRange(row, 3).setValue(email.toString().trim());
      // Jika email pendaftaran diubah, sinkronkan ke Supabase Whitelist LMS (hanya ubah kolom email, data lain di Supabase tetap utuh)
      const cleanNewEmail = email.toString().trim().toLowerCase();
      if (oldEmail && cleanNewEmail && oldEmail !== cleanNewEmail) {
        try {
          updateSupabaseMemberEmail(oldEmail, cleanNewEmail);
        } catch(eSup) {
          Logger.log("Auto sync supabase email on editPendaftar: " + eSup.toString());
        }
      }
    }
    
    // 3. Update Kolom D (No WhatsApp)
    // Gunakan format teks '@' agar nomor HP berawalan 0 atau 62 tetap utuh TANPA menambah tanda petik (')
    if (wa !== undefined && wa !== null) {
      let waVal = wa.toString().trim();
      if (waVal.startsWith("'")) {
        waVal = waVal.substring(1).trim();
      }
      sheet.getRange(row, 4).setNumberFormat('@').setValue(waVal);
    }
    
    // 4. Update Kolom E (Batas Akses Mentoring / Tanggal)
    // Simpan sebagai Date Object jika valid, atau string bersih tanpa merusak format sel tanggal
    if (batasMentoring !== undefined && batasMentoring !== null) {
      let tglStr = batasMentoring.toString().trim();
      if (tglStr.startsWith("'")) {
        tglStr = tglStr.substring(1).trim();
      }
      if (tglStr !== '') {
        const parsedD = parseIndonesianDate(tglStr);
        if (parsedD && !isNaN(parsedD.getTime())) {
          sheet.getRange(row, 5).setValue(parsedD);
        } else {
          sheet.getRange(row, 5).setValue(tglStr);
        }
      } else {
        sheet.getRange(row, 5).setValue('');
      }
    }
    
    // CATATAN PENTING: Kolom F (index 6) dan Kolom G (index 7) berisi rumus:
    // Kolom F =countif(C:C; C...)
    // Kolom G =countif(D:D; D...)
    // Kolom F dan G TIDAK disentuh sama sekali agar rumus tetap utuh dan otomatis recalculate!
    
    // 5. Update Kolom H (Email Baru untuk Akses Gemini)
    if (emailBaru !== undefined && emailBaru !== null) {
      let ebVal = emailBaru.toString().trim();
      if (ebVal.startsWith("'")) {
        ebVal = ebVal.substring(1).trim();
      }
      sheet.getRange(row, 8).setValue(ebVal);
    }

    // 6. Migrasikan & Pertahankan ACTION_STATUS_MAP agar tombol aksi/template TIDAK reset jadi merah saat diedit
    try {
      const properties = PropertiesService.getScriptProperties();
      const mapStr = getScriptPropertySafe('ACTION_STATUS_MAP') || '{}';
      const map = JSON.parse(mapStr);
      const rowKey = 'row_' + row;
      const cleanNewEmail = email !== undefined && email !== null ? email.toString().trim().toLowerCase() : oldEmail;
      const cleanNewWa = wa !== undefined && wa !== null ? cleanPhone(wa) : oldWa;
      const waKey = cleanNewWa ? ('wa_' + cleanNewWa) : '';
      const oldWaKey = oldWa ? ('wa_' + oldWa) : '';

      const existingEntry = map[rowKey] || (oldEmail && map[oldEmail]) || (oldWaKey && map[oldWaKey]) || (cleanNewEmail && map[cleanNewEmail]) || (waKey && map[waKey]);
      if (existingEntry) {
        map[rowKey] = existingEntry;
        if (cleanNewEmail) map[cleanNewEmail] = existingEntry;
        if (oldEmail) map[oldEmail] = existingEntry;
        if (waKey) map[waKey] = existingEntry;
        setScriptPropertySafe('ACTION_STATUS_MAP', JSON.stringify(map));
      }
    } catch(eMap) {
      Logger.log("Gagal sync status di editPendaftar: " + eMap.toString());
    }
    
    invalidateDashboardDataCache();
    return {
      success: true,
      message: 'Berhasil memperbarui data di baris ' + row + ' tanpa merubah format sel!'
    };
  } catch (error) {
    return {
      success: false,
      message: 'Gagal memperbarui data: ' + error.toString()
    };
  }
}

/**
 * Menghapus pendaftar dari spreadsheet
 */
function hapusPendaftar(rowNumber) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Form Responses 1") || ss.getActiveSheet();
    
    const row = parseInt(rowNumber);
    if (isNaN(row) || row < 2) {
      return { success: false, message: 'Baris tidak valid' };
    }
    
    sheet.deleteRow(row);
    invalidateDashboardDataCache();
    
    return {
      success: true,
      message: 'Berhasil menghapus pendaftar di baris ' + row
    };
  } catch (error) {
    return {
      success: false,
      message: 'Gagal menghapus data: ' + error.toString()
    };
  }
}

/**
 * Mengambil data pembeli yang BELUM mengisi form pendaftaran dari Sheet UPDATE / Transactions
 */
function getUnfilledFormsData(sharedContext, forceFresh) {
  // 1. Coba baca dari Script Cache jika tidak dipaksa fresh dan tanpa custom sharedContext
  if (!forceFresh && !sharedContext) {
    try {
      const cached = CacheService.getScriptCache().get('UNFILLED_FORMS_CACHE_V2');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.success) return parsed;
      }
    } catch(e) {}
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheetUpdate = ss.getSheetByName("UPDATE");
    let sheetTrans = ss.getSheetByName("Private Mentoring - Lynk.id - Transactions");
    let sheetForm = ss.getSheetByName("Form Responses 1") || ss.getActiveSheet();

    // Map email yang SUDAH DI-REMARK (Tandai Selesai) dari Script Properties
    const remarkedEmails = new Set();
    let markedMap = {};
    try {
      const markedStr = getScriptPropertySafe('MARKED_FILLED_MAP') || '{}';
      markedMap = JSON.parse(markedStr);
      for (const e in markedMap) {
        if (markedMap[e] === true) remarkedEmails.add(e.toLowerCase());
      }
    } catch (err) {}

    // Map email & nama yang SUDAH ISI FORM (Gunakan cache dari sharedContext jika tersedia)
    let registeredFormEmails = new Set();
    let registeredFormNames = new Set();
    if (sharedContext && sharedContext.registeredFormEmails && sharedContext.registeredFormNames) {
      registeredFormEmails = sharedContext.registeredFormEmails;
      registeredFormNames = sharedContext.registeredFormNames;
    } else if (sheetForm) {
      const formData = sheetForm.getDataRange().getValues();
      for (let f = 1; f < formData.length; f++) {
        const fEmail = formData[f][2] ? formData[f][2].toString().trim().toLowerCase() : '';
        const fNama = formData[f][1] ? formData[f][1].toString().trim().toLowerCase() : '';
        if (fEmail) registeredFormEmails.add(fEmail);
        if (fNama) registeredFormNames.add(fNama);
      }
    }

    const unfilledList = [];
    let sheetTarget = ss.getSheetByName("UPDATE") || ss.getSheetByName("Private Mentoring - Lynk.id - Transactions");

    // Map nomor WA langsung dari sheet mentah Lynk.id (Kolom T JSON & Kolom S)
    const rawLynkPhoneMap = {};
    if (sheetTrans) {
      try {
        const rawTransData = sheetTrans.getDataRange().getValues();
        if (rawTransData.length > 1) {
          const rawHeaders = rawTransData[0].map(h => h ? h.toString().trim().toLowerCase() : '');
          let rColEmail = rawHeaders.findIndex(h => h.includes('email'));
          let rColNama = rawHeaders.findIndex(h => h.includes('nama') || h.includes('name'));
          if (rColEmail === -1) rColEmail = 16;
          if (rColNama === -1) rColNama = 17;

          for (let r = 1; r < rawTransData.length; r++) {
            const rEmail = rawTransData[r][rColEmail] ? rawTransData[r][rColEmail].toString().trim().toLowerCase() : '';
            const rNama = rawTransData[r][rColNama] ? rawTransData[r][rColNama].toString().trim().toLowerCase() : '';
            const rPhone = extractPhoneFromRowData(rawTransData[r]);
            if (rPhone && rPhone.length >= 10) {
              if (rEmail) rawLynkPhoneMap[rEmail] = rPhone;
              if (rNama) rawLynkPhoneMap[rNama] = rPhone;
            }
          }
        }
      } catch (eRaw) {
        Logger.log("Gagal map raw Lynk transactions: " + eRaw.toString());
      }
    }

    if (sheetTarget) {
      const transData = sheetTarget.getDataRange().getValues();
      const isSheetUpdate = sheetTarget.getName() === "UPDATE";

      if (transData.length > 1) {
        const headers = transData[0].map(h => h ? h.toString().trim().toLowerCase() : '');
        let colIsiForm = headers.findIndex(h => h.includes('isi form') || h.includes('remark'));

        const startRow = isSheetUpdate ? 1 : 2;
        const colTanggal = isSheetUpdate ? 0 : 14;
        const colEmail = isSheetUpdate ? 1 : 16;
        const colNama = isSheetUpdate ? 2 : 17;
        const colJenis = isSheetUpdate ? 3 : 13;
        const colHarga = isSheetUpdate ? 4 : 13;
        const colGeminiPro = isSheetUpdate ? 6 : 7;

        for (let i = startRow; i < transData.length; i++) {
          const row = transData[i];

          const rawEmail = row[colEmail] ? row[colEmail].toString().trim() : '';
          const rawNama = row[colNama] ? row[colNama].toString().trim() : '';
          if (!rawEmail && !rawNama) continue;
          if (rawEmail.toLowerCase().includes('email') || rawNama.toLowerCase().includes('nama')) continue; // Lewati header

          const cleanEmail = rawEmail.toLowerCase();
          const cleanNama = rawNama.toLowerCase();
          const tglVal = normalizeLynkDateString(row[colTanggal]);

          const isRemarked = isTransactionFilled(row, cleanEmail, cleanNama, registeredFormEmails, registeredFormNames, remarkedEmails, i + 1, markedMap, colIsiForm, tglVal);
          const isMemberLama = (cleanEmail && registeredFormEmails.has(cleanEmail)) || (cleanNama && registeredFormNames.has(cleanNama));

          // 1. Ekstrak nomor WA dari baris ini (mengabaikan kolom tanggal)
          let cleanedNo = extractPhoneFromRowData(row);
          
          // 2. Jika di sheet UPDATE belum ada WA, cari cross-sheet dari sheet transaksi mentah Lynk.id
          if ((!cleanedNo || cleanedNo.length < 10) && (cleanEmail || cleanNama)) {
            cleanedNo = rawLynkPhoneMap[cleanEmail] || rawLynkPhoneMap[cleanNama] || '';
          }

          // 3. Pastikan nomor valid (8-16 digit, mendukung Indonesia & Internasional) yang disimpan
          if (cleanedNo && (cleanedNo.length < 8 || cleanedNo.length > 16)) {
            cleanedNo = '';
          }

          const displayPhone = (cleanedNo && cleanedNo.length >= 10) ? ('+' + cleanedNo) : '';

          let isGeminiPro = false;
          if (isSheetUpdate) {
            const geminiVal = row[colGeminiPro] ? parseFloat(row[colGeminiPro].toString()) : 0;
            const geminiStr = row[colGeminiPro] ? row[colGeminiPro].toString().toLowerCase() : '';
            isGeminiPro = geminiVal > 0 || geminiStr.includes('300') || geminiStr.includes('gemini');
          } else {
            const notesCell = row[19] ? row[19].toString() : '';
            const addonVal = row[7] ? parseFloat(row[7].toString()) : 0;
            isGeminiPro = addonVal > 0 || notesCell.toLowerCase().includes('gemini pro');
          }

          const hargaVal = row[colHarga] ? row[colHarga].toString() : '195000';
          const jenisVal = (isSheetUpdate && row[colJenis]) ? row[colJenis].toString() : 'Member #4';

          unfilledList.push({
            rowNumber: i + 1,
            timestamp: tglVal,
            nama: rawNama || (rawEmail ? rawEmail.split('@')[0] : 'Pembeli Lynk.id'),
            email: rawEmail,
            waRaw: displayPhone,
            waCleaned: cleanedNo,
            jenisMember: jenisVal,
            harga: hargaVal,
            hasGeminiPro: isGeminiPro,
            isRemarked: isRemarked,
            isMemberLama: isMemberLama
          });
        }
      }
    }

    const res = {
      success: true,
      totalUnfilled: unfilledList.length,
      unfilledList: unfilledList
    };

    // Simpan ke CacheService selama 60 detik jika bukan custom context
    if (!sharedContext) {
      try {
        CacheService.getScriptCache().put('UNFILLED_FORMS_CACHE_V2', JSON.stringify(res), 60);
      } catch(eCache) {}
    }

    return res;
  } catch (err) {
    return {
      success: false,
      message: 'Gagal mengambil data rekap transaksi pembeli: ' + err.toString(),
      totalUnfilled: 0,
      unfilledList: []
    };
  }
}

/**
 * Pemindai nomor HP serbaguna dari seluruh sel di dalam baris spreadsheet (Aman dari Kolom Tanggal)
 */
function extractPhoneFromRowData(row) {
  if (!row || !Array.isArray(row)) return '';

  // 1. Cek Kolom T (index 19: JSON WA) & Kolom S (index 18: Phone) terlebih dahulu
  if (row.length > 19 && row[19]) {
    const pT = extractPhoneFromText(row[19]);
    if (pT && pT.length >= 10) return pT;
  }
  if (row.length > 18 && row[18]) {
    const pS = extractPhoneFromText(row[18]);
    if (pS && pS.length >= 8) return pS;
  }

  // 2. Memindai sel dari index 15 ke atas (area kolom kontak Lynk.id)
  for (let c = 15; c < row.length; c++) {
    if (row[c]) {
      const p = extractPhoneFromText(row[c]);
      if (p && p.length >= 8) return p;
    }
  }

  // 3. Pindai kolom selain Kolom Tanggal (Hindari Index 0 & Index 14 yang berisi Timestamp)
  for (let c = 1; c < row.length; c++) {
    if (c === 14) continue; // Lewati kolom tanggal transaksi mentah
    if (row[c]) {
      const p = extractPhoneFromText(row[c]);
      if (p && p.length >= 8) return p;
    }
  }

  return '';
}

/**
 * Helper parsing tanggal dari spreadsheet (DD-MM-YYYY HH:mm:ss atau Date)
 */
function parseSheetDate(val) {
  return parseIndonesianDate(val);
}

/**
 * Helper ekstraksi nomor HP presisi dari teks JSON & string biasa (Anti-Salah Tanggal)
 */
function extractPhoneFromText(txt) {
  return cleanPhone(txt);
}

/**
 * Menandai pembeli sudah mengisi form secara manual di tab Lynk.id
 */
function markIsiFormManual(email, rowNumber, formEmail, phone, name) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetTarget = ss.getSheetByName("UPDATE") || ss.getSheetByName("Private Mentoring - Lynk.id - Transactions");
    let targetEmail = (email || '').toString().trim().toLowerCase();
    let targetFormEmail = (formEmail || '').toString().trim().toLowerCase();
    let targetPhone = cleanPhone(phone || '');
    let targetName = (name || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');

    if (sheetTarget && rowNumber && rowNumber > 1) {
      const data = sheetTarget.getDataRange().getValues();
      const headers = data[0].map(h => h ? h.toString().trim().toLowerCase() : '');
      let colIsiForm = headers.findIndex(h => h.includes('isi form') || h.includes('remark'));
      // HANYA update sel jika kolom khusus "Isi Form" / "Remark" benar-benar ada di spreadsheet
      if (colIsiForm !== -1) {
        sheetTarget.getRange(rowNumber, colIsiForm + 1).setValue(true);
      }

      if (!targetEmail) {
        const colEmail = (sheetTarget.getName() === "UPDATE") ? 1 : 16;
        targetEmail = (data[rowNumber - 1][colEmail] || '').toString().trim().toLowerCase();
      }
      if (!targetPhone && sheetTarget.getName() !== "UPDATE") {
        targetPhone = cleanPhone(data[rowNumber - 1][16] || '');
      }
      if (!targetName) {
        const colName = (sheetTarget.getName() === "UPDATE") ? 0 : 15;
        targetName = (data[rowNumber - 1][colName] || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
      }
    }
    
    // Simpan ke Script Properties dengan key unik transaksi (txKey) & email manual
    // (Tidak lagi menggunakan 'row_X' agar saat ada pembeli baru masuk di baris 2, pembeli baru TIDAK mewarisi status Remarked!)
    const mapStr = getScriptPropertySafe('MARKED_FILLED_MAP') || '{}';
    const filledMap = JSON.parse(mapStr);
    let normTs = '';
    if (sheetTarget && rowNumber && rowNumber > 1) {
      const data = sheetTarget.getDataRange().getValues();
      const colTanggal = (sheetTarget.getName() === "UPDATE") ? 0 : 14;
      if (data[rowNumber - 1]) {
        normTs = normalizeLynkDateString(data[rowNumber - 1][colTanggal]);
      }
    }
    const txKey = 'tx_' + (targetEmail || targetName || rowNumber) + '_' + normTs;
    filledMap[txKey] = true;
    if (targetEmail) {
      filledMap['manual_email_' + targetEmail] = true;
      delete filledMap['unmark_' + targetEmail];
    }
    if (targetFormEmail) {
      filledMap['manual_email_' + targetFormEmail] = true;
      delete filledMap['unmark_' + targetFormEmail];
    }
    // CATATAN: Remark transaksi di tab Lynk.id TIDAK BOLEH memodifikasi ACTION_STATUS_MAP
    // agar data member di tab "Perlu Tindakan" TIDAK hilang (konfirmasi Perlu Tindakan dilakukan terpisah oleh Admin).

    setScriptPropertySafe('MARKED_FILLED_MAP', JSON.stringify(filledMap));
    try {
      CacheService.getScriptCache().remove('UNFILLED_FORMS_CACHE_V2');
    } catch(eC) {}
    invalidateDashboardDataCache();

    return {
      success: true,
      message: 'Berhasil menandai transaksi pembeli di tab Lynk.id!'
    };
  } catch (error) {
    return {
      success: false,
      message: 'Gagal menandai status: ' + error.toString()
    };
  }
}

/**
 * Membatalkan tanda sudah mengisi form (Unmark)
 */
function unmarkIsiFormManual(email, rowNumber) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetTarget = ss.getSheetByName("UPDATE") || ss.getSheetByName("Private Mentoring - Lynk.id - Transactions");
    let targetEmail = (email || '').toString().trim().toLowerCase();

    if (sheetTarget && rowNumber && rowNumber > 1) {
      const data = sheetTarget.getDataRange().getValues();
      const headers = data[0].map(h => h ? h.toString().trim().toLowerCase() : '');
      let colIsiForm = headers.findIndex(h => h.includes('isi form') || h.includes('remark'));
      if (colIsiForm !== -1) {
        sheetTarget.getRange(rowNumber, colIsiForm + 1).setValue(false);
      }

      if (!targetEmail) {
        const colEmail = (sheetTarget.getName() === "UPDATE") ? 1 : 16;
        targetEmail = (data[rowNumber - 1][colEmail] || '').toString().trim().toLowerCase();
      }
    }
    
    // Tandai unmark secara eksplisit di Script Properties agar pembeli historis pun bisa di-unmark jika diinginkan
    const properties = PropertiesService.getScriptProperties();
    const mapStr = getScriptPropertySafe('MARKED_FILLED_MAP') || '{}';
    const filledMap = JSON.parse(mapStr);
    let normTs = '';
    if (sheetTarget && rowNumber && rowNumber > 1) {
      const data = sheetTarget.getDataRange().getValues();
      const colTanggal = (sheetTarget.getName() === "UPDATE") ? 0 : 14;
      if (data[rowNumber - 1]) {
        normTs = normalizeLynkDateString(data[rowNumber - 1][colTanggal]);
      }
    }
    const txKey = 'tx_' + (targetEmail || rowNumber) + '_' + normTs;
    filledMap[txKey] = false;
    if (rowNumber && rowNumber > 1) {
      delete filledMap['row_' + rowNumber];
      delete filledMap[String(rowNumber)];
    }
    if (targetEmail) {
      delete filledMap[targetEmail];
      delete filledMap['email_' + targetEmail];
      delete filledMap['manual_email_' + targetEmail];
      filledMap['unmark_' + targetEmail] = true;
    }
    setScriptPropertySafe('MARKED_FILLED_MAP', JSON.stringify(filledMap));

    // Kembalikan status di ACTION_STATUS_MAP jika sebelumnya ditandai manual
    if (targetEmail) {
      const actionMapStr = getScriptPropertySafe('ACTION_STATUS_MAP') || '{}';
      let actionMap = {};
      try { actionMap = JSON.parse(actionMapStr); } catch (eAct) {}
      if (actionMap[targetEmail] && actionMap[targetEmail].manualDone) {
        delete actionMap[targetEmail].manualDone;
        setScriptPropertySafe('ACTION_STATUS_MAP', JSON.stringify(actionMap));
      }
    }

    invalidateDashboardDataCache();

    return {
      success: true,
      message: 'Status tanda remark berhasil dibatalkan!'
    };
  } catch (error) {
    return {
      success: false,
      message: 'Gagal membatalkan status: ' + error.toString()
    };
  }
}

/**
 * Helper Chunking CacheService Google Apps Script Ultra Cepat (Batch putAll/getAll)
 * Memangkas puluhan panggilan RPC individual menjadi 1 operasi batch (<20ms)
 */
function saveToScriptCacheChunked(key, strData, ttlSeconds) {
  try {
    const cache = CacheService.getScriptCache();
    const chunkSize = 85000; // 85KB per chunk agar selalu aman di bawah batas 100KB
    const totalChunks = Math.ceil(strData.length / chunkSize);
    if (totalChunks > 25) return false;
    
    const entries = {};
    entries[key + '_chunks'] = String(totalChunks);
    for (let i = 0; i < totalChunks; i++) {
      entries[key + '_' + i] = strData.substring(i * chunkSize, (i + 1) * chunkSize);
    }
    cache.putAll(entries, ttlSeconds);
    return true;
  } catch(e) {
    return false;
  }
}

function getFromScriptCacheChunked(key) {
  try {
    const cache = CacheService.getScriptCache();
    const chunksStr = cache.get(key + '_chunks');
    if (!chunksStr) return null;
    const totalChunks = parseInt(chunksStr, 10);
    if (isNaN(totalChunks) || totalChunks <= 0) return null;
    
    const keys = [];
    for (let i = 0; i < totalChunks; i++) {
      keys.push(key + '_' + i);
    }
    const chunks = cache.getAll(keys);
    let fullStr = '';
    for (let i = 0; i < totalChunks; i++) {
      const part = chunks[key + '_' + i];
      if (!part) return null; // Cache belum lengkap/kadaluarsa
      fullStr += part;
    }
    return fullStr;
  } catch(e) {
    return null;
  }
}

function invalidateDashboardDataCache() {
  try {
    const cache = CacheService.getScriptCache();
    const keysToRemove = [
      'DASHBOARD_DATA_CACHE_chunks',
      'MEMBER_DATA_CACHE_V2_chunks',
      'UNFILLED_FORMS_CACHE_V2'
    ];
    for (let i = 0; i < 25; i++) {
      keysToRemove.push('DASHBOARD_DATA_CACHE_' + i);
      keysToRemove.push('MEMBER_DATA_CACHE_V2_' + i);
    }
    cache.removeAll(keysToRemove);
  } catch(e) {}
}

/**
 * Panggilan Cepat Terpadu (Unified Dashboard Data) dengan Akselerasi CacheService (<150ms)
 * Memangkas waktu muat dari 4-6 detik menjadi di bawah 200 milidetik
 */
function getAllDashboardData(forceFresh) {
  // 1. Coba baca dari Script Cache super cepat jika tidak dipaksa refresh
  if (!forceFresh) {
    const cachedJson = getFromScriptCacheChunked('DASHBOARD_DATA_CACHE');
    if (cachedJson) {
      try {
        const parsed = JSON.parse(cachedJson);
        if (parsed && parsed.success) {
          parsed.isFromCache = true;
          return parsed;
        }
      } catch(e) {}
    }
  }

  try {
    const memberResult = getMemberData(forceFresh);
    // Gunakan shared context dari memberResult untuk menghindari fetch ulang Form Responses 1
    const sharedContext = {
      registeredFormEmails: memberResult._registeredEmails,
      registeredFormNames: memberResult._registeredNames
    };
    const unfilledResult = getUnfilledFormsData(sharedContext, forceFresh);

    // Hapus field internal sebelum dikirim ke client
    delete memberResult._registeredEmails;
    delete memberResult._registeredNames;

    const res = {
      success: true,
      cloudVersion: CLOUD_APP_VERSION,
      releaseNotes: CLOUD_RELEASE_NOTES,
      memberData: memberResult,
      unfilledData: unfilledResult,
      timestamp: new Date().getTime()
    };

    // Simpan ke CacheService selama 600 detik (10 menit)
    try {
      saveToScriptCacheChunked('DASHBOARD_DATA_CACHE', JSON.stringify(res), 600);
    } catch(eCache) {}

    return res;
  } catch (error) {
    return {
      success: false,
      message: 'Gagal memuat data terpadu: ' + error.toString()
    };
  }
}

/**
 * Menandai transaksi pembeli massal (Bulk Remark) secara presisi berbasis nomor baris transaksi
 */
function bulkRemarkTransactions(payload) {
  try {
    let rowsToMark = [];
    let emails = [];
    let phones = [];
    let names = [];
    
    if (payload && typeof payload === 'object') {
      if (Array.isArray(payload)) {
        if (payload.length > 0 && typeof payload[0] === 'number') {
          rowsToMark = payload;
        } else if (payload.length > 0 && typeof payload[0] === 'object' && payload[0].rowNumber) {
          rowsToMark = payload.map(p => Number(p.rowNumber));
          emails = payload.map(p => p.email).filter(Boolean);
          phones = payload.map(p => p.phone || p.wa).filter(Boolean);
          names = payload.map(p => p.nama || p.name).filter(Boolean);
        } else {
          emails = payload;
        }
      } else {
        if (Array.isArray(payload.rowNumbers)) rowsToMark = payload.rowNumbers.map(Number);
        if (Array.isArray(payload.emails)) emails = payload.emails;
        if (Array.isArray(payload.phones)) phones = payload.phones;
        if (Array.isArray(payload.names)) names = payload.names;
      }
    }

    if (rowsToMark.length === 0 && emails.length === 0 && phones.length === 0 && names.length === 0) {
      return { success: false, message: 'Tidak ada data transaksi terpilih untuk di-remark.' };
    }

    const properties = PropertiesService.getScriptProperties();
    const mapStr = getScriptPropertySafe('MARKED_FILLED_MAP') || '{}';
    const filledMap = JSON.parse(mapStr);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetTarget = ss.getSheetByName("UPDATE") || ss.getSheetByName("Private Mentoring - Lynk.id - Transactions");

    let markedCount = 0;

    if (sheetTarget) {
      const data = sheetTarget.getDataRange().getValues();
      const headers = data[0].map(h => h ? h.toString().trim().toLowerCase() : '');
      let colIsiForm = headers.findIndex(h => h.includes('isi form') || h.includes('remark'));

      // 1. Eksekusi centang HANYA pada baris yang dipilih jika kolom "Isi Form" / "Remark" tersedia di spreadsheet
      const colEmail = (sheetTarget.getName() === "UPDATE") ? 1 : 16;
      if (rowsToMark.length > 0) {
        rowsToMark.forEach(rNum => {
          if (rNum && rNum > 1 && rNum <= data.length) {
            if (colIsiForm !== -1) {
              sheetTarget.getRange(rNum, colIsiForm + 1).setValue(true);
            }
            filledMap['row_' + rNum] = true;
            filledMap[String(rNum)] = true;
            const rEmail = data[rNum - 1][colEmail] ? data[rNum - 1][colEmail].toString().trim().toLowerCase() : '';
            if (rEmail) filledMap[rEmail] = true;
            markedCount++;
          }
        });
      } else if (emails.length > 0) {
        const emailSet = new Set(emails.map(e => (e || '').toString().trim().toLowerCase()).filter(Boolean));
        for (let i = 1; i < data.length; i++) {
          const rowE = data[i][colEmail] ? data[i][colEmail].toString().trim().toLowerCase() : '';
          if (rowE && emailSet.has(rowE)) {
            if (colIsiForm !== -1) {
              sheetTarget.getRange(i + 1, colIsiForm + 1).setValue(true);
            }
            filledMap['row_' + (i + 1)] = true;
            filledMap[String(i + 1)] = true;
            filledMap[rowE] = true;
            markedCount++;
          }
        }
      }
    } else {
      if (rowsToMark.length > 0) {
        rowsToMark.forEach(rNum => {
          filledMap['row_' + rNum] = true;
          filledMap[String(rNum)] = true;
          markedCount++;
        });
      }
    }

    (emails || []).forEach(e => {
      if (!e) return;
      const cleanE = e.toString().trim().toLowerCase();
      if (cleanE) {
        filledMap[cleanE] = true;
        filledMap['email_' + cleanE] = true;
      }
    });

    // CATATAN: Remark transaksi Lynk.id TIDAK BOLEH memodifikasi ACTION_STATUS_MAP
    // agar data member di tab "Perlu Tindakan" TIDAK hilang.
    setScriptPropertySafe('MARKED_FILLED_MAP', JSON.stringify(filledMap));
    try {
      CacheService.getScriptCache().remove('UNFILLED_FORMS_CACHE_V2');
    } catch(eC) {}
    invalidateDashboardDataCache();

    return {
      success: true,
      message: 'Berhasil menandai ' + (markedCount || rowsToMark.length || emails.length) + ' transaksi terpilih di tab Lynk.id!'
    };
  } catch (error) {
    return {
      success: false,
      message: 'Gagal menandai masal: ' + error.toString()
    };
  }
}

/**
 * Membatalkan remark banyak transaksi sekaligus (Bulk Unmark) di tab Lynk.id
 */
function bulkUnmarkTransactions(payload) {
  try {
    let rowsToUnmark = [];
    let emails = [];
    if (payload && typeof payload === 'object') {
      if (Array.isArray(payload.rowNumbers)) rowsToUnmark = payload.rowNumbers.map(Number);
      if (Array.isArray(payload.emails)) emails = payload.emails;
    }
    if (rowsToUnmark.length === 0 && emails.length === 0) {
      return { success: false, message: 'Tidak ada data transaksi terpilih untuk dibatalkan remark-nya.' };
    }

    const properties = PropertiesService.getScriptProperties();
    const mapStr = getScriptPropertySafe('MARKED_FILLED_MAP') || '{}';
    const filledMap = JSON.parse(mapStr);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetTarget = ss.getSheetByName("UPDATE") || ss.getSheetByName("Private Mentoring - Lynk.id - Transactions");

    if (sheetTarget) {
      const data = sheetTarget.getDataRange().getValues();
      const headers = data[0].map(h => h ? h.toString().trim().toLowerCase() : '');
      let colIsiForm = headers.findIndex(h => h.includes('isi form') || h.includes('remark'));
      if (colIsiForm !== -1) {
        rowsToUnmark.forEach(rNum => {
          if (rNum && rNum > 1 && rNum <= data.length) {
            sheetTarget.getRange(rNum, colIsiForm + 1).setValue(false);
          }
        });
      }
    }

    rowsToUnmark.forEach(rNum => {
      delete filledMap['row_' + rNum];
      delete filledMap[String(rNum)];
    });
    emails.forEach(e => {
      if (e) delete filledMap[e.toString().trim().toLowerCase()];
    });

    setScriptPropertySafe('MARKED_FILLED_MAP', JSON.stringify(filledMap));
    invalidateDashboardDataCache();

    return {
      success: true,
      message: 'Berhasil membatalkan status remark ' + (rowsToUnmark.length || emails.length) + ' transaksi!'
    };
  } catch (error) {
    return { success: false, message: 'Gagal batal remark massal: ' + error.toString() };
  }
}

/**
 * Mereset seluruh status remark di tab Lynk.id (Menghapus seluruh cache tanda remark yang salah)
 */
function resetAllLynkRemarks() {
  try {
    const properties = PropertiesService.getScriptProperties();
    setScriptPropertySafe('MARKED_FILLED_MAP', '{}');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetTarget = ss.getSheetByName("UPDATE") || ss.getSheetByName("Private Mentoring - Lynk.id - Transactions");
    if (sheetTarget) {
      const data = sheetTarget.getDataRange().getValues();
      const headers = data[0].map(h => h ? h.toString().trim().toLowerCase() : '');
      let colIsiForm = headers.findIndex(h => h.includes('isi form') || h.includes('remark'));
      if (colIsiForm !== -1 && data.length > 1) {
        sheetTarget.getRange(2, colIsiForm + 1, data.length - 1, 1).setValue(false);
      }
    }

    invalidateDashboardDataCache();
    return {
      success: true,
      message: 'Seluruh tanda remark Lynk.id berhasil di-reset!'
    };
  } catch (err) {
    return { success: false, message: 'Gagal reset remark: ' + err.toString() };
  }
}

/**
 * Menandai member telah terinput ke Whitelist LMS
 */
function confirmWhitelistMember(email, rowNumber) {
  try {
    if (!email && !rowNumber) return { success: false, message: 'Data member tidak valid.' };
    const properties = PropertiesService.getScriptProperties();
    const mapStr = getScriptPropertySafe('WHITELIST_CONFIRMED_MAP') || '{}';
    const map = JSON.parse(mapStr);
    const now = new Date().getTime();

    if (email) {
      map[email.toString().trim().toLowerCase()] = { confirmedAt: now, rowNumber: rowNumber };
    }
    if (rowNumber) {
      map['row_' + rowNumber] = { confirmedAt: now, email: email };
    }

    setScriptPropertySafe('WHITELIST_CONFIRMED_MAP', JSON.stringify(map));
    invalidateDashboardDataCache();
    return {
      success: true,
      message: 'Member berhasil dikonfirmasi ke Whitelist LMS!'
    };
  } catch (err) {
    return { success: false, message: 'Gagal konfirmasi whitelist: ' + err.toString() };
  }
}

/**
 * Menandai banyak member sekaligus (massal) telah terinput ke Whitelist LMS
 */
function bulkConfirmWhitelist(payload) {
  try {
    let rows = [];
    let emails = [];
    if (payload && typeof payload === 'object') {
      if (Array.isArray(payload.rowNumbers)) rows = payload.rowNumbers.map(Number);
      if (Array.isArray(payload.emails)) emails = payload.emails;
    }

    if (rows.length === 0 && emails.length === 0) {
      return { success: false, message: 'Tidak ada data member terpilih.' };
    }

    const properties = PropertiesService.getScriptProperties();
    const mapStr = getScriptPropertySafe('WHITELIST_CONFIRMED_MAP') || '{}';
    const map = JSON.parse(mapStr);
    const now = new Date().getTime();

    rows.forEach(r => {
      if (r) map['row_' + r] = { confirmedAt: now };
    });
    emails.forEach(e => {
      if (e) map[e.toString().trim().toLowerCase()] = { confirmedAt: now };
    });

    setScriptPropertySafe('WHITELIST_CONFIRMED_MAP', JSON.stringify(map));
    invalidateDashboardDataCache();
    return {
      success: true,
      message: 'Berhasil mengonfirmasi ' + (rows.length || emails.length) + ' member ke Whitelist LMS!'
    };
  } catch (err) {
    return { success: false, message: 'Gagal konfirmasi massal: ' + err.toString() };
  }
}

/**
 * Membatalkan status konfirmasi whitelist
 */
function unconfirmWhitelistMember(email, rowNumber) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const mapStr = getScriptPropertySafe('WHITELIST_CONFIRMED_MAP') || '{}';
    const map = JSON.parse(mapStr);

    if (email) delete map[email.toString().trim().toLowerCase()];
    if (rowNumber) delete map['row_' + rowNumber];

    setScriptPropertySafe('WHITELIST_CONFIRMED_MAP', JSON.stringify(map));
    invalidateDashboardDataCache();
    return {
      success: true,
      message: 'Konfirmasi whitelist dibatalkan.'
    };
  } catch (err) {
    return { success: false, message: 'Gagal membatalkan konfirmasi: ' + err.toString() };
  }
}

/**
 * Membatalkan status konfirmasi whitelist secara massal
 */
function bulkUnconfirmWhitelist(data) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const mapStr = getScriptPropertySafe('WHITELIST_CONFIRMED_MAP') || '{}';
    const map = JSON.parse(mapStr);

    const rows = (data && data.rowNumbers) || [];
    const emails = (data && data.emails) || [];

    rows.forEach(function(row) {
      if (row) delete map['row_' + row];
    });

    emails.forEach(function(email) {
      if (email) delete map[email.toString().trim().toLowerCase()];
    });

    setScriptPropertySafe('WHITELIST_CONFIRMED_MAP', JSON.stringify(map));
    invalidateDashboardDataCache();

    return {
      success: true,
      message: 'Berhasil mengembalikan ' + (rows.length || emails.length) + ' data ke antrean Whitelist!'
    };
  } catch (err) {
    return { success: false, message: 'Gagal mengembalikan data whitelist: ' + err.toString() };
  }
}

/**
 * Mengirim daftar member ke Supabase REST API (Tabel Whitelist LMS)
 */
function sendMembersToSupabase(members, supabaseUrl, supabaseKey, tableName, colEmail, colName) {
  try {
    if (!members || !Array.isArray(members) || members.length === 0) {
      return { success: false, message: 'Tidak ada data member yang dikirim.' };
    }

    const defaultUrl = (function() {
      try {
        const prop = PropertiesService.getScriptProperties().getProperty('SUPABASE_URL');
        return (prop && prop.trim()) ? prop.trim() : 'https://dtbbmpuqfstwxewylbao.supabase.co';
      } catch(e) { return 'https://dtbbmpuqfstwxewylbao.supabase.co'; }
    })();
    const defaultKey = (function() {
      try {
        const prop = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_ROLE_KEY');
        return (prop && prop.trim()) ? prop.trim() : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0YmJtcHVxZnN0d3hld3lsYmFvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTg2Nzk2NiwiZXhwIjoyMTA3NDQzOTY2fQ.X_rIR_fnlF9y9AA5XY37EKevSxuAViiU92q9dXgVriQ';
      } catch(e) { return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0YmJtcHVxZnN0d3hld3lsYmFvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTg2Nzk2NiwiZXhwIjoyMTA3NDQzOTY2fQ.X_rIR_fnlF9y9AA5XY37EKevSxuAViiU92q9dXgVriQ'; }
    })();

    const sUrl = (supabaseUrl && supabaseUrl.trim()) ? supabaseUrl.trim() : defaultUrl;
    const sKey = (supabaseKey && supabaseKey.trim()) ? supabaseKey.trim() : defaultKey;
    const table = (tableName || 'whitelist_members').trim();
    const cEmail = (colEmail || 'email').trim();
    const cName = (colName || 'full_name').trim();

    const cleanUrl = sUrl.replace(/\/+$/, '');

    // Susun payload, deduplikasi email, dan format kolom tabel whitelist Supabase
    const seenEmails = {};
    const payload = [];
    members.forEach(m => {
      const rawEmail = (m[cEmail] || m.email || '').toString().trim().toLowerCase();
      if (rawEmail && !seenEmails[rawEmail]) {
        seenEmails[rawEmail] = true;
        const item = {};
        item[cEmail] = rawEmail;
        const namaVal = m[cName] || m.nama || m.name || '';
        if (namaVal && cName) item[cName] = namaVal.toString().trim();
        item.role = m.role || 'member';
        item.is_active = (m.is_active !== undefined) ? m.is_active : true;
        payload.push(item);
      }
    });

    if (payload.length === 0) {
      return { success: false, message: 'Data email member kosong.' };
    }

    // 1. Cek apakah email yang akan didaftarkan sudah punya ID di Supabase (agar tidak bentrok primary key id saat upsert email)
    const existingEmailIdMap = {};
    try {
      const emailListParam = payload.map(p => '"' + p[cEmail].replace(/"/g, '') + '"').join(',');
      const checkUrl = cleanUrl + '/rest/v1/' + encodeURIComponent(table) + '?select=id,' + encodeURIComponent(cEmail) + '&' + encodeURIComponent(cEmail) + '=in.(' + encodeURIComponent(emailListParam) + ')';
      const checkRes = UrlFetchApp.fetch(checkUrl, {
        method: 'get',
        headers: { 'apikey': sKey, 'Authorization': 'Bearer ' + sKey },
        muteHttpExceptions: true
      });
      if (checkRes.getResponseCode() === 200) {
        const existingRows = JSON.parse(checkRes.getContentText());
        if (Array.isArray(existingRows)) {
          existingRows.forEach(r => {
            if (r && r[cEmail] && r.id) {
              existingEmailIdMap[r[cEmail].toString().trim().toLowerCase()] = r.id;
            }
          });
        }
      }
    } catch (eCheckExisting) {}

    // 2. Ambil ID tertinggi saat ini dari Supabase (prefix WL-XXXX) dengan order=id.desc (akurat secara leksikografis untuk WL-XXXX)
    let maxIdNum = 2833; // Baseline ID terverifikasi terbaru (WL-2833)
    try {
      const idQueryUrl = cleanUrl + '/rest/v1/' + encodeURIComponent(table) + '?select=id&id=like.WL-*&order=id.desc&limit=50';
      const idRes = UrlFetchApp.fetch(idQueryUrl, {
        method: 'get',
        headers: {
          'apikey': sKey,
          'Authorization': 'Bearer ' + sKey
        },
        muteHttpExceptions: true
      });
      if (idRes.getResponseCode() === 200) {
        const idData = JSON.parse(idRes.getContentText());
        if (Array.isArray(idData)) {
          idData.forEach(r => {
            if (r && r.id) {
              const m = r.id.toString().match(/^WL-(\d+)$/i);
              if (m) {
                const n = parseInt(m[1], 10);
                if (!isNaN(n) && n < 1000000 && n > maxIdNum) maxIdNum = n;
              }
            }
          });
        }
      }
    } catch (eId) {
      Logger.log("Gagal membaca last ID Supabase: " + eId.toString());
    }

    // 3. Pasang ID berurutan secara otomatis (gunakan ID lama jika email sudah ada di Supabase)
    let currentCounter = maxIdNum;
    payload.forEach(item => {
      const cleanE = item[cEmail] ? item[cEmail].toString().trim().toLowerCase() : '';
      if (cleanE && existingEmailIdMap[cleanE]) {
        item.id = existingEmailIdMap[cleanE];
      } else if (!item.id) {
        currentCounter++;
        item.id = 'WL-' + String(currentCounter).padStart(4, '0');
      }
    });

    // 4. Kirim ke Supabase dengan Auto-Retry hingga 3x jika terjadi HTTP 409 (bentrok ID WL-XXXX bersamaan)
    const endpoint = cleanUrl + '/rest/v1/' + encodeURIComponent(table) + '?on_conflict=' + encodeURIComponent(cEmail);
    let responseCode = 0;
    let responseText = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      const options = {
        method: 'post',
        headers: {
          'apikey': sKey,
          'Authorization': 'Bearer ' + sKey,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      };

      const response = UrlFetchApp.fetch(endpoint, options);
      responseCode = response.getResponseCode();
      responseText = response.getContentText();

      if (responseCode >= 200 && responseCode < 300) {
        break;
      }
      // Jika HTTP 409 karena ID WL-XXXX sudah terpakai, naikkan counter ID dan coba lagi otomatis!
      if (responseCode === 409 && attempt < 3) {
        payload.forEach(item => {
          const cleanE = item[cEmail] ? item[cEmail].toString().trim().toLowerCase() : '';
          if (!existingEmailIdMap[cleanE]) {
            currentCounter++;
            item.id = 'WL-' + String(currentCounter).padStart(4, '0');
          }
        });
      } else {
        break;
      }
    }

    if (responseCode >= 200 && responseCode < 300) {
      // Simpan status terinput ke Script Properties
      try {
        const properties = PropertiesService.getScriptProperties();
        const sentMapStr = getScriptPropertySafe('SUPABASE_SENT_MAP') || '{}';
        const sentMap = JSON.parse(sentMapStr);
        const nowTs = new Date().getTime();
        payload.forEach(item => {
          if (item[cEmail]) {
            sentMap[item[cEmail].toLowerCase()] = {
              id: item.id,
              sentAt: nowTs,
              nama: item[cName] || ''
            };
          }
        });
        setScriptPropertySafe('SUPABASE_SENT_MAP', JSON.stringify(sentMap));
        invalidateDashboardDataCache();
      } catch (eSentProp) {}

      return {
        success: true,
        message: 'Berhasil mengirim ' + payload.length + ' data ke Supabase (' + table + ')!',
        responseCode: responseCode,
        insertedMembers: payload.map(p => ({ email: p[cEmail], id: p.id }))
      };
    } else {
      return {
        success: false,
        message: 'Gagal dari Supabase (HTTP ' + responseCode + '): ' + responseText,
        responseCode: responseCode
      };
    }
  } catch (err) {
    return {
      success: false,
      message: 'Gagal kirim ke Supabase: ' + err.toString()
    };
  }
}

/**
 * Memperbarui alamat email member di Supabase REST API (Tabel Whitelist LMS)
 * Hanya mengubah kolom email (colEmail), kolom lain tetap utuh tidak tersentuh.
 */
function updateSupabaseMemberEmail(oldEmail, newEmail, supabaseUrl, supabaseKey, tableName, colEmail) {
  try {
    if (!oldEmail || !newEmail) {
      return { success: false, message: 'Email lama dan email baru tidak boleh kosong.' };
    }
    const cleanOld = oldEmail.toString().trim().toLowerCase();
    const cleanNew = newEmail.toString().trim().toLowerCase();
    if (cleanOld === cleanNew) {
      return { success: true, message: 'Email tidak berubah.' };
    }

    const defaultUrl = (function() {
      try {
        const prop = PropertiesService.getScriptProperties().getProperty('SUPABASE_URL');
        return (prop && prop.trim()) ? prop.trim() : 'https://dtbbmpuqfstwxewylbao.supabase.co';
      } catch(e) { return 'https://dtbbmpuqfstwxewylbao.supabase.co'; }
    })();
    const defaultKey = (function() {
      try {
        const prop = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_ROLE_KEY');
        return (prop && prop.trim()) ? prop.trim() : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0YmJtcHVxZnN0d3hld3lsYmFvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTg2Nzk2NiwiZXhwIjoyMTA3NDQzOTY2fQ.X_rIR_fnlF9y9AA5XY37EKevSxuAViiU92q9dXgVriQ';
      } catch(e) { return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0YmJtcHVxZnN0d3hld3lsYmFvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTg2Nzk2NiwiZXhwIjoyMTA3NDQzOTY2fQ.X_rIR_fnlF9y9AA5XY37EKevSxuAViiU92q9dXgVriQ'; }
    })();

    const sUrl = (supabaseUrl && supabaseUrl.trim()) ? supabaseUrl.trim() : defaultUrl;
    const sKey = (supabaseKey && supabaseKey.trim()) ? supabaseKey.trim() : defaultKey;
    const table = (tableName || 'whitelist_members').trim();
    const cEmail = (colEmail || 'email').trim();
    const cleanUrl = sUrl.replace(/\/+$/, '');

    // PATCH ke Supabase: hanya update kolom email tanpa menyentuh kolom lain
    const patchUrl = cleanUrl + '/rest/v1/' + encodeURIComponent(table) + '?' + encodeURIComponent(cEmail) + '=eq.' + encodeURIComponent(cleanOld);
    const patchBody = {};
    patchBody[cEmail] = cleanNew;

    const res = UrlFetchApp.fetch(patchUrl, {
      method: 'patch',
      headers: {
        'apikey': sKey,
        'Authorization': 'Bearer ' + sKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      payload: JSON.stringify(patchBody),
      muteHttpExceptions: true
    });

    const status = res.getResponseCode();
    const bodyText = res.getContentText();
    let updatedRows = [];
    try { updatedRows = JSON.parse(bodyText); } catch(e) {}

    // Migrasikan status di SUPABASE_SENT_MAP jika ada
    try {
      const props = PropertiesService.getScriptProperties();
      const sentMapStr = getScriptPropertySafe('SUPABASE_SENT_MAP') || '{}';
      const sentMap = JSON.parse(sentMapStr);
      if (sentMap[cleanOld]) {
        sentMap[cleanNew] = sentMap[cleanOld];
        delete sentMap[cleanOld];
        setScriptPropertySafe('SUPABASE_SENT_MAP', JSON.stringify(sentMap));
      }
    } catch(eMap) {}

    // Migrasikan status di WHITELIST_CONFIRMED_MAP jika ada
    try {
      const props = PropertiesService.getScriptProperties();
      const wlMapStr = getScriptPropertySafe('WHITELIST_CONFIRMED_MAP') || '{}';
      const wlMap = JSON.parse(wlMapStr);
      if (wlMap[cleanOld]) {
        wlMap[cleanNew] = wlMap[cleanOld];
        delete wlMap[cleanOld];
        setScriptPropertySafe('WHITELIST_CONFIRMED_MAP', JSON.stringify(wlMap));
      }
    } catch(eWl) {}

    invalidateDashboardDataCache();

    if (status >= 200 && status < 300) {
      return {
        success: true,
        message: 'Email di Supabase berhasil diubah ke ' + cleanNew,
        updatedRows: updatedRows
      };
    } else {
      return {
        success: false,
        message: 'Supabase HTTP ' + status + ': ' + bodyText
      };
    }
  } catch (err) {
    Logger.log("Error updateSupabaseMemberEmail: " + err.toString());
    return { success: false, message: 'Gagal update Supabase: ' + err.toString() };
  }
}

/**
 * Mencatat status email yang sudah sukses terkirim ke Supabase
 */
function catatSupabaseSent(email, id) {
  try {
    if (!email) return { success: false, message: 'Email kosong' };
    const properties = PropertiesService.getScriptProperties();
    const sentMapStr = getScriptPropertySafe('SUPABASE_SENT_MAP') || '{}';
    const sentMap = JSON.parse(sentMapStr);
    sentMap[email.toString().trim().toLowerCase()] = {
      id: id || '',
      sentAt: new Date().getTime()
    };
    setScriptPropertySafe('SUPABASE_SENT_MAP', JSON.stringify(sentMap));
    return { success: true, message: 'Status Supabase dicatat.' };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * Fungsi khusus untuk memaksa otorisasi ulang seluruh izin Google Apps Script
 * (Spreadsheet, Drive, UrlFetch, Session).
 * Pilih fungsi 'forceReauthorizeAllScopes' dari dropdown "Run" untuk memicu dialog izin.
 */
function forceReauthorizeAllScopes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.create("Zettbos Admin Temp Check");
  Logger.log("SS ID: " + ss.getId());
  var userEmail = Session.getActiveUser().getEmail();
  Logger.log("User Email: " + userEmail);
  var fetchTest = UrlFetchApp.fetch("https://script.google.com");
  Logger.log("Fetch Status: " + fetchTest.getResponseCode());
  return "Otorisasi Sukses!";
}
/**
 * Helper Penyimpanan Aman PropertiesService Google Apps Script (Anti-Limit 9KB)
 * Memecah JSON panjang ke beberapa chunk properti jika melebihi 8.000 karakter
 */
function setScriptPropertySafe(key, valStr) {
  try {
    const props = PropertiesService.getScriptProperties();
    if (!valStr || valStr.length <= 8000) {
      props.setProperty(key, valStr || '');
      props.deleteProperty(key + '_chunks');
      return true;
    }
    const chunkSize = 8000;
    const totalChunks = Math.ceil(valStr.length / chunkSize);
    const newProps = {};
    newProps[key + '_chunks'] = String(totalChunks);
    for (let i = 0; i < totalChunks; i++) {
      newProps[key + '_' + i] = valStr.substring(i * chunkSize, (i + 1) * chunkSize);
    }
    newProps[key] = valStr.substring(0, chunkSize);
    props.setProperties(newProps);
    return true;
  } catch(e) {
    Logger.log("Error setScriptPropertySafe for " + key + ": " + e.toString());
    return false;
  }
}

function getScriptPropertySafe(key) {
  try {
    const props = PropertiesService.getScriptProperties();
    const chunksStr = props.getProperty(key + '_chunks');
    if (!chunksStr) {
      return props.getProperty(key);
    }
    const totalChunks = parseInt(chunksStr, 10);
    if (isNaN(totalChunks) || totalChunks <= 0) {
      return props.getProperty(key);
    }
    let full = '';
    for (let i = 0; i < totalChunks; i++) {
      const part = props.getProperty(key + '_' + i);
      if (part !== null && part !== undefined) {
        full += part;
      }
    }
    return full || props.getProperty(key);
  } catch(e) {
    Logger.log("Error getScriptPropertySafe for " + key + ": " + e.toString());
    return null;
  }
}

/**
 * Konfirmasi Selesai Massal (Bulk Mark Done) untuk memindahkan banyak member ke Arsip sekaligus
 */
function bulkMarkMemberDoneManual(emails) {
  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return { success: false, message: 'Daftar email tidak boleh kosong.' };
  }
  try {
    const mapStr = getScriptPropertySafe('ACTION_STATUS_MAP') || '{}';
    let map = {};
    try { map = JSON.parse(mapStr); } catch(e) {}
    const now = new Date().getTime();
    let count = 0;
    emails.forEach(email => {
      if (!email) return;
      const cleanE = email.toString().trim().toLowerCase();
      if (!map[cleanE]) {
        map[cleanE] = { contactSaved: false, templates: {}, geminiCopied: false };
      }
      map[cleanE].manualDone = true;
      map[cleanE].processedAt = now;
      delete map[cleanE].forceAction;
      count++;
    });
    setScriptPropertySafe('ACTION_STATUS_MAP', JSON.stringify(map));
    invalidateDashboardDataCache();
    return { success: true, count: count, message: count + ' member berhasil dikonfirmasi selesai dan dipindahkan ke Arsip!' };
  } catch(err) {
    return { success: false, message: 'Gagal konfirmasi massal: ' + err.toString() };
  }
}

function bulkUnmarkMemberDoneManual(emails) {
  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return { success: false, message: 'Daftar email tidak boleh kosong.' };
  }
  try {
    const mapStr = getScriptPropertySafe('ACTION_STATUS_MAP') || '{}';
    let map = {};
    try { map = JSON.parse(mapStr); } catch(e) {}
    let count = 0;
    emails.forEach(email => {
      if (!email) return;
      const cleanE = email.toString().trim().toLowerCase();
      if (!map[cleanE]) {
        map[cleanE] = { contactSaved: false, templates: {}, geminiCopied: false };
      }
      map[cleanE].manualDone = false;
      map[cleanE].forceAction = true;
      delete map[cleanE].processedAt;
      count++;
    });
    setScriptPropertySafe('ACTION_STATUS_MAP', JSON.stringify(map));
    invalidateDashboardDataCache();
    return { success: true, count: count, message: count + ' member berhasil dibatalkan dan dikembalikan ke antrean Perlu Tindakan!' };
  } catch(err) {
    return { success: false, message: 'Gagal batal massal: ' + err.toString() };
  }
}


/**
 * UTILITY: Jalankan fungsi ini 1x dari editor Apps Script untuk menyimpan semua Secret Keys ke Script Properties.
 * Setelah dijalankan, Anda dapat menghapus fungsi ini atau membiarkannya.
 */
function setupAllSecretKeys() {
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    'FONNTE_TOKEN': 'eSNkqCpQRVxy2HSBnyR2',
    'SUPABASE_URL': 'https://dtbbmpuqfstwxewylbao.supabase.co',
    'SUPABASE_SERVICE_ROLE_KEY': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0YmJtcHVxZnN0d3hld3lsYmFvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTg2Nzk2NiwiZXhwIjoyMTA3NDQzOTY2fQ.X_rIR_fnlF9y9AA5XY37EKevSxuAViiU92q9dXgVriQ',
    'PRIMARY_ADMIN_PHONE': '6282195277812'
  });
  Logger.log("✅ Semua secret keys berhasil disimpan ke Script Properties!");
}
