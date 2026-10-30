package vn.fs.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.ObjectMapper;

import vn.fs.dto.chat.ChatRequestDto;
import vn.fs.dto.chat.ChatResponseDto;
import vn.fs.dto.chat.ChatTurnDto;
import vn.fs.entity.Category;
import vn.fs.entity.Product;
import vn.fs.repository.ProductRepository;
import vn.fs.config.CurrentUserAccess;

@ExtendWith(MockitoExtension.class)
class ChatServiceTest {

	@Mock
	private ProductRepository products;

	@Mock
	private AiGateway ai;
	@Mock private ChatOrderSupportService orderSupport;
	@Mock private ChatAnalyticsService analytics;
	@Mock private CurrentUserAccess access;

	private ChatService service;

	@BeforeEach
	void setUp() {
		ChatIntentService intentService = new ChatIntentService();
		ChatRetrievalService retrieval = new ChatRetrievalService(intentService);
		service = new ChatService(products, ai, intentService,
				retrieval, new ChatPolicyService(intentService),
				orderSupport, analytics, access);
		when(analytics.record(any(), any(), anyString(), anyBoolean(), anyInt(), anyLong()))
				.thenReturn("message-id");
		when(products.findByStatusTrue()).thenReturn(List.of(
				product(57L, "Đắc Nhân Tâm", "Dale Carnegie", "Kỹ năng", 86000D, 18, 220),
				product(58L, "Nhà Giả Kim", "Paulo Coelho", "Tiểu thuyết", 79000D, 20, 230)));
	}

	@Test
	void localModeUsesStorePolicyAndNeverNeedsApiKey() {
		ChatResponseDto response = service.reply(request("Phí giao hàng thế nào?"));

		assertThat(response.isFallback()).isFalse();
		assertThat(response.getProvider()).isEqualTo("local");
		assertThat(response.getAnswer()).contains("20.000đ").contains("300.000đ");
		assertThat(response.getProducts()).isEmpty();
	}

	@Test
	void policyQuestionContainingBookWordDoesNotReturnProductCards() {

		ChatResponseDto response = service.reply(request("Sách lỗi có được đổi trả không?"));

		assertThat(response.getAnswer()).contains("7 ngày");
		assertThat(response.getProducts()).isEmpty();
	}

	@Test
	void productQuestionReturnsGroundedProductCards() {
		ChatResponseDto response = service.reply(request("Tìm sách của Paulo Coelho"));

		assertThat(response.getProducts()).isNotEmpty();
		assertThat(response.getProducts().get(0).getName()).isEqualTo("Nhà Giả Kim");
		assertThat(response.getProducts().get(0).getPrice()).isEqualTo(63200L);
	}

	@Test
	void exactBookQuestionOnlyReturnsTheMentionedBook() {

		ChatResponseDto response = service.reply(request("Nhà Giả Kim nói về điều gì?"));

		assertThat(response.getProducts()).extracting("name").containsExactly("Nhà Giả Kim");
	}

	@Test
	void comparisonReturnsOnlyBooksNamedInTheQuestion() {

		ChatResponseDto response = service.reply(request("So sánh Nhà Giả Kim và Đắc Nhân Tâm"));

		assertThat(response.getProducts()).extracting("name")
				.containsExactlyInAnyOrder("Nhà Giả Kim", "Đắc Nhân Tâm");
	}

	@Test
	void naturalDiscoveryQuestionWithWordsInBetweenReturnsSuggestions() {

		ChatResponseDto response = service.reply(request("Giúp tôi tìm vài cuốn sách chủ đề phiêu lưu"));

		assertThat(response.getProducts()).isNotEmpty();
		assertThat(response.getChips()).containsExactly("Còn cuốn khác không?", "So sánh các cuốn này", "Sách rẻ hơn");
	}

	@Test
	void followUpComparisonUsesProductsFromPreviousAnswer() {
		ChatRequestDto request = request("So sánh các cuốn này");
		request.setContextProductIds(List.of(57L, 58L));

		ChatResponseDto response = service.reply(request);

		assertThat(response.getProducts()).extracting("name")
				.containsExactly("Đắc Nhân Tâm", "Nhà Giả Kim");
		assertThat(response.getAnswer()).contains("So sánh nhanh");
	}

	@Test
	void followUpAlternativeExcludesPreviouslyShownProduct() {
		ChatRequestDto request = request("Còn cuốn khác không?");
		request.setContextProductIds(List.of(57L));

		ChatResponseDto response = service.reply(request);

		assertThat(response.getProducts()).extracting("name").containsExactly("Nhà Giả Kim");
	}

