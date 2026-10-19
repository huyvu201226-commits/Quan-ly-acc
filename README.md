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

## Phân quyền

- **Admin tổng** (tên + mật khẩu đặt trong `firebase-config.js`, mặc định `Huyduc` / `201226`): toàn quyền — thêm/sửa/xóa acc, xem giá + mô tả, xem Thùng rác + Lịch sử, tạo/xóa admin phụ, và **xóa được người dùng thường**.
- **Admin phụ** (tạo trong tab Quản trị, cần đúng tên + mật khẩu riêng): thêm/sửa/xóa acc, xem giá + mô tả, xem Thùng rác + Lịch sử — nhưng không quản lý được người dùng/admin khác (mục đó chỉ Admin tổng thấy).
- **Người dùng thường**: chỉ cần gõ tên là vào xem ngay, **không cần mật khẩu, không cần Admin duyệt**. Chỉ thấy 2 trang **Trang chủ** và **Acc đã thêm**; mỗi acc chỉ thấy **mã số + ảnh** (không thấy giá, mô tả, ngày thêm); không có nút Sửa/Xóa, không thêm được acc mới, không thấy tab Thùng rác/Lịch sử/Quản trị.

## Bắt buộc điền đủ khi thêm/sửa acc

Cả 3 cách thêm/sửa acc (bấm dấu **+**, bấm **Sửa** trên một acc, và **Thêm nhiều ảnh cùng lúc**) đều bắt buộc phải có đủ **ảnh, mã số, giá, mô tả** mới lưu được — thiếu ô nào sẽ báo lỗi ngay tại ô đó và không cho lưu.

## Xóa có xác nhận

Bấm **Xóa** trên một acc (hoặc xóa người dùng/admin trong tab Quản trị) sẽ hiện một cửa sổ xác nhận nổi; có thể bấm nút **Xóa** hoặc gõ phím **Enter** để xác nhận, hoặc **Esc**/bấm **Hủy** để hủy.

## Lịch sử truy cập

Mỗi người dùng chỉ hiện **đúng 1 dòng** trong tab Lịch sử: lần truy cập gần nhất là ngày/giờ nào, và đã hoạt động trong bao lâu ở lần đó (tính từ lúc đăng nhập tới lần cập nhật hoạt động gần nhất) — không hiện lại các lần truy cập cũ trước đó. Nếu một nick lỡ có nhiều hơn 1 dòng (ví dụ do dữ liệu cũ từ trước, hoặc truy cập dồn dập), app tự động dọn và chỉ giữ lại đúng 1 dòng mới nhất cho nick đó — cả trên màn hình lẫn trong Firestore.

## Ghi nhớ đăng nhập (không cần đăng nhập lại khi tải lại trang)

Sau khi vào được trang lần đầu (người dùng thường, admin phụ hay Admin tổng), tên + quyền được ghi nhớ ngay trên trình duyệt/thiết bị đó. Từ lần sau — kể cả khi bấm tải lại trang (F5) hay đóng rồi mở lại — sẽ **tự động vào lại ngay**, không cần gõ tên hay mật khẩu lần nữa, cho tới khi bấm **Thoát**.

Lưu ý: đây là ghi nhớ theo **từng trình duyệt/thiết bị** (lưu trong localStorage của trình duyệt đó), không phải một tài khoản thật dùng chung. Vì vậy nó giúp bạn không phải đăng nhập lại mỗi lần mở lại trang trên **cùng một máy/trình duyệt**, nhưng **không** tự động đăng nhập giúp bạn trên một thiết bị/trình duyệt khác mà bạn chưa từng đăng nhập ở đó — lần đầu mở trên thiết bị mới vẫn cần gõ tên (và mật khẩu nếu là admin) như bình thường. Đây là giới hạn tự nhiên của việc không có hệ thống tài khoản thật (xem thêm phần "Về bảo mật" bên dưới).

## Về bảo mật

