package vn.fs.service;

import java.util.*;
import java.util.stream.Collectors;
import javax.persistence.*;
import javax.validation.Valid;
import javax.validation.constraints.*;
import lombok.Data;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import vn.fs.config.CurrentUserAccess;
import vn.fs.dto.chat.ChatRequestDto;
import vn.fs.entity.*;
import vn.fs.repository.*;

/** Account cart. Whole-cart replacements require a revision; migration is durable and idempotent. */
@Service
public class CartSyncService {
    private final CurrentUserAccess access;
    private final UserRepository users;
    private final CartRepository carts;
    private final CartDetailRepository details;
    private final ProductRepository products;
    private final ChatRetrievalService pricing;
    private final EntityManager em;
    public CartSyncService(CurrentUserAccess access, UserRepository users, CartRepository carts,
            CartDetailRepository details, ProductRepository products, ChatRetrievalService pricing, EntityManager em) {
        this.access=access;this.users=users;this.carts=carts;this.details=details;this.products=products;this.pricing=pricing;this.em=em;
    }
    private Cart owned() {
        String email=access.currentEmail();
        if(email==null)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Vui lòng đăng nhập");
        User user=users.findByEmail(email).orElseThrow(()->new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        // Serialize first-cart creation as well as writes for the same account.
        em.lock(user,LockModeType.PESSIMISTIC_WRITE);
        Cart cart=carts.findByUser(user);
        if(cart==null){cart=new Cart();cart.setUser(user);cart=carts.saveAndFlush(cart);}
        em.lock(cart,LockModeType.PESSIMISTIC_WRITE);
        return cart;
    }
    @Transactional public Snapshot get() { return snapshot(owned()); }
    @Transactional public Snapshot replace(Update input) {
        Cart cart=owned();
        if(input.requestId.equals(cart.getLastSyncRequest()))return snapshot(cart);
        if(input.revision!=cart.getSyncRevision())throw new ResponseStatusException(HttpStatus.CONFLICT,"Giỏ đã thay đổi ở nơi khác. Tải lại giỏ trước khi sửa tiếp.");
        Map<Long,Integer> wanted=validated(input.items);
        write(cart,wanted);cart.setLastSyncRequest(input.requestId);return snapshot(cart);
    }
    @Transactional public Snapshot migrate(Migration input) {
        Cart cart=owned();
        if(cart.getMigrationKeys().contains(input.clientKey))return snapshot(cart);
        Map<Long,Integer> wanted=new LinkedHashMap<>();
        for(CartDetail d:details.findByCart(cart))wanted.merge(d.getProduct().getProductId(),d.getQuantity(),Integer::sum);
        // Import a local quantity once; max avoids doubling a cart previously pushed at checkout.
        for(Line line:input.items) {
            Product p=products.findByProductIdAndStatusTrue(line.productId);
            if(p!=null && p.getQuantity()>0)wanted.merge(line.productId,Math.min(line.quantity,Math.min(99,p.getQuantity())),Math::max);
        }
        write(cart,wanted);cart.getMigrationKeys().add(input.clientKey);return snapshot(cart);
    }
    @Transactional(propagation=org.springframework.transaction.annotation.Propagation.REQUIRES_NEW) public List<ChatRequestDto.CartItem> chatItems() {
        return get().items.stream().map(i->{ChatRequestDto.CartItem item=new ChatRequestDto.CartItem();item.setProductId(i.id);item.setQuantity(i.quantity);return item;}).collect(Collectors.toList());
    }
    private Map<Long,Integer> validated(List<Line> lines) {
        Map<Long,Integer> wanted=new LinkedHashMap<>();
        for(Line line:lines) {
            if(wanted.putIfAbsent(line.productId,line.quantity)!=null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Sách bị lặp trong giỏ");
            Product p=products.findByProductIdAndStatusTrue(line.productId);
            if(p==null || line.quantity<1 || line.quantity>99 || p.getQuantity()<line.quantity)
                throw new ResponseStatusException(HttpStatus.CONFLICT,"Sách không còn đủ số lượng. Vui lòng kiểm tra lại giỏ.");
        }
        return wanted;
    }
    @Transactional public void consume(List<ChatCheckoutService.QuoteLine> lines,long revision) {
        Cart cart=owned();
        if(cart.getSyncRevision()!=revision)throw new ResponseStatusException(HttpStatus.CONFLICT,"Giỏ hàng đã thay đổi. Vui lòng xem lại trước khi đặt.");
        List<CartDetail> stored=details.findByCart(cart);
        for(var line:lines) {
            CartDetail item=stored.stream().filter(d->d.getProduct().getProductId().equals(line.productId())).findFirst().orElseThrow(()->new ResponseStatusException(HttpStatus.CONFLICT,"Sách không còn trong giỏ."));
            if(item.getQuantity()!=line.quantity())throw new ResponseStatusException(HttpStatus.CONFLICT,"Số lượng trong giỏ đã thay đổi.");
            details.delete(item);
        }
        details.flush();cart.setSyncRevision(cart.getSyncRevision()+1);carts.saveAndFlush(cart);
    }
    private void write(Cart cart,Map<Long,Integer> wanted) {
        details.deleteAll(details.findByCart(cart));details.flush();
        for(var entry:wanted.entrySet()) {
            Product p=products.findById(entry.getKey()).orElseThrow();
            details.save(new CartDetail(null,entry.getValue(),(double)(pricing.effectivePrice(p)*entry.getValue()),p,cart));
        }
        details.flush();cart.setSyncRevision(cart.getSyncRevision()+1);carts.saveAndFlush(cart);
    }
    private Snapshot snapshot(Cart cart) {
        List<Item> items=new ArrayList<>();long subtotal=0;
        for(CartDetail detail:details.findByCart(cart)) {
            Product p=detail.getProduct();long price=pricing.effectivePrice(p);int quantity=detail.getQuantity();
            items.add(new Item(p.getProductId(),p.getName(),p.getImage(),p.getAuthor(),price,quantity,
                Boolean.TRUE.equals(p.getStatus())?p.getQuantity():0));subtotal+=price*quantity;
        }
        return new Snapshot(cart.getSyncRevision(),items,subtotal);
    }
    public record Item(Long id,String name,String image,String author,long price,int quantity,int stock) {}
    public record Snapshot(long revision,List<Item> items,long subtotal) {}
    @Data public static class Line { @NotNull @Positive private Long productId; @Min(1) @Max(99) private int quantity; }
    @Data public static class Update {
        @Min(0) private long revision;
        @NotBlank @Size(max=80) private String requestId;
        @NotNull @Size(max=100) @Valid private List<@NotNull Line> items;
    }
    @Data public static class Migration {
        @NotBlank @Pattern(regexp="[a-zA-Z0-9-]{8,80}") private String clientKey;
        @NotNull @Size(max=100) @Valid private List<@NotNull Line> items;
    }
}