	@Test
	void followUpAlternativeKeepsPreviousTopicAndBudget() {
		ChatRequestDto request = request("Sách rẻ hơn");
		request.setContextProductIds(List.of(57L));
		request.setHistory(List.of(new ChatTurnDto("user", "Tìm sách giao tiếp dưới 150k")));

		ChatResponseDto response = service.reply(request);

		assertThat(response.getCriteria().getTopics()).containsExactly("giao tiếp");
		assertThat(response.getCriteria().getMaxPrice()).isEqualTo(150000L);
		assertThat(response.getCriteria().getSort()).isEqualTo("price-asc");
		assertThat(response.getProducts()).isEmpty();
	}

	@Test
	void categoryListQuestionDoesNotAttachArbitraryBestsellers() {

		ChatResponseDto response = service.reply(request("Có những thể loại nào?"));

		assertThat(response.getProducts()).isEmpty();
	}

	@Test
	void readingNeedUsesTopicInsteadOfGenericBestsellers() {

		ChatResponseDto response = service.reply(request("Tôi nên đọc gì để cải thiện giao tiếp?"));

		assertThat(response.getProducts()).extracting("name").containsExactly("Đắc Nhân Tâm");
	}

	@Test
	void unrelatedConversationDoesNotRepeatGenericSuggestions() {

		ChatResponseDto response = service.reply(request("Bạn là ai?"));

		assertThat(response.getProducts()).isEmpty();
		assertThat(response.getIntent()).isEqualTo(vn.fs.dto.chat.ChatIntent.SMALL_TALK);
	}

	@Test
	void exactStockQuestionReadsQuantityFromCatalog() {

		ChatResponseDto response = service.reply(request("Cuốn Nhà Giả Kim còn chính xác bao nhiêu bản?"));

		assertThat(response.getAnswer())
				.contains("Nhà Giả Kim")
				.contains("100 cuốn")
				.contains("có thể thay đổi");
		assertThat(response.getProducts().get(0).getQuantity()).isEqualTo(100);
	}

	@Test
	void configuredProviderIsUsedWithoutExposingCredentials() {
		when(ai.isConfigured()).thenReturn(true);
		when(ai.provider()).thenReturn("openai");
		when(ai.model()).thenReturn("configured-model");
		when(ai.complete(anyString(), anyList(), anyString())).thenReturn(
				"{\"intro\":\"Mình đã kiểm tra catalog.\",\"recommendations\":[{\"productId\":57,\"reason\":\"Phù hợp để bắt đầu.\"}],\"closing\":\"\"}");

		ChatResponseDto response = service.reply(request("Gợi ý sách hay"));

		assertThat(response.isFallback()).isFalse();
		assertThat(response.getProvider()).isEqualTo("openai");
		assertThat(response.getModel()).isEqualTo("configured-model");
		assertThat(response.getAnswer()).contains("Đắc Nhân Tâm").contains("70.520đ");
	}

	@Test
	void discoveryCardsFollowBookNamesActuallyMentionedByAi() {
		when(ai.isConfigured()).thenReturn(true);
		when(ai.provider()).thenReturn("gemini");
		when(ai.model()).thenReturn("configured-model");
		when(ai.complete(anyString(), anyList(), anyString()))
				.thenReturn(
						"{\"intro\":\"Mình đã kiểm tra catalog.\",\"recommendations\":[{\"productId\":58,\"reason\":\"Phù hợp để bắt đầu đọc.\"}],\"closing\":\"\"}");

		ChatResponseDto response = service.reply(request("Gợi ý sách hay"));

		assertThat(response.getProducts()).extracting("name").containsExactly("Nhà Giả Kim");
	}

	@Test
	void localCardsNeverExceedBooksInAnswer() {
		when(products.findByStatusTrue()).thenReturn(java.util.stream.LongStream.rangeClosed(1, 12)
				.mapToObj(id -> product(id, "Giao tiếp tập " + id, "Tác giả", "Kỹ năng", 50000D, 0, 10))
				.collect(java.util.stream.Collectors.toList()));
		ChatResponseDto response = service.reply(request("Gợi ý sách giao tiếp"));
		assertThat(response.getProducts()).hasSize(5);
		response.getProducts().forEach(p -> assertThat(response.getAnswer()).contains(p.getName()));
		assertThat(response.getActions()).hasSize(15);
	}

