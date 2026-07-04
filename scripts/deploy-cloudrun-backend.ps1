# Deploy arionear-api to Google Cloud Run (reads repo-root .env).
#
# Usage (first deploy or full rebuild):
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-cloudrun-backend.ps1
#
# Update env vars only (CORS / domain change, no rebuild):
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-cloudrun-backend.ps1 -SkipBuild
#
# Custom domains are set via -FrontendUrl / -BackendCustomDomain.
# Defaults below match the production custom domains on arionear.id.vn.

param(
    [string]$ProjectId    = "project-f8474886-b777-42fc-88c",
    [string]$Region       = "asia-east1",
    [string]$ServiceName  = "arionear-api",
    # Custom-domain URL of the frontend (used for CORS + OPENROUTER_SITE_URL)
    [string]$FrontendUrl  = "https://arionear.id.vn",
    # Custom-domain URL of the backend (used for BACKEND_BASE_URL + OAuth redirect)
    [string]$BackendCustomDomain = "https://api.arionear.id.vn",
    # Cloud Run service URL — auto-detected if empty (used as BACKEND_BASE_URL fallback)
    [string]$BackendUrl   = "",
    [switch]$SkipBuild,
    [switch]$SecretsOnly
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $RepoRoot ".env"

if (-not (Test-Path $EnvFile)) {
    throw ".env not found at $EnvFile"
}

function Get-DotEnvValue {
    param([string]$Key)
    foreach ($line in Get-Content $EnvFile -Encoding UTF8) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
        if ($trimmed -match "^\s*$([regex]::Escape($Key))\s*=\s*(.*)\s*$") {
            $value = $Matches[1].Trim()
            if ($value.StartsWith('"') -and $value.EndsWith('"')) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            return $value
        }
    }
    return $null
}

function Set-GcpSecret {
    param([string]$Name, [string]$Value)
    $Value = $Value.Trim()
    if (-not $Value) {
        Write-Warning "Skip secret '$Name' - empty value in .env"
        return
    }
    $exists = $false
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        gcloud secrets describe $Name --project $ProjectId 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $exists = $true }
    } finally {
        $ErrorActionPreference = $prevEap
    }
    $secretFile = Join-Path $env:TEMP "gcp-secret-$Name.txt"
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
        [System.IO.File]::WriteAllBytes($secretFile, $bytes)
        if ($exists) {
            gcloud secrets versions add $Name --project $ProjectId --data-file=$secretFile
            Write-Host "[secret] updated $Name"
        } else {
            gcloud secrets create $Name --project $ProjectId --replication-policy=automatic --data-file=$secretFile
            Write-Host "[secret] created $Name"
        }
    } finally {
        if (Test-Path $secretFile) { Remove-Item $secretFile -Force -ErrorAction SilentlyContinue }
    }
}

$directDb = Get-DotEnvValue "DIRECT_DATABASE_URL"
$authSecret = Get-DotEnvValue "AUTH_SECRET_KEY"
$openrouterKey = Get-DotEnvValue "OPENROUTER_API_KEY"
$zaiKey = Get-DotEnvValue "ZAI_API_KEY"
$googleApiKey = Get-DotEnvValue "GOOGLE_API_KEY"
$googleSecret = Get-DotEnvValue "GOOGLE_CLIENT_SECRET"
$smtpPassword = Get-DotEnvValue "SMTP_PASSWORD"
$adminPassword = Get-DotEnvValue "ADMIN_GOD_PASSWORD"
$aiLogKey = Get-DotEnvValue "AI_LOG_API_KEY"
$langchainKey = Get-DotEnvValue "LANGCHAIN_API_KEY"

if (-not $authSecret -or $authSecret -eq "change-me-generate-with-openssl-rand-hex-32" -or $authSecret -eq "dev-only-change-in-production") {
    $authSecret = -join ((1..32) | ForEach-Object { "{0:x2}" -f (Get-Random -Maximum 256) })
    Write-Host "[auth] AUTH_SECRET_KEY missing in .env - generated a new random secret for deploy."
    Write-Host "       Add to .env if you want local + prod to match:"
    Write-Host "       AUTH_SECRET_KEY=$authSecret"
}

