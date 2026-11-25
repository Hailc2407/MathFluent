# MathFluent

Tiếng Anh cho Toán ứng dụng: học thuật ngữ, đọc ký hiệu và viết paper bằng tiếng Anh, bắt đầu với **Optimization**.
English for Applied Mathematics, starting with optimization.

Web tĩnh chạy trên GitHub Pages. Không cần tài khoản, không có backend, không cần API key.

## Các module

| Module | Nội dung | Bài tập |
|---|---|---|
| 📖 Thuật ngữ & collocation | 48 thuật ngữ Optimization trong 6 chủ đề: định nghĩa (LaTeX), phiên âm, họ từ, collocation, câu ví dụ, ghi chú | chọn nghĩa, đoán thuật ngữ từ định nghĩa, nghe chọn từ, điền collocation, gõ thuật ngữ |
| 📐 Thuật ngữ Giải tích | 39 thuật ngữ Giải tích toán học trong 5 chủ đề (dãy và giới hạn, liên tục và tô-pô, vi phân, tích phân, chuỗi), cùng định dạng và bài tập như module trên | như trên |
| 🌐 Thuật ngữ Giải tích hàm | 40 thuật ngữ trong 5 chủ đề (không gian Banach/Hilbert, toán tử tuyến tính, đối ngẫu và tô-pô yếu, các định lý nền tảng, toán tử phi tuyến và điểm bất động), cùng định dạng và bài tập | như trên |
| 🧮 Thuật ngữ Giải tích số | 40 thuật ngữ trong 5 chủ đề (sai số và ổn định, hệ tuyến tính, nội suy và xấp xỉ, cầu phương và ODE, PDE và rời rạc hóa), cùng định dạng và bài tập | như trên |
| ∑ Đọc ký hiệu | 45 ký hiệu trong 5 nhóm, mỗi ký hiệu có cách đọc chuẩn và cách đọc khác | công thức → cách đọc, nghe → công thức, tự đọc to rồi tự chấm |
| ✍️ Mẫu câu viết paper | 40 mẫu câu trong 5 nhóm, câu ví dụ trong ngữ cảnh Optimization, lỗi người Việt hay mắc | chọn mẫu câu theo chức năng, chọn câu đúng, điền từ còn thiếu |

Mỗi chủ đề có các bài ngắn (≤ 9 mục), học xong bài trước mới mở bài sau. Mục đã học vào hàng ôn ngắt quãng: 10 phút → 1 → 3 → 7 → 15 → 30 ngày.

Các tính năng khác:

- Giao diện song ngữ Việt / Anh. Ở chế độ tiếng Anh, giải nghĩa cũng chuyển sang tiếng Anh.
- Đọc to bằng giọng có sẵn của trình duyệt, kể cả câu có công thức.
- Đồng bộ tiến độ giữa các máy qua gist bí mật.
- Sao lưu và khôi phục tiến độ bằng file JSON.
- Nút 🚩 để ghi chú chỗ nội dung sai.

## Nội dung là bản nháp

Toàn bộ nội dung do AI soạn và **chưa được duyệt hết**. Mỗi mục hiện nhãn “Nháp” cho đến khi được đánh dấu đã duyệt.

Cách duyệt:

1. Khi học, thấy chỗ nào sai thì bấm 🚩 và ghi chú.
2. Vào Sổ tay → 🚩, bấm “Chép danh sách cần sửa” rồi gửi danh sách đó để sửa file dữ liệu.
3. Mục nào đã kiểm tra kỹ thì thêm `"ok": true` vào mục đó trong file JSON. Nhãn “Nháp” sẽ biến mất.

Phiên âm IPA dùng giọng Anh-Anh.

## Cấu trúc

```
index.html
css/app.css
js/boot.js     theme trước khi vẽ trang
js/core.js     tiện ích, lưu trữ, giọng đọc tiếng Anh, render KaTeX
js/sync.js     đồng bộ qua GitHub gist
js/lang.js     chuỗi giao diện vi / en
js/app.js      trang, bài học, bài tập, ôn ngắt quãng
data/terms-optimization.json
data/terms-analysis.json
data/terms-functional.json
data/terms-numerical.json
data/symbols.json
data/phrases.json
tools/check.mjs   kiểm tra dữ liệu
vendor/katex/     KaTeX 0.16.22 (MIT)
```

### Định dạng dữ liệu

Trong mọi chuỗi:

- `$…$` là công thức inline, `$$…$$` là công thức display.
- `{{…}}` đánh dấu thuật ngữ trong định nghĩa. Thuật ngữ được tô đậm khi học và bị che trong bài “đoán thuật ngữ”.
- `[[…]]` đánh dấu chỗ trống trong collocation và mẫu câu. Nhiều đáp án được chấp nhận thì tách bằng `|`, ví dụ `[[Since|As]]`.

Trong JSON, mọi dấu `\` của LaTeX phải viết thành `\\`.

Sau khi sửa dữ liệu, chạy lệnh sau từ thư mục gốc của repo:

```
node tools/check.mjs
```

Lệnh này kiểm tra cấu trúc, ID trùng, chỗ trống và render thử mọi công thức.

## Chạy thử trên máy

```
python3 -m http.server 8000
```

Mở http://localhost:8000. Phải mở qua http, không mở trực tiếp file `index.html`.

## Giấy phép

KaTeX: MIT (xem `vendor/katex/LICENSE`). Nội dung tự biên soạn, không sao chép từ giáo trình hay từ điển có bản quyền.
