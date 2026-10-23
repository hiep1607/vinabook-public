package vn.fs.service;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.*;
import javax.persistence.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import vn.fs.config.CurrentUserAccess;
import vn.fs.entity.*;
import vn.fs.repository.*;

class OrderCancellationServiceTest {
    CurrentUserAccess access=mock(CurrentUserAccess.class);UserRepository users=mock(UserRepository.class);
    OrderRepository orders=mock(OrderRepository.class);OrderDetailRepository details=mock(OrderDetailRepository.class);
    EntityManager em=mock(EntityManager.class);OrderCancellationService service;
    Order order;Product product;
    @BeforeEach void setup(){
        service=new OrderCancellationService(access,users,orders,details,em);
        User user=new User();user.setEmail("buyer@test.invalid");when(access.currentEmail()).thenReturn(user.getEmail());
        when(users.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
        order=new Order();order.setOrdersId(7L);order.setUser(user);order.setPaymentMethod("COD");order.setPaymentStatus("UNPAID");
        when(orders.findById(7L)).thenReturn(Optional.of(order));when(orders.findByUserOrderByOrdersIdDesc(user)).thenReturn(List.of(order));
        when(em.find(Order.class,7L,LockModeType.PESSIMISTIC_WRITE)).thenReturn(order);
        product=new Product();product.setProductId(1L);product.setQuantity(8);
        when(em.find(Product.class,1L,LockModeType.PESSIMISTIC_WRITE)).thenReturn(product);
        when(details.findByOrder(order)).thenReturn(List.of(new OrderDetail(1L,2,100000D,product,order)));
    }
    @Test void previewNeverMutatesAndCanResolveLatest(){assertThat(service.preview(null)).isEqualTo(7L);assertThat(order.getStatus()).isZero();verify(orders,never()).save(order);}
    @Test void cancelRestoresReservationExactlyOnce(){order.setStockReserved(true);service.cancel(7L);service.cancel(7L);assertThat(order.getStatus()).isEqualTo(3);assertThat(product.getQuantity()).isEqualTo(10);verify(orders,times(1)).save(order);}
    @Test void legacyOrderWithoutReservationDoesNotInventStock(){service.cancel(7L);assertThat(product.getQuantity()).isEqualTo(8);}
    @Test void cannotCancelAnotherAccount(){when(access.currentEmail()).thenReturn("other@test.invalid");assertThatThrownBy(()->service.cancel(7L)).isInstanceOf(ResponseStatusException.class);assertThat(order.getStatus()).isZero();}
    @Test void deliveredAndPaidOrdersCannotCancel(){order.setStatus(1);assertThatThrownBy(()->service.cancel(7L)).isInstanceOf(ResponseStatusException.class);order.setStatus(0);order.setPaymentStatus("PAID");assertThatThrownBy(()->service.cancel(7L)).isInstanceOf(ResponseStatusException.class);}
    @Test void pendingOnlinePaymentRequiresManualResolution(){order.setPaymentMethod("VNPAY");order.setPaymentStatus("PENDING");assertThatThrownBy(()->service.cancel(7L)).isInstanceOf(ResponseStatusException.class);}
    @Test void adminPathRequiresAdminAndRestoresStock(){assertThatThrownBy(()->service.cancelAsAdmin(7L)).isInstanceOf(ResponseStatusException.class);when(access.isAdmin()).thenReturn(true);order.setStockReserved(true);service.cancelAsAdmin(7L);assertThat(product.getQuantity()).isEqualTo(10);}
}
