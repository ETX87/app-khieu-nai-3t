-- ly_do_cham
INSERT INTO settings_option (nhom, gia_tri, parent) VALUES
    ('ly_do_cham', 'Do KTV', NULL),
    ('ly_do_cham', 'Do CSKH', NULL),
    ('ly_do_cham', 'Do đối tác', NULL),
    ('ly_do_cham', 'Chờ phê duyệt', NULL),
    ('ly_do_cham', 'Do cuối tuần', NULL),
    ('ly_do_cham', 'Do công ty thiếu linh kiện', NULL),
    ('ly_do_cham', 'Do khách hàng', NULL),
    ('ly_do_cham', 'Do thời tiết', NULL),
    ('ly_do_cham', 'Do chờ phòng bảo hành (kho)', NULL),
    ('ly_do_cham', 'Do KTV quá tải', NULL),
    ('ly_do_cham', 'Do App đồng bộ muộn', NULL),
    ('ly_do_cham', 'Lý do khác', NULL),
    ('ly_do_cham', 'Do Admin chậm', NULL),
    ('ly_do_cham', 'Do KRF xử lý chậm', NULL),
    ('ly_do_cham', 'Kết thúc tồn đọng', NULL);

-- nhom_van_de
INSERT INTO settings_option (nhom, gia_tri, parent) VALUES
    ('nhom_van_de', 'Báo cáo', NULL),
    ('nhom_van_de', 'CA LẶP CẦN XEM XÉT, ĐỔI MÁY', NULL),
    ('nhom_van_de', 'Chính sách', NULL),
    ('nhom_van_de', 'Khiếu nại', NULL),
    ('nhom_van_de', 'Quy trình', NULL),
    ('nhom_van_de', 'Sản phẩm', NULL),
    ('nhom_van_de', 'Thái độ, tay nghề', NULL),
    ('nhom_van_de', 'Thay lõi', NULL),
    ('nhom_van_de', 'Tư vấn', NULL);

-- van_de_dau_vao (parent = nhom_van_de value)
INSERT INTO settings_option (nhom, gia_tri, parent) VALUES
    ('van_de_dau_vao', 'CTV báo sai', 'Báo cáo'),
    ('van_de_dau_vao', 'Gian lận', 'Báo cáo'),
    ('van_de_dau_vao', 'Lỗi do KH', 'Báo cáo'),

    ('van_de_dau_vao', 'CA LẶP CẦN XEM XÉT', 'CA LẶP CẦN XEM XÉT, ĐỔI MÁY'),
    ('van_de_dau_vao', 'CA ĐỔI MÁY CẦN XEM XÉT', 'CA LẶP CẦN XEM XÉT, ĐỔI MÁY'),

    ('van_de_dau_vao', 'Chính sách bảo hành', 'Chính sách'),
    ('van_de_dau_vao', 'Chính sách bảo mật', 'Chính sách'),

    ('van_de_dau_vao', 'Chậm trễ', 'Khiếu nại'),
    ('van_de_dau_vao', 'Máy lỗi', 'Khiếu nại'),
    ('van_de_dau_vao', 'KTV', 'Khiếu nại'),
    ('van_de_dau_vao', 'Khác', 'Khiếu nại'),
    ('van_de_dau_vao', 'Máy lọc nước bể lọc thô', 'Khiếu nại'),
    ('van_de_dau_vao', 'Máy không lên nước', 'Khiếu nại'),
    ('van_de_dau_vao', 'Máy kêu to sáng đèn liên tục', 'Khiếu nại'),
    ('van_de_dau_vao', 'Máy chớp đỏ', 'Khiếu nại'),
    ('van_de_dau_vao', 'Máy không chảy nước', 'Khiếu nại'),
    ('van_de_dau_vao', 'Máy không lạnh. Không nóng', 'Khiếu nại'),
    ('van_de_dau_vao', 'Máy ko lên nước', 'Khiếu nại'),

    ('van_de_dau_vao', 'Lỗi hẹn khách', 'Quy trình'),
    ('van_de_dau_vao', 'Sai quy định', 'Quy trình'),

    ('van_de_dau_vao', 'Chất lượng sản phẩm', 'Sản phẩm'),
    ('van_de_dau_vao', 'Lỗi linh kiện theo máy', 'Sản phẩm'),

    ('van_de_dau_vao', 'Thái độ', 'Thái độ, tay nghề'),
    ('van_de_dau_vao', 'Kỹ năng', 'Thái độ, tay nghề'),
    ('van_de_dau_vao', 'Nghiệp vụ', 'Thái độ, tay nghề'),
    ('van_de_dau_vao', 'Tay nghề', 'Thái độ, tay nghề'),

    ('van_de_dau_vao', 'Lõi thô', 'Thay lõi'),
    ('van_de_dau_vao', 'Lõi phụ trợ', 'Thay lõi'),
    ('van_de_dau_vao', 'Màng RO', 'Thay lõi'),
    ('van_de_dau_vao', 'Khác', 'Thay lõi'),
    ('van_de_dau_vao', 'Lõi dơ', 'Thay lõi'),

    ('van_de_dau_vao', 'Chất lượng sản phẩm', 'Tư vấn'),
    ('van_de_dau_vao', 'Cách sử dụng', 'Tư vấn'),
    ('van_de_dau_vao', 'Khác', 'Tư vấn'),
    ('van_de_dau_vao', 'Tư vấn thay lõi', 'Tư vấn'),
    ('van_de_dau_vao', 'Xuất hóa đơn', 'Tư vấn');

