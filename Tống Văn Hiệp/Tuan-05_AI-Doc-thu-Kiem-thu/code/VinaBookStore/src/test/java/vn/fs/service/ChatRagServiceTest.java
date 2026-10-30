package vn.fs.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;

import vn.fs.dto.chat.ChatIntent;
import vn.fs.dto.chat.ChatSearchCriteriaDto;
import vn.fs.entity.Category;
import vn.fs.entity.Product;

class ChatRagServiceTest {
	private ChatRetrievalService retrieval;
	private ChatGroundingService grounding;
	private List<Product> catalog;

	@BeforeEach
	void setUp() {
		retrieval = new ChatRetrievalService(new ChatIntentService());
		grounding = new ChatGroundingService(new ObjectMapper(), retrieval);
		Category law = new Category(1L, "Sách Chính trị – pháp luật");
		Category psychology = new Category(7L, "Sách Tâm lý");
		Category technology = new Category(2L, "Sách Khoa học công nghệ – Kinh tế");
		catalog = List.of(
				product(3L, "Hiến Pháp Nước Cộng Hòa Xã Hội Chủ Nghĩa Việt Nam", "Quốc Hội Việt Nam",
						45000D, "Văn bản pháp lý cao nhất, nền tảng hệ thống pháp luật.", law),
				product(5L, "Luật Lao Động Thực Hành", "Nguyễn Văn Phần",
						92000D, "Hướng dẫn hợp đồng, tiền lương và tranh chấp lao động.", law),
				product(6L, "Cẩm Nang Pháp Lý Cho Doanh Nghiệp", "Trương Thanh Đức",
						135000D, "Phòng ngừa rủi ro hợp đồng, thuế và sở hữu trí tuệ.", law),
				product(57L, "Đắc Nhân Tâm", "Dale Carnegie",
						86000D, "Nghệ thuật giao tiếp và ứng xử.", psychology),
				product(9L, "Clean Code - Mã Sạch Và Cách Viết", "Robert C. Martin",
						168000D, "Cẩm nang viết mã nguồn sạch cho lập trình viên.", technology));
	}

	@Test
	void retrievesRealLegalBooksInsteadOfGenericBestsellers() {
		ChatSearchCriteriaDto criteria = new ChatSearchCriteriaDto(null, null, "", "", "",
				List.of("pháp luật"));
		ChatQueryPlan plan = new ChatQueryPlan(ChatIntent.DISCOVER_BOOKS, criteria,
				List.of("pháp luật"), 5, false);

		List<Product> result = retrieval.retrieve("Có sách nào về pháp luật không?", plan, catalog,
				Collections.emptyList(), false);

		assertThat(result).extracting(Product::getName)
				.contains("Hiến Pháp Nước Cộng Hòa Xã Hội Chủ Nghĩa Việt Nam",
						"Luật Lao Động Thực Hành", "Cẩm Nang Pháp Lý Cho Doanh Nghiệp")
				.doesNotContain("Đắc Nhân Tâm");
	}

	@Test void ranksOnlyProductsWithRealRatings() {
		vn.fs.repository.RateRepository rates = org.mockito.Mockito.mock(vn.fs.repository.RateRepository.class);
		org.mockito.Mockito.when(rates.averageRatings()).thenReturn(List.of(new Object[]{3L, 3.5D}, new Object[]{5L, 4.8D}, new Object[]{6L, 4.2D}));
		retrieval.setRates(rates);
		ChatSearchCriteriaDto criteria = new ChatSearchCriteriaDto(null, null, "", "", "rating", List.of());
		criteria.setMinRating(4D);
		assertThat(retrieval.retrieve("Tìm sách đánh giá cao", new ChatQueryPlan(ChatIntent.DISCOVER_BOOKS, criteria, List.of(), 3, false), catalog, List.of(), false))
				.extracting(Product::getProductId).containsExactly(5L, 6L);
	}

	@Test
	void rejectsBroadScienceMatchesWhenCatalogHasNoQuantumBook() {
		ChatQueryPlan plan = new ChatQueryPlan(ChatIntent.DISCOVER_BOOKS,
				ChatSearchCriteriaDto.empty(), List.of("lượng tử", "vật lý", "khoa học"), 5, true);

		List<Product> result = retrieval.retrieve("Sách lượng tử cho người mới bắt đầu", plan, catalog,
				Collections.emptyList(), false);

		assertThat(result).isEmpty();
	}

