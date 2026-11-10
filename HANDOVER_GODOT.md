# Godot Portu — Devir Notu

> **Kime:** Bu projeye devam edecek Claude oturumu
> **Tarih:** 10 Kasım 2026
> **Repo kökü:** `Aerials/` (git, remote `https://github.com/Eren0764/Aerials.git`, branch `main`)
> **Godot projesi:** `Aerials/Aerials_godot/` (Godot 4.7.2, Forward+, binary: `godot4`)
> **Kaynak oyun:** kökteki `game.js` (~14.500 satır), `ww2_aircraft_builders.js`, `barrage_balloon_builder.js`, `net.js`, `style.css`, `index.html`

---

## 1. Görev

Tarayıcı oyununu (HTML/JS, Three.js r128) Godot 4 Forward+ PC oyununa sistem sistem portla.
JS davranışına sadık kal. Bilerek yapılan sapmalar `# shortcut:` veya `# JS bug fix:` yorumuyla işaretlenir.

### Kullanıcının kesin kuralları
1. **%100 kod ile kurulum.** Editör/inspector talimatı yok. Tüm düğümler `_ready()` içinde `Node.new()` + `add_child()` ile kurulur. Tek sahne `Aerials.tscn` (kök `World`).
2. **Forward+ grafik:** gölgeli ışıklar, WorldEnvironment (AgX tonemap, glow, SSAO, sis) kodla.
3. **Asset yolları `res://`** (= `Aerials_godot/`).
4. `requestAnimationFrame` → `_process(delta)`; JS matematiği → `Vector3` / `Basis` / `Transform3D`.
5. JS event listener → `Input` / `_unhandled_input`. Aksiyonlar kodla, sadece yoksa eklenir (`action_has_event` kontrolü).

### Çalışma biçimi
- Önce ilgili JS'i oku, sonra GDScript yaz.
- Tüm projeyi parse-check et: `godot4 --headless --path . --import` (Aerials_godot içinde), çıktıda `SCRIPT ERROR` arama.
- Headless test: `extends SceneTree` script'i; `_initialize`'da `root.add_child.call_deferred(World.new())`, `_process`'te fazlar. Çalıştır: `godot4 --headless --path . -s <test.gd>`.
- Görsel kontrol: aynı script'i pencereli çalıştır (`--resolution 1280x720`), `root.get_texture().get_image().save_png()`; ekran görüntüsünü kullanıcıya gönder.
- Script hata verince Godot asılı kalabilir: komutları `timeout` ile çalıştır.
- Kullanıcıyla Türkçe konuş.

---

## 2. Mimari ve kurallar

- **Koordinatlar:** Three ve Godot ikisi de sağ elli, Y yukarı. Uçak burnu **+Z**.
- **Döndürme:** `rotate_object_local` = Three `rotateX/Y/Z`. `Basis.looking_at(dir, up, true)` = Three `lookAt` (+Z ileri).
- **Euler sırası:** Godot varsayılanı YXZ, Three XYZ. Three'den açı kopyalanan düğümlerde `rotation_order = EULER_ORDER_XYZ`.
- **Simülasyon:** `_process`, `dt = minf(delta, 0.1)`. Kare başına lerp'ler `1 - pow(1 - f, dt * 60)` ile kare hızından bağımsız.
- **Fizik motoru kullanılmıyor.** Arazi analitik: `World.get_terrain_height(x, z)`.
- **Mermi hedefleri:** `"bullet_targets"` grubu.
  - Arayüz: `bullet_team()`, `bullet_hit_test(p0, p1) -> {module, point}`, `take_bullet_hit(damage, module, point, shooter)`.
  - Aynı takım vurmaz. `"friendly_targets_only"` takımı (balonlar) sadece `"friendly"` mermiyle vurulur.
- **Hedef bilgisi:** uçaklar `get_target_info() -> {pos, basis, velocity, airborne, firing, engageable, side}` sağlar; ölü/uygun değilse `{}`.
  - Side: oyuncu ve müttefik `"friendly"`, düşman takımları `team_id` (`team_mustang` …). Tüm AI takımları birbirine düşman.
- **Ballistics** grubu `"ballistics"`: `get_tree().get_first_node_in_group("ballistics")`.
- **Atış yapanın adı:** `callsign` özelliği olan herhangi bir düğüm (EnemyPlane, FriendlyPlane, `Defenses.Battery`) mesajlarda adıyla geçer.
- **Duraklatma:** `SceneTree.paused`. Duraklama sırasında da çalışması gereken UI `PROCESS_MODE_ALWAYS`.
- **Ses:** tek seferlik sesler JS'deki osilatör ve filtrelerle bir kez offline render edilip `AudioStreamWAV` olarak önbelleğe alınır (`GameAudio._render_all`). Motor, rüzgar ve uyarı sesleri döngü halinde çalar.
- **Ayarlar:** `user://settings.cfg` (menü ses seviyesi, pilot adı).

