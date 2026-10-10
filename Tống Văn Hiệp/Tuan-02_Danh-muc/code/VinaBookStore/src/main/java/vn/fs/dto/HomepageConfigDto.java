package vn.fs.dto;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import javax.validation.Valid;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Positive;
import javax.validation.constraints.Size;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class HomepageConfigDto {

	@Valid
	@NotNull
	private HeroSection hero;

	@Valid
	@NotNull
	private BenefitsSection benefits;

	@Valid
	@NotNull
	private ProductSection latest;

	@Valid
	@NotNull
	private StatsSection stats;

	@Valid
	@NotNull
	private ProductSection bestseller;

	@Valid
	@NotNull
	private CategoriesSection categories;

	@Valid
	@NotNull
	private CtaSection cta;

	public static HomepageConfigDto defaults() {
		HeroSection hero = new HeroSection(true, "Nhà sách trực tuyến", "Khám phá thế giới tri thức",
				"Sách chọn lọc, giao nhanh toàn quốc và nhiều ưu đãi để bạn tìm thấy cuốn sách đáng đọc tiếp theo.",
				"Khám phá sách", "/books", "Sách mới nhất", "/books/new", true, Collections.emptyList());

		BenefitsSection benefits = new BenefitsSection(true, "An tâm khi mua sách tại VinaBook", Arrays.asList(
				new BenefitItem("truck", "Giao hàng nhanh",
						"Vận chuyển toàn quốc, đóng gói cẩn thận, theo dõi đơn 24/7."),
				new BenefitItem("shield-check", "Thanh toán thuận tiện",
						"Thanh toán khi nhận hàng, rõ ràng và dễ kiểm tra kiện sách."),
				new BenefitItem("refresh-ccw", "Ưu đãi mỗi ngày",
						"Hàng trăm tựa sách giảm giá, cập nhật khuyến mãi liên tục."),
				new BenefitItem("headphones", "Hỗ trợ tận tâm",
						"Đội ngũ tư vấn nhiệt tình, đồng hành cùng bạn mọi lúc.")));

		ProductSection latest = new ProductSection(true, "Vừa cập nhật", "Sách mới nhất", "Xem tất cả",
				"/books/new");
		StatsSection stats = new StatsSection(true, "Đầu sách", "Thể loại", "2-4", "Ngày giao hàng dự kiến",
				"300K", "Miễn phí vận chuyển từ");
		ProductSection bestseller = new ProductSection(true, "", "Sách bán chạy nhất", "Xem tất cả",
				"/books/bestseller");
		CategoriesSection categories = new CategoriesSection(true, "Danh mục nổi bật", Collections.emptyList());
		CtaSection cta = new CtaSection(true, "Tìm cuốn sách tiếp theo của bạn",
				"Khám phá danh mục mới, sách bán chạy và những tựa sách đang được giảm giá.", "Xem tất cả sách",
				"/books");

		return new HomepageConfigDto(hero, benefits, latest, stats, bestseller, categories, cta);
	}

	@Data
	@AllArgsConstructor
	@NoArgsConstructor
	public static class HeroSection {
		private boolean visible;
		@Size(max = 80)
		private String eyebrow;
		@NotBlank
		@Size(max = 120)
		private String title;
		@NotBlank
		@Size(max = 320)
		private String description;
		@NotBlank
		@Size(max = 40)
		private String primaryLabel;
		@NotBlank
		@Size(max = 160)
		private String primaryRoute;
		@NotBlank
		@Size(max = 40)
		private String secondaryLabel;
		@NotBlank
		@Size(max = 160)
		private String secondaryRoute;
		private boolean showScrollCue;
		@Size(max = 5)
		private List<@Positive Long> productIds;
	}

	@Data
	@AllArgsConstructor
	@NoArgsConstructor
	public static class BenefitsSection {
		private boolean visible;
		@NotBlank
		@Size(max = 100)
		private String title;
		@Valid
		@NotNull
		@Size(min = 4, max = 4)
		private List<BenefitItem> items;
	}

	@Data
	@AllArgsConstructor
	@NoArgsConstructor
	public static class BenefitItem {
		@NotBlank
		@Size(max = 40)
		private String icon;
		@NotBlank
		@Size(max = 80)
		private String title;
		@NotBlank
		@Size(max = 220)
		private String description;
	}

	@Data
	@AllArgsConstructor
	@NoArgsConstructor
	public static class ProductSection {
		private boolean visible;
		@Size(max = 80)
		private String overline;
		@NotBlank
		@Size(max = 100)
		private String title;
		@NotBlank
		@Size(max = 40)
		private String linkLabel;
		@NotBlank
		@Size(max = 160)
		private String route;
	}

	@Data
	@AllArgsConstructor
	@NoArgsConstructor
	public static class StatsSection {
		private boolean visible;
		@NotBlank
		@Size(max = 60)
		private String booksLabel;
		@NotBlank
		@Size(max = 60)
		private String categoriesLabel;
		@NotBlank
		@Size(max = 20)
		private String shippingValue;
		@NotBlank
		@Size(max = 80)
		private String shippingLabel;
		@NotBlank
		@Size(max = 20)
		private String freeShippingValue;
		@NotBlank
		@Size(max = 80)
		private String freeShippingLabel;
	}

	@Data
	@AllArgsConstructor
	@NoArgsConstructor
	public static class CategoriesSection {
		private boolean visible;
		@NotBlank
		@Size(max = 100)
		private String title;
		@Size(max = 8)
		private List<@Positive Long> categoryIds;
	}

	@Data
	@AllArgsConstructor
	@NoArgsConstructor
	public static class CtaSection {
		private boolean visible;
		@NotBlank
		@Size(max = 120)
		private String title;
		@NotBlank
		@Size(max = 300)
		private String description;
		@NotBlank
		@Size(max = 40)
		private String buttonLabel;
		@NotBlank
		@Size(max = 160)
		private String buttonRoute;
	}
}
