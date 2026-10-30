package vn.fs.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import java.util.Optional;
import javax.persistence.EntityManager;
import javax.persistence.LockModeType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;
import org.springframework.web.server.ResponseStatusException;
import vn.fs.config.CurrentUserAccess;
import vn.fs.entity.*;
import vn.fs.repository.*;

class ChatCheckoutServiceTest {
    CurrentUserAccess access = mock(CurrentUserAccess.class);
    ProductRepository products = mock(ProductRepository.class);
    UserRepository users = mock(UserRepository.class);
    OrderRepository orders = mock(OrderRepository.class);
    OrderDetailRepository details = mock(OrderDetailRepository.class);
    EntityManager em = mock(EntityManager.class);
    PlatformTransactionManager tx = mock(PlatformTransactionManager.class);
    ChatCheckoutService service;
    Product product;
    ChatCheckoutService.Input input;
    @BeforeEach void setup() {
        service = new ChatCheckoutService(access, products, users, orders, details,
            new ChatRetrievalService(new ChatIntentService()), em, tx);
        when(access.currentEmail()).thenReturn("buyer@example.test");
        product = new Product(); product.setProductId(1L); product.setName("Sách thử");
        product.setStatus(true); product.setQuantity(10); product.setPrice(100000D);
        when(products.findById(1L)).thenReturn(Optional.of(product));
        when(em.find(Product.class,1L,LockModeType.PESSIMISTIC_WRITE)).thenReturn(product);
        when(tx.getTransaction(any())).thenReturn(mock(TransactionStatus.class));
        User user = new User(); user.setEmail("buyer@example.test");
        when(users.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
        when(orders.save(any())).thenAnswer(call -> { Order o = call.getArgument(0); o.setOrdersId(9L); return o; });
        input = new ChatCheckoutService.Input(); input.setProductId(1L); input.setQuantity(1);
        input.setRecipient("Người thử"); input.setPhone("0900000000"); input.setStreet("Địa chỉ kiểm thử");
    }
    @Test void quoteDoesNotWriteAndUsesServerPrice() {
        var q=service.quote(input);
        assertThat(q.getTotal()).isEqualTo(120000);
        verifyNoInteractions(orders,details);
        input.setQuantity(3);
        assertThat(service.quote(input).getShipping()).isZero();
    }
    @Test void repeatedConfirmationOnlyWritesOnce() {
        var q=service.quote(input);
        assertThat(service.confirm(q.getToken()).get("orderId")).isEqualTo(9L);
        assertThat(service.confirm(q.getToken()).get("orderId")).isEqualTo(9L);
        verify(orders,times(1)).save(any()); verify(details,times(1)).save(any());
        verify(tx).commit(any());
        assertThat(product.getQuantity()).isEqualTo(9);
    }
    @Test void otherOwnerCannotConfirm() {
        var q=service.quote(input); when(access.currentEmail()).thenReturn("other@example.test");
        assertThatThrownBy(() -> service.confirm(q.getToken())).isInstanceOf(ResponseStatusException.class);
        verify(orders,never()).save(any());
    }
    @Test void priceChangeRequiresNewQuote() {
        var q=service.quote(input); product.setPrice(150000D);
        assertThatThrownBy(() -> service.confirm(q.getToken())).isInstanceOf(ResponseStatusException.class);
        verify(orders,never()).save(any()); verify(tx).rollback(any());
    }
    @Test void expiredQuoteCannotCreateOrder() {
        var q=service.quote(input); q.setExpiresAt(0);
        assertThatThrownBy(() -> service.confirm(q.getToken())).isInstanceOf(ResponseStatusException.class);
        verify(orders,never()).save(any());
    }
    @Test void noStockCannotQuote() {
        product.setQuantity(0);
        assertThatThrownBy(() -> service.quote(input)).isInstanceOf(ResponseStatusException.class);
    }
    @Test void editedQuoteInvalidatesPrevious() {
        var first=service.quote(input); service.quote(input);
        assertThatThrownBy(() -> service.confirm(first.getToken())).isInstanceOf(ResponseStatusException.class);
    }
    @Test void cancelledDraftCannotBeConfirmed(){var q=service.quote(input);service.cancelDraft(q.getToken());assertThatThrownBy(()->service.confirm(q.getToken())).isInstanceOf(ResponseStatusException.class);verify(orders,never()).save(any());}
    @Test void otherAccountCannotCancelDraft(){var q=service.quote(input);when(access.currentEmail()).thenReturn("other@test.invalid");assertThatThrownBy(()->service.cancelDraft(q.getToken())).isInstanceOf(ResponseStatusException.class);when(access.currentEmail()).thenReturn("buyer@example.test");assertThat(service.confirm(q.getToken()).get("orderId")).isEqualTo(9L);}
    @Test void secondBuyerCannotConsumeReservedStock(){input.setQuantity(10);var first=service.quote(input);when(access.currentEmail()).thenReturn("other@test.invalid");var second=service.quote(input);when(access.currentEmail()).thenReturn("buyer@example.test");service.confirm(first.getToken());when(access.currentEmail()).thenReturn("other@test.invalid");assertThatThrownBy(()->service.confirm(second.getToken())).isInstanceOf(ResponseStatusException.class);assertThat(product.getQuantity()).isZero();}
    @Test void committedOrderCanBeRecoveredAfterServiceRestart() {
        Order saved = new Order(); saved.setOrdersId(9L);
        User owner=new User(); owner.setEmail("buyer@example.test"); saved.setUser(owner);
        when(orders.findByPaymentReference("CHAT-old-token")).thenReturn(Optional.of(saved));
        assertThat(service.confirm("old-token").get("orderId")).isEqualTo(9L);
        verify(orders,never()).save(any());
    }
    @Test void purchaseLanguageAndNegation() {
        assertThat(ChatService.isPurchaseRequest("t mua cuon nay")).isTrue();
        assertThat(ChatService.isPurchaseRequest("minh muon mua nha gia kim")).isTrue();
        assertThat(ChatService.isPurchaseRequest("chot cuon thu hai")).isTrue();
        assertThat(ChatService.isPurchaseRequest("minh khong mua cuon nay")).isFalse();
        assertThat(ChatService.isPurchaseRequest("mua cuon nay bao nhieu")).isFalse();
    }
    @Test void detailFailureRollsBackAndDoesNotMarkDraftConfirmed() {
        var q=service.quote(input);
        when(details.save(any())).thenThrow(new IllegalStateException("simulated failure"));
        assertThatThrownBy(() -> service.confirm(q.getToken())).isInstanceOf(IllegalStateException.class);
        assertThat(q.getOrderId()).isNull();
        verify(tx).rollback(any());
    }
}