gcloud config set project $ProjectId | Out-Null

Write-Host "`n=== Step 1: Upload secrets ===" -ForegroundColor Cyan
Set-GcpSecret "direct-database-url" $directDb
Set-GcpSecret "auth-secret-key" $authSecret
Set-GcpSecret "openrouter-api-key" $openrouterKey
if ($zaiKey) {
    Set-GcpSecret "zai-api-key" $zaiKey
}
if ($googleApiKey) {
    Set-GcpSecret "google-api-key" $googleApiKey
}
Set-GcpSecret "google-client-secret" $googleSecret
Set-GcpSecret "smtp-password" $smtpPassword
Set-GcpSecret "admin-god-password" $adminPassword
if ($langchainKey -and $langchainKey -ne "your-langsmith-key-here") {
    Set-GcpSecret "langchain-api-key" $langchainKey
}
if ($aiLogKey) {
    Set-GcpSecret "ai-log-api-key" $aiLogKey
}

if ($SecretsOnly) {
    Write-Host "SecretsOnly - done."
    exit 0
}

$image = "$Region-docker.pkg.dev/$ProjectId/arionear/backend:latest"

if (-not $SkipBuild) {
    Write-Host "`n=== Step 2: Build image (10-20 minutes) ===" -ForegroundColor Cyan
    Push-Location $RepoRoot
    try {
        gcloud builds submit --tag $image . --timeout=2400
    } finally {
        Pop-Location
    }
}

if (-not $BackendUrl) {
    $BackendUrl = gcloud run services describe $ServiceName --region $Region --format="value(status.url)" 2>$null
    if (-not $BackendUrl) {
        $BackendUrl = $BackendCustomDomain
    }
}
# Prefer the custom domain for BACKEND_BASE_URL (QR confirm URL, OAuth redirect, etc.)
# Fall back to the Cloud Run .run.app URL if no custom domain is set.
$BackendBaseUrl = if ($BackendCustomDomain) { $BackendCustomDomain } else { $BackendUrl }

$llmProvider = Get-DotEnvValue "LLM_PROVIDER"
if (-not $llmProvider) { $llmProvider = "openrouter" }

$googleClientId      = Get-DotEnvValue "GOOGLE_CLIENT_ID"
$googleOauthRedirect = "$BackendBaseUrl/api/v1/auth/google/callback"
$smtpHost = Get-DotEnvValue "SMTP_HOST"
$smtpPort = Get-DotEnvValue "SMTP_PORT"
$smtpUser = Get-DotEnvValue "SMTP_USER"
$smtpFrom = Get-DotEnvValue "SMTP_FROM"
if (-not $smtpFrom) { $smtpFrom = $smtpUser }
$adminEmail = Get-DotEnvValue "ADMIN_GOD_EMAIL"
$adminName = Get-DotEnvValue "ADMIN_GOD_NAME"
$openrouterSiteUrl = $FrontendUrl
$openrouterAppName = Get-DotEnvValue "OPENROUTER_APP_NAME"
$langchainProject = Get-DotEnvValue "LANGCHAIN_PROJECT"
$langchainTracing = Get-DotEnvValue "LANGCHAIN_TRACING_V2"
$aiLogServer = Get-DotEnvValue "AI_LOG_SERVER"

