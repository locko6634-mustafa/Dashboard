# Randevu Paneli - Otomatik Sunucu Deploy Scripti
# Kullanim: .\deploy.ps1

Write-Host "Deploy baslatiliyor: 212.64.193.15..." -ForegroundColor Cyan

$server = "locko-admin@212.64.193.15"
$key = "C:/Users/Mustafa/.ssh/codex-ssh-mcp_ed25519"
$remoteDir = "/home/locko-admin/randevu-paneli"

# 1. Dosyalari SCP ile aktar
Write-Host "Dosyalar sunucuya aktariliyor..." -ForegroundColor Yellow
scp -i $key -r css "${server}:${remoteDir}/"
scp -i $key -r js "${server}:${remoteDir}/"
scp -i $key dashboard.html "${server}:${remoteDir}/dashboard.html"
scp -i $key login.html "${server}:${remoteDir}/login.html"
scp -i $key index.html "${server}:${remoteDir}/index.html"
scp -i $key backend/docker-compose.yml "${server}:${remoteDir}/backend/docker-compose.yml"

# 2. Sunucuda konteyneri yeniden baslat
Write-Host "Docker servisi guncelleniyor..." -ForegroundColor Yellow
ssh -o StrictHostKeyChecking=no -i $key $server "cd /home/locko-admin/randevu-paneli/backend; docker compose up -d"

Write-Host "Dagitim tamamlandi! Canli Adres: https://randevu.n8n-mustafa.me/" -ForegroundColor Green
