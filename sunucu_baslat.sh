#!/usr/bin/env bash

# Betiğin bulunduğu dizini al (proje kök dizini)
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR" || exit 1

# Python kontrolü (python3 veya python)
if command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_CMD="python"
else
    echo "Hata: Python bulunamadı. Python kurulumunu ve PATH ayarını kontrol edin." >&2
    exit 1
fi

# 8000 portu kullanımda mı kontrolü (Python socket kullanarak platform bağımsız ve net kontrol)
PORT_IN_USE=$("$PYTHON_CMD" -c "
import socket, sys
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(0.5)
try:
    s.connect(('127.0.0.1', 8000))
    s.close()
    sys.exit(0)
except Exception:
    sys.exit(1)
" >/dev/null 2>&1 && echo "1" || echo "0")

if [ "$PORT_IN_USE" = "1" ]; then
    echo "8000 portu zaten kullanımda. Tarayıcıdan http://localhost:8000/ adresini açın."
    exit 0
fi

# Sunucuyu arka planda bağımsız bir süreç olarak başlat (daemon)
if command -v setsid >/dev/null 2>&1; then
    setsid "$PYTHON_CMD" -m http.server 8000 </dev/null >/dev/null 2>&1 &
    SERVER_PID=$!
else
    nohup "$PYTHON_CMD" -m http.server 8000 </dev/null >/dev/null 2>&1 &
    SERVER_PID=$!
    disown "$SERVER_PID" 2>/dev/null || true
fi

sleep 0.5

echo "Sunucu başlatıldı: http://localhost:8000/ (PID: $SERVER_PID)"
echo "Sunucu kökü: $PROJECT_DIR"

# Varsayılan tarayıcıda aç (GUI ortamı varsa)
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:8000/index.html" >/dev/null 2>&1 &
fi
