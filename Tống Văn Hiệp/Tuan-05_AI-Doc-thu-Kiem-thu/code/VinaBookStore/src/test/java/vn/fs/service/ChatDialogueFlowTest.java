package vn.fs.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import vn.fs.config.CurrentUserAccess;
import vn.fs.dto.chat.*;
import vn.fs.entity.*;
import vn.fs.repository.*;

class ChatDialogueFlowTest {
    ProductRepository products=mock(ProductRepository.class);
    AiGateway ai=mock(AiGateway.class);
    CurrentUserAccess access=mock(CurrentUserAccess.class);
    ChatOrderSupportService orders=mock(ChatOrderSupportService.class);
    ChatAnalyticsService analytics=mock(ChatAnalyticsService.class);
    RateRepository rates=mock(RateRepository.class);
    ChatIntentService language=new ChatIntentService();
    ChatService chat;
    List<Product> catalog;
    @BeforeEach void setup() {
        catalog=List.of(book(1,"Giáo Trình Lập Trình Java",91800,"Java căn bản, hướng đối tượng cho người mới."),
                book(2,"Giáo Trình Cấu Trúc Dữ Liệu",83600,"Cấu trúc dữ liệu, giải thuật cho sinh viên lập trình."),
                book(3,"Giáo Trình Cơ Sở Dữ Liệu",90160,"Cơ sở dữ liệu và SQL."),
                book(4,"Giáo Trình Mạng Máy Tính",95000,"Mạng máy tính và TCP/IP."),
                book(5,"Clean Code",151200,"Viết mã nguồn sạch, thực hành lập trình."),
                book(6,"Luật Lao Động Thực Hành",82800,"Pháp luật dành cho người lao động."));
        when(products.findByStatusTrue()).thenReturn(catalog);
        when(analytics.record(any(),any(),anyString(),anyBoolean(),anyInt(),anyLong())).thenReturn("test");
        ChatRetrievalService data=new ChatRetrievalService(language); data.setRates(rates);
        chat=new ChatService(products,ai,language,data,new ChatPolicyService(language),orders,analytics,access);
    }
    @Test void moneyIsNotAnArbitraryNumberInATitle() {
        assertThat(language.criteria("Tìm cuốn Advanced Mars Programming with Java 2099",catalog).getMaxPrice()).isNull();
        assertThat(language.criteria("Tầm 2 lít mua mấy quyển code",catalog).getMaxPrice()).isEqualTo(200000);
        assertThat(language.criteria("Tối đa 1,5 triệu",catalog).getMaxPrice()).isEqualTo(1500000);
        assertThat(language.criteria("3 cuốn rating 4 sao",catalog).getMaxPrice()).isNull();
    }
    @Test void sortsAllEligibleBooksBeforeTakingFive() {
        var r=turn("a","Cho tôi 5 cuốn sách rẻ nhất thuộc danh mục Công nghệ thông tin");
        assertThat(r.getProducts()).extracting(ChatProductDto::getId).containsExactly(2L,3L,1L,4L,5L);
    }
    @Test void dialogueFindDetailBuyUsesTheSameBookWithoutButton() {
        var first=turn("a","Tìm 3 cuốn sách lập trình dưới 150k");
        Long second=first.getProducts().get(1).getId();
        assertThat(turn("a","Nói rõ hơn về cuốn thứ hai").getProducts()).extracting(ChatProductDto::getId).containsExactly(second);
        var buy=turn("a","giúp t mua");
        assertThat(buy.getIntent()).isEqualTo(ChatIntent.PURCHASE);
        assertThat(buy.getProducts()).extracting(ChatProductDto::getId).containsExactly(second);
        verifyNoInteractions(orders);
    }
    @Test void policyInterruptionPreservesFocus() {
        turn("a","Nói rõ hơn về cuốn Luật Lao Động Thực Hành");
        assertThat(turn("a","Phí giao hàng thế nào?").getProducts()).isEmpty();
        assertThat(turn("a","mua ngay").getProducts()).extracting(ChatProductDto::getId).containsExactly(6L);
    }
    @Test void shortlistSurvivesDetailedFocusAndCanRemoveAnItem() {
        turn("a","Tìm 3 cuốn sách lập trình rẻ nhất");
        turn("a","Nói rõ hơn về cuốn đầu tiên");
        var remaining=turn("a","Loại cuốn đắt nhất ra");
        assertThat(remaining.getProducts()).extracting(ChatProductDto::getId).containsExactly(2L,3L);
        assertThat(turn("a","Lập bảng so sánh hai cuốn này").getProducts()).extracting(ChatProductDto::getId).containsExactly(2L,3L);
    }
    @Test void retryIdDoesNotRemoveTwoBooks() {
        turn("a","Tìm 3 cuốn sách lập trình rẻ nhất");
        ChatRequestDto r=request("a","Loại cuốn đắt nhất ra"); r.setRequestId("same-turn");
        ChatResponseDto first=chat.reply(r);
        assertThat(chat.reply(r)).isSameAs(first);
        assertThat(turn("a","Lập bảng so sánh hai cuốn này").getProducts()).hasSize(2);
    }
    @Test void accountAndSessionIsolation() {
        when(access.currentEmail()).thenReturn("alice@test.invalid"); turn("same","Nói rõ về Luật Lao Động Thực Hành");
        when(access.currentEmail()).thenReturn("bob@test.invalid");
        assertThat(turn("same","mua ngay").getProducts()).isEmpty();
        when(access.currentEmail()).thenReturn("alice@test.invalid");
        assertThat(turn("new-session","mua ngay").getProducts()).isEmpty();
        assertThat(turn("same","mua ngay").getProducts()).extracting(ChatProductDto::getId).containsExactly(6L);
    }
    @Test void unknownTitleDoesNotBecomeOldPurchaseAndNameIsRemembered() {
        turn("a","Nói rõ về Luật Lao Động Thực Hành");
        turn("a","Tìm cuốn \"Advanced Mars Programming with Java 2099\"");
        assertThat(turn("a","Bạn kiểm tra lại giá của nó").getAnswer()).contains("Advanced Mars").doesNotContain("cuốn sách nào");
        assertThat(turn("a","mua ngay").getProducts()).isEmpty();
    }
    @Test void noPythonDoesNotFabricateButConsentCanOpenRelatedBooks() {
        assertThat(turn("a","Tìm sách Python dưới 200k").getProducts()).isEmpty();
        assertThat(turn("a","đồng ý").getProducts()).isNotEmpty().allMatch(p -> p.getPrice()<=200000 && p.getId()!=6L);
    }
    @Test void budgetAndTopicsSurviveMoreThanEightTurns() {
        turn("a","Tìm sách lập trình dưới 150k");
        for(int i=0;i<12;i++) turn("a","Phí giao hàng thế nào?");
        var r=turn("a","Chỉ lấy những cuốn dưới 90k");
        assertThat(r.getProducts()).extracting(ChatProductDto::getId).containsExactly(2L);
    }
    @Test void modelMayNotReturnProductOutsideEligibleCatalog() {
        when(ai.isConfigured()).thenReturn(true);
        when(ai.complete(anyString(),anyList(),anyString())).thenReturn("{\"intro\":\"Gợi ý\",\"recommendations\":[{\"productId\":6,\"reason\":\"Hay\"}]}");
        assertThat(turn("a","Tìm sách lập trình").getProducts()).noneMatch(p -> p.getId()==6L);
    }
    @Test void adviceDoesNotDependOnCatalogHavingPython() {
        var r=turn("a","Tôi chưa biết lập trình, nên học Python hay Java trước?");
        assertThat(r.getAnswer()).contains("Python","Java").doesNotContain("chưa tìm thấy");
        assertThat(r.getProducts()).isEmpty();
    }
    @Test void pendingChoiceResolvesOrdinalDirectlyToPurchase() {
        turn("a","Tìm 3 cuốn sách lập trình rẻ nhất");
        assertThat(turn("a","giúp t mua").getProducts()).hasSize(3);
        var r=turn("a","cuốn thứ hai");
        assertThat(r.getIntent()).isEqualTo(ChatIntent.PURCHASE);
        assertThat(r.getProducts()).extracting(ChatProductDto::getId).containsExactly(3L);
    }
    @Test void privatePayloadNeverReachesModel() {
        when(ai.isConfigured()).thenReturn(true);
        turn("a","SĐT 0901234567, giao đến số 1 đường ABC");
        verify(ai,never()).complete(anyString(),anyList(),anyString());
    }
    @Test void oneModelCallCanExplainASelectedBook() {
        when(ai.isConfigured()).thenReturn(true); when(ai.provider()).thenReturn("gemini"); when(ai.model()).thenReturn("test");
        when(ai.complete(anyString(),anyList(),anyString())).thenReturn("{\"intent\":\"PRODUCT_INFO\",\"intro\":\"Về nội dung:\",\"recommendations\":[{\"productId\":6,\"reason\":\"Giải thích quyền lợi khi đi làm từ các tình huống pháp luật.\"}],\"closing\":\"\"}");
        var r=turn("a","Nói rõ về Luật Lao Động Thực Hành");
        assertThat(r.getProvider()).isEqualTo("gemini");
        assertThat(r.getProducts()).extracting(ChatProductDto::getId).containsExactly(6L);
        verify(ai,times(1)).complete(anyString(),anyList(),anyString());
    }
    @Test void acceptingAnEnglishAlternativeNeverSwitchesToProgramming() {
        assertThat(turn("a","Tìm sách tiếng Anh dưới 200k").getProducts()).isEmpty();
        var answer=turn("a","đồng ý");
        assertThat(answer.getProducts()).isEmpty();
        assertThat(answer.getAnswer()).contains("chủ đề");
    }
    @Test void newComparisonSearchReturnsATableOfExactlyTwoCheapestBooks() {
        var answer=turn("a","So sánh 2 cuốn sách lập trình rẻ nhất");
        assertThat(answer.getIntent()).isEqualTo(ChatIntent.COMPARE_BOOKS);
        assertThat(answer.getProducts()).extracting(ChatProductDto::getId).containsExactly(2L,3L);
        assertThat(answer.getAnswer()).contains("| Sách | Tác giả | Giá | Rating |");
    }
    @Test void adviceLabelDoesNotDiscardVerifiedBookRecommendations() {
        when(ai.isConfigured()).thenReturn(true); when(ai.provider()).thenReturn("gemini"); when(ai.model()).thenReturn("test");
        when(ai.complete(anyString(),anyList(),anyString())).thenReturn("{\"intent\":\"ADVICE\",\"intro\":\"Bạn có thể bắt đầu từ:\",\"recommendations\":[{\"productId\":1,\"reason\":\"Có bài tập và kiến thức cơ bản cho sinh viên CNTT.\"}]}");
        var r=turn("a","Tôi là sinh viên công nghệ thông tin, nên đọc sách nào?");
        assertThat(r.getIntent()).isEqualTo(ChatIntent.DISCOVER_BOOKS);
        assertThat(r.getProducts()).extracting(ChatProductDto::getId).containsExactly(1L);
        assertThat(r.getAnswer()).contains("Giáo Trình Lập Trình Java");
    }
    @Test void ambiguousPairRequiresNamesInsteadOfDroppingARandomBook() {
        turn("a","Tìm 3 cuốn sách lập trình rẻ nhất");
        var response=turn("a","So sánh hai cuốn sách này giúp tôi");
        assertThat(response.getProducts()).isEmpty();
        assertThat(response.getAnswer()).contains("hiện có 3 cuốn");
        assertThat(turn("a","Giáo Trình Cơ Sở Dữ Liệu và Giáo Trình Lập Trình Java").getProducts())
                .extracting(ChatProductDto::getId).containsExactly(3L,1L);
    }
    @Test void generalWhichBooksQuestionDoesNotRequireAnExistingShortlist() {
        var response=turn("a","Có cuốn nào vừa thuộc sách bán chạy vừa nằm trong nhóm được đánh giá cao không?");
        assertThat(response.getAnswer()).doesNotContain("Bạn đang hỏi cuốn sách nào");
    }
    @Test void tellPriceResolvesLongPronoun() {
        turn("a","Nói rõ về Luật Lao Động Thực Hành");
        var response=turn("a","Tôi chắc chắn cuốn sách đó có trên website. Hãy nói giá cho tôi.");
        assertThat(response.getProducts()).extracting(ChatProductDto::getId).containsExactly(6L);
        assertThat(response.getAnswer()).contains("82.800đ");
    }
    @Test void explanationOfAnEmptyRecommendationCannotIntroduceUnrelatedBooks() {
        turn("a","Tìm sách Python cho người mới dưới 200k");
        var r=turn("a","Hãy cho tôi biết chính xác tại sao bạn đề xuất cuốn sách đó thay vì các lựa chọn khác.");
        assertThat(r.getProducts()).isEmpty();
        assertThat(r.getAnswer()).contains("chưa tìm được sách phù hợp");
        verify(ai,never()).complete(anyString(),anyList(),anyString());
    }
    @Test void internalProductReferencesAreNeverPrintedAsExtraRecommendations() {
        when(ai.isConfigured()).thenReturn(true); when(ai.provider()).thenReturn("gemini"); when(ai.model()).thenReturn("test");
        when(ai.complete(anyString(),anyList(),anyString())).thenReturn("{\"intent\":\"DISCOVER_BOOKS\",\"intro\":\"Nền tảng:\",\"recommendations\":[{\"productId\":1,\"reason\":\"Có bài tập thực hành.\"}],\"closing\":\"Bạn cũng nên xem productId 6\"}");
        var r=turn("a","Tìm sách lập trình");
        assertThat(r.getAnswer()).doesNotContain("productId", "Bạn cũng nên xem");
        assertThat(r.getProducts()).extracting(ChatProductDto::getId).containsExactly(1L);
    }
    @Test void comparisonCannotPromiseAnOrderFromModelProse() {
        when(ai.isConfigured()).thenReturn(true); when(ai.provider()).thenReturn("gemini"); when(ai.model()).thenReturn("test");
        when(ai.complete(anyString(),anyList(),anyString())).thenReturn("{\"intent\":\"PRODUCT_INFO\",\"intro\":\"Giới thiệu:\",\"recommendations\":[{\"productId\":1,\"reason\":\"Có bài tập thực hành.\"}],\"closing\":\"Đơn hàng sẽ được xử lý ngay sau khi bạn xác nhận.\"}");
        var r=turn("a","Nói rõ về Giáo Trình Lập Trình Java");
        assertThat(r.getAnswer()).doesNotContain("Đơn hàng", "xác nhận");
        assertThat(r.getIntent()).isEqualTo(ChatIntent.PRODUCT_INFO);
    }
    private ChatResponseDto turn(String session,String text) { return chat.reply(request(session,text)); }
    private ChatRequestDto request(String session,String text) { ChatRequestDto r=new ChatRequestDto();r.setSessionId(session);r.setMessage(text);return r; }
    private Product book(long id,String name,double price,String description) { return new Product(id,name,"Tác giả",100,price,0,"",description,LocalDate.now(),true,10,new Category(1L,"Giáo trình")); }
}
