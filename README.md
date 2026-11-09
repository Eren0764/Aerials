# Aerials — WWII Hava Muharebesi

İkinci Dünya Savaşı temalı, War Thunder Arcade tarzı 3D uçuş ve it dalaşı oyunu.

Repoda iki sürüm var:

| Klasör | Ne | Durum |
|---|---|---|
| `/` (kök) | Orijinal tarayıcı oyunu (HTML/JS, Three.js r128) | Tam oyun, referans kaynak |
| `Aerials_godot/` | Godot 4 (Forward+ / Vulkan) PC portu, GDScript | Aktif geliştirme |

---

## Başka bilgisayarda kurulum

```bash
git clone https://github.com/Eren0764/Aerials.git
cd Aerials
```

**Godot sürümü:**
1. [Godot 4.7](https://godotengine.org/download) (standart, .NET gerekmez) indir.
2. Godot'u aç, *Import* ile `Aerials_godot/project.godot` dosyasını seç.
3. İlk açılışta Godot modelleri ve sesleri içe aktarır (`.godot/` klasörü oluşur, repoda yok).
4. F5 ile çalıştır. Ana sahne `res://Aerials.tscn`.

Komut satırından:

```bash
godot --path Aerials_godot
```

**Tarayıcı sürümü:** `index.html` dosyasına çift tıkla (veya Windows'ta `Play_Game.bat`). Sunucu gerekmez.

---

## Kontroller (Godot)

| Tuş | İşlev |
|---|---|
| Fare | Nişan; Sanal Eğitmen uçağı imlece yönlendirir |
| W / S | Pitch (manuel, eğitmeni devre dışı bırakır) |
| A / D | Roll |
| Q / E | Rudder (yaw) |
| Shift / Ctrl, tekerlek | Gaz ve WEP (%110) |
| Sol tık / Space | Makineli tüfek |
| Sağ tık / Z | Nişangah zoom |
| Basılı C | Serbest bakış (360°) |
| B | Bomba bırak |
| L | Lead (önleme) nişangahı aç/kapa |
| G | İniş takımı |
| F | Flap |
| V | Kamera modu (takip / kokpit / flyby) |
| R | Yeniden doğ / tekrar dene |
| M | Ses aç/kapa |
| ESC | Duraklat menüsü |

---

## Özellikler (Godot portu)

### Dünya ve grafik
- 17.76 km × 12.36 km harita (`MAP_SCALE = 4`). Adalar, dağlar, körfezler analitik yükseklik fonksiyonundan üretilir (JS ile birebir aynı).
- Forward+ render: ProceduralSky, AgX tonemapping, glow, SSAO, mesafe sisi.
- 4 kademeli gölgeli güneş, deniz yüzeyi, vertex renkli arazi + detay noise dokusu.
- Hava üsleri: pist (doku ve numaralar), apron, taksi yolu, kule ve döner fener, hangarlar, kum torbaları, pist kenar ışıkları, rüzgar tulumu.
- Limanlar kıyıya otomatik yerleşir; üsler limanlara doğru yönlenir.

### Uçaklar
6 uçak, her biri 0–4 arası çeviklik / hız / hasar / dayanıklılık kademesine sahip:

| Uçak | Uzmanlık |
|---|---|
| P-51D Mustang | Hız |
| A6M2 Zero | Çeviklik (kısa kalkış) |
| Bf 109 "Yellow 14" | Ateş gücü |
| Il-2 Sturmovik | Zırh |
| Spitfire Mk I | Dengeli |
| SM.79 Sparviero | Bombardıman (6 bomba) |

- Gerçek 3D modeller (`models/aircraft/*.glb`), JS model kodundan dışa aktarıldı.
- Hareketli parçalar: pervane + pervane bulanıklığı, iniş takımı, aileron, elevator, rudder, flap.

### Uçuş fiziği
- Fare ile nişan + Sanal Eğitmen (otomatik roll / pitch / rudder koordinasyonu).
- WASD/QE ile anında manuel kontrol, bırakınca eğitmen geri döner.
- Enerji modeli: dalışta hız kazanma, tırmanışta kaybetme, sert dönüşte hız kaybı.
- WEP: 10 sn güç, 15 sn soğuma.
- Stall, kalkış ve iniş kuralları, çarpma algılama, harita sınırı uyarısı.
- İniş takımı ve flap sürtünmesi; yerde takım kapanmasını engelleyen kilit.
- Üste inip durunca tamir ve mühimmat ikmali.

### Silahlar ve balistik
- Fiziksel mermiler: gerçek namlu noktaları, uçak hızını miras alır, yerçekimiyle düşer.
- 600 m convergence (namlu uyum mesafesi), düşüş telafili.
- Namlu ısınması ve sıkışma (jam), namlu ucu ışığı ve ısı parlaması.
- Tracer mermiler, isabet kıvılcımları, enkaz, hasar dumanı, patlamalar.
- Modül hasarı: motor / kanat / gövde.
- Lead nişangahı (L): hedefin hızına ve mermi uçuş süresine göre önleme noktası.

### Bombalar ve üs hasarı
- B ile bomba; yere düşüş nişangahı (0.3 m hassasiyet).
- Patlama: şok dalgası, su sütunu veya krater, duman, kamera sarsıntısı.
- 75 m etki alanı: uçaklara hasar, kule (400 HP) ve hangarlar (350 HP) yıkılır.
- Üs 1200 HP; yok edilen üsün takımı yeniden doğamaz.
- Üste inince bombalar yeniden yüklenir.

### Yapay zeka
- Düşman filoları rastgele üslere atanır; kalkış, tırmanış, devriye (orbit / sekiz), saldırı.
- Taktik it dalaşı: lider + kanatçı, kıskaç manevrası, hedef başına en fazla 2 saldırgan.
- 2600 m algılama, 3600 m ayrılma. AI'lar birbirleriyle de savaşır.
- Kanat arkadaşları (müttefik AI): kalkış, devriye, saldırı, kaçınma, iniş, tamir.
- Her AI 3 can, 8 sn sonra yeniden doğar.

### Oyun akışı
- Ana menü: kamera panoraması, pilot adı (rastgele isim düğmesi), takım boyutu 1–4, uçak kartları (stüdyo fotoğrafı + özellikler).
- Menü müziği: 2 parça, ses ayarı; ayarlar `user://settings.cfg` dosyasına kaydedilir.
- Oyuncu 3 can. Düşünce kanat arkadaşını devralma, yoksa yenilgi ekranı.
- Tüm düşmanlar tamamen yok olunca zafer: oyun durur, debrief ekranı, yörünge kamerası, fanfar.
- Duraklat menüsü (ESC, pencere odak kaybında otomatik): kontrol listesi, devam, ana menü.

### HUD
- Telemetri: gaz, hız, irtifa, mühimmat, takım, HP, can, flap, bomba, kanat arkadaşı, hedefler, üsler.
- Pusula, nişan halkası, ısı göstergeli nişangah, isabet işareti.
- Müttefik (mavi) ve düşman işaretçileri, savaş bildirimleri, uyarılar.
- Mini harita (yok edilen üsler işaretli).

### Ses
- Tüm sesler JS'deki osilatör ve filtrelerle kod içinde üretilir (dosya yok).
- Motor (gaza göre pitch), rüzgar, uyarı bip sesi.
- Silah (ağır / hafif), sıkışma, isabet, patlama, tamir, bomba, zafer fanfarı.
- AI silah sesleri 850 m menzilde.

---

## Proje yapısı (Godot)

Tüm sahne kod ile kurulur (`_ready()` içinde `Node.new()` + `add_child()`); editörde elle ayar yok.

```
Aerials_godot/
  project.godot, Aerials.tscn      # tek kök düğüm: World
  scripts/
    world.gd                 # harita, arazi, ortam, oyun akışı (menü / sortie)
    sortie.gd                # bir görev: oyuncu, AI, HUD, ses, zafer/yenilgi
    aircraft_defs.gd         # uçak istatistikleri ve silah tabloları
    aircraft_model.gd        # GLB yükleme + hareketli parçalar
    player_aircraft.gd       # oyuncu uçuş fiziği ve girdileri
    flight_camera.gd         # takip / kokpit / flyby kamera
    gun_system.gd            # silahlar, ısınma, convergence
    ballistics.gd            # mermiler, isabet testi, efektler
    puff_system.gd           # MultiMesh parçacık havuzu
    bomb_system.gd           # bombalar ve patlama hasarı
    enemy_plane.gd           # düşman AI
    enemy_director.gd        # filo oluşturma, hedef dağıtımı
    friendly_plane.gd        # kanat arkadaşı AI
    airfields.gd             # hava üsleri, hasar
    hud.gd, pause_menu.gd, result_screen.gd
    main_menu.gd, menu_camera.gd, aircraft_photo_studio.gd
    game_audio.gd            # prosedürel ses
  models/aircraft/           # <id>.glb + <id>.json (hareketli parça adları)
  audio/                     # menü müzikleri (ogg)
tools/
  export_aircraft_glb.py     # JS modellerini GLB'ye aktarır (Chromium gerekir)
```

Modeller `ww2_aircraft_builders.js` değişirse yeniden üret:

```bash
python3 tools/export_aircraft_glb.py
```

---

## Henüz portlanmayanlar

JS sürümünde olup Godot'ta henüz olmayanlar:
- Gemiler, yollar, ağaçlar, çöl ortamı, bulutlar
- Uçaksavar (AA), baraj balonları, SM.79 sırt topçusu
- Fraksiyonlar, çok oyunculu modlar (`net.js`), mod seçim ekranı
- Ayarlar paneli, dokunmatik kontroller
- 3D konumsal ses
- Menü kartlarında fareyle büyütme efekti
