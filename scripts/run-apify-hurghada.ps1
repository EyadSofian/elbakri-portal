$ErrorActionPreference = "Stop"

if (-not $env:APIFY_TOKEN) {
  Write-Host "APIFY_TOKEN is missing." -ForegroundColor Red
  Write-Host 'Run this first: $env:APIFY_TOKEN="your_apify_token"' -ForegroundColor Yellow
  exit 1
}

$Limit = if ($env:LIMIT) { $env:LIMIT } else { "25" }

Write-Host "Scraping Hurghada hotels from the verified Elbakri CSV..." -ForegroundColor Cyan
Write-Host "Limit: $Limit" -ForegroundColor Cyan

node scripts/apify-booking-enrich.js --city hurghada --limit $Limit

Write-Host ""
Write-Host "Done. Output:" -ForegroundColor Green
Write-Host "outputs\apify-booking-enrichment\hurghada_booking_enriched_hotels.csv"
