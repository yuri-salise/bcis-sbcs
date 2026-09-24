# Developer orchestration script: dev
Write-Host "Starting BCIS development servers..." -ForegroundColor Cyan

# Start backend and frontend concurrently
$backendProcess = Start-Process pnpm -ArgumentList "--dir", "backend", "dev" -PassThru -NoNewWindow
$frontendProcess = Start-Process pnpm -ArgumentList "--dir", "frontend", "dev" -PassThru -NoNewWindow

Wait-Process -Id $backendProcess.Id, $frontendProcess.Id
