package vn.fs.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import java.util.*;
import java.time.LocalDate;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import vn.fs.dto.chat.*;
import vn.fs.entity.*;
import vn.fs.repository.*;
import vn.fs.config.CurrentUserAccess;

class ChatToolsTest {
    ObjectMapper mapper=new ObjectMapper();
    ProductRepository products=mock(ProductRepository.class);
    RateRepository rates=mock(RateRepository.class);
    AiGateway ai=mock(AiGateway.class);
    CurrentUserAccess access=mock(CurrentUserAccess.class);
    ChatAnalyticsService analytics=mock(ChatAnalyticsService.class);
    ChatOrderSupportService orders=mock(ChatOrderSupportService.class);
    ChatIntentService language=new ChatIntentService();
    ChatRetrievalService data=new ChatRetrievalService(language);
    ChatDialogueMemory.State state=new ChatDialogueMemory.State();
    ChatToolRegistry registry;
    ChatOrchestrator orchestrator;
    ChatBuiltinTools builtins;
    @BeforeEach void setup() {
        data.setRates(rates);
        when(products.findByStatusTrue()).thenReturn(List.of(book(1,190000),book(2,95000),book(3,90000)));
        when(rates.averageRatings()).thenReturn(List.of(new Object[]{1L,4.8},new Object[]{2L,4.5},new Object[]{3L,4.0}));
        builtins=new ChatBuiltinTools(products,data,language,orders,new ChatPolicyService(language));
        registry=new ChatToolRegistry(List.of(builtins.searchProducts(),builtins.recommendBooks(),builtins.getProducts(),builtins.updateSelection(),
            builtins.prepareCartChange(),builtins.prepareCheckout(),builtins.getCart(),builtins.getMyOrders(),builtins.getOrderDetail(),builtins.getPolicy(),builtins.respond()));
        when(ai.provider()).thenReturn("gemini");when(ai.model()).thenReturn("fixture");when(ai.isConfigured()).thenReturn(true);
        when(analytics.record(any(),any(),anyString(),anyBoolean(),anyInt(),anyLong())).thenReturn("event");
        orchestrator=new ChatOrchestrator(ai,mapper,registry,analytics);
    }
    ChatTool.Result run(String tool,String arguments) throws Exception {
        return registry.execute(tool,mapper.readTree(arguments),new ChatTool.Context(request("s","test"),state));
    }
    @Test void filtersRatingIndependentlyOfPriceAndSortsBeforeLimit() throws Exception {
        var r=run("searchProducts","{\"query\":\"Python\",\"maxPrice\":200000,\"minRating\":4.5,\"sort\":\"price-asc\",\"limit\":1}");
        assertThat(r.products()).extracting(ChatProductDto::getId).containsExactly(2L);
        assertThat(state.criteria.getMaxPrice()).isEqualTo(200000);
        assertThat(state.criteria.getMinRating()).isEqualTo(4.5);
    }
    @Test void continuationRetainsTopicAndExplicitNullClearsPrice() throws Exception {
        run("searchProducts","{\"query\":\"Python\",\"maxPrice\":100000}");
        run("searchProducts","{\"scope\":\"continue\",\"minRating\":4.5}");
        assertThat(state.displayed).containsExactly(2L);
        run("searchProducts","{\"scope\":\"continue\",\"maxPrice\":null}");
        assertThat(state.displayed).containsExactly(1L,2L);
        assertThat(state.criteria.getMaxPrice()).isNull();
    }
    @Test void unknownTopicDoesNotReturnAllBooks() throws Exception {
        assertThat(run("searchProducts","{\"query\":\"Advanced Mars 2099\"}").products()).isEmpty();
    }
    @Test void recommendationBudgetIsTotalAndRetainsReaderLevel() throws Exception {
        var r=run("recommendBooks","{\"query\":\"Python\",\"level\":\"beginner\",\"totalBudget\":200000,\"limit\":2}");
        assertThat(r.products()).extracting(ChatProductDto::getId).containsExactly(3L,2L);
        assertThat(r.answer()).contains("185.000đ","Chưa gồm phí giao hàng");
        assertThat(state.level).isEqualTo("beginner");
        assertThat(run("recommendBooks","{\"scope\":\"continue\",\"limit\":1}").products()).hasSize(1);
        assertThat(state.recommendationBudget).isEqualTo(200000L);
    }
    @Test void experiencedReaderDoesNotGetOnlyBeginnerBooks() throws Exception {
        assertThat(run("recommendBooks","{\"query\":\"Python\",\"level\":\"experienced\"}").products()).isEmpty();
    }
    @Test void factualPriceDoesNotInvokeNarrator() {
        ChatBookNarrator narrator=mock(ChatBookNarrator.class);orchestrator.setNarrator(narrator);
        plan("{\"tool\":\"getProducts\",\"arguments\":{\"title\":\"Python 1\",\"field\":\"price\"}}");
        var r=orchestrator.reply(request("s","Giá cuốn Python 1?"),state);
        assertThat(r.getAnswer()).contains("190.000đ").doesNotContain("Tồn kho");
        verifyNoInteractions(narrator);
    }
    @Test void comparisonTableUsesActualPricesAndRatings() throws Exception {
        run("searchProducts","{\"limit\":2}");
        var r=run("getProducts","{\"reference\":\"selection\",\"field\":\"table\"}");
        assertThat(r.answer()).contains("| Tên sách | Tác giả | Giá | Rating |","190.000đ","95.000đ","4.8/5","4.5/5");
    }
    @Test void orderFollowupRechecksOwnershipWithFocusedId() throws Exception {
        when(orders.latestOrderId()).thenReturn(7L);
        when(orders.orderById(7L)).thenReturn("Đơn #7: Đang xử lý");
        run("getMyOrders","{\"mode\":\"latest\"}");
        assertThat(state.focusedOrderId).isEqualTo(7L);
        when(orders.orderById(7L)).thenReturn("Mình không tìm thấy mã đơn này trong tài khoản của bạn.");
        assertThat(run("getOrderDetail","{}").answer()).contains("không tìm thấy");
        verify(orders,times(2)).orderById(7L);
    }
    @Test void conceptualCategoryUsesTopicWithoutKeepingImpossibleCategory() throws Exception {
        assertThat(run("searchProducts","{\"category\":\"Công nghệ thông tin\",\"sort\":\"price-asc\",\"limit\":1}").products())
            .extracting(ChatProductDto::getId).containsExactly(3L);
        assertThat(state.criteria.getCategory()).isEmpty();
    }
    @Test void continuationKeepsLimitAndClearsOldMissingTitle() throws Exception {
        state.missingTitle="Mars 2099";
        run("searchProducts","{\"query\":\"Python\",\"limit\":1}");
        assertThat(state.missingTitle).isEmpty();
        assertThat(run("searchProducts","{\"scope\":\"continue\",\"sort\":\"price-asc\"}").products())
            .extracting(ChatProductDto::getId).containsExactly(3L);
    }
    @Test void alternativeTopicsAreUnionNotIntersection() throws Exception {
        assertThat(run("searchProducts","{\"query\":\"Java hoặc Python\",\"maxPrice\":100000}").products())
            .extracting(ChatProductDto::getId).containsExactly(2L,3L);
    }
    @Test void vagueNeedAsksForPreferencesRatherThanAnUnseenBook() throws Exception {
        var result=run("respond","{\"kind\":\"clarify\"}");
        assertThat(result.answer()).contains("chủ đề").doesNotContain("số thứ tự","ngân sách");
    }
    @Test void detailPreservesSelectionThenRemoveHighestPrice() throws Exception {
        run("searchProducts","{\"sort\":\"price-asc\"}");
        run("getProducts","{\"reference\":\"second\"}");
        assertThat(state.focus).isEqualTo(2L);
        var r=run("updateSelection","{\"reference\":\"most_expensive\"}");
        assertThat(r.products()).extracting(ChatProductDto::getId).containsExactly(3L,2L);
        assertThat(r.answer()).contains("danh sách đang cân nhắc");
    }
    @Test void fabricatedProductIdCannotBeSelected() throws Exception {
        assertThat(run("prepareCheckout","{\"productId\":1}").status()).isEqualTo("NEEDS_INPUT");
    }
    @Test void checkoutProducesPendingProposalAndQuantityOnly() throws Exception {
        var r=run("prepareCheckout","{\"title\":\"Python 1\",\"quantity\":3}");
        assertThat(r.status()).isEqualTo("AWAITING_CONFIRMATION");
        assertThat(r.actions().get(0).getQuantity()).isEqualTo(3);
        assertThat(r.answer()).doesNotContain("đặt hàng thành công");
        verifyNoInteractions(orders);
    }
    @Test void cartMutationAlsoRequiresConfirmation() throws Exception {
        ChatRequestDto request=request("s","Sửa cuốn Python 2 thành 2 bản");
        ChatRequestDto.CartItem item=new ChatRequestDto.CartItem();item.setProductId(2L);item.setQuantity(1);request.setCartItems(List.of(item));
        var r=registry.execute("prepareCartChange",mapper.readTree("{\"title\":\"Python 2\",\"operation\":\"update\",\"quantity\":2}"),new ChatTool.Context(request,state));
        assertThat(r.status()).isEqualTo("AWAITING_CONFIRMATION");
        assertThat(r.actions().get(0).getType()).isEqualTo("UPDATE_CART_QUANTITY");
        assertThat(r.actions().get(0).isRequiresConfirmation()).isTrue();
    }
    @Test void rejectsUnknownToolsAndArgumentsBeforeExecution() {
        assertThatThrownBy(()->run("createOrder","{}")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->run("getMyOrders","{\"userId\":99}")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->run("searchProducts","{\"minRating\":6}")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->run("prepareCheckout","{\"quantity\":1.5}")).isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(orders);
    }
    @Test void multiStepSearchThenPrepareUsesResultReference() {
        plan("{\"calls\":[{\"tool\":\"searchProducts\",\"arguments\":{\"sort\":\"price-asc\",\"limit\":1}},{\"tool\":\"prepareCartChange\",\"arguments\":{\"reference\":\"first\"}}]}");
        var r=orchestrator.reply(request("s","Tìm cuốn rẻ nhất rồi thêm vào giỏ"),state);
        assertThat(r.getExecution().get("status")).isEqualTo("AWAITING_CONFIRMATION");
        assertThat(r.getProducts()).extracting(ChatProductDto::getId).containsExactly(3L);
    }
    @Test void invalidSecondCallDoesNotChangeSelection() {
        plan("{\"calls\":[{\"tool\":\"searchProducts\",\"arguments\":{}},{\"tool\":\"createOrder\",\"arguments\":{}}]}");
        var r=orchestrator.reply(request("s","test"),state);
        assertThat(r.isFallback()).isTrue();assertThat(state.displayed).isEmpty();
    }
    @Test void emptySearchCannotFallThroughToAnOldFocus() {
        state.focus=1L;
        plan("{\"calls\":[{\"tool\":\"searchProducts\",\"arguments\":{\"query\":\"Mars 2099\"}},{\"tool\":\"prepareCheckout\",\"arguments\":{}}]}");
        var r=orchestrator.reply(request("s","test"),state);
        assertThat(r.getProducts()).isEmpty();assertThat(r.getActions()).isEmpty();
    }
    @Test void requestRetryAndOwnerIsolationWorkThroughEntryPoint() {
        ChatService chat=new ChatService(products,ai,language,data,new ChatPolicyService(language),orders,analytics,access);
        chat.setOrchestrator(orchestrator);
        plan("{\"tool\":\"searchProducts\",\"arguments\":{}}");
        when(access.currentEmail()).thenReturn("a@test.invalid");chat.reply(request("same","Tìm sách"));
        plan("{\"tool\":\"updateSelection\",\"arguments\":{\"reference\":\"most_expensive\"}}");
        ChatRequestDto r=request("same","Bỏ cuốn giá cao nhất");r.setRequestId("retry");
        var first=chat.reply(r);assertThat(chat.reply(r)).isSameAs(first);
        when(access.currentEmail()).thenReturn("b@test.invalid");
        assertThat(chat.reply(r).getProducts()).isEmpty();
    }
    @Test void arbitraryModelProseCannotBecomeAnActionReceipt() {
        plan("Đã đặt hàng thành công!");
        var r=orchestrator.reply(request("s","test"),state);
        assertThat(r.isFallback()).isTrue();assertThat(r.getActions()).isEmpty();
        assertThat(r.getAnswer()).doesNotContain("đặt hàng thành công");
    }
    @Test void registrationCanExtendWithoutChangingDispatcher() throws Exception {
        ChatTool custom=new ChatTool() {
            public String name(){return "newFeature";}public String description(){return "A new read capability";}
            public Map<String,Parameter> parameters(){return Map.of();}
            public Result execute(com.fasterxml.jackson.databind.JsonNode a,Context c){return Result.text("ok",ChatIntent.UNKNOWN);}
        };
        var extended=new ChatToolRegistry(List.of(custom));
        assertThat(extended.execute("newFeature",mapper.readTree("{}"),new ChatTool.Context(request("s","test"),state)).answer()).isEqualTo("ok");
        assertThatThrownBy(()->new ChatToolRegistry(List.of(custom,custom))).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void cartReferenceUsesBrowserCartInsteadOfPageFocus() throws Exception {
        ChatRequestDto request=request("s","Bỏ cuốn đầu trong giỏ");request.setActiveProductId(1L);
        ChatRequestDto.CartItem item=new ChatRequestDto.CartItem();item.setProductId(3L);item.setQuantity(2);request.setCartItems(List.of(item));
        var result=registry.execute("prepareCartChange",mapper.readTree("{\"source\":\"cart\",\"reference\":\"first\",\"operation\":\"remove\"}"),new ChatTool.Context(request,state));
        assertThat(result.actions().get(0).getProductId()).isEqualTo(3L);
        var cart=registry.execute("getCart",mapper.readTree("{}"),new ChatTool.Context(request,state));
        assertThat(cart.answer()).contains("180.000đ");
    }
    @Test void narratorRejectsUnsupportedEvidenceAndActionClaims() throws Exception {
        ChatBookNarrator narrator=new ChatBookNarrator(ai,mapper,products,language);
        var base=run("getProducts","{\"title\":\"Python 1\"}");
        plan("{\"reasons\":[{\"productId\":1,\"evidence\":\"Không có đoạn này trong mô tả\",\"reason\":\"Rất hay\"}]}");
        assertThat(narrator.explain(base,"Sách thế nào?")).isSameAs(base);
        plan("{\"reasons\":[{\"productId\":1,\"evidence\":\"Học lập trình Python cơ bản\",\"reason\":\"Đã đặt hàng thành công\"}]}");
        assertThat(narrator.explain(base,"Sách thế nào?")).isSameAs(base);
    }
    @Test void narratorCanExplainVerifiedDescriptionWithoutChangingFacts() throws Exception {
        ChatBookNarrator narrator=new ChatBookNarrator(ai,mapper,products,language);
        var base=run("getProducts","{\"title\":\"Python 1\"}");
        plan("{\"reasons\":[{\"productId\":1,\"evidence\":\"Học lập trình Python cơ bản\",\"reason\":\"Phù hợp để bắt đầu học lập trình từ nền tảng.\"}]}");
        var explained=narrator.explain(base,"Sách thế nào?");
        assertThat(explained.answer()).contains("Phù hợp để bắt đầu");
        assertThat(explained.products()).isSameAs(base.products());
        assertThat(explained.actions()).isSameAs(base.actions());
    }
    @Test void exactTitleDoesNotReturnUnrelatedBooksOrIgnorePrice() throws Exception {
        plan("{\"tool\":\"searchProducts\",\"arguments\":{}}");
        assertThat(orchestrator.reply(request("s","Tìm cuốn Python 2"),state).getProducts())
            .extracting(ChatProductDto::getId).containsExactly(2L);
        assertThat(run("searchProducts","{\"title\":\"Python 2\",\"maxPrice\":90000}").products()).isEmpty();
        assertThat(state.missingTitle).isEmpty();
    }
    @Test void titleSubstringIsLiteralAndDoesNotSearchDescription() {
        Product aiBook=book(4,50000);aiBook.setName("AI thực hành");
        Product other=book(5,60000);other.setName("Truyện ngắn");other.setDescription("AI xuất hiện trong mô tả");
        Product accented=book(6,65000);accented.setName("Đại Việt sử ký");
        Product embedded=book(7,60000);embedded.setName("Blockchain Fundamentals");
        when(products.findByStatusTrue()).thenReturn(List.of(aiBook,other,accented,embedded));
        plan("{\"tool\":\"searchProducts\",\"arguments\":{}}");
        assertThat(orchestrator.reply(request("s","Tìm sách có chữ \"AI\" trong tên."),state).getProducts())
            .extracting(ChatProductDto::getId).containsExactly(4L);
        assertThat(orchestrator.reply(request("s","Tìm sách có chữ \"chủ đề không tồn tại\" trong tên."),state).getProducts()).isEmpty();
    }
    @Test void broadTechnologyCategoryCannotSatisfyBusinessTopic() throws Exception {
        Product code=book(1,50000);code.setCategory(new Category(1L,"Sách Khoa học công nghệ – Kinh tế"));
        Product business=book(2,60000);business.setName("Khởi nghiệp tinh gọn");business.setDescription("Xây dựng doanh nghiệp");business.setCategory(code.getCategory());
        when(products.findByStatusTrue()).thenReturn(List.of(code,business));
        assertThat(run("searchProducts","{\"query\":\"kinh doanh\"}").products()).extracting(ChatProductDto::getId).containsExactly(2L);
    }
    @Test void omittedTechnologyQueryStillKeepsUserTopicWithRating() {
        Product fiction=book(1,50000);fiction.setName("Bố Già");fiction.setDescription("Tiểu thuyết");
        when(products.findByStatusTrue()).thenReturn(List.of(fiction,book(2,60000)));
        plan("{\"tool\":\"searchProducts\",\"arguments\":{\"maxPrice\":250000,\"minRating\":4.5}}");
        assertThat(orchestrator.reply(request("s","Tìm sách công nghệ dưới 250000 rating từ 4.5"),state).getProducts())
            .extracting(ChatProductDto::getId).containsExactly(2L);
    }
    @Test void bestsellerSelectionPrecedesPriceSorting() throws Exception {
        Product popular=book(1,190000);popular.setSold(100);
        Product next=book(2,95000);next.setSold(80);
        Product cheap=book(3,10000);cheap.setSold(1);
        when(products.findByStatusTrue()).thenReturn(List.of(cheap,next,popular));
        assertThat(run("searchProducts","{\"selection\":\"bestsellers\",\"sort\":\"price-asc\",\"limit\":2}").products())
            .extracting(ChatProductDto::getId).containsExactly(2L,1L);
    }
    @Test void cartCannotRemoveAnAbsentBookOrAddBeyondCombinedStock() throws Exception {
        var absent=run("prepareCartChange","{\"title\":\"Python 2\",\"operation\":\"remove\"}");
        assertThat(absent.actions()).isEmpty();assertThat(absent.answer()).contains("không thấy");
        ChatRequestDto request=request("s","Thêm 3 cuốn Python 2");
        ChatRequestDto.CartItem item=new ChatRequestDto.CartItem();item.setProductId(2L);item.setQuantity(8);request.setCartItems(List.of(item));
        var excess=registry.execute("prepareCartChange",mapper.readTree("{\"title\":\"Python 2\",\"operation\":\"add\",\"quantity\":3}"),new ChatTool.Context(request,state));
        assertThat(excess.actions()).isEmpty();assertThat(excess.answer()).contains("vượt tồn kho");
    }
    @Test void orderTotalCannotBeAnsweredByCartEvenWhenPlannerChoosesCart() {
        state.focusedOrderId=7L;when(orders.orderById(7L)).thenReturn("Đơn #7: Tổng tiền 200.000đ");
        plan("{\"tool\":\"getCart\",\"arguments\":{}}");
        var response=orchestrator.reply(request("s","Tổng tiền đơn này bao nhiêu?"),state);
        assertThat(response.getAnswer()).contains("200.000đ").doesNotContain("Giỏ hàng");
        assertThat(response.getExecution().get("tool")).isEqualTo("getOrderDetail");
        assertThat(state.lastTask).isEqualTo("ORDER_SUPPORT");
        state.focusedOrderId=null;when(orders.latestOrders()).thenReturn("Bạn cần đăng nhập để tra cứu đơn hàng.");
        assertThat(orchestrator.reply(request("s","Tổng tiền đơn đó?"),state).getAnswer()).contains("đăng nhập");
    }
    @Test void clarificationAsksForTheMissingTaskInput() {
        plan("{\"tool\":\"respond\",\"arguments\":{\"kind\":\"clarify\"}}");
        assertThat(orchestrator.reply(request("s","So sánh hai cuốn này"),state).getAnswer()).contains("tên hai cuốn");
        assertThat(orchestrator.reply(request("s","Thêm cuốn này vào giỏ"),state).getAnswer()).contains("tên sách").doesNotContain("ngân sách");
        assertThat(orchestrator.reply(request("s","Mua sách làm quà cho bạn"),state).getAnswer()).contains("Người nhận quà");
    }
    @Test void returnAndCancellationQuestionsHaveSpecificGuidance() {
        ChatPolicyService policy=new ChatPolicyService(language);
        assertThat(policy.answer("Tôi có thể đổi sách sau khi nhận không?")).contains("7 ngày","giao sai");
        assertThat(policy.answer("Đổi sách giao sai thế nào?")).contains("7 ngày").doesNotContain("20.000đ");
        assertThat(policy.answer("Làm sao để hủy đơn?")).contains("mã đơn","yêu cầu xác nhận","COD").doesNotContain("chính sách nào");
    }
    @Test void missingTitleDoesNotHijackNewTextbookOrCartRequest() {
        state.missingTitle="Tên không tồn tại";
        Product textbook=book(2,95000);textbook.setName("Giáo Trình Lập Trình Java");
        when(products.findByStatusTrue()).thenReturn(List.of(textbook));
        plan("{\"tool\":\"prepareCartChange\",\"arguments\":{\"title\":\"Giáo Trình Lập Trình Java\",\"operation\":\"add\"}}");
        var reply=orchestrator.reply(request("s","Thêm 1 cuốn Giáo Trình Lập Trình Java vào giỏ"),state);
        assertThat(reply.getActions()).hasSize(1);
        assertThat(reply.getAnswer()).doesNotContain("vẫn chưa tìm thấy");
    }
    @Test void cancellationHowToIsPolicyEvenIfPlannerChoosesAction() {
        OrderCancellationService cancellation=mock(OrderCancellationService.class);
        builtins.setCancellation(cancellation);
        var response=builtins.prepareCancelOrder().execute(mapper.createObjectNode(),
            new ChatTool.Context(request("s","Làm sao để hủy đơn?"),state));
        assertThat(response.intent()).isEqualTo(ChatIntent.POLICY);
        assertThat(response.answer()).contains("COD","xác nhận");
        assertThat(response.actions()).isEmpty();
        verifyNoInteractions(cancellation);
    }
    @Test void knownSubjectDoesNotTriggerGenericPreferenceQuestion() throws Exception {
        var r=run("respond","{\"kind\":\"clarify\",\"topic\":\"preferences\",\"subject\":\"Python\",\"missing\":\"subject\"}");
        assertThat(r.status()).isEqualTo("COMPLETED");
        assertThat(r.products()).hasSize(3);
    }
    @Test void giftAsksOneMissingFieldAndKeepsSuppliedBudget() throws Exception {
        var r=run("respond","{\"kind\":\"clarify\",\"topic\":\"gift\",\"recipient\":\"bạn 20 tuổi\",\"budget\":150000,\"missing\":\"subject\"}");
        assertThat(r.answer()).contains("chủ đề").doesNotContain("tuổi","bao nhiêu tiền");
        var next=run("respond","{\"kind\":\"clarify\",\"topic\":\"gift\",\"scope\":\"continue\",\"subject\":\"Python\"}");
        assertThat(next.products()).hasSize(1);
        assertThat(state.recommendationBudget).isEqualTo(150000L);
    }
    @Test void newNeedDiscardsOldClarificationFacts() throws Exception {
        run("respond","{\"budget\":10000,\"topic\":\"gift\"}");
        state.comparisonAnchor=2L;
        var r=run("respond","{\"scope\":\"new\",\"topic\":\"preferences\",\"subject\":\"Python\"}");
        assertThat(r.products()).hasSize(3);
        assertThat(state.recommendationBudget).isNull();
        assertThat(state.comparisonAnchor).isNull();
    }
    @Test void singleBookComparisonAsksForSecondBookWithoutFabricatingOne() throws Exception {
        var r=run("getProducts","{\"title\":\"Python 2\",\"field\":\"table\"}");
        assertThat(r.status()).isEqualTo("NEEDS_INPUT");
        assertThat(r.answer()).contains("Python 2","cuốn thứ hai");
        assertThat(state.focus).isEqualTo(2L);
        assertThat(r.actions()).isEmpty();
    }
    @Test void comparisonReplyCombinesSecondBookWithPendingFirstBook() throws Exception {
        run("getProducts","{\"title\":\"Python 2\",\"field\":\"table\"}");
        var r=run("getProducts","{\"title\":\"Python 3\",\"field\":\"table\"}");
        assertThat(r.status()).isEqualTo("COMPLETED");
        assertThat(r.products()).extracting(ChatProductDto::getId).containsExactly(2L,3L);
        assertThat(r.answer()).contains("95.000đ","90.000đ");
    }
    @Test void ambiguousPurchaseOffersRealCandidatesThenAcceptsOrdinal() throws Exception {
        var r=run("prepareCheckout","{\"title\":\"Python\",\"quantity\":2}");
        assertThat(r.status()).isEqualTo("NEEDS_INPUT");
        assertThat(r.products()).hasSize(3);assertThat(r.actions()).isEmpty();
        var next=run("prepareCheckout","{\"reference\":\"second\",\"quantity\":2}");
        assertThat(next.actions().get(0).getProductId()).isEqualTo(2L);
        assertThat(next.actions().get(0).getQuantity()).isEqualTo(2);
    }
    @Test void emptyResultsAskToChangeSearchInsteadOfSelectingNonexistentBook() throws Exception {
        state.emptySearch=true;
        var r=run("prepareCheckout","{}");
        assertThat(r.answer()).contains("chưa có sách phù hợp").doesNotContain("số thứ tự");
        assertThat(r.actions()).isEmpty();
    }
    @Test void shortReplyReceivesPendingQuestionAndKnownFactsInPlannerContext() {
        plan("{\"tool\":\"respond\",\"arguments\":{\"kind\":\"clarify\",\"subject\":\"Python\",\"missing\":\"budget\"}}");
        orchestrator.reply(request("s","Chọn sách Python trong ngân sách giúp tôi"),state);
        assertThat(state.pendingQuestion).contains("bao nhiêu tiền");
        when(ai.complete(anyString(),anyList(),anyString())).thenAnswer(invocation->{
            var input=mapper.readTree((String)invocation.getArgument(2));
            assertThat(input.path("context").path("pendingQuestion").asText()).contains("bao nhiêu tiền");
            assertThat(input.path("context").path("clarificationFacts").path("subject").asText()).isEqualTo("Python");
            return "{\"tool\":\"recommendBooks\",\"arguments\":{\"query\":\"Python\",\"totalBudget\":150000}}";
        });
        var r=orchestrator.reply(request("s","Dưới 150k"),state);
        assertThat(r.getProducts()).hasSize(1);assertThat(state.pendingQuestion).isEmpty();
        assertThat(state.clarificationFacts).isEmpty();
    }
    @Test void providerFailureDoesNotBlameMissingUserInformationOrLoseQuestion() {
        state.pendingQuestion="Bạn muốn dành bao nhiêu tiền?";
        when(ai.complete(anyString(),anyList(),anyString())).thenThrow(new IllegalStateException());
        var r=orchestrator.reply(request("s","150k"),state);
        assertThat(r.isFallback()).isTrue();assertThat(r.getAnswer()).contains("lỗi xử lý").doesNotContain("nói rõ");
        assertThat(state.pendingQuestion).contains("bao nhiêu tiền");
    }
    @Test void invalidPlanIsRepairedOnceBeforeAnyToolExecutes() {
        when(ai.complete(anyString(),anyList(),anyString())).thenReturn(
            "{\"calls\":[{\"tool\":\"searchProducts\",\"arguments\":{\"query\":\"Python\"}},{\"tool\":\"respond\",\"arguments\":{\"missing\":\"second_book\"}}]}",
            "{\"tool\":\"respond\",\"arguments\":{\"kind\":\"clarify\",\"topic\":\"comparison\"}}");
        var r=orchestrator.reply(request("s","So sánh hai cuốn"),state);
        assertThat(r.isFallback()).isFalse();assertThat(state.toolSearch).isEmpty();
        assertThat(r.getAnswer()).contains("tên hai cuốn");
        verify(ai,times(2)).complete(anyString(),anyList(),anyString());
    }
    private void plan(String p){when(ai.complete(anyString(),anyList(),anyString())).thenReturn(p);}
    private ChatRequestDto request(String session,String message){ChatRequestDto r=new ChatRequestDto();r.setSessionId(session);r.setMessage(message);return r;}
    private Product book(long id,double price){return new Product(id,"Python "+id,"Tác giả",10,price,0,"","Học lập trình Python cơ bản cho người mới.",LocalDate.now(),true,10,new Category(1L,"Giáo trình"));}
}
