# WWII AIR COMBAT SIMULATOR (game2) — KAPSAMLI DEVİR-TESLİM DOKÜMANI

> **Kime:** Claude (veya projeyi devralacak yapay zeka / geliştirici)  
> **Konu:** `game2` projesinde bugüne kadar yapılan tüm çalışmalar, mimari kararlar, uygulanan mekanikler ve güncel durum.  
> **Tarih:** 30 Ekim 2026  
> **Çalışma Dizini:** `c:\Users\Derya\game2`

---

## 1. PROJENİN AMACI VE GENEL YAPISI

### 1.1. Temel Vizyon ve Oyun Türü
Bu proje; İkinci Dünya Savaşı (WWII) dönemini konu alan, **War Thunder Arcade Battles** mekaniklerinden esinlenilmiş, tarayıcı üzerinde çalışan **3D Arcade Uçuş ve Hava Muharebesi Simülasyonu**dur. 

### 1.2. Katı Kural ve Kısıtlamalar (En Kritik Prensipler)
1. **Sıfır Kurulum / Doğrudan Çalıştırılabilirlik:**
   - Oyun, herhangi bir geliştirme sunucusuna (Vite, Webpack, Node.js http-server vb.) ihtiyaç duymadan **yalnızca `index.html` dosyasına çift tıklanarak (`file:///` protokolü üzerinden) veya `Play_Game.bat` ile doğrudan tarayıcıda çalışabilmelidir**.
2. **Saf Vanilla Mimarisi (No Frameworks / Bundlers):**
   - Projede npm paket bağımlılıkları, modül derleyicileri veya harici karmaşık kütüphaneler yasaktır.
   - Tek harici 3D grafik kütüphanesi yerel olarak dizinde bulunan `three.min.js` (Three.js r128)'dir.
