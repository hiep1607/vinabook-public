package vn.fs.service;

import java.util.*;
import javax.persistence.EntityManager;
import javax.persistence.LockModeType;
import javax.validation.constraints.*;
import lombok.Data;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import vn.fs.config.CurrentUserAccess;
import vn.fs.entity.*;
import vn.fs.repository.*;

/** Short-lived, owner-bound quotes. No order is written until explicit confirmation. */
@Service
public class ChatCheckoutService {
    private final CurrentUserAccess access;
    private final ProductRepository products;
    private final UserRepository users;
    private final OrderRepository orders;
    private final OrderDetailRepository details;
    private final ChatRetrievalService pricing;
    private final EntityManager em;
    private final TransactionTemplate tx;
    private final Map<String, Draft> drafts = new HashMap<>();
    private CartSyncService carts;
    @org.springframework.beans.factory.annotation.Autowired public void setCarts(CartSyncService value){carts=value;}
    public ChatCheckoutService(CurrentUserAccess access, ProductRepository products, UserRepository users,
            OrderRepository orders, OrderDetailRepository details, ChatRetrievalService pricing,
            EntityManager em, PlatformTransactionManager transactions) {
        this.access=access; this.products=products; this.users=users; this.orders=orders;
        this.details=details; this.pricing=pricing; this.em=em; this.tx=new TransactionTemplate(transactions);
    }
    private String owner() {
        String email=access.currentEmail();
        if(email==null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Vui lòng đăng nhập");
        return email;
    }
    public synchronized Draft quote(Input input) {
        String email=owner();
        drafts.values().removeIf(d -> d.expiresAt < System.currentTimeMillis());
        if(drafts.size()>=2000) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Vui lòng thử lại sau");
        List<QuoteLine> lines=new ArrayList<>();
        List<CartSyncService.Line> requested=input.items;
        if(requested==null || requested.isEmpty()) {
            if(input.productId==null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Bạn chưa chọn sách.");
            CartSyncService.Line line=new CartSyncService.Line();line.setProductId(input.productId);line.setQuantity(input.quantity);requested=List.of(line);
        }
        Set<Long> seen=new HashSet<>();
        for(CartSyncService.Line item:requested) {
            if(!seen.add(item.getProductId()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Sách bị lặp trong đơn.");
            Product p=products.findById(item.getProductId()).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
            check(p,item.getQuantity());lines.add(new QuoteLine(p.getProductId(),p.getName(),item.getQuantity(),pricing.effectivePrice(p)));
        }
        // Only one unconfirmed draft per account. Edits invalidate the earlier quote.
        drafts.values().removeIf(d -> d.owner.equals(email) && d.orderId==null);
        Draft d=new Draft(); d.owner=email; d.token=UUID.randomUUID().toString();
        d.items=lines;d.productId=lines.get(0).productId();d.name=lines.get(0).name();d.quantity=lines.get(0).quantity();
        d.paymentMethod=input.paymentMethod;d.fromCart=input.fromCart;d.cartRevision=input.cartRevision;
        d.recipient=input.recipient.trim(); d.phone=input.phone.trim(); d.street=input.street.trim();
        d.unitPrice=lines.get(0).unitPrice();d.subtotal=lines.stream().mapToLong(i->i.unitPrice()*i.quantity()).sum();
        d.shipping=d.subtotal>0 && d.subtotal<300000 ? 20000 : 0; d.total=d.subtotal+d.shipping;
        d.expiresAt=System.currentTimeMillis()+15*60*1000;
        drafts.put(d.token,d); return d;
    }
    public synchronized Map<String,Long> confirm(String token) {
        String email=owner();
        Order existing=orders.findByPaymentReference("CHAT-"+token).orElse(null);
        if(existing!=null && existing.getUser()!=null && email.equals(existing.getUser().getEmail()))
            return Map.of("orderId",existing.getOrdersId());
        Draft d=drafts.get(token);
        if(d==null || !d.owner.equals(email) || d.expiresAt<System.currentTimeMillis())
            throw new ResponseStatusException(HttpStatus.GONE,"Bản nháp đã hết hạn. Vui lòng lập lại.");
        if(d.orderId!=null) return Map.of("orderId",d.orderId);
        Long id=tx.execute(status -> {
            if(d.fromCart)carts.consume(d.items,d.cartRevision);
            Map<Long,Product> locked=new LinkedHashMap<>();
            for(QuoteLine line:d.items.stream().sorted(Comparator.comparing(QuoteLine::productId)).toList()) {
                Product p=em.find(Product.class,line.productId(),LockModeType.PESSIMISTIC_WRITE);
                if(p==null)throw new ResponseStatusException(HttpStatus.NOT_FOUND);
                check(p,line.quantity());
                if(pricing.effectivePrice(p)!=line.unitPrice())throw new ResponseStatusException(HttpStatus.CONFLICT,"Giá đã thay đổi. Vui lòng xem lại bản nháp.");
                locked.put(line.productId(),p);
            }
            User user=users.findByEmail(email).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
            Order order=new Order(); order.setUser(user); order.setOrderDate(new Date());
            order.setAmount((double)d.total); order.setAddress(d.street+" (Người nhận: "+d.recipient+")");
            order.setPhone(d.phone); order.setStatus(0); order.setPaymentMethod(d.paymentMethod); order.setPaymentStatus("COD".equals(d.paymentMethod)?"UNPAID":"PENDING");
            order.setPaymentReference("CHAT-"+token);
            order.setStockReserved(true);
            Order saved=orders.save(order);
            for(QuoteLine line:d.items) {
                Product p=locked.get(line.productId());p.setQuantity(p.getQuantity()-line.quantity());
                details.save(new OrderDetail(0L,line.quantity(),(double)(line.unitPrice()*line.quantity()),p,saved));
            }
            return saved.getOrdersId();
        });
        d.orderId=id; return Map.of("orderId",id);
    }
    public synchronized void cancelDraft(String token) {
        String email=owner();Draft draft=drafts.get(token);
        if(draft==null)return;
        if(!draft.owner.equals(email))throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        if(draft.orderId!=null)throw new ResponseStatusException(HttpStatus.CONFLICT,"Đơn đã được tạo. Hãy dùng thao tác hủy đơn hàng.");
        drafts.remove(token);
    }
    private void check(Product p,int quantity) {
        if(!Boolean.TRUE.equals(p.getStatus()) || quantity<1 || quantity>99 || quantity>p.getQuantity())
            throw new ResponseStatusException(HttpStatus.CONFLICT,"Sách không còn đủ số lượng. Vui lòng chọn lại.");
    }
    @Data public static class Input {
        @Positive private Long productId;
        @javax.validation.Valid @Size(max=100) private List<CartSyncService.@NotNull Line> items;
        @NotBlank @Pattern(regexp="COD|BANK_QR|VNPAY|MOMO") private String paymentMethod="COD";
        private boolean fromCart;
        @Min(0) private long cartRevision;
        @Min(1) @Max(99) private int quantity=1;
        @NotBlank @Size(max=80) private String recipient;
        @NotBlank @Pattern(regexp="0[0-9]{9}") private String phone;
        @NotBlank @Size(max=160) private String street;
    }
    @Data public static class Draft {
        @com.fasterxml.jackson.annotation.JsonIgnore private String owner;
        private String token,name,recipient,phone,street;
        private Long productId,orderId;
        private int quantity;
        private long unitPrice,subtotal,shipping,total,expiresAt;
        private String paymentMethod="COD";
        private List<QuoteLine> items;
        @com.fasterxml.jackson.annotation.JsonIgnore private boolean fromCart;
        @com.fasterxml.jackson.annotation.JsonIgnore private long cartRevision;
    }
    public record QuoteLine(Long productId,String name,int quantity,long unitPrice) {}
}
