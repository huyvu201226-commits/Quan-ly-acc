# Quản lý ACC — hướng dẫn cài đặt

Bộ file gồm: `index.html`, `style.css`, `script.js`, `firebase-config.js`.
Dữ liệu (ảnh, mã acc, mô tả, lịch sử đăng nhập, phân quyền admin) được lưu trên **Firebase Firestore** (miễn phí, không cần thẻ), không lưu trong file nên sẽ không mất khi tải lại trang hay đổi máy. Ảnh được nén nhỏ và lưu thẳng vào Firestore dạng base64 — không cần dùng Firebase Storage (Storage hiện bắt buộc gói trả phí Blaze nên app này tránh dùng để bạn không cần thêm thẻ).

## Dữ liệu độc lập, không ảnh hưởng trang cũ

Nếu bạn dùng chung project Firebase với trang khác (ví dụ trang bio cũ), **không sao cả** — app này lưu dữ liệu vào 4 mục riêng có tiền tố `accmgr_` (`accmgr_accounts`, `accmgr_users`, `accmgr_logins`, `accmgr_presence`), hoàn toàn tách biệt với mục `site/data` hay bất kỳ mục nào trang cũ đang dùng. Xóa/sửa dữ liệu trong app này sẽ không đụng tới dữ liệu trang cũ và ngược lại.

## Bước 1 — Tạo dự án Firebase (nếu chưa có)

1. Vào https://console.firebase.google.com → **Add project** → đặt tên bất kỳ → tạo xong. (Có thể dùng lại project cũ bạn đã có, không cần tạo mới.)
2. Trong menu trái, vào **Firestore** (hoặc Build > Firestore Database) → **Create database** → chọn **Start in test mode** → chọn khu vực gần Việt Nam (vd `asia-southeast1`) → Enable. Nếu project đã có Firestore rồi thì bỏ qua bước này.
3. Vào ⚙️ **Project settings** → kéo xuống **Your apps** → nếu chưa có app Web, bấm biểu tượng `</>` → đặt tên app → **Register app**. Nếu đã có app Web (vì dùng chung project với trang cũ) thì bấm vào xem lại config.
4. Firebase sẽ hiện ra đoạn `firebaseConfig = {...}`. Copy toàn bộ đoạn đó.

## Bước 2 — Điền cấu hình vào file

Mở file `firebase-config.js`, dán đè lên phần `firebaseConfig` bằng đoạn bạn vừa copy. Ví dụ:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "ten-du-an.firebaseapp.com",
  projectId: "ten-du-an",
  storageBucket: "ten-du-an.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};
```

Sửa dòng `ADMIN_NAME = "Huyduc"` và `ADMIN_PASSWORD = "201226"` nếu bạn muốn đổi tên đăng nhập/mật khẩu của **Admin tổng** (tài khoản toàn quyền, có thể tạo thêm admin phụ ngay trong web, tab 🛡 Quản trị).

> ⚠️ Lưu ý bảo mật: mật khẩu (cả Admin tổng lẫn admin phụ tạo trong web) được lưu dạng **chữ thường, không mã hóa**, phù hợp cho nhóm nhỏ dùng nội bộ, không phù hợp nếu cần bảo mật cao. Báo mình nếu bạn cần nâng cấp lên mã hóa mật khẩu thật sự.

## Bước 3 — Đặt quy tắc bảo mật (bắt buộc)

Vào **Firestore Database > Rules**, dán đè bằng:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Trang bio cũ: cho phép đọc công khai (để trang hiển thị bình thường),
    // KHÔNG cho ghi/sửa công khai — giả định bạn tự sửa nội dung qua Firebase Console.
    match /site/{document=**} {
      allow read: if true;
      allow write: if false;
    }
    // App quản lý ACC: cho đọc/ghi công khai vì app tự có lớp "chờ admin duyệt" riêng.
    match /accmgr_accounts/{doc} { allow read, write: if true; }
    match /accmgr_users/{doc} { allow read, write: if true; }
    match /accmgr_logins/{doc} { allow read, write: if true; }
    match /accmgr_presence/{doc} { allow read, write: if true; }
  }
}
```

Bấm **Publish**.

> Lưu ý: nếu trang bio cũ của bạn có tính năng cho khách **tự chỉnh sửa** nội dung ngay trên web (không phải chỉ bạn sửa qua Console), thì rule `write: if false` ở trên sẽ làm hỏng tính năng đó — báo mình biết trang bio cũ hoạt động ra sao để chỉnh lại rule cho đúng.

> ⚠️ Với 4 mục `accmgr_...`: cho phép **bất kỳ ai có link trang** đều đọc/ghi được dữ liệu (không cần biết tài khoản Firebase). Điều này phù hợp vì trang tự có lớp "chờ admin duyệt" ở tầng ứng dụng. Nhưng ai biết cách gọi thẳng tới Firestore (không qua giao diện) vẫn có thể đọc/sửa 4 mục này. Nếu cần chặt hơn, báo mình để thêm Firebase Authentication thật sự.

## Bước 4 — Đăng lên GitHub Pages

1. Tạo repository mới trên GitHub (vd `acc-manager`), để **Public**.
2. Upload cả 4 file (`index.html`, `style.css`, `script.js`, `firebase-config.js`) lên repo đó.
3. Vào **Settings > Pages** của repo → mục **Source** chọn nhánh `main`, thư mục `/ (root)` → **Save**.
4. Sau ~1 phút, trang sẽ chạy tại: `https://<tên-github-của-bạn>.github.io/acc-manager/`

## Sau khi cài xong

- Mở link trên, đăng nhập bằng đúng tên + mật khẩu `ADMIN_NAME`/`ADMIN_PASSWORD` đã đặt (mặc định `Huyduc` / `201226`) → bạn là **Admin tổng**, vào tab **🛡 Quản trị** để duyệt người khác và tạo thêm admin phụ.
- Trong tab Quản trị (chỉ Admin tổng thấy), có ô "Thêm quản trị viên" — nhập tên đăng nhập + mật khẩu cho admin phụ mới, họ sẽ đăng nhập bằng đúng tên + mật khẩu đó. Admin phụ chỉ thấy và duyệt được "Yêu cầu chờ duyệt", không thấy Admin tổng hay danh sách admin khác.
- Người dùng thường chỉ cần gõ tên (không cần mật khẩu) → chờ Admin duyệt.
- Khi thêm ACC, có nút "📦 Thêm nhiều ảnh cùng lúc từ máy" — chọn nhiều ảnh một lúc, bấm vào từng ảnh để nhập mã số/mô tả riêng cho ảnh đó, rồi bấm "Lưu tất cả".
- Dữ liệu lưu vĩnh viễn trên Firestore, mọi người mở link đều thấy chung một dữ liệu, mất máy/xóa cache vẫn còn.
- Ảnh được nén trước khi lưu (cạnh dài tối đa 900px, chất lượng 70%) để vừa giới hạn 1MB/tài liệu của Firestore — ảnh chất lượng cao gốc sẽ không được giữ nguyên 100%, nhưng vẫn đủ rõ để xem/nhận diện.
- Gói miễn phí Firestore (Spark): ~1GB lưu trữ, đủ cho hàng chục nghìn acc ảnh nén; không cần thẻ ngân hàng.

