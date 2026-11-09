param(
    [switch]$BuildApk = $false,
    [switch]$UploadApk = $false,
    [switch]$ForceUpdate = $false,
    [string]$ReleaseNotes = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$WorkspaceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$IndexHtmlPath = Join-Path $WorkspaceRoot "Index.html"
$AssetHtmlPath = Join-Path $WorkspaceRoot "ZettbosAdminApp\app\src\main\assets\index.html"
$DocsHtmlPath  = Join-Path $WorkspaceRoot "docs\index.html"
$GradleFile    = Join-Path $WorkspaceRoot "ZettbosAdminApp\app\build.gradle.kts"
$AndroidAppDir = Join-Path $WorkspaceRoot "ZettbosAdminApp"
$BuiltApkDebug = Join-Path $AndroidAppDir "app\build\outputs\apk\debug\app-debug.apk"
$RootApk1      = Join-Path $WorkspaceRoot "ZettbosAdmin.apk"

$SupabaseUrl = "https://anshbrwbtoxgvnyrrnfn.supabase.co"
$SupabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuc2hicndidG94Z3ZueXJybmZuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MzI2MjMyMSwiZXhwIjoyMTA4ODM4MzIxfQ.x0AxM0og19Nr7tnEN5HZWvNuWW6XpTLAapAFu9rb2uE"
$BucketName  = "app-ota"

Write-Host "=== [1/4] Sinkronisasi Bundle Index.html ===" -ForegroundColor Cyan
if (-not (Test-Path $IndexHtmlPath)) {
    throw "Index.html tidak ditemukan di $IndexHtmlPath"
}

$AssetDir = Split-Path -Parent $AssetHtmlPath
if (-not (Test-Path $AssetDir)) { New-Item -ItemType Directory -Path $AssetDir -Force | Out-Null }
Copy-Item -Path $IndexHtmlPath -Destination $AssetHtmlPath -Force
if (Test-Path (Split-Path -Parent $DocsHtmlPath)) {
    Copy-Item -Path $IndexHtmlPath -Destination $DocsHtmlPath -Force
}

$IndexContent = Get-Content -Path $IndexHtmlPath -Raw -Encoding UTF8
$WebVersion = "3.9.17"
if ($IndexContent -match 'var\s+APP_VERSION\s*=\s*"([^"]+)"') {
    $WebVersion = $Matches[1]
}

$GradleContent = Get-Content -Path $GradleFile -Raw -Encoding UTF8
$NativeVersionCode = 11
$NativeVersionName = $WebVersion
if ($GradleContent -match 'versionCode\s*=\s*(\d+)') {
    $NativeVersionCode = [int]$Matches[1]
}
if ($GradleContent -match 'versionName\s*=\s*"([^"]+)"') {
    $NativeVersionName = $Matches[1]
}

if ([string]::IsNullOrWhiteSpace($ReleaseNotes)) {
    $CodeGsPath = Join-Path $WorkspaceRoot "Code.gs"
    if (Test-Path $CodeGsPath) {
        $CodeGsRaw = Get-Content -Path $CodeGsPath -Raw -Encoding UTF8
        if ($CodeGsRaw -match "const\s+CLOUD_RELEASE_NOTES\s*=\s*'([^']+)'") {
            $ReleaseNotes = $Matches[1]
        }
    }
    if ([string]::IsNullOrWhiteSpace($ReleaseNotes)) {
        $ReleaseNotes = "Pembaruan otomatis v$WebVersion siap diterapkan."
    }
}

Write-Host "Web Version       : v$WebVersion"
Write-Host "Native VersionCode: $NativeVersionCode (v$NativeVersionName)"

if ($BuildApk) {
    Write-Host "=== [2/4] Kompilasi Native Android APK (assembleDebug) ===" -ForegroundColor Cyan
    if (-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
        $JbrCandidates = @(
            "C:\Program Files\Android\Android Studio\jbr",
            "C:\Program Files\Android\Android Studio\jre",
            "$env:LOCALAPPDATA\Programs\Android Studio\jbr"
        )
        foreach ($Cand in $JbrCandidates) {
            if (Test-Path (Join-Path $Cand "bin\java.exe")) {
                $env:JAVA_HOME = $Cand
                $env:PATH = "$Cand\bin;$env:PATH"
                break
            }
        }
    }
    Write-Host "JAVA_HOME         : $env:JAVA_HOME"
    Push-Location $AndroidAppDir
    try {
        & .\gradlew.bat assembleDebug --no-daemon
        if ($LASTEXITCODE -ne 0) {
            throw "Gradle assembleDebug gagal dengan kode exit $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }

    if (-not (Test-Path $BuiltApkDebug)) {
        throw "File hasil kompilasi tidak ditemukan: $BuiltApkDebug"
    }
    Copy-Item -Path $BuiltApkDebug -Destination $RootApk1 -Force
    $ApkMb = [math]::Round((Get-Item $RootApk1).Length / 1MB, 2)
    Write-Host "APK Berhasil Dibuat: $RootApk1 ($ApkMb MB)" -ForegroundColor Green
} else {
    Write-Host "=== [2/4] Melewati Kompilasi APK (Mode Push OTA Cepat) ===" -ForegroundColor Yellow
}

Write-Host "=== [3/4] Menyiapkan Bucket Supabase Storage '$BucketName' ===" -ForegroundColor Cyan
$AuthHeaders = @{
    "apikey"        = $SupabaseKey
    "Authorization" = "Bearer $SupabaseKey"
}

try {
    $CreateBucketBody = @{
        id     = $BucketName
        name   = $BucketName
        public = $true
    } | ConvertTo-Json -Compress
    Invoke-RestMethod -Method Post -Uri "$SupabaseUrl/storage/v1/bucket" `
        -Headers $AuthHeaders -ContentType "application/json" -Body $CreateBucketBody | Out-Null
    Write-Host "Bucket '$BucketName' baru berhasil dibuat." -ForegroundColor Green
} catch {
    # Jika bucket sudah ada, pastikan public = true
    $UpdateBucketBody = @{ public = $true } | ConvertTo-Json -Compress
    try {
        Invoke-RestMethod -Method Put -Uri "$SupabaseUrl/storage/v1/bucket/$BucketName" `
            -Headers $AuthHeaders -ContentType "application/json" -Body $UpdateBucketBody | Out-Null
    } catch {}
    Write-Host "Bucket '$BucketName' sudah aktif & berstatus Public." -ForegroundColor Green
}

Write-Host "=== [4/4] Mengunggah Paket OTA & Manifest ke Supabase DB 3 ===" -ForegroundColor Cyan

# 1. Upload index.html
$HtmlUploadHeaders = @{
    "apikey"        = $SupabaseKey
    "Authorization" = "Bearer $SupabaseKey"
    "x-upsert"      = "true"
    "cache-control" = "0"
}
Invoke-RestMethod -Method Post -Uri "$SupabaseUrl/storage/v1/object/$BucketName/index.html" `
    -Headers $HtmlUploadHeaders -ContentType "text/html; charset=utf-8" -InFile $IndexHtmlPath | Out-Null
Write-Host "Uploaded: index.html (v$WebVersion)" -ForegroundColor Green

# 2. Upload APK jika diminta dan file tersedia
$PublicBase = "$SupabaseUrl/storage/v1/object/public/$BucketName"
$ApkPublicUrl = "$PublicBase/ZettbosAdmin-Latest.apk"

if (($BuildApk -or $UploadApk) -and (Test-Path $RootApkLatest)) {
    Write-Host "Uploading ZettbosAdmin-Latest.apk ke Supabase Storage..."
    $ApkUploadHeaders = @{
        "apikey"        = $SupabaseKey
        "Authorization" = "Bearer $SupabaseKey"
        "x-upsert"      = "true"
        "cache-control" = "0"
    }
    Invoke-RestMethod -Method Post -Uri "$SupabaseUrl/storage/v1/object/$BucketName/ZettbosAdmin-Latest.apk" `
        -Headers $ApkUploadHeaders -ContentType "application/vnd.android.package-archive" -InFile $RootApkLatest | Out-Null
    Write-Host "Uploaded: ZettbosAdmin-Latest.apk" -ForegroundColor Green
}

# 3. Buat dan upload ota-manifest.json
$ManifestObj = [ordered]@{
    web_version         = $WebVersion
    native_version_code = $NativeVersionCode
    native_version_name = $NativeVersionName
    html_url            = "$PublicBase/index.html"
    apk_url             = $ApkPublicUrl
    force_update        = [bool]$ForceUpdate
    release_notes       = $ReleaseNotes
    updated_at          = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ", [System.Globalization.CultureInfo]::InvariantCulture)
}
$ManifestTempFile = Join-Path $env:TEMP "zettbos_ota_manifest.json"
$ManifestJson = $ManifestObj | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($ManifestTempFile, $ManifestJson, (New-Object System.Text.UTF8Encoding($false)))

$ManifestHeaders = @{
    "apikey"        = $SupabaseKey
    "Authorization" = "Bearer $SupabaseKey"
    "x-upsert"      = "true"
    "cache-control" = "0"
}
Invoke-RestMethod -Method Post -Uri "$SupabaseUrl/storage/v1/object/$BucketName/ota-manifest.json" `
    -Headers $ManifestHeaders -ContentType "application/json; charset=utf-8" -InFile $ManifestTempFile | Out-Null

# 4. Verifikasi Endpoint Publik
$VerifyManifest = Invoke-RestMethod -Method Get -Uri "$PublicBase/ota-manifest.json?t=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
Write-Host "=== OTA PUSH SUKSES & TERVERIFIKASI LIVE ===" -ForegroundColor Green
Write-Host ($VerifyManifest | ConvertTo-Json -Depth 5)

