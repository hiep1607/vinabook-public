package vn.fs.service;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import java.util.*;
import javax.persistence.EntityManager;
import org.junit.jupiter.api.*;
import org.springframework.web.server.ResponseStatusException;
import vn.fs.config.CurrentUserAccess;
import vn.fs.entity.*;
import vn.fs.repository.*;

class CartSyncServiceTest {
    CurrentUserAccess access=mock(CurrentUserAccess.class);UserRepository users=mock(UserRepository.class);
    CartRepository carts=mock(CartRepository.class);CartDetailRepository details=mock(CartDetailRepository.class);
    ProductRepository products=mock(ProductRepository.class);EntityManager em=mock(EntityManager.class);
    CartSyncService service;Cart cart;Product product;List<CartDetail> stored;
    @BeforeEach void setup(){
        User user=new User();user.setEmail("buyer@test.invalid");when(access.currentEmail()).thenReturn(user.getEmail());when(users.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
        cart=new Cart();cart.setCartId(1L);cart.setUser(user);when(carts.findByUser(user)).thenReturn(cart);
        product=new Product();product.setProductId(5L);product.setName("Sách thử");product.setPrice(100000D);product.setDiscount(20);product.setQuantity(10);product.setStatus(true);
        when(products.findById(5L)).thenReturn(Optional.of(product));when(products.findByProductIdAndStatusTrue(5L)).thenReturn(product);
        stored=new ArrayList<>();when(details.findByCart(cart)).thenAnswer(i->new ArrayList<>(stored));
        doAnswer(i->{stored.clear();return null;}).when(details).deleteAll(anyIterable());
        doAnswer(i->{stored.remove(i.getArgument(0));return null;}).when(details).delete(any());
        when(details.save(any())).thenAnswer(i->{stored.add(i.getArgument(0));return i.getArgument(0);});
        service=new CartSyncService(access,users,carts,details,products,new ChatRetrievalService(new ChatIntentService()),em);
    }
    CartSyncService.Line line(int n){var l=new CartSyncService.Line();l.setProductId(5L);l.setQuantity(n);return l;}
    CartSyncService.Update update(long revision,int count){var u=new CartSyncService.Update();u.setRevision(revision);u.setRequestId(UUID.randomUUID().toString());u.setItems(count==0?List.of():List.of(line(count)));return u;}
    @Test void serverPricesAndRevisionAreAuthoritative(){var s=service.replace(update(0,2));assertThat(s.subtotal()).isEqualTo(160000);assertThat(s.revision()).isEqualTo(1);}
    @Test void staleWriterCannotOverwriteAnotherDevice(){service.replace(update(0,2));assertThatThrownBy(()->service.replace(update(0,3))).isInstanceOf(ResponseStatusException.class);assertThat(service.get().items().get(0).quantity()).isEqualTo(2);}
    @Test void retryIsIdempotent(){var u=update(0,2);service.replace(u);service.replace(u);assertThat(cart.getSyncRevision()).isEqualTo(1);}
    @Test void localMigrationCannotResurrectClearedCart(){var m=new CartSyncService.Migration();m.setClientKey("client-123456");m.setItems(List.of(line(2)));service.migrate(m);service.replace(update(1,0));assertThat(service.migrate(m).items()).isEmpty();}
    @Test void migrationUsesMaxInsteadOfDoublingPreviouslyPushedItems(){service.replace(update(0,2));var m=new CartSyncService.Migration();m.setClientKey("client-123456");m.setItems(List.of(line(2)));assertThat(service.migrate(m).items().get(0).quantity()).isEqualTo(2);}
    @Test void consumeChecksRevisionAndKeepsOtherLines(){service.replace(update(0,2));assertThatThrownBy(()->service.consume(List.of(new ChatCheckoutService.QuoteLine(5L,"Sách",2,80000)),0)).isInstanceOf(ResponseStatusException.class);service.consume(List.of(new ChatCheckoutService.QuoteLine(5L,"Sách",2,80000)),1);assertThat(service.get().items()).isEmpty();}
    @Test void oversizedQuantityAndUnauthenticatedWritesFail(){assertThatThrownBy(()->service.replace(update(0,11))).isInstanceOf(ResponseStatusException.class);when(access.currentEmail()).thenReturn(null);assertThatThrownBy(()->service.get()).isInstanceOf(ResponseStatusException.class);}
}
