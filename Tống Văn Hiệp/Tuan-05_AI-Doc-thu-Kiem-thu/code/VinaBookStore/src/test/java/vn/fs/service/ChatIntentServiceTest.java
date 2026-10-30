package vn.fs.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Collections;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import vn.fs.dto.chat.ChatIntent;
import vn.fs.dto.chat.ChatSearchCriteriaDto;

class ChatIntentServiceTest {
	private final ChatIntentService service = new ChatIntentService();

	@ParameterizedTest(name = "{0} -> {1}")
	@MethodSource("intentCases")
	void classifiesVietnameseShoppingQuestions(String question, ChatIntent expected) {
		assertThat(service.classify(question)).isEqualTo(expected);
	}

	@Test
	void normalizesVietnameseDiacritics() {
		assertThat(service.normalize("ĐẮC Nhân Tâm")).isEqualTo("dac nhan tam");
	}

	@Test
	void doesNotTreatRequestedBookCountAsAThreeThousandDongBudget() {
		ChatSearchCriteriaDto criteria = service.criteria("Tìm 3 sách pháp luật dưới 100k",
				Collections.emptyList());

		assertThat(criteria.getMaxPrice()).isEqualTo(100_000L);
	}

	private static Stream<Arguments> intentCases() {
		return Stream.of(
			Arguments.of("Gợi ý sách hay", ChatIntent.DISCOVER_BOOKS),
			Arguments.of("goi y sach hay", ChatIntent.DISCOVER_BOOKS),
			Arguments.of("Tìm sách tâm lý dưới 150k", ChatIntent.DISCOVER_BOOKS),
			Arguments.of("Tìm sách thiếu nhi", ChatIntent.DISCOVER_BOOKS),
			Arguments.of("Có cuốn nào làm quà không?", ChatIntent.DISCOVER_BOOKS),
			Arguments.of("Tôi nên đọc gì?", ChatIntent.DISCOVER_BOOKS),
			Arguments.of("Sách mới nhất", ChatIntent.DISCOVER_BOOKS),
			Arguments.of("Sách bán chạy", ChatIntent.DISCOVER_BOOKS),
			Arguments.of("Sách đang khuyến mãi", ChatIntent.DISCOVER_BOOKS),
			Arguments.of("Tư vấn sách kinh doanh", ChatIntent.DISCOVER_BOOKS),
			Arguments.of("Sách phù hợp cho người mới đi làm", ChatIntent.DISCOVER_BOOKS),
			Arguments.of("Tìm cuốn dưới 100 nghìn", ChatIntent.DISCOVER_BOOKS),
			Arguments.of("Sách giá trên 200k", ChatIntent.DISCOVER_BOOKS),
			Arguments.of("Tìm sách về giao tiếp", ChatIntent.DISCOVER_BOOKS),
			Arguments.of("Có sách nào về pháp luật không?", ChatIntent.DISCOVER_BOOKS),
			Arguments.of("Sách luật cho người không học luật", ChatIntent.DISCOVER_BOOKS),
			Arguments.of("Tìm hiểu pháp lý doanh nghiệp", ChatIntent.DISCOVER_BOOKS),
			Arguments.of("Sách thể loại trinh thám", ChatIntent.DISCOVER_BOOKS),
			Arguments.of("Còn cuốn khác không?", ChatIntent.DISCOVER_BOOKS),
			Arguments.of("Sách rẻ hơn", ChatIntent.DISCOVER_BOOKS),
			Arguments.of("So sánh Nhà Giả Kim và Đắc Nhân Tâm", ChatIntent.COMPARE_BOOKS),
			Arguments.of("Hai cuốn này khác nhau thế nào?", ChatIntent.COMPARE_BOOKS),
			Arguments.of("Nên chọn cuốn nào?", ChatIntent.COMPARE_BOOKS),
			Arguments.of("Cuốn nào tốt hơn?", ChatIntent.COMPARE_BOOKS),
			Arguments.of("so sanh sapiens voi tu duy nhanh va cham", ChatIntent.COMPARE_BOOKS),
			Arguments.of("Nhà Giả Kim giá bao nhiêu?", ChatIntent.PRODUCT_INFO),
			Arguments.of("Giá Đắc Nhân Tâm bao nhiêu?", ChatIntent.PRODUCT_INFO),
			Arguments.of("Cuốn này còn hàng không?", ChatIntent.PRODUCT_INFO),
			Arguments.of("Tồn kho Đắc Nhân Tâm", ChatIntent.PRODUCT_INFO),
			Arguments.of("Nội dung Sapiens là gì?", ChatIntent.PRODUCT_INFO),
			Arguments.of("Tác giả cuốn này là ai?", ChatIntent.PRODUCT_INFO),
			Arguments.of("Sách này giảm bao nhiêu?", ChatIntent.PRODUCT_INFO),
			Arguments.of("Đánh giá cuốn Nhà Giả Kim", ChatIntent.PRODUCT_INFO),
			Arguments.of("Phí giao hàng bao nhiêu?", ChatIntent.POLICY),
			Arguments.of("phi ship the nao", ChatIntent.POLICY),
			Arguments.of("Có được đổi trả không?", ChatIntent.POLICY),
			Arguments.of("Sách rách thì hoàn tiền thế nào?", ChatIntent.POLICY),
			Arguments.of("Có thanh toán COD không?", ChatIntent.POLICY),
			Arguments.of("VinaBook hỗ trợ VNPay chứ?", ChatIntent.POLICY),
			Arguments.of("Thanh toán MoMo", ChatIntent.POLICY),
			Arguments.of("Liên hệ cửa hàng", ChatIntent.POLICY),
			Arguments.of("Chính sách vận chuyển", ChatIntent.POLICY),
			Arguments.of("Đơn hàng của tôi", ChatIntent.ORDER_SUPPORT),
			Arguments.of("Theo dõi đơn hàng", ChatIntent.ORDER_SUPPORT),
			Arguments.of("Đơn đang giao tới đâu?", ChatIntent.ORDER_SUPPORT),
			Arguments.of("Tra mã đơn", ChatIntent.ORDER_SUPPORT),
			Arguments.of("don cua toi dang o dau", ChatIntent.ORDER_SUPPORT),
			Arguments.of("Xin chào", ChatIntent.SMALL_TALK),
			Arguments.of("hello", ChatIntent.SMALL_TALK),
			Arguments.of("hi", ChatIntent.SMALL_TALK),
			Arguments.of("Cảm ơn bạn", ChatIntent.SMALL_TALK),
			Arguments.of("Tạm biệt", ChatIntent.SMALL_TALK),
			Arguments.of("Bạn là ai?", ChatIntent.SMALL_TALK),
			Arguments.of("Bạn làm được gì?", ChatIntent.SMALL_TALK),
			Arguments.of("Thời tiết hôm nay", ChatIntent.UNKNOWN),
			Arguments.of("Kể chuyện cười", ChatIntent.UNKNOWN)
		);
	}
}
