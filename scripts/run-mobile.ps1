# QamqorMap мобильді қосымшасын телефонда ашу (Expo Go арқылы).
# IskeQosu-Mobile.bat файлы арқылы іске қосыңыз.
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Say($t, $c = 'Cyan') { Write-Host $t -ForegroundColor $c }
function Fail($t) { Write-Host ""; Write-Host "ҚАТЕ: $t" -ForegroundColor Red; exit 1 }

Say "=== QamqorMap мобильді қосымшасы ===" 'Green'

# 1. Node.js
function Find-Node {
  if (Get-Command node -ErrorAction SilentlyContinue) { return $true }
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  if (Get-Command node -ErrorAction SilentlyContinue) { return $true }
  foreach ($dir in @("$env:ProgramFiles\nodejs", "${env:ProgramFiles(x86)}\nodejs", "$env:LOCALAPPDATA\Programs\nodejs", "$env:NVM_SYMLINK")) {
    if ($dir -and (Test-Path (Join-Path $dir 'node.exe'))) { $env:Path = "$dir;$env:Path"; return $true }
  }
  return $false
}
if (-not (Find-Node)) { Fail "Node.js табылмады. Алдымен IskeQosu.bat-ты бір рет іске қосыңыз (ол Node.js-ті орнатуға көмектеседі)." }
Say "Node.js: $(& node -v)"

# 2. Сервер (сайт пен қосымшаға ортақ API)
function Test-Server {
  try { $r = Invoke-WebRequest -Uri 'http://localhost:3000/api/health' -UseBasicParsing -TimeoutSec 3; return $r.StatusCode -eq 200 } catch { return $false }
}
if (Test-Server) {
  Say "Сервер жұмыс істеп тұр: http://localhost:3000" 'Green'
} else {
  Say "Сервер қосылмаған — жаңа терезеде демо режимде іске қосылады (IskeQosu-Demo.bat)..." 'Yellow'
  Say "Ол терезе құпиясөз сұраса, сонда жазыңыз. Ол терезені ЖАППАҢЫЗ." 'Yellow'
  Start-Process -FilePath (Join-Path $root 'IskeQosu-Demo.bat') -WorkingDirectory $root
  $ok = $false
  for ($i = 0; $i -lt 180; $i++) {
    Start-Sleep -Seconds 2
    if (Test-Server) { $ok = $true; break }
    if ($i % 10 -eq 9) { Say "  сервер күтілуде..." }
  }
  if (-not $ok) { Fail "Сервер 6 минутта іске қосылмады. IskeQosu-Demo.bat терезесіндегі хабарды қараңыз, сосын осы файлды қайта ашыңыз." }
  Say "Сервер іске қосылды." 'Green'
}

# 3. Қосылу режимі: әдепкіде TUNNEL (телефон кез келген желіден QR арқылы қосылады).
#    "IskeQosu-Mobile.bat lan" — телефон мен компьютер бір Wi-Fi-да болса, жылдамырақ LAN режимі.
$mode = 'tunnel'
if ($args.Count -gt 0 -and $args[0] -match '^(lan|--lan)$') { $mode = 'lan' }
# API Expo серверінің өзі арқылы проксиленеді (mobile/metro.config.js → /api/*):
# телефонға компьютердің 3000-портын ашудың қажеті жоқ, брандмауэр мен IP мекенжайы да маңызды емес.
Remove-Item Env:EXPO_PUBLIC_API_URL -ErrorAction SilentlyContinue
Remove-Item Env:REACT_NATIVE_PACKAGER_HOSTNAME -ErrorAction SilentlyContinue
$env:QM_API_TARGET = 'http://127.0.0.1:3000'

# 4. Қосымшаның пакеттері (бірінші рет немесе tunnel модулі жоқ болса)
Set-Location (Join-Path $root 'mobile')
if (-not (Test-Path 'node_modules\expo') -or -not (Test-Path 'node_modules\@expo\ngrok')) {
  Say ""
  Say "Қосымша пакеттері орнатылуда (бірінші рет 2-5 минут)..."
  & npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Fail "npm install сәтсіз аяқталды. Интернет байланысын тексеріп, қайта көріңіз." }
}