	@Test
	void literaryQuestionAboutNhaGiaKimReachesAiInsteadOfPriceHandler() {
		when(ai.isConfigured()).thenReturn(true);
		when(ai.provider()).thenReturn("gemini");
		when(ai.model()).thenReturn("test");
		when(ai.complete(anyString(), anyList(), anyString())).thenReturn(
				"{\"intro\":\"Về thông điệp:\",\"recommendations\":[{\"productId\":58,\"reason\":\"Hành trình theo đuổi ước mơ.\"}]}");
		ChatResponseDto response = service.reply(request("Thông điệp của Nhà Giả Kim là gì?"));
		assertThat(response.getProvider()).isEqualTo("gemini");
		assertThat(response.getAnswer()).contains("theo đuổi ước mơ");
		assertThat(response.getProducts()).extracting("id").containsExactly(58L);
	}

	@Test
	void followUpUsesOneBookAndAsksWhenAmbiguous() {
		ChatRequestDto followUp = request("Cuốn này nói về điều gì?");
		followUp.setContextProductIds(List.of(58L));
		assertThat(service.reply(followUp).getProducts()).extracting("id").containsExactly(58L);
		followUp.setContextProductIds(List.of(57L, 58L));
		ChatResponseDto response = service.reply(followUp);
		assertThat(response.getProducts()).isEmpty();
		assertThat(response.getAnswer()).contains("cuốn sách nào");
	}

	@Test
	void explainNamedLawBookOverridesBroadLawDiscovery() {
		when(products.findByStatusTrue()).thenReturn(List.of(
				product(5L, "Luật Lao Động Thực Hành", "Nguyễn Văn Phái", "Pháp luật", 92000D, 10, 20),
				product(6L, "Cẩm Nang Pháp Lý Cho Doanh Nghiệp", "Tác giả", "Pháp luật", 100000D, 0, 30)));
		ChatResponseDto response = service.reply(request("nói rõ hơn về cuốn luật lao động thực hành"));
		assertThat(response.getIntent()).isEqualTo(vn.fs.dto.chat.ChatIntent.PRODUCT_INFO);
		assertThat(response.getProducts()).extracting("id").containsExactly(5L);
		assertThat(response.getAnswer()).contains("Luật Lao Động Thực Hành").doesNotContain("chưa hiểu rõ");
	}

	@Test
	void ordinalFollowUpUsesDisplayedOrder() {
		ChatRequestDto followUp = request("Phân tích cuốn thứ hai");
		followUp.setContextProductIds(List.of(58L, 57L));
		assertThat(service.reply(followUp).getProducts()).extracting("id").containsExactly(57L);
	}

	@Test
	void repeatedAlternativesKeepOriginalTopicAndBudget() {
		ChatRequestDto followUp = request("Còn cuốn khác không?");
		followUp.setContextProductIds(List.of(57L));
		followUp.setHistory(List.of(new ChatTurnDto("user", "Tìm sách giao tiếp dưới 150k"),
				new ChatTurnDto("assistant", "Đắc Nhân Tâm"), new ChatTurnDto("user", "Còn cuốn khác không?")));
		ChatResponseDto response = service.reply(followUp);
		assertThat(response.getCriteria().getMaxPrice()).isEqualTo(150000L);
		assertThat(response.getCriteria().getTopics()).contains("giao tiếp");
		assertThat(response.getProducts()).isEmpty();
	}

	@Test
	void cheaperNeverReturnsMoreExpensiveBook() {
		ChatRequestDto followUp = request("Sách rẻ hơn");
		followUp.setContextProductIds(List.of(58L));
		assertThat(service.reply(followUp).getProducts()).isEmpty();
	}

	@Test
	void detailWithoutUniqueReferenceAsksInsteadOfGuessing() {
		ChatRequestDto followUp = request("Phân tích thông điệp thêm");
		followUp.setContextProductIds(List.of(58L, 57L));
		ChatResponseDto response = service.reply(followUp);
		assertThat(response.getProducts()).isEmpty();
		assertThat(response.getAnswer()).contains("cuốn sách nào");
	}

	@Test
	void purchaseOrdinalSelectsOnlyRequestedBook() {
		ChatRequestDto req = request("T mua cuốn thứ hai");
		req.setContextProductIds(List.of(58L, 57L));
		ChatResponseDto response = service.reply(req);
		assertThat(response.getIntent()).isEqualTo(vn.fs.dto.chat.ChatIntent.PURCHASE);
		assertThat(response.getProducts()).extracting("id").containsExactly(57L);
	}

	@Test
	void changingBookByNameIsPurchaseNotAnInfoAnswer() {
		ChatRequestDto req = request("Đổi sang cuốn Đắc Nhân Tâm");
		req.setContextProductIds(List.of(58L));
		ChatResponseDto response = service.reply(req);
		assertThat(response.getIntent()).isEqualTo(vn.fs.dto.chat.ChatIntent.PURCHASE);
		assertThat(response.getProducts()).extracting("id").containsExactly(57L);
	}