App này không dùng tài khoản Firebase thật (Firebase Authentication) — mật khẩu Admin chỉ được kiểm tra bằng JavaScript chạy ngay trên trình duyệt, và như đã nói ở phần Rules bên trên, 4 mục `accmgr_...` cho phép đọc/ghi công khai để app tự vận hành. Điều này phù hợp cho một nhóm nhỏ dùng nội bộ, nhưng **không phải là bảo mật tuyệt đối**: một người biết cách gọi thẳng vào Firestore (không qua giao diện) vẫn có thể đọc hoặc sửa dữ liệu trực tiếp, kể cả tự phong mình làm admin. Nếu bạn cần chặn khả năng này (ví dụ acc có dữ liệu nhạy cảm/giá trị cao), cách chắc chắn nhất là thêm **Firebase Authentication** thật + viết lại Firestore Rules để kiểm tra quyền theo tài khoản đăng nhập thật — báo mình nếu muốn nâng cấp phần này.

## Khi thêm/sửa nhiều acc

- Khi thêm ACC, có nút "📦 Thêm nhiều ảnh cùng lúc từ máy" — chọn nhiều ảnh một lúc, bấm vào từng ảnh để nhập mã số/giá/mô tả riêng cho ảnh đó (bắt buộc điền đủ cả 3), rồi bấm "Lưu tất cả".
- Dữ liệu lưu vĩnh viễn trên Firestore, mọi người mở link đều thấy chung một dữ liệu, mất máy/xóa cache vẫn còn.
- Ảnh được nén trước khi lưu (cạnh dài tối đa 900px, chất lượng 70%) để vừa giới hạn 1MB/tài liệu của Firestore — ảnh chất lượng cao gốc sẽ không được giữ nguyên 100%, nhưng vẫn đủ rõ để xem/nhận diện.
- Gói miễn phí Firestore (Spark): ~1GB lưu trữ, đủ cho hàng chục nghìn acc ảnh nén; không cần thẻ ngân hàng.
- Trang đăng nhập bắt đầu tải trước danh sách acc + lịch sử truy cập ngay khi mở trang (chạy song song lúc bạn gõ tên/mật khẩu), nên sau khi đăng nhập xong dữ liệu hiện ra nhanh hơn thay vì phải đợi tải lại từ đầu.


## Dán ảnh (Ctrl+V) và kéo thả
- Đứng ở **Trang chủ** (không mở cửa sổ nào) rồi Ctrl+V: tự mở "Thêm ACC" với ảnh vừa dán, con trỏ nhảy sẵn vào ô Mã số.
- Copy **nhiều ảnh** (chọn nhiều file trong Explorer/Finder rồi Ctrl+C) và dán: tự mở "Thêm nhiều ACC".
- Trong cửa sổ Thêm / Sửa: dán ở đâu cũng được, không cần bấm vào khung ảnh. Có thể kéo thả file ảnh vào cửa sổ.
- Trong "Thêm nhiều ACC": Ctrl+V hoặc kéo thả sẽ cộng thêm ảnh vào danh sách, không xóa ảnh đã chọn.
- Đang gõ trong ô chữ và clipboard có cả chữ lẫn ảnh (vd copy từ Excel): ưu tiên dán chữ.


## Phím tắt & tính năng mới

**Thêm nhiều ảnh cùng lúc**
- Mở lên là tự vào ảnh đầu tiên. Điền mã số → Enter → giá → Enter → mô tả → Enter: tự sang ảnh kế tiếp, vào dòng đầu (mã số). Esc: thoát nhập.
- Khi không đang gõ: ← → ↑ ↓ chuyển ảnh (khung xanh đậm), Enter để nhập thông tin ảnh đang chọn, **Delete** xóa luôn ảnh đang chọn.
- Ảnh trùng mã KHÔNG còn tự xóa/bỏ qua. Khi bấm "Lưu tất cả" sẽ hiện cửa sổ so sánh ảnh mới với ảnh cũ trùng mã (hoặc trùng nhau trong cùng đợt) để bạn chọn: Giữ ảnh cũ / Dùng ảnh mới (ảnh cũ vào thùng rác) / Giữ cả hai.

**Kho acc & Trang chủ**: ← → ↑ ↓ chọn ảnh (khung đậm), Enter = Sửa, **Delete** = Xóa. Bấm Xóa (hoặc Delete) hiện 3 nút: **Đã bán** / **Xóa acc** / **Hủy** (← → chọn, Enter xác nhận).

**Trang Nhắc nhở** (Admin): chọn "Đã bán" → nhập hẹn ngày giờ, bán cho ai, nguồn của ai, giá đã trả, tổng giá. Acc rời kho sang trang Nhắc nhở (ảnh lớn, thông tin cũ in nhỏ). Nút: Sửa hẹn, ✉ Email, 📅 Lịch, Đã trả đủ, Trả về kho.

