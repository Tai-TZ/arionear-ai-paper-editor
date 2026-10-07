# Deploy proofline-web frontend to Google Cloud Run.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-cloudrun-frontend.ps1
#
# Env-only update (no rebuild):
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-cloudrun-frontend.ps1 -SkipBuild

param(
    [string]$ProjectId   = "project-f8474886-b777-42fc-88c",
    [string]$Region      = "asia-east1",
    [string]$ServiceName = "proofline-web",
    [string]$ViteApiUrl  = "https://api.proofline.example/api/v1",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $RepoRoot "frontend"
$image = "$Region-docker.pkg.dev/$ProjectId/proofline/frontend:latest"

gcloud config set project $ProjectId | Out-Null

if (-not $SkipBuild) {
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
