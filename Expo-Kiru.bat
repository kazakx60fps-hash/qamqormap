@echo off
chcp 65001 >nul
cd /d "%~dp0mobile"
echo === Expo аккаунтына кіру (iPhone-дағы Expo Go-мен БІР аккаунт, мысалы bekss2222) ===
echo.
echo 1-тәсіл: браузер ашылады. Сол аккаунтпен кіріп, «Authorize / Растау» батырмасын басыңыз.
echo Браузерде «Success» жазуы шыққанша бұл терезені жаппаңыз.
call npx expo login --browser
call npx expo whoami >nul 2>&1
if not errorlevel 1 goto ok
echo.
echo 2-тәсіл: браузер арқылы болмады. Аккаунт атын және Expo құпиясөзін ОСЫ ТЕРЕЗЕГЕ өзіңіз жазыңыз.
echo (Google/Apple арқылы тіркелген болсаңыз, алдымен expo.dev сайтында Settings бөлімінде құпиясөз орнатыңыз.)
call npx expo login --no-browser
call npx expo whoami >nul 2>&1
if not errorlevel 1 goto ok
echo.
echo Кіру сәтсіз аяқталды. Осы терезенің скриншотын жіберіңіз.
pause
exit /b 1
:ok
echo.
echo Expo аккаунты:
call npx expo whoami
echo.
echo Енді IskeQosu-Mobile.bat іске қосылады...
cd /d "%~dp0"
call "%~dp0IskeQosu-Mobile.bat"