-- kenh_tiep_nhan
INSERT INTO settings_option (nhom, gia_tri, parent) VALUES
    ('kenh_tiep_nhan', 'Tổng đài', NULL),
    ('kenh_tiep_nhan', 'Zalo OA', NULL),
    ('kenh_tiep_nhan', 'Zalo', NULL),
    ('kenh_tiep_nhan', 'Mail', NULL),
    ('kenh_tiep_nhan', 'Sale tiếp nhận', NULL),
    ('kenh_tiep_nhan', 'Khảo sát', NULL),
    ('kenh_tiep_nhan', 'KTV', NULL),
    ('kenh_tiep_nhan', 'CSKH', NULL),
    ('kenh_tiep_nhan', 'Trưởng bộ phận', NULL),
    ('kenh_tiep_nhan', 'Tư vấn tổng đài', NULL),
    ('kenh_tiep_nhan', 'Chuyển các bộ phận', NULL);

-- danh_gia_cskh
INSERT INTO settings_option (nhom, gia_tri, parent) VALUES
    ('danh_gia_cskh', 'Đã hoàn thành', NULL),
    ('danh_gia_cskh', 'Ca thất bại', NULL),
    ('danh_gia_cskh', 'Chưa hoàn thành', NULL),
    ('danh_gia_cskh', 'Có hẹn xử lý', NULL);

-- phan_loai_kh
INSERT INTO settings_option (nhom, gia_tri, parent) VALUES
    ('phan_loai_kh', 'Thường', NULL),
    ('phan_loai_kh', 'S.VIP', NULL);

-- muc_do
INSERT INTO settings_option (nhom, gia_tri, parent) VALUES
    ('muc_do', 'Nghiêm trọng', NULL),
    ('muc_do', 'Trung bình', NULL),
    ('muc_do', 'Gấp', NULL),
    ('muc_do', 'Cần quà tặng xoa dịu', NULL);

-- nhom_yeu_cau
INSERT INTO settings_option (nhom, gia_tri, parent) VALUES
    ('nhom_yeu_cau', 'XLSC B2B', NULL),
    ('nhom_yeu_cau', 'XLSC PTDV', NULL),
    ('nhom_yeu_cau', 'XLSC DVBH', NULL),
    ('nhom_yeu_cau', 'Khác', NULL),
    ('nhom_yeu_cau', 'Direct sale', NULL),
    ('nhom_yeu_cau', 'Digital', NULL);
