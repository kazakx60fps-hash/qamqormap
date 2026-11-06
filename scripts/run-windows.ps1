# QamqorMap: Windows-та бір рет баптау және іске қосу.
# IskeQosu.bat файлы арқылы іске қосыңыз. IskeQosu-Demo.bat — қорғауға арналған бөлек демо дерекқормен (-Demo).
param([switch]$Demo)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Say($t, $c = 'Cyan') { Write-Host $t -ForegroundColor $c }
function Fail($t) { Write-Host ""; Write-Host "ҚАТЕ: $t" -ForegroundColor Red; exit 1 }

Say "=== QamqorMap іске қосылуда ===" 'Green'

# 1. Node.js
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Find-Node {
  $n = Get-Command node -ErrorAction SilentlyContinue
  if ($n) { return $true }
  foreach ($dir in @("$env:ProgramFiles\nodejs", "${env:ProgramFiles(x86)}\nodejs", "$env:LOCALAPPDATA\Programs\nodejs", "$env:NVM_SYMLINK")) {
    if ($dir -and (Test-Path (Join-Path $dir 'node.exe'))) { $env:Path = "$dir;$env:Path"; return $true }
  }
  return $false
}
if (-not (Find-Node)) {
  Refresh-Path
}
if (-not (Find-Node)) {
  Say "Node.js компьютерде табылмады." 'Yellow'
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    $ans = Read-Host "Node.js LTS қазір автоматты түрде орнатылсын ба? (Y = иә / N = жоқ)"
    if ($ans -match '^[YyИиДд]') {
      Say "Node.js орнатылуда (1-3 минут, Windows рұқсат сұраса — 'Иә' басыңыз)..."
      & winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
      Refresh-Path
    }
  }
}
if (-not (Find-Node)) {
  Start-Process 'https://nodejs.org/'
  Fail "Node.js табылмады. Ашылған беттен LTS нұсқасын орнатып (барлық баптауды әдепкі күйінде қалдырыңыз), IskeQosu.bat-ты қайта ашыңыз."
}
$ver = (& node -v).TrimStart('v').Split('.')[0]
if ([int]$ver -lt 20) { Fail "Node.js $(& node -v) ескі. 20 немесе жаңа нұсқасын орнатыңыз: https://nodejs.org/" }
Say "Node.js: $(& node -v)"

# 2. PostgreSQL (psql)
$psql = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $psql) {
  $cand = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
    Sort-Object { [int]($_.Directory.Parent.Name -replace '[^0-9].*$', '') } -Descending | Select-Object -First 1
  if ($cand) { $psql = $cand.FullName }
}
if (-not $psql) {
  Start-Process 'https://www.postgresql.org/download/windows/'
  Fail "PostgreSQL табылмады. Оны орнатып (postgres құпиясөзін есте сақтаңыз), IskeQosu.bat-ты қайта ашыңыз."
}
Say "PostgreSQL: $psql"

$pgPort = if ($env:PGPORT) { $env:PGPORT } else { '5432' }

# 3. Дерекқор және .env (тек бірінші рет)
$envFile = Join-Path $root '.env'
if (-not (Test-Path $envFile)) {
  Say ""
  Say "Бірінші іске қосу: дерекқор жасалады."
  $sec = Read-Host -AsSecureString "PostgreSQL орнатқанда берген 'postgres' пайдаланушысының құпиясөзін енгізіңіз"
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  $env:PGCLIENTENCODING = 'UTF8'

  & $psql -U postgres -h localhost -p $pgPort -d postgres -tAc "SELECT 1" | Out-Null
  if ($LASTEXITCODE -ne 0) { Remove-Item Env:PGPASSWORD; Fail "PostgreSQL-ге қосылу мүмкін болмады. Құпиясөзді және PostgreSQL қызметі қосулы екенін тексеріңіз." }

  $chars = (48..57) + (65..90) + (97..122)
  $appPass = -join ($chars | Get-Random -Count 20 | ForEach-Object { [char]$_ })

  $roleExists = "$(& $psql -U postgres -h localhost -p $pgPort -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='qamqor'")".Trim()
  if ($roleExists -eq '1') {
    & $psql -U postgres -h localhost -p $pgPort -d postgres -c "ALTER ROLE qamqor WITH LOGIN PASSWORD '$appPass'" | Out-Null
  } else {
    & $psql -U postgres -h localhost -p $pgPort -d postgres -c "CREATE ROLE qamqor LOGIN PASSWORD '$appPass'" | Out-Null
  }
  if ($LASTEXITCODE -ne 0) { Fail "qamqor рөлін жасау мүмкін болмады." }

  foreach ($db in @('qamqormap', 'qamqormap_test', 'qamqormap_demo')) {
    $exists = "$(& $psql -U postgres -h localhost -p $pgPort -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'")".Trim()
    if ($exists -ne '1') {
      & $psql -U postgres -h localhost -p $pgPort -d postgres -c "CREATE DATABASE $db OWNER qamqor ENCODING 'UTF8' TEMPLATE template0" | Out-Null
      if ($LASTEXITCODE -ne 0) { Fail "$db дерекқорын жасау мүмкін болмады." }
      Say "Дерекқор жасалды: $db"
    } else {
      & $psql -U postgres -h localhost -p $pgPort -d postgres -c "ALTER DATABASE $db OWNER TO qamqor" | Out-Null
      Say "Дерекқор бұрыннан бар (деректер сақталады): $db"
    }
  }
  Remove-Item Env:PGPASSWORD

  $envText = @"
