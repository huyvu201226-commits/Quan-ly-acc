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

Sửa dòng `ADMIN_NAME = "Huyvu"` thành đúng tên bạn sẽ dùng để đăng nhập — người đăng nhập bằng đúng tên này sẽ tự động là **Admin**, có quyền duyệt người khác.

## Bước 3 — Đặt quy tắc bảo mật (bắt buộc)

Vào **Firestore Database > Rules**, dán đè bằng:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

Bấm **Publish**.

> ⚠️ Quy tắc trên cho phép **bất kỳ ai có link trang** đều đọc/ghi được dữ liệu (không cần biết tài khoản Firebase). Điều này phù hợp vì trang tự có lớp "chờ admin duyệt" ở tầng ứng dụng. Nhưng ai biết cách gọi thẳng tới Firestore (không qua giao diện) vẫn có thể đọc/sửa data — kể cả các mục dữ liệu khác trong cùng project nếu bạn không xiết rules riêng cho từng mục. Nếu cần chặt hơn (ví dụ chỉ cho phép đọc/ghi các mục có tiền tố `accmgr_`), báo mình để viết rules chi tiết hơn.

## Bước 4 — Đăng lên GitHub Pages

1. Tạo repository mới trên GitHub (vd `acc-manager`), để **Public**.
2. Upload cả 4 file (`index.html`, `style.css`, `script.js`, `firebase-config.js`) lên repo đó.
3. Vào **Settings > Pages** của repo → mục **Source** chọn nhánh `main`, thư mục `/ (root)` → **Save**.
4. Sau ~1 phút, trang sẽ chạy tại: `https://<tên-github-của-bạn>.github.io/acc-manager/`

## Sau khi cài xong

- Mở link trên, đăng nhập bằng đúng `ADMIN_NAME` đã đặt → bạn tự động là Admin, vào tab **🛡 Quản trị** để duyệt người khác.
- Người khác đăng nhập bằng tên bất kỳ → sẽ ở trạng thái "chờ duyệt" tới khi bạn duyệt.
- Dữ liệu lưu vĩnh viễn trên Firestore, mọi người mở link đều thấy chung một dữ liệu, mất máy/xóa cache vẫn còn.
- Ảnh được nén trước khi lưu (cạnh dài tối đa 900px, chất lượng 70%) để vừa giới hạn 1MB/tài liệu của Firestore — ảnh chất lượng cao gốc sẽ không được giữ nguyên 100%, nhưng vẫn đủ rõ để xem/nhận diện.
- Gói miễn phí Firestore (Spark): ~1GB lưu trữ, đủ cho hàng chục nghìn acc ảnh nén; không cần thẻ ngân hàng.

