# Deploy edico-web frontend to Google Cloud Run.
#
# Usage (-ViteApiUrl is required for a build; there is no default domain):
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-cloudrun-frontend.ps1 `
#     -ViteApiUrl https://api.your-domain/api/v1
#
# Env-only update (no rebuild):
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-cloudrun-frontend.ps1 -SkipBuild

param(
    [string]$ProjectId   = "project-f8474886-b777-42fc-88c",
    [string]$Region      = "asia-east1",
    [string]$ServiceName = "edico-web",
    [string]$ViteApiUrl  = "",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $RepoRoot "frontend"
$image = "$Region-docker.pkg.dev/$ProjectId/edico/frontend:latest"

gcloud config set project $ProjectId | Out-Null

if (-not $SkipBuild) {
    if (-not $ViteApiUrl) { throw "Pass -ViteApiUrl (the backend API URL baked into the bundle)." }
    Write-Host "`n=== Build frontend image (10-15 minutes) ===" -ForegroundColor Cyan
    Push-Location $RepoRoot
    try {
        gcloud builds submit --config=frontend/cloudbuild.yaml `
            --substitutions="_VITE_API_URL=$ViteApiUrl,_IMAGE=$image" `
            frontend/ --timeout=1800
        if ($LASTEXITCODE -ne 0) { throw "Frontend Cloud Build failed (exit $LASTEXITCODE)." }
    } finally {
        Pop-Location
    }
}

Write-Host "`n=== Deploy Cloud Run frontend ===" -ForegroundColor Cyan
gcloud run deploy $ServiceName `
    --image $image `
    --region $Region `
    --platform managed `
    --allow-unauthenticated `
    --port 8080 `
    --memory 2Gi `
    --cpu 2 `
    --concurrency 60 `
    --max-instances 5

$FrontendUrl = gcloud run services describe $ServiceName --region $Region --format="value(status.url)"
Write-Host "`nFrontend Cloud Run URL: $FrontendUrl" -ForegroundColor Green
