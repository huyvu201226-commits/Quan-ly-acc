#!/usr/bin/env bash
# Đẩy cả thư mục này lên GitHub: ./up.sh "lời nhắn" (không gõ lời nhắn thì tự đặt theo giờ)
set -e
cd "$(dirname "$0")"
command -v git >/dev/null || { echo "[LỖI] Máy chưa cài Git."; exit 1; }
[ -d .git ] || git init -b main >/dev/null
if ! git remote get-url origin >/dev/null 2>&1; then
  read -r -p "Lần đầu: dán link repo GitHub (vd https://github.com/ten-ban/acc-manager.git): " URL
  git remote add origin "$URL"
fi
MSG="${*:-Cập nhật $(date '+%d/%m/%Y %H:%M')}"
git add -A
git commit -m "$MSG" || echo "(không có thay đổi mới để commit)"
git branch -M main
git pull --rebase --autostash origin main >/dev/null 2>&1 || true
git push -u origin main
echo "Xong! Đợi ~1 phút rồi tải lại trang GitHub Pages (Ctrl+F5)."