**Nhắc qua email huyvu201226@gmail.com**
- Nút ✉ Email: mở sẵn Gmail soạn thư "Acc này đã đến hạn trả góp" kèm đủ thông tin.
- Nút 📅 Lịch: tạo sự kiện Google Calendar mời huyvu201226@gmail.com — Google tự nhắc kể cả khi đóng web.
- Gửi tự động khi đến hạn: điền `EMAILJS` trong firebase-config.js. Web chỉ gửi khi có người đang mở trang (trang tĩnh không có máy chủ chạy nền).

## Để tab mở liên tục
Danh sách acc tự cập nhật theo thời gian thực (không cần F5): thêm/sửa/xóa/bán ở máy khác đều hiện ngay trên tab đang mở. Nhắc hạn kiểm tra mỗi 60 giây khi tab còn mở. Muốn nhắc cả khi đóng web, dùng Google Apps Script (file Code.gs).


## Tự nhận diện mã (tướng/trang phục) từ ảnh — file `ocr-acc.js`
- Dán ảnh (Ctrl+V), kéo thả hoặc chọn file: trang tự đọc ảnh, tìm số **Tướng** và số **Trang phục** rồi điền sẵn vào ô Mã số theo dạng `tướng/trang phục` (vd `112/205`). Điền xong con trỏ nhảy sang ô Giá.
- **Chỉ có 1 kết quả**: tự điền, ghi "✓ Tự nhận từ ảnh". Bạn vẫn sửa được ở ô Mã số như bình thường.
- **Nhận ra 2 kết quả trở lên**: KHÔNG tự điền, hiện cảnh báo đỏ + các nút kết quả để bấm chọn (hoặc tự nhập).
- **Không đọc được / chỉ thấy một nửa**: báo rõ lý do, bạn tự nhập.
- Nếu bạn đã gõ mã trước khi OCR xong thì OCR không ghi đè, chỉ hiện "Gợi ý từ ảnh".
- Khi **Sửa** acc và đổi ảnh: chỉ gợi ý mã (không tự ghi đè mã cũ).
- **Thêm nhiều ảnh**: mỗi ảnh được nhận diện lần lượt, thẻ nào đủ mã thì tự điền, thẻ nào mơ hồ/không đọc được sẽ có cảnh báo; xong cả đợt có thông báo tổng kết.
- Chạy trên trình duyệt bằng Tesseract.js (miễn phí, không cần API key). Lần đầu mất vài giây để tải thư viện + dữ liệu tiếng Việt (khoảng vài MB), các lần sau được trình duyệt lưu đệm. Cần có mạng.
- Số liệu hợp lệ chỉnh ở đầu file `ocr-acc.js` (`heroRange`, `skinRange`), từ khóa nhận nhãn ở `heroWords`, `skinWords`. Nếu ảnh của bạn ghi nhãn khác (vd "Hero", "Skin", "Tướng đã mua") thêm vào đó.
- Nhớ upload thêm file `ocr-acc.js` lên GitHub cùng 4 file còn lại.


