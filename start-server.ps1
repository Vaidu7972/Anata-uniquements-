# ============================================
# Ananta Techtonic - Smart Server Launcher
# ============================================
# Kills any old process on port 5000, then starts fresh

Write-Host "🛰️  Ananta Techtonic - Server Launcher" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

# Kill any process listening on port 5000
Write-Host "`n🔍 Checking port 5000..." -ForegroundColor Yellow
$connections = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
if ($connections) {
    $connections | ForEach-Object {
        Write-Host "⚡ Killing process PID: $($_.OwningProcess)" -ForegroundColor Red
        Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force
    }
    Write-Host "✅ Port 5000 cleared!" -ForegroundColor Green
} else {
    Write-Host "✅ Port 5000 is free." -ForegroundColor Green
}

Start-Sleep -Seconds 1

# Start the backend server
Write-Host "`n🚀 Starting Ananta Techtonic Server..." -ForegroundColor Cyan
Set-Location -Path "$PSScriptRoot\backend"
npm start
