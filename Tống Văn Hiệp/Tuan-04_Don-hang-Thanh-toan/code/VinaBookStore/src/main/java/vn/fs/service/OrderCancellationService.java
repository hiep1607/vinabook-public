package vn.fs.service;

import java.util.*;
import javax.persistence.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import vn.fs.config.CurrentUserAccess;
import vn.fs.entity.*;
import vn.fs.repository.*;

@Service
public class OrderCancellationService {
    private final CurrentUserAccess access;
    private final UserRepository users;
    private final OrderRepository orders;
    private final OrderDetailRepository details;
    private final EntityManager em;
    public OrderCancellationService(CurrentUserAccess access,UserRepository users,OrderRepository orders,OrderDetailRepository details,EntityManager em){
        this.access=access;this.users=users;this.orders=orders;this.details=details;this.em=em;
    }
    private Order owned(Long id,boolean lock) {
        String email=access.currentEmail();
        if(email==null)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Bạn cần đăng nhập để hủy đơn hàng.");
        if(id==null){
            User u=users.findByEmail(email).orElseThrow(()->new ResponseStatusException(HttpStatus.UNAUTHORIZED));
            id=orders.findByUserOrderByOrdersIdDesc(u).stream().findFirst().map(Order::getOrdersId).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Bạn chưa có đơn hàng nào."));
        }
        Order order=lock?em.find(Order.class,id,LockModeType.PESSIMISTIC_WRITE):orders.findById(id).orElse(null);
        if(order==null || order.getUser()==null || !email.equals(order.getUser().getEmail()))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Không tìm thấy đơn này trong tài khoản của bạn.");
        return order;
    }
    private void eligible(Order order) {
        if(order.getStatus()!=0)throw new ResponseStatusException(HttpStatus.CONFLICT,"Chỉ có thể hủy đơn đang chờ xử lý. Đơn đang giao hoặc hoàn thành cần liên hệ cửa hàng.");
        if("PAID".equals(order.getPaymentStatus()) || (order.getPaymentMethod()!=null && !"COD".equals(order.getPaymentMethod())))
            throw new ResponseStatusException(HttpStatus.CONFLICT,"Đơn thanh toán trực tuyến hoặc đã thanh toán cần cửa hàng kiểm tra giao dịch và hoàn tiền. Mình chưa hủy đơn này.");
    }
    // Expected validation failures become chat replies; do not poison the enclosing read transaction.
    @Transactional(readOnly=true, noRollbackFor=ResponseStatusException.class)
    public Long preview(Long id){Order order=owned(id,false);eligible(order);return order.getOrdersId();}
    @Transactional public Map<String,Object> cancel(Long id) {
        return cancelOwned(owned(id,true));
    }
    @Transactional public Map<String,Object> cancelAsAdmin(Long id) {
        if(!access.isAdmin())throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        Order order=em.find(Order.class,id,LockModeType.PESSIMISTIC_WRITE);
        if(order==null)throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return cancelOwned(order);
    }
    private Map<String,Object> cancelOwned(Order order) {
        if(order.getStatus()==3)return Map.of("orderId",order.getOrdersId(),"status","CANCELLED");
        eligible(order);
        if(order.isStockReserved()) {
            List<OrderDetail> lines=new ArrayList<>(details.findByOrder(order));
            lines.sort(Comparator.comparing(d->d.getProduct().getProductId()));
            for(OrderDetail line:lines){
                Product p=em.find(Product.class,line.getProduct().getProductId(),LockModeType.PESSIMISTIC_WRITE);
                if(p!=null)p.setQuantity(p.getQuantity()+line.getQuantity());
            }
            order.setStockReserved(false);
        }
        order.setStatus(3);orders.save(order);
        return Map.of("orderId",order.getOrdersId(),"status","CANCELLED");
    }
}