$secretBindings = @(
    "DIRECT_DATABASE_URL=direct-database-url:latest",
    "AUTH_SECRET_KEY=auth-secret-key:latest",
    "OPENROUTER_API_KEY=openrouter-api-key:latest",
    "GOOGLE_CLIENT_SECRET=google-client-secret:latest",
    "SMTP_PASSWORD=smtp-password:latest",
    "ADMIN_GOD_PASSWORD=admin-god-password:latest"
)
if ($langchainKey -and $langchainKey -ne "your-langsmith-key-here") {
    $secretBindings += "LANGCHAIN_API_KEY=langchain-api-key:latest"
}
if ($aiLogKey) {
    $secretBindings += "AI_LOG_API_KEY=ai-log-api-key:latest"
}
if ($zaiKey) {
    $secretBindings += "ZAI_API_KEY=zai-api-key:latest"
}
if ($googleApiKey) {
    $secretBindings += "GOOGLE_API_KEY=google-api-key:latest"
}

$envVars = @(
    "APP_ENV=production",
    "LLM_PROVIDER=$llmProvider",
    # Allow requests from frontend + API custom domain + raw Cloud Run URL
    "CORS_ORIGINS=$FrontendUrl,$BackendCustomDomain,$BackendUrl",
    "FRONTEND_BASE_URL=$FrontendUrl",
    "BACKEND_BASE_URL=$BackendBaseUrl",
    "GOOGLE_CLIENT_ID=$googleClientId",
    "GOOGLE_OAUTH_REDIRECT_URI=$googleOauthRedirect",
    "SMTP_HOST=$smtpHost",
    "SMTP_PORT=$smtpPort",
    "SMTP_USER=$smtpUser",
    "SMTP_FROM=$smtpFrom",
    "SMTP_USE_TLS=true",
    "SMTP_USE_SSL=false",
    "ADMIN_GOD_EMAIL=$adminEmail",
    "ADMIN_GOD_NAME=$adminName",
    "OPENROUTER_SITE_URL=$openrouterSiteUrl",
    "OPENROUTER_APP_NAME=$openrouterAppName",
    "LOG_LEVEL=INFO"
)
if ($langchainProject) { $envVars += "LANGCHAIN_PROJECT=$langchainProject" }
if ($langchainTracing) { $envVars += "LANGCHAIN_TRACING_V2=$langchainTracing" }
if ($aiLogServer) { $envVars += "AI_LOG_SERVER=$aiLogServer" }

Write-Host "`n=== Step 3: Deploy Cloud Run ===" -ForegroundColor Cyan
# Write env vars to YAML to avoid gcloud comma/colon escaping issues on Windows.
$envVarsFile = Join-Path $env:TEMP "arionear-api-env-$([Guid]::NewGuid().ToString('N')).yaml"
try {
    $yamlLines = @("---")
    foreach ($entry in $envVars) {
        $eq = $entry.IndexOf("=")
        if ($eq -lt 1) { continue }
        $key = $entry.Substring(0, $eq)
        $value = $entry.Substring($eq + 1)
        $escaped = $value.Replace("'", "''")
        $yamlLines += "${key}: '${escaped}'"
    }
    Set-Content -Path $envVarsFile -Value ($yamlLines -join "`n") -Encoding utf8

    gcloud run deploy $ServiceName `
        --image $image `
        --region $Region `
        --platform managed `
        --allow-unauthenticated `
        --port 8000 `
        --memory 4Gi `
        --cpu 4 `
        --concurrency 30 `
        --timeout 300 `
        --max-instances 15 `
        --set-secrets ($secretBindings -join ",") `
        --env-vars-file $envVarsFile
} finally {
    if (Test-Path $envVarsFile) { Remove-Item $envVarsFile -Force }
}

$BackendUrl = gcloud run services describe $ServiceName --region $Region --format="value(status.url)"
Write-Host "`nBackend Cloud Run URL : $BackendUrl" -ForegroundColor Green
Write-Host "Backend custom domain : $BackendBaseUrl" -ForegroundColor Green
Write-Host "Health  : $BackendBaseUrl/health"
Write-Host "API docs: $BackendBaseUrl/docs"
Write-Host "`nNow rebuild the frontend with VITE_API_URL=$BackendBaseUrl/api/v1"
Write-Host "(see frontend/cloudbuild.yaml)"
