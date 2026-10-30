package vn.fs.service;

import org.springframework.stereotype.Service;

@Service
public class ChatPolicyService {
	private final ChatIntentService intents;

	public ChatPolicyService(ChatIntentService intents) {
		this.intents = intents;
	}

	public String answer(String question) {
		String q = intents.normalize(question);
		if (contains(q, "huy don", "huy dat hang")) {
			return "Bạn có thể nhắn “hủy đơn gần nhất” hoặc “hủy đơn #mã đơn”. Mình sẽ kiểm tra tài khoản và trạng thái rồi yêu cầu xác nhận. Đơn COD chưa thanh toán, đang chờ xử lý có thể hủy; đơn đang giao, đã hoàn thành hoặc thanh toán trực tuyến cần liên hệ cửa hàng. Chưa có đơn nào bị hủy chỉ vì bạn hỏi chính sách.";
		}
		if (contains(q, "doi sach", "doi tra", "tra hang", "hoan tien", "sach loi", "sach rach", "giao sai")) {
			return "VinaBook hỗ trợ đổi trả trong 7 ngày nếu sách lỗi in, rách hoặc giao sai. Bạn giữ hóa đơn và liên hệ trang Hỗ trợ để được xử lý.";
		}
		if (contains(q, "phi ship", "phi giao", "van chuyen", "giao hang", "freeship", "bao lau")) {
			return "Phí giao hàng là 20.000đ và được miễn phí cho đơn từ 300.000đ. Thời gian giao dự kiến 2 đến 4 ngày làm việc.";
		}
		if (contains(q, "thanh toan", "cod", "vietqr", "vnpay", "momo", "chuyen khoan")) {
			return "Bạn luôn có thể thanh toán COD. VietQR, VNPay Sandbox và MoMo Test sẽ xuất hiện ở bước thanh toán khi cửa hàng đã cấu hình cổng tương ứng.";
		}
		if (contains(q, "lien he", "hotline", "email", "cua hang")) {
			return "Bạn có thể gửi yêu cầu tại trang Liên hệ hoặc email hotro@vinabook.vn. Không gửi mật khẩu, OTP hay thông tin thẻ qua nội dung hỗ trợ.";
		}
		return "Mình có thể giải đáp về giao hàng, thanh toán, đổi trả và cách đặt hàng. Bạn muốn hỏi chính sách nào?";
	}

	private boolean contains(String q, String... values) {
		for (String value : values) if (q.contains(value)) return true;
		return false;
	}
}
