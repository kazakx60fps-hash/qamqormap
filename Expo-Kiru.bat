@echo off
chcp 65001 >nul
cd /d "%~dp0mobile"
echo === Expo аккаунтына кіру (iPhone-дағы Expo Go-мен БІР аккаунт) ===
echo Браузер ашылады: сол аккаунтпен кіріп, растаңыз.
call npx expo login --browser
echo.
echo Қазіргі аккаунт:
call npx expo whoami
echo.
echo Енді IskeQosu-Mobile.bat іске қосылады...
cd /d "%~dp0"
call "%~dp0IskeQosu-Mobile.bat"
