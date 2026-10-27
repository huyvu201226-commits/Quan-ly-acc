@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo [LOI] May chua cai Git. Tai o day roi chay lai: https://git-scm.com/download/win
  pause
  exit /b 1
)

if not exist ".git" git init -b main >nul

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  echo Lan dau: dan link repo GitHub cua ban ^(vd https://github.com/ten-ban/acc-manager.git^)
  set /p URL=Link repo: 
  git remote add origin %URL%
)

set "MSG=%*"
if "%MSG%"=="" set "MSG=Cap nhat %date% %time%"

git add -A
git commit -m "%MSG%"
git branch -M main
git pull --rebase --autostash origin main >nul 2>nul
git push -u origin main
if errorlevel 1 (
  echo.
  echo [LOI] Day len that bai. Neu GitHub hoi dang nhap, hay dang nhap trinh duyet / dung Personal Access Token.
  pause
  exit /b 1
)
echo.
echo Xong! Doi ~1 phut roi tai lai trang GitHub Pages (Ctrl+F5).
pause
