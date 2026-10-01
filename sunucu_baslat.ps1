$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Python kontrolü (python3 veya python)
$python = Get-Command python3 -ErrorAction SilentlyContinue
if (-not $python) {
    $python = Get-Command python -ErrorAction SilentlyContinue
}

if (-not $python) {
    Write-Error "Python bulunamadı. Python kurulumunu ve PATH ayarını kontrol edin."
    exit 1
}

# Platform bağımsız 8000 portu kontrolü (.NET Sockets)
$portInUse = $false
try {
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    $asyncResult = $tcpClient.BeginConnect("127.0.0.1", 8000, $null, $null)
    $success = $asyncResult.AsyncWaitHandle.WaitOne(500, $false)
    if ($success -and $tcpClient.Connected) {
        $portInUse = $true
        $tcpClient.EndConnect($asyncResult)
    }
    $tcpClient.Close()
} catch {
    $portInUse = $false
}

if ($portInUse) {
    Write-Host "8000 portu zaten kullanımda. Tarayıcıdan http://localhost:8000/ adresini açın."
    exit 0
}

# Arka planda sunucu sürecini başlatma
$isWin = [System.Environment]::OSVersion.Platform -match "Win" -or $IsWindows
$startParams = @{
    FilePath = $python.Source
    ArgumentList = @("-m", "http.server", "8000")
    WorkingDirectory = $projectDir
}
if ($isWin) {
    $startParams["WindowStyle"] = "Hidden"
}

Start-Process @startParams

Start-Sleep -Milliseconds 500
Write-Host "Sunucu başlatıldı: http://localhost:8000/"
Write-Host "Sunucu kökü: $projectDir"

# Tarayıcıda aç
try {
    if ($isWin) {
        Start-Process "http://localhost:8000/index.html"
    } elseif (Get-Command xdg-open -ErrorAction SilentlyContinue) {
        Start-Process "xdg-open" "http://localhost:8000/index.html"
    }
} catch {
    # Headless ortamlarda sessizce geç
}