	@Test
	void prioritizesCommunicationBookWithoutTrustingAnInferredCategoryFilter() {
		ChatQueryPlan plan = new ChatQueryPlan(ChatIntent.DISCOVER_BOOKS,
				ChatSearchCriteriaDto.empty(), List.of("giao tiếp", "tự tin", "người mới đi làm"), 3, true);

		List<Product> result = retrieval.retrieve("Tôi ngại giao tiếp và muốn tự tin hơn", plan, catalog,
				Collections.emptyList(), false);

		assertThat(result).extracting(Product::getName).first().isEqualTo("Đắc Nhân Tâm");
	}

	@Test
	void conservativeFallbackDoesNotTurnQuantumIntoUnrelatedTechnologyBooks() {
		List<Product> result = retrieval.directMatches("Sách lượng tử cho người mới bắt đầu",
				ChatSearchCriteriaDto.empty(), catalog);

		assertThat(result).isEmpty();
	}

	@Test
	void rendersOnlyVerifiedDatabaseProductsAndFacts() {
		String raw = "{\"intro\":\"Mình đã đối chiếu kho.\",\"recommendations\":["
				+ "{\"productId\":5,\"reason\":\"Phù hợp để hiểu quyền lợi khi đi làm.\"},"
				+ "{\"productId\":999,\"reason\":\"ID bịa.\"}],\"closing\":\"Bạn muốn đọc theo tình huống nào?\"}";

		ChatGroundingService.GroundedResult result = grounding.parse(raw, catalog, ChatIntent.DISCOVER_BOOKS);

		assertThat(result.isValid()).isTrue();
		assertThat(result.getProducts()).extracting(Product::getProductId).containsExactly(5L);
		assertThat(result.getAnswer()).contains("Luật Lao Động Thực Hành").contains("92.000đ")
				.doesNotContain("999").doesNotContain("ID bịa");
	}

	@Test
	void rejectsAiAnswerWithoutAnyVerifiedProductId() {
		String raw = "{\"intro\":\"Có sách phù hợp.\",\"recommendations\":["
				+ "{\"productId\":999,\"reason\":\"Không tồn tại.\"}],\"closing\":\"\"}";

		ChatGroundingService.GroundedResult result = grounding.parse(raw, catalog, ChatIntent.DISCOVER_BOOKS);

		assertThat(result.isValid()).isFalse();
		assertThat(result.getProducts()).isEmpty();
	}

	@Test
	void acceptsAnEmptyGroundedRecommendationWhenCandidatesAreOnlyNearMatches() {
		String raw = "{\"intro\":\"Mình chưa tìm thấy sách khớp trực tiếp trong lần tra cứu này.\","
				+ "\"recommendations\":[],\"closing\":\"Bạn có muốn đổi chủ đề không?\"}";

		ChatGroundingService.GroundedResult result = grounding.parse(raw, catalog, ChatIntent.DISCOVER_BOOKS);

		assertThat(result.isValid()).isTrue();
		assertThat(result.getProducts()).isEmpty();
		assertThat(result.getAnswer()).contains("chưa tìm thấy");
	}

	@Test
	void suppressesAlternativesWhenModelAdmitsThereIsNoDirectMatch() {
		String raw = "{\"intro\":\"Chưa tìm thấy sách lượng tử, tuy nhiên có sách gần chủ đề.\","
				+ "\"recommendations\":[{\"productId\":9,\"reason\":\"Sách công nghệ.\"}],"
				+ "\"closing\":\"Bạn có muốn đổi chủ đề không?\"}";

		ChatGroundingService.GroundedResult result = grounding.parse(raw, catalog, ChatIntent.DISCOVER_BOOKS);

		assertThat(result.isValid()).isTrue();
		assertThat(result.getProducts()).isEmpty();
		assertThat(result.getAnswer()).doesNotContain("Clean Code").contains("chưa tìm thấy");
	}

	private Product product(Long id, String name, String author, Double price, String description,
			Category category) {
		return new Product(id, name, author, 100, price, 0, "cover.jpg", description,
				LocalDate.now(), true, 20, category);
	}
}
