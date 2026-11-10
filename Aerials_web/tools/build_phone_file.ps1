# Builds WWII_Air_Combat_Phone.html: one self-contained file (CSS, Three.js, all scripts and the menu
# music inlined) that a phone can open on its own. Phones cannot load the files next to index.html,
# so opening index.html alone shows an unstyled white page.
# Run Build_Phone_File.bat again after changing the game.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Read-Text([string]$name) {
  return [System.IO.File]::ReadAllText((Join-Path $root $name), [System.Text.Encoding]::UTF8)
}

# A literal "</script" inside inlined code would end the <script> tag early
function Get-InlineScript([string]$name) {
  $code = (Read-Text $name).Replace('</script', '<\/script')
  return "<script>/* $name */`n" + $code + "`n</script>"
}

function Replace-Once([string]$text, [string]$find, [string]$with, [string]$what) {
  if (-not $text.Contains($find)) { throw "Could not find $what in the source - the build script needs updating." }
  return $text.Replace($find, $with)
}

$html = Read-Text 'index.html'

$html = Replace-Once $html '<link rel="stylesheet" href="style.css">' ("<style>`n" + (Read-Text 'style.css') + "`n</style>") 'the style.css link'
$html = Replace-Once $html '<script src="three.min.js"></script>' (Get-InlineScript 'three.min.js') 'the three.min.js script tag'
$html = Replace-Once $html '<script src="ww2_aircraft_builders.js"></script>' (Get-InlineScript 'ww2_aircraft_builders.js') 'the aircraft builders script tag'
$html = Replace-Once $html '<script src="barrage_balloon_builder.js"></script>' (Get-InlineScript 'barrage_balloon_builder.js') 'the balloon builder script tag'
$html = Replace-Once $html '<script src="net.js"></script>' (Get-InlineScript 'net.js') 'the net.js script tag'

# Menu music becomes data: URLs so it plays without the audio folder
$game = Read-Text 'game.js'
foreach ($track in @('theme1.m4a', 'theme2.m4a')) {
  $path = Join-Path $root "audio\$track"
  if (Test-Path $path) {
    $b64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($path))
    $game = Replace-Once $game "'audio/$track'" "'data:audio/mp4;base64,$b64'" "the audio/$track path in game.js"
  }
}
$gameTag = "<script>/* game.js */`n" + $game.Replace('</script', '<\/script') + "`n</script>"
$html = Replace-Once $html '<script src="game.js"></script>' $gameTag 'the game.js script tag'

$out = Join-Path $root 'WWII_Air_Combat_Phone.html'
[System.IO.File]::WriteAllText($out, $html, $utf8)
$mb = [Math]::Round((Get-Item $out).Length / 1MB, 1)
Write-Host "Built $out ($mb MB)"
