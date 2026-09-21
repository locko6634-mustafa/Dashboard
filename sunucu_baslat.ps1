$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Get-Command python -ErrorAction SilentlyContinue

if (-not $python) {
    Write-Error "Python bulunamadı. Python kurulumunu ve PATH ayarını kontrol edin."
    exit 1
}

$portInUse = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Host "8000 portu zaten kullanımda. Tarayıcıdan http://localhost:8000/ adresini açın."
    exit 0
}

Start-Process `
    -FilePath $python.Source `
    -ArgumentList "-m", "http.server", "8000" `
    -WorkingDirectory $projectDir `
    -WindowStyle Hidden

Start-Sleep -Milliseconds 500
Write-Host "Sunucu başlatıldı: http://localhost:8000/"
Write-Host "Sunucu kökü: $projectDir"
Start-Process "http://localhost:8000/index.html"