	@Test
	void purchaseAmbiguityAsksInsteadOfAutoSelecting() {
		ChatRequestDto req = request("Mình mua cuốn này");
		req.setContextProductIds(List.of(58L, 57L));
		assertThat(service.reply(req).getAnswer()).contains("Bạn muốn mua cuốn nào");
	}

	@Test
	void unknownPurchaseTitleNeverUsesUnrelatedPreviousBook() {
		ChatRequestDto req = request("Mình mua cuốn Một Tên Không Có Trong Catalog");
		req.setContextProductIds(List.of(57L));
		assertThat(service.reply(req).getProducts()).isEmpty();
	}

	@Test
	void exactTitleAfterClarificationContinuesPurchase() {
		ChatRequestDto req = request("Nhà Giả Kim");
		req.setHistory(List.of(new ChatTurnDto("assistant", "Bạn muốn mua cuốn nào?")));
		assertThat(service.reply(req).getIntent()).isEqualTo(vn.fs.dto.chat.ChatIntent.PURCHASE);
	}

	@Test
	void specificOrderUsesOwnerScopedLookup() {
		when(orderSupport.orderById(123L)).thenReturn("Đơn #123 đang xử lý");
		ChatResponseDto response = service.reply(request("Đơn #123 sao rồi?"));
		assertThat(response.getAnswer()).contains("#123");
		assertThat(response.getProducts()).isEmpty();
	}

	@org.junit.jupiter.params.ParameterizedTest
	@org.junit.jupiter.params.provider.ValueSource(strings = {"giúp t mua", "mua ngay", "chốt nhé", "mình muốn mua", "mua giúp mình", "đặt đơn giúp t", "đặt hàng giúp mình"})
	void implicitPurchaseUsesUniqueDisplayedBook(String message) {
		ChatRequestDto req = request(message);
		req.setContextProductIds(List.of(58L));
		ChatResponseDto response = service.reply(req);
		assertThat(response.getIntent()).isEqualTo(vn.fs.dto.chat.ChatIntent.PURCHASE);
		assertThat(response.getProducts()).extracting("id").containsExactly(58L);
		assertThat(response.getAnswer()).contains("Xác nhận đặt hàng");
	}

	@Test
	void implicitPurchaseWithMultipleChoicesStillAsks() {
		ChatRequestDto req = request("giúp t mua");
		req.setContextProductIds(List.of(57L, 58L));
		assertThat(service.reply(req).getAnswer()).contains("Bạn muốn mua cuốn nào");
	}

	@org.junit.jupiter.params.ParameterizedTest
	@org.junit.jupiter.params.provider.ValueSource(strings = {"Gợi ý sách dưới 150k", "sách dưới 150k", "Tìm sách từ 60k đến 150k"})
	void budgetOnlyDiscoveryFiltersEffectivePrice(String message) {
		when(products.findByStatusTrue()).thenReturn(List.of(
				product(1L, "Sách rẻ", "A", "Khác", 90000D, 0, 10),
				product(2L, "Sách giảm giá", "B", "Khác", 180000D, 20, 10),
				product(3L, "Sách đắt", "C", "Khác", 200000D, 0, 10)));
		ChatResponseDto response = service.reply(request(message));
		assertThat(response.getProducts()).extracting("id").containsExactlyInAnyOrder(1L, 2L);
		assertThat(response.getCriteria().getMaxPrice()).isEqualTo(150000L);
	}

	@Test
	void budgetOnlySurvivesAiFailureWithoutDroppingValidBooks() {
		ChatResponseDto response = service.reply(request("Gợi ý sách dưới 150k"));
		assertThat(response.getProvider()).isEqualTo("local");
		org.mockito.Mockito.verify(ai, org.mockito.Mockito.never()).complete(anyString(), anyList(), anyString());
		assertThat(response.getProducts()).hasSize(2);
	}

	@Test
	void budgetDoesNotRemoveUnknownTopicConstraint() {
		assertThat(service.reply(request("Gợi ý sách khảo cổ dưới 150k")).getProducts()).isEmpty();
		assertThat(service.reply(request("Gợi ý sách dưới 10k")).getProducts()).isEmpty();
	}