### Oyun akışı
- `World` kalıcı sistemleri kurar: Ballistics, Airfields, Defenses, MenuCamera, MainMenu.
- `start_sortie()` → `assign_random_team_bases()` + `airfields.build()` + `defenses.build()` → `Sortie`.
- `Sortie` şunları kurar: Player, FlightCamera, EnemyDirector, müttefikler, HUD, PauseMenu, BombSystem, GameAudio, ResultScreen. Sinyalleri de o bağlar.
- `_end_sortie` önce `remove_child`, sonra `queue_free` yapar.

---

## 3. Dosyalar (`Aerials_godot/scripts/`)

| Dosya | İçerik |
|---|---|
| `world.gd` | Harita sabitleri, airports/docks statik verisi, arazi mesh, ortam, güneş, deniz, oyun akışı |
| `sortie.gd` | Bir görev: kurulum ve bağlantılar, düşme → yeniden doğma / devralma / yenilgi, zafer |
| `aircraft_defs.gd` | Tier tablosu, 6 uçak, silahlar, bomba rafı, SM.79 `dorsal_gunner` |
| `aircraft_model.gd` | GLB yükleme + hook'lar (pervane, bulanıklık diski, iniş takımı, kumanda yüzeyleri, `dorsal_turret`) |
| `player_aircraft.gd` | Uçuş fiziği (WEP, sanal eğitmen, stall, iniş), girdi, hasar |
| `flight_camera.gd` | Takip, kokpit ve flyby kamera; serbest bakış; sarsıntı |
| `gun_system.gd` | Ateş hızı, convergence, ısınma ve tutukluk |
| `ballistics.gd` | Mermiler, isabet testi, efektler, PuffSystem havuzları |
| `puff_system.gd` | MultiMesh parçacık havuzu |
| `bomb_system.gd` | Bombalar, patlama, üs / balon / flak hasarı |
| `enemy_plane.gd`, `enemy_director.gd` | Düşman AI, filolar, hedef dağıtımı |
| `friendly_plane.gd` | Kanat arkadaşı AI |
| `airfields.gd` | Üs görselleri ve hasarı |
| `defenses.gd` | Baraj balonları, 12 flak bataryası, uyarı küreleri, duman shader'ları |
| `dorsal_gunner.gd` | SM.79 otomatik sırt topçusu (tüm uçaklara eklenir, def'te yoksa boşta durur) |
| `hud.gd`, `pause_menu.gd`, `result_screen.gd` | Arayüz |
| `main_menu.gd`, `menu_camera.gd`, `aircraft_photo_studio.gd` | Menü, panorama, kart fotoğrafları |
| `game_audio.gd` | Prosedürel ses |

**Model hattı:** `tools/export_aircraft_glb.py` headless Chromium ile JS model kodunu çalıştırır ve `models/aircraft/<id>.glb` + `<id>.json` (hook adları) yazar.

---

## 4. Henüz portlanmayanlar (öncelik sırasıyla)

1. **Dünya süsleri:** gemiler ve iskeleler (`buildDocks`, gemi mesh'leri), yollar (`ROAD_LINKS`, `buildRoads`), ağaçlar (`buildTrees`), çöl ortamı (`buildDesertEnvironment`), bulutlar (`buildClouds`). game.js ~2267. satırdan başlıyor.
   - Yollar gelince `defenses.gd` → `_valid_site` içine `isNearRoad` kontrolü ekle (shortcut yorumu orada).
2. **Ayarlar paneli** (`setupSettingsPanel`, ~5686. satır).
3. **Fraksiyonlar modu** ve mod seçim ekranı.
4. **Çok oyunculu** (`net.js`).
5. **Dokunmatik kontroller.**
6. **3D konumsal ses.**
7. **Menü kartlarında fareyle büyütme efekti.**

### Bilinen bilinçli sapmalar
- Balonlar ve bataryalar her yeni oyunda sıfırlanır; JS'de yıkık kalıyorlardı.
- Balon modelinde JS'de ters olan burun ve kuyruk düzeltildi.
- Tüm flak bataryaları düşman boyasında; taraf mini haritadaki renkten okunur.
- Deniz opak PBR düzlem (shortcut).
- Kapanışta görülen "ObjectDB leaked / resources still in use" uyarıları zararsız (statik önbellekler).

---

## 5. Ortam notları

- **Klasör adları:** üst klasör adı sonda boşluk içerir: `/home/btlab13/Masaüstü/Aerials ` (yolları tırnakla yaz).
- **Git kimliği:** global git kimliği yok. Commit'leri `git -c user.name="Derya" -c user.email="mehmet07643407@gmail.com" commit ...` ile at.
- **Push:** kullanıcı kendisi yapar. GitHub kullanıcı adı `Eren0764`, şifre yerine token kullanılır. Token'ı asla isteme veya yazma.
- **Claude Code Game Studios** (`.claude/`, `CLAUDE.md`, `project.yaml`) repoya kuruldu: 78 skill, 49 ajan, hook'lar.
  - Sadece `Aerials/` klasöründe açılan oturumda aktif.
  - `project.yaml` henüz yapılandırılmadı: önce `/start` veya `/setup-engine` çalıştır. Motor Godot 4, dil GDScript, kod klasörü `Aerials_godot`.
- Kökteki `HANDOVER_CLAUDE.md` eski tarayıcı sürümünün devir notu (JS tarafı için referans).