# 5. Expo серверін іске қосу — QR-код шығады
Say ""
Say "Келесі қадамдар:" 'Green'
Say "  1. Телефонға Expo Go-ның ЕҢ СОҢҒЫ нұсқасын орнатыңыз/жаңартыңыз (Play Store / App Store). Жоба Expo SDK 58-де." 'Yellow'
if ($mode -eq 'tunnel') {
  Say "  2. Режим: TUNNEL — телефон мобильді интернетте немесе басқа Wi-Fi-да болса да қосылады." 'Yellow'
  Say "     Алғашқы іске қосуда tunnel 20-60 секунд дайындалады: «Tunnel ready» жазуын күтіңіз." 'Yellow'
} else {
  Say "  2. Режим: LAN — телефон мен компьютер БІР Wi-Fi желісінде болсын. Қосылмаса, жай IskeQosu-Mobile.bat (tunnel) іске қосыңыз." 'Yellow'
  Say "     Windows брандмауэрі сұраса — Node.js үшін «Жеке желілер» рұқсатын беріңіз." 'Yellow'
}
Say "  3. Android: Expo Go → «Scan QR code» → төмендегі QR-кодты сканерлеңіз." 'Yellow'
Say "     iPhone: стандартты «Камера» қосымшасымен QR-кодты сканерлеп, «Expo Go-да ашу» хабарын басыңыз." 'Yellow'
Say "     iPhone-да Expo талабы: тегін Expo аккаунты керек — компьютерде  cd mobile  және  npx expo login," 'Yellow'
Say "     ал Expo Go-да оң жақ жоғарғы бұрыштағы белгішені басып, СОЛ аккаунтпен кіріңіз. Android-та қажет емес." 'Yellow'
Say "  4. Бұрын қосымшада сервер мекенжайын қолмен жазған болсаңыз: Профиль → Сервер мекенжайы → «Әдепкі мекенжайға қайтару»." 'Yellow'
Say "Бұл терезені және сервер терезесін ЖАППАҢЫЗ — Expo Go осы компьютердегі серверден жұмыс істейді. Тоқтату: Ctrl+C." 'Red'
Say ""
# iPhone-дағы Expo Go үшін Expo CLI-ге кіру керек (бір рет; кейін есте сақталады).
# Тексеріс ешқашан скриптті тоқтатпайды: кірмеген болса да QR-код шығады (Android-та аккаунт керек емес).
$ErrorActionPreference = 'Continue'
$who = ''
try { $who = (cmd /c "npx expo whoami 2>&1" | Out-String).Trim() } catch { $who = '' }
if ($LASTEXITCODE -ne 0 -or -not $who -or $who -match 'Not logged in') {
  Say "Expo CLI-ге кірілмеген — iPhone-дағы Expo Go жобаны ашпайды (Android-та міндетті емес)." 'Yellow'
  Say "Кіру үшін: осы терезені жабыңыз да, Expo-Kiru.bat файлын іске қосыңыз." 'Yellow'
} else {
  Say "Expo CLI аккаунты: $who  (iPhone-дағы Expo Go-да да осы аккаунт болуы керек)" 'Green'
}
Say ""

if ($mode -eq 'tunnel') {
  # Expo SDK 58: жай --tunnel Expo аккаунтын талап етеді; "--tunnel ngrok" аккаунтсыз жұмыс істейді
  & npx expo start --tunnel ngrok --clear
  if ($LASTEXITCODE -ne 0) {
    Say ""
    Say "Tunnel іске қосылмады. Мүмкін шешімдер:" 'Yellow'
    Say "  а) Интернетті тексеріп, осы файлды қайта ашыңыз (ngrok кейде уақытша қолжетімсіз)." 'Yellow'
    Say "  ә) Expo аккаунтымен (тегін): cd mobile, сосын  npx expo login  және  npx expo start --tunnel" 'Yellow'
    Say "  б) Телефон мен компьютер бір Wi-Fi-да болса:  IskeQosu-Mobile.bat lan" 'Yellow'
  }
} else {
  & npx expo start --lan --clear
}