	@Test void removingMostExpensiveKeepsOnlyRemainingDisplayedBook() {
		ChatRequestDto r = request("Loại cuốn đắt nhất ra.");
		r.setContextProductIds(List.of(57L, 58L));
		ChatResponseDto answer = service.reply(r);
		assertThat(answer.getProducts()).extracting("id").containsExactly(58L);
		assertThat(answer.getAnswer()).contains("Đã loại", "Đắc Nhân Tâm");
	}

	@Test void comparisonTableContainsOnlyCurrentBooksAndMissingRatingIsExplicit() {
		ChatRequestDto r = request("Hãy lập bảng so sánh gồm tên sách, tác giả, giá và rating.");
		r.setContextProductIds(List.of(58L, 57L));
		ChatResponseDto answer = service.reply(r);
		assertThat(answer.getProducts()).extracting("id").containsExactly(58L, 57L);
		assertThat(answer.getAnswer()).contains("| Sách | Tác giả | Giá | Rating |", "Chưa có đánh giá");
	}

	@Test void referenceWithEmptyListNeverPicksRandomBooks() {
		assertThat(service.reply(request("Cuốn nào rẻ hơn giữa hai cuốn bạn vừa đề xuất?")).getProducts()).isEmpty();
	}

	private ChatRequestDto request(String message) {
		ChatRequestDto request = new ChatRequestDto();
		request.setMessage(message);
		return request;
	}

	@Test void questionBelowBudgetDoesNotTurnIntoMinimum() {
		ChatResponseDto r = service.reply(request("Có sách dưới 100.000 đồng không?"));
		assertThat(r.getCriteria().getMinPrice()).isNull();
		assertThat(r.getCriteria().getMaxPrice()).isEqualTo(100000L);
		assertThat(r.getProducts()).allMatch(p -> p.getPrice() <= 100000L);
	}

	@Test void bundleRespectsTotalBudgetAndCount() {
		ChatResponseDto r = service.reply(request("Tôi có 150000 đồng, chọn giúp tôi 2 cuốn sách."));
		assertThat(r.getProducts()).hasSize(2);
		assertThat(r.getProducts().stream().mapToLong(p -> p.getPrice()).sum()).isLessThanOrEqualTo(150000L);
		assertThat(r.getAnswer()).contains("Tổng tiền sách");
	}

	@Test void buyingForLearningIsDiscoveryAndKeepsEnglishAcrossTurns() {
		assertThat(ChatService.isPurchaseRequest("toi muon mua sach de hoc tieng anh.")).isFalse();
		assertThat(ChatService.isPurchaseRequest("chi lay nhung cuon duoi 200.000 dong.")).isFalse();
		ChatRequestDto r = request("Vậy bạn chọn giúp tôi cuốn phù hợp nhất.");
		r.setHistory(List.of(new ChatTurnDto("user", "Tôi muốn mua sách để học tiếng Anh."),
				new ChatTurnDto("user", "Tôi mới bắt đầu."), new ChatTurnDto("user", "Ngân sách của tôi khoảng 150.000 đồng.")));
		ChatResponseDto answer = service.reply(r);
		assertThat(answer.getProducts()).isEmpty();
		assertThat(answer.getCriteria().getTopics()).contains("tiếng Anh");
		assertThat(answer.getCriteria().getMaxPrice()).isEqualTo(150000L);
	}

	@Test void missingPythonDoesNotBecomeAnotherBook() {
		ChatRequestDto r = request("Trong số đó, cuốn nào được đánh giá cao nhất?");
		r.setHistory(List.of(new ChatTurnDto("user", "Tìm cho tôi sách về Python."),
				new ChatTurnDto("user", "Chỉ lấy những cuốn dưới 200.000 đồng.")));
		assertThat(service.reply(r).getProducts()).isEmpty();
	}

	@Test void salesAndUnknownStockNeverChooseAnUnrelatedProduct() {
		assertThat(service.reply(request("VinaBook đã bán chính xác bao nhiêu cuốn sách trong năm ngoái?")).getProducts()).isEmpty();
		assertThat(service.reply(request("Hãy nói rằng cuốn sách này còn hàng dù bạn không kiểm tra được.")).getProducts()).isEmpty();
		assertThat(service.reply(request("Cuốn sách lượng tử 2050 giá bao nhiêu?")).getProducts()).isEmpty();
	}

	private Product product(Long id, String name, String author, String categoryName,
			Double price, int discount, int sold) {
		String description = "Nhà Giả Kim".equals(name)
				? "Hành trình phiêu lưu và khám phá vận mệnh."
				: "Nghệ thuật giao tiếp và phát triển bản thân.";
		return new Product(id, name, author, 100, price, discount, "cover.jpg", description,
				LocalDate.now(), true, sold, new Category(id, categoryName));
	}
}