DATABASE_URL=postgres://qamqor:$appPass@localhost:$pgPort/qamqormap
TEST_DATABASE_URL=postgres://qamqor:$appPass@localhost:$pgPort/qamqormap_test
PORT=3000
COOKIE_SECURE=false
SESSION_DAYS=14
UPLOAD_DIR=uploads
MAX_UPLOAD_MB=5
"@
  [IO.File]::WriteAllText($envFile, $envText, (New-Object Text.UTF8Encoding $false))
  Say ".env файлы жасалды."
}

# 4. Тәуелділіктер
if (-not (Test-Path (Join-Path $root 'node_modules\express'))) {
  Say ""
  Say "npm пакеттері орнатылуда (бірінші рет 1-2 минут)..."
  & npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Fail "npm install сәтсіз аяқталды. Интернет байланысын тексеріңіз." }
}

# 5. Миграциялар және демо деректер (қайталау қауіпсіз)
Say ""
if ($Demo) {
  Say "ДЕМО режимі: бөлек qamqormap_demo дерекқоры (негізгі дерекқор өзгермейді)..." 'Yellow'
  & node scripts/demo.mjs setup
  if ($LASTEXITCODE -ne 0) {
    Say "qamqormap_demo дерекқорын PostgreSQL әкімшісі ретінде жасау керек." 'Yellow'
    $sec = Read-Host -AsSecureString "'postgres' пайдаланушысының құпиясөзі"
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
    & $psql -U postgres -h localhost -p $pgPort -d postgres -c "CREATE DATABASE qamqormap_demo OWNER qamqor ENCODING 'UTF8' TEMPLATE template0" | Out-Null
    Remove-Item Env:PGPASSWORD
    & node scripts/demo.mjs setup
    if ($LASTEXITCODE -ne 0) { Fail "Демо дерекқорды дайындау сәтсіз аяқталды." }
  }
} else {
  Say "Дерекқор миграциялары және демо деректер..."
  & npm run setup --silent
  if ($LASTEXITCODE -ne 0) { Fail "Миграция сәтсіз аяқталды. Жоғарыдағы хабарды қараңыз." }
}

# 6. Сайтты іске қосу
Say ""
Say "Сайт ашылуда: http://localhost:3000" 'Green'
Say "Демо аккаунттар құпиясөзі: Demo12345 (кіру бетінде жылдам батырмалар бар)" 'Yellow'
Say "МАҢЫЗДЫ: бұл терезені ЖАППАҢЫЗ — сайт тек осы терезе ашық тұрғанда жұмыс істейді." 'Red'
Say "Терезенің ішін тышқанмен баспаңыз (Windows серверді кідіртіп қояды). Тоқтату үшін Ctrl+C басыңыз." 'Yellow'
# Windows консоліндегі QuickEdit режимін өшіру: терезені басқанда сервер «қатып» қалмауы үшін
try {
  Add-Type -Namespace QM -Name Con -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern System.IntPtr GetStdHandle(int h);
[DllImport("kernel32.dll")] public static extern bool GetConsoleMode(System.IntPtr h, out uint m);
[DllImport("kernel32.dll")] public static extern bool SetConsoleMode(System.IntPtr h, uint m);
'@
  $h = [QM.Con]::GetStdHandle(-10); $m = 0
  if ([QM.Con]::GetConsoleMode($h, [ref]$m)) { [QM.Con]::SetConsoleMode($h, (($m -bor 0x80) -band (-bnot 0x40))) | Out-Null }
} catch {}
if ($Demo) {
  Say "Телефондағы қосымшаға сервер терезесінде көрсетілген «Мобильді қосымша үшін API мекенжайы» жазылады." 'Yellow'
  Say "Windows брандмауэрі сұраса, «Жеке желілер» үшін рұқсат беріңіз." 'Yellow'
}
Start-Job -ScriptBlock { Start-Sleep -Seconds 3; Start-Process 'http://localhost:3000' } | Out-Null
if ($Demo) { & node scripts/demo.mjs start } else { & node server/index.js }