## Tải dữ liệu nhanh, 2 giai đoạn (không còn treo khi mới vào)
- **Giai đoạn 1 (trước khi vào web):** chỉ tải acc thêm trong **2 ngày gần nhất** (+ lịch sử truy cập). Việc này chạy song song với màn hình đăng nhập nên đăng nhập xong là vào được ngay. Nếu 2 ngày gần đây có ít hơn 30 acc, trang tự lấy thêm 30 acc mới nhất để Trang chủ không bị trống.
- **Giai đoạn 2 (chạy ngầm sau khi đã vào):** acc cũ hơn được tải từng lô 25 acc, mới → cũ, hiện dần lên trang. Góc trái dưới có thanh "Đang tải thêm acc cũ… N". Tải lỗi thì bấm vào thanh đó để thử lại. Đổi `OLD_PAGE` / `RECENT_MS` đầu phần "Tải dữ liệu 2 giai đoạn" trong `script.js` nếu muốn chỉnh.
- Trong lúc acc cũ chưa tải xong: ô tìm kiếm có ghi chú "kết quả có thể chưa đủ"; khi lưu acc mới, trang tự hỏi thẳng máy chủ xem mã có trùng với acc cũ chưa tải không (kiểm tra theo đúng mã đã nhập).
- Tab "Acc đã thêm" chỉ vẽ 60 acc đầu, bấm "Hiện thêm" để xem tiếp (kho hàng nghìn acc không làm nặng trang). Trang chỉ vẽ lại khi dữ liệu thật sự đổi nên ảnh không bị nháy khi các lô nền đổ về.
- Cập nhật thời gian thực: mỗi lần thêm/sửa/bán/xóa mềm, acc được gắn thêm trường `updatedAt`; các máy khác chỉ nghe những acc có `updatedAt` mới, nên vẫn thấy thay đổi tức thì kể cả với acc cũ mà không phải tải lại cả kho. (Việc sửa acc từ một máy còn chạy bản code cũ thì chưa có `updatedAt`, máy khác sẽ thấy sau khi F5.)
- Bộ nhớ đệm trên máy chỉ giữ acc gần đây (tối đa ~3,5 MB) thay vì cả kho, nên không còn bị đầy bộ nhớ trình duyệt hay đơ lúc lưu cache. Việc dọn acc quá 4 tháng chỉ chạy sau khi đã tải đủ acc cũ.
- Lượng đọc Firestore giảm khoảng một nửa so với trước (trước đây vừa tải cả kho vừa nghe cả kho).


## Nhận diện mã bản 2 (ocr-acc.js) — đọc đúng 2 nơi đã học
- Số tướng/trang phục nằm ở 2 nơi: ô tròn góc phải ("126 468 / Tướng Tr.phục") và khung trái ("TƯỚNG 126 / SKIN 468"). Code cắt đúng 2 vùng này (toạ độ theo % ảnh), chỉ đọc chữ số, thử nhiều ngưỡng + cỡ phóng rồi bỏ phiếu: ~1-3 giây, 2 nơi khớp nhau là chắc chắn.
- Lệch nhau hoặc chưa chắc: kiểm chữ nhãn (Tướng/Tr.phục/SKIN) để xác minh. Không có ở chỗ đã học: tự tìm số trên toàn ảnh, chỉ nhận khi thấy đúng nhãn cạnh số (tối đa ~25 giây). Không xác nhận được thì KHÔNG tự điền, chỉ gợi ý để bạn bấm chọn.
- Chỉnh vùng ở `CFG.zones` đầu file nếu giao diện game đổi.

## Tự học vị trí mã (mới)
- Khi OCR không tìm ra / đọc sai và bạn tự nhập mã rồi bấm Lưu, code chạy NỀN: quét mọi chữ số trong ảnh (nhiều ngưỡng sáng/tối, phủ kín toàn ảnh) để tìm đúng 2 số bạn nhập, nhớ vị trí + bố cục (số nằm cạnh nhau hay chồng nhau) vào localStorage của trình duyệt (key `accocr.learned.v1`, tối đa 12 vùng). Ảnh sau cùng bố cục sẽ đọc thẳng vùng đã học (~2 giây).
- Ảnh tự tìm thấy nhờ chữ nhãn cũng được tự ghi nhớ. Vùng cho kết quả sai bị giảm điểm và tự bỏ khi hết điểm.
- Vùng học lưu theo từng trình duyệt/máy. Sao chép sang máy khác: `AccOCR.exportLearned()` rồi `AccOCR.importLearned(chuỗi)` ở Console. Xoá hết: `AccOCR.clearLearned()`.
- Giới hạn: số tướng phải đứng TRƯỚC (bên trái hoặc phía trên) số trang phục.

## Tăng tốc lưu/tải (mới)
- Nén ảnh nhanh hơn (giải mã bằng createImageBitmap, mã hoá bất đồng bộ) và nén SẴN ngay lúc chọn/dán ảnh, nên bấm Lưu là có luôn.
- Kiểm tra trùng mã chạy song song với nén ảnh.
- Thêm/sửa 1 acc: lưu "lạc quan" — acc hiện và cửa sổ đóng ngay, Firebase ghi ở nền. Lỗi thì tự hoàn tác và báo; đóng tab khi còn đang ghi sẽ có cảnh báo.
- Thêm nhiều ảnh: nén + ghi 4 ảnh cùng lúc thay vì lần lượt.
- Phần tự học vị trí mã chỉ chạy lúc máy rảnh và nhường CPU định kỳ, không còn tranh với thao tác lưu.
