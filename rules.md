# Dashboard Projesi Geliştirme Kuralları

Bu dosya, bu dashboard projesinde çalışırken uyulması gereken projeye özel kuralları ve operasyonel adımları tanımlar.

## 1. Yetenek ve Tasarım Referansları
Bu projede frontend veya tasarım çalışması yapmadan önce aşağıdaki global kural dosyaları KESİNLİKLE okunmalıdır:
* Tasarım İlkeleri: [design-taste-frontend RULES.md](file:///C:/Users/Mustafa/.gemini/antigravity/skills/design-taste-frontend/RULES.md)
* Yeniden Tasarım Kuralları: [redesign-existing-projects RULES.md](file:///C:/Users/Mustafa/.gemini/antigravity/skills/redesign-existing-projects/RULES.md)

## 2. Görsel Doğrulama ve Playwright Kuralı
* Projede gerçekleştirilen her köklü arayüz değişikliği, bileşen ekleme veya yeniden tasarım sonrasında görsel doğrulama yapılmalıdır.
* Değişikliklerin ardından Playwright MCP araçları kullanılarak testler koşturulmalı ve görsel çıktılar denetlenmelidir.
* Referans: [playwright-visual-verification RULES.md](file:///C:/Users/Mustafa/.gemini/antigravity/skills/playwright-visual-verification/RULES.md)

## 3. Teknoloji Yığını Sınırları
* Projede modern ve temiz bir dashboard tasarımı hedeflenmektedir.
* Tasarımda HSL renk paletleri, tutarlı köşe yarıçapları (shape consistency) ve zengin mikro animasyonlar önceliklendirilmelidir.
* Gereksiz veya kopya CSS kuralı yazmaktan kaçınılmalı, global tasarım standartları korunmalıdır.