3. **Harici Ağ Bağımsızlığı (Offline-First):**
   - İnternet bağlantısı kesildiğinde bile tüm modeller, sesler ve scriptler yerel dosyalardan yüklenmelidir (CDN'ler yalnızca Three.js için opsiyonel fallback olarak tanımlanmıştır).

### 1.3. Oynanış Mimarisi ve Uçak Sınıfları
Oyunda 4 adet ikonik İkinci Dünya Savaşı uçağı bulunmaktadır. Her uçağın ortak temel uçuş fiziklerine ek olarak kendine has uzmanlıkları (stat bonusları) vardır:
- 🇺🇸 **P-51D Mustang ("Red Tail"):** Yüksek hız uzmanı (680 km/h azami hız, 120 HP, 4x Browning .50 cal makineli tüfek, 14 hasar/mermi).
- 🇯🇵 **A6M2 Zero (Model 21):** Yüksek çeviklik uzmanı (+48% dönüş hızı / manevra kabiliyeti, 560 km/h, 120 HP, 2x 20mm top + 2x 7.7mm tüfek).
- 🇩🇪 **Bf 109 ("Yellow 14"):** Yüksek ateş gücü / hasar uzmanı (26 hasar/mermi, 560 km/h, 120 HP, 1x 20mm MG 151 burun topu + 2x 7.92mm tüfek).
- ☭ **Il-2 Sturmovik ("Flying Tank"):** Zırh ve dayanıklılık uzmanı (240 HP zırh, 560 km/h, 2x 23mm VYa topları + gövde altı 2x FAB-100 bomba).

---

## 2. ALINAN KRİTİK KARARLAR VE İZLENEN YÖNTEMLER

### 2.1. War Thunder Tarzı Mouse Aim ve Sanal Eğitmen (Virtual Instructor)
- **Mouse Aim:** Oyuncu uçağı doğrudan joystick gibi elle bank/pitch açısıyla kontrol etmek zorunda değildir. Mouse imleci 3D uzayda bir hedef vektörü (`mouseAim.direction`) çizer; dahili **Virtual Instructor (Sanal Eğitmen)** uçağı bu vektöre doğru otomatik olarak yatırır (roll), kaldırır (pitch) ve yalpalamayı (rudder) koordine eder.
- **Manuel Override (WASD / QE):** Oyuncu `W/S` (pitch), `A/D` (roll) veya `Q/E` (yaw) tuşlarına bastığı anda Sanal Eğitmen anında devre dışı kalır ve %100 saf aerodinamik kontrol oyuncuya geçer. Tuşlar bırakıldığında Sanal Eğitmen pürüzsüzce yeniden devreye girer.
- **Serbest Bakış (Free Look):** `C` tuşuna veya farenin sağ tuşuna basılı tutularak uçuş yönü bozulmadan kamera uçağın etrafında 360° döndürülebilir.

### 2.2. Uçuş Dinamiği ve Enerji Fiziği (Helikopter Hata Düzeltmesi)
- İlk prototipte gaz açıldığında uçak helikopter gibi dikey fırlıyordu. Bu giderildi.
- Yerçekimi etkisi, dalışta hız kazanma (kinetik enerji dönüşümü), tırmanışta hız kaybetme ve **yüksek G'li sert dönüşlerde hava direnciyle hız kaybetme (speed bleed)** formülleri eklendi.
- **Açılabilir İniş Takımları (`G` Tuşu):** Açık olduğunda aerodinamik sürtünme (drag) yaratır, uçağı yavaşlatır. Uçak pistte dururken iniş takımlarının yanlışlıkla kapanmasını önleyen **Squat Switch emniyet kilidi** bulunur.

### 2.3. Silahlar, Balistik ve Convergence (Mermi Uyum Mesafesi)
- **Fiziksel Mermiler:** Gerçek namlu çıkış noktalarından fırlar; uçağın anlık hız vektörünü (`aircraft velocity`) miras alır ve yerçekimi eğrisiyle (`gravity drop`) alçalır.
- **Harmonizasyon (Convergence):** Kanatlardaki 4 makineli tüfek 400m–600m mesafede tek bir noktada kesişecek şekilde içe ve yukarı açılı sıfırlanmıştır.
- **Aşırı Isınma (Overheat) & Sıkışma:** Sürekli ateş edildiğinde namlu ısısı birikir; kırmızı çizgiye ulaştığında silahlar sıkışır (jam click sesi çıkar) ve soğuyana kadar ateş kesilir.
- **Balistik Lider Göstergesi (Lead Indicator - `L` Tuşu):** Hareket eden düşman uçağının hızını ve mermi uçuş süresini hesaplayarak mermilerin düşmana çarpması için ateş edilmesi gereken gelecekteki noktayı (yeşil reticle) çizer.

### 2.4. Harita Genişlemesi ve Çevre Mimarisi
- Harita, coğrafi yapısı (kuzey dağları, atol adaları, çöl adası, limanlar ve körfezler) korunarak **lineer 4 kat büyütüldü** (`MAP_SCALE = 4.0`, **17.76 km x 12.36 km** devasa harekat sahası).
- 4 adet tam operasyonel hava üssü (Kuzey, Kuzeydoğu, Batı, Güneydoğu) bulunmaktadır. `T` tuşu ile aktif üsler arasında geçiş yapılır.
- Balonlar, hava üsleri ve dağ yükseklikleri çakışmayacak şekilde zemin yükseklik algoritmasına (`getTerrainHeight`) kenetlenmiştir.
- Kullanıcı isteğiyle **Uçaksavar (AA) savunmaları çatışmadan kaldırılmıştır / etkisizleştirilmiştir**.

### 2.5. Bot Yapay Zekası ve Kanat Arkadaşı (Wingman) Sistemi
- Düşman uçakları 2'şerli taktik takımlar (Lider ve Kanatçı) halinde hareket eder; it dalaşı (dogfight), takip ve hücum yapay zekasına sahiptir.
- Düşman botlarının ateş frekansı ve silah bekleme süreleri oyuncuyla birebir eşitlenmiştir (haksız ateş üstünlüğü engellendi).
- **Kanat Arkadaşı Devralma (Wingman Takeover):**
  - Oyuncunun yanında dost bir Kanatçı (#2) uçar.
  - Oyuncunun uçağı düşer veya can hakları (3 can) tükenirse ve dost kanatçı hayattaysa, kamera ve kontroller anında bu kanatçıya aktarılır ve oyuncu kanatçıyı yöneterek savaşa devam eder.
  - Eğer kanatçı da dahil filodaki tüm uçaklar yok edilirse **YENİLGİ (DEFEAT)** ekranı gelir ve Ana Menü'ye dönülür (önceden lider uçağın yeniden canlanması hatası düzeltildi).

### 2.6. Pist İniş, Bakım ve Yeniden Donatım (Landing & Servicing)
- **Sert İniş Kontrolü:** İniş takımları kapalıyken veya aşırı yüksek hızla (>120 km/h dikey/yatay sert darbe) piste temas edilirse uçak parçalanır ve patlar.
- **Pistte Bakım:** Düzgün iniş yapılıp pistte durulduğunda 4 saniyelik bakım sayacı başlar; uçak tamir edilir, makineli tüfek mermileri ve gövde altı bombaları yenilenir.
- **Kritik Kural:** Pist bakımı **can haklarını (lives) ASLA geri vermez**; canlar yalnızca yeni sorti başlatıldığında yenilenir.

### 2.7. WEP (War Emergency Power) Cooldown Mekaniği
- Gaz kolu %100'ün üzerine (%110) itilerek WEP aşırı güç takviyesi devreye alınabilir.
- WEP kesintisiz en fazla **10 saniye** kullanılabilir. Ardından motor aşırı ısınır ve **15 saniyelik orta seviye bir soğuma (cooldown)** sürecine girer. Bu süreçte gaz %100 ile sınırlanır.
- Respawn olunduğunda, piste inip bakım yapıldığında veya ana menüye dönüldüğünde WEP cooldown'ı derhal sıfırlanır.

### 2.8. Ana Menü ve Dinamik Minecraft-Tarzı Arka Plan
- Oyun ilk açıldığında doğrudan uçuş başlamaz, tam bir **Ana Menü (Hangar)** ekranı karşılar.
- **Kritik Kural:** Ana menüdeyken 3D sahnede hiçbir uçak (oyuncu, kanatçı veya düşman) spawn EDİLMEZ.
- **Minecraft Tarzı Kamera:** Kamera takımadaların üzerinde otomatik olarak süzülür, belirli manzaralı koordinatlar arasında yumuşakça gezinir ve 360 derece panoramik olarak döner.
- **Pilot Çağrı Kodu (Callsign):** Oyuncu çağrı kodunu metin kutusundan yazabilir, zar butonuna (`🎲`) tıklayarak rastgele seçebilir veya hazır butonlardan (MAVERICK, VIPER vb.) seçebilir.
- **3D Stüdyo Uçak Fotoğrafları:** Kartların üzerindeki uçak resimleri harici PNG değil, Three.js tarafından arkaplanda anlık oluşturulan 3D stüdyo açılı dinamik render fotoğraflarıdır (`generateAircraftPhotos`).
- **Uçak Seçimi Kısıtı:** Uçak seçimi **yalnızca ana menüde (uçuş başlamadan önce)** yapılabilir; oyun başladıktan sonra uçak değiştirilemez.

### 2.9. Ana Menü Müziği ve YouTube Error 153 Çözümü
- Kullanıcının talep ettiği 2 müzik:
  1. *Advance Australia - 8 Bit Version*
  2. *Wings of Steel - Menu Theme Soundtrack*
- **Şarkılar Arası 50 Saniyelik Görünmez Gecikme:** Bir şarkı bittiğinde diğeri hemen başlamaz; tam 50 saniyelik sessiz bir bekleme aralığı sayar (`⏳ DELAY (50s)`). İstenirse Next (`⏭`) veya Play (`▶`) ile bekleme atlanabilir.
- **Ses Ayarı (Volume Slider):** 0-%100 range slider ve Mute butonu bulunur; seçilen seviye `localStorage` (`ww2_menu_music_volume`) içerisine kaydedilir.
- **Kritik Hata ve Çözüm (YouTube Error 153):**
  - İlk denemede YouTube IFrame API kullanılmıştı. Ancak oyun yerel olarak `file:///` üzerinden açıldığında tarayıcı güvenlik politikası gereği Referrer başlığı gönderilemez (`origin: null`). YouTube sunucuları da `Error 153 (embedder.identity.missing.referrer)` fırlatarak akışı reddetti ve müziklerin döngüye girip çalmamasına sebep oldu.
  - **Kalıcı Çözüm:** İki parça da doğrudan indirilerek yerel `audio/theme1.m4a` ve `audio/theme2.m4a` dosyalarına dönüştürüldü ve standart HTML5 `<audio id="menu-audio-element">` ile bağlandı. Böylece internet olmadan ve `file:///` altında %100 kararlı çalışması sağlandı.
  - Sortie başladığında müzik durur, ana menüye dönüldüğünde kaldığı yerden devam eder.

### 2.10. ESC Tuşu ile Tüm Oyunu Dondurma (Freeze Entire Game)
- Uçuş esnasında **ESC** tuşuna basıldığında (veya tarayıcı pointer lock'tan çıktığında):
  - Uçak fiziği, mermiler, bombalar, düşman yapay zekası, çevre efektleri, dumanlar ve hava üssü sayaçları **anında donar**.
  - `clock.getDelta()` döngüde sürekli tüketildiği için donma süresi boyunca zaman birikmez; oyun devam ettiğinde hiçbir fiziksel sıçrama veya hızlanma yaşanmaz.
  - Web Audio API (`audioCtx.suspend()`) ve motor sesleri derhal susturulur.
  - Ekranda donmuş 3D sahnenin üzerine yarı saydam buzlu cam efektiyle `FLIGHT PAUSED` paneli gelir.
  - Tekrar **ESC** tuşuna basıldığında veya **RESUME FLIGHT (ESC)** butonuna tıklandığında oyun kaldığı saliseden pürüzsüzce devam eder.
  - Pause ekranına eklenen **MAIN MENU** butonu sayesinde uçuşu terk edip doğrudan hangara dönmek mümkündür.

---

## 3. YAZILAN/DEĞİŞTİRİLEN KODLAR VE DOSYA MİMARİSİ

### 3.1. Dosya Ağacı ve Görev Dağılımı
```text
c:\Users\Derya\game2\
├── index.html                   # Ana giriş noktası, HUD, Menü, Audio ve Modal DOM yapıları
├── style.css                    # War Thunder temalı koyu cam (glassmorphism) stilleri, HUD ve menü
├── game.js                      # Ana oyun motoru (Uçuş fiziği, yapay zeka, balistik, menü & ses döngüsü)
├── three.min.js                 # Three.js r128 kütüphanesi (yerel dosya)
├── ww2_aircraft_builders.js     # 4 uçağın (Mustang, Zero, Bf 109, Il-2) prosedürel 3D mesh oluşturucuları
├── barrage_balloon_builder.js   # Baraj balonları ve kablolarının 3D oluşturucusu
├── Play_Game.bat                # Windows için tek tıkla başlatma bat betiği
└── audio\                       # Yerel ses dosyaları
    ├── theme1.m4a               # Advance Australia 8-bit tema müziği (~99.8s)
    └── theme2.m4a               # Wings of Steel ana menü müziği (~76.7s)
```

### 3.2. `game.js` İçindeki Ana Modüller ve Satır Referansları
- **Konfigürasyon & State (`state` nesnesi - Satır ~38–110):**
  - `inMainMenu`, `gameStarted`, `isPaused`, `isFlyingWingman`, `aircraftLives`, `pilotName`, `mouseAim`, `flight` nesneleri burada tutulur.
- **Audio Sistemi (`initAudio`, `updateAudio` - Satır ~410–815):**
  - Web Audio API ile prosedürel motor osilatörü, rüzgar gürültüsü, dalış uğultusu ve silah sesleri üretilir.
- **Menü Arka Plan Panoraması (`initMenuPanorama`, `updateMenuPanoramaCamera` - Satır ~1090–1150):**
  - Minecraft tarzı 360° dönen kamera matematiği.
- **Uçak 3D Fotoğraf Çekimi (`generateAircraftPhotos` - Satır ~1150–1350):**
  - Seçim kartları için uçak modellerini geçici render edip `img.src` veri URL'sine çevirir.
- **Sortie Başlatma & Kanatçı Devralma (Satır ~2970–3140):**
  - `launchSortieFromMainMenu()`: Ana menüyü kapatır, uçağı ve düşmanları sahnede oluşturur.
  - `takeOverFriendlyWingman()`: Oyuncunun canı bittiğinde hayattaki kanatçıya geçiş yapar.
- **WEP & Soğuma Sistemi (`resetWEPState` - Satır ~3140–3190):**
  - 10s WEP + 15s cooldown döngüsü.
- **Oyun Dondurma & Pointer Lock (`pauseGame`, `resumeGame`, `togglePause`, `requestLock` - Satır ~3330–3450):**
  - ESC tuşuyla tetiklenen küresel donma mekanizması.
- **Ana Menüye Dönüş (`returnToMainMenu` - Satır ~3450–3510):**
  - Tüm uçakları sahneden siler (despawn), kamera panoramasını ve menü müziğini geri açar.
- **Müzik ve Ses Sistemi (`initMenuMusic`, `applyMenuMusicVolume` - Satır ~3510–3710):**
  - HTML5 Audio, 50s bekleme sayacı, volume slider ve mute yönetimi.
- **Girdi Yöneticisi (`setupInputs` - Satır ~3960–4350):**
  - Mouse Aim (`mousemove`), Gaz (`wheel`), Ateş (`mousedown`/`Space`), ESC dinleyicisi.
- **Fizik & Aerodinamik (`updatePhysics` - Satır ~4350–5100):**
  - İrtifa, hücum açısı (AoA), stall uyarıları, hız kesme, sürtünme ve iniş takımı fiziği.
- **Silahlar & Balistik (`updateWeapons` - Satır ~5100–5800):**
  - Mermi izleri, yerçekimi düşüşü, 400m convergence ve isabet tespiti.
- **Yapay Zeka ve Filo Yönetimi (`updateEnemyPlanes` - Satır ~5800–8200):**
  - Düşman takım taktikleri, lider-kanatçı formasyonları ve atış kararları.
- **Hava Meydanı Bakım İstasyonu (`updateAirfieldSystems` - Satır ~8280–8400):**
  - Sert iniş kontrolü ve 4 saniyelik tamir/mühimmat ikmali sayacı.
- **Ana Animasyon Döngüsü (`animate` - Satır ~9320–9415):**
  - `state.isPaused` kontrolü ile tüm simülasyonu donduran veya kareleri güncelleyen ana döngü.

---

## 4. ŞU ANKİ MEVCUT DURUM VE SIRADA BEKLEYEN ADIMLAR

### 4.1. Doğrulanmış ve Sorunsuz Çalışan Özellikler
- [x] `index.html` üzerinden çift tıklayarak tarayıcıda doğrudan açılabilme.
- [x] Minecraft tarzı dönen ve rastgele süzülen 3D harita panoramalı Ana Menü.
- [x] Ana menüde 3D stüdyo uçak kartları, pilot adı seçimi ve rastgele çağrı kodu üretici.
- [x] Ana menü müzik çaları (yerel M4A), 50 saniyelik şarkı arası sessizlik sayacı ve ses seviyesi ayarı.
- [x] Uçuş sırasında **ESC** tuşuna basıldığında tüm oyunun (fiziğin, seslerin, mermilerin, düşmanların) eksiksiz donması ve ESC/Resume ile sıçramasız devam edebilmesi.
- [x] Pause menüsünden doğrudan **MAIN MENU**'ye dönebilme.
- [x] Gerçekçi WEP süresi (10s) ve bekleme süresi (15s) göstergeleri ve sayaçları.
- [x] Oyuncu canı bittiğinde Kanatçı (#2)'ye geçebilme; tüm filo yok olduğunda yenilgi ekranı gösterilmesi.
- [x] Hava meydanına inişte hız kontrolü (hızlı inişte patlama) ve güvenli inişte can haklarını artırmadan tamir ve mühimmat ikmali yapılması.
- [x] Kanat silahlarının 400m–600m harmonizasyonu ve lead indicator (önleme nişangahı) senkronizasyonu.

### 4.2. Claude İçin Önemli Notlar ve Gelecek Geliştirme Alanları
1. **Dosya Bütünlüğü:** `game.js` dosyası 9400+ satırdan oluşan kapsamlı bir modüldür. Değişiklik yaparken fonksiyon isimlerini ve küresel `state` yapısını bozmamaya özen gösterilmelidir.
2. **`file:///` Protokolü Hatırlatması:** Asla harici domainlerden CORS veya iframe gerektiren kütüphaneler eklenmemelidir. Eklenen her yeni ses veya doku yerel dosya yolundan (`audio/`, `models/` vb.) yüklenmelidir.
3. **Sırada Bekleyen / Geliştirilebilecek Potansiyel Alanlar:**
   - **Hedef ve Görev Sistemi:** Oyuncuya yok edilecek belirli düşman hedefleri, koruma görevleri (bombardıman uçaklarını eskortlama vb.) verilebilir.
   - **Gelişmiş Hasar Modeli:** Uçağın kanat veya dümeninin kopması gibi parça bazlı hasar modellemesi (şu an toplam HP barı üzerinden çalışmaktadır).
   - **Daha Fazla Uçak & Ses Efekti:** Yeni İkinci Dünya Savaşı uçakları veya ek motor sesleri eklenebilir.
