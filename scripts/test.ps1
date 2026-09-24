# Developer orchestration script: test
Write-Host "Running BCIS Backend Tests..." -ForegroundColor Cyan
pnpm --dir backend test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Running BCIS Frontend Tests..." -ForegroundColor Cyan
pnpm --dir frontend test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "All tests passed successfully!" -ForegroundColor Green
