// ===== ĐIỀN THÔNG TIN FIREBASE CỦA BẠN VÀO ĐÂY =====
// Lấy trong Firebase Console > Project settings > General > Your apps > SDK setup and configuration
const firebaseConfig = {
  apiKey: "AIzaSyDYvwIPea1bMCqpaBa20sol6RB8nQga_sg",
  authDomain: "trang-bio-cua-toi.firebaseapp.com",
  projectId: "trang-bio-cua-toi",
  storageBucket: "trang-bio-cua-toi.firebasestorage.app",
  messagingSenderId: "477154277734",
  appId: "1:477154277734:web:eae9b301bc03ce6f7db0a7"
};

// Tài khoản Admin tổng (toàn quyền, tạo được admin phụ). Bắt buộc đúng cả tên lẫn mật khẩu.
const ADMIN_NAME = "Huyduc";
const ADMIN_PASSWORD = "201226";

// ===== PROJECT FIREBASE THỨ 2 (TÙY CHỌN) — thêm dung lượng lưu acc + ảnh =====
// Project 2: he-thong-quan-li-tk (Firestore + Rules đã bật). Để "DIEN_VAO" nếu muốn tắt project 2.
const firebaseConfig2 = {
  apiKey: "AIzaSyAFj-VnvD136Slx051gHCzS7_k4H12W4ng",
  authDomain: "he-thong-quan-li-tk.firebaseapp.com",
  projectId: "he-thong-quan-li-tk",
  storageBucket: "he-thong-quan-li-tk.firebasestorage.app",
  messagingSenderId: "752124033736",
  appId: "1:752124033736:web:6c423b0433edaca56d43fd"
};
// Acc MỚI thêm sẽ lưu vào project nào:
//   'auto' (khuyên dùng) = lưu vào project 1 cho tới khi ước lượng dung lượng gần đầy thì TỰ chuyển sang project 2.
//   1 hoặc 2 = ép lưu cố định vào project đó.
// Acc cũ vẫn ở nguyên project cũ và web luôn hiển thị gộp cả hai.
const ACC_WRITE_TO = 'auto';
// Ngưỡng ước lượng để tự chuyển sang project 2 (byte). 800 MB chừa khoảng trống dưới mức 1 GiB miễn phí.
const ACC_MAX_BYTES = 800 * 1024 * 1024;
