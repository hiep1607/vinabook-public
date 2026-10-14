package vn.fs.api;
import java.util.Map;
import javax.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;
import vn.fs.service.CartSyncService;

@RestController @RequestMapping("/api/cart/me")
public class CartSyncApi {
    private final CartSyncService carts;
    public CartSyncApi(CartSyncService carts){this.carts=carts;}
    @GetMapping public CartSyncService.Snapshot get(){return carts.get();}
    @PutMapping public CartSyncService.Snapshot replace(@Valid @RequestBody CartSyncService.Update input){return carts.replace(input);}
    @PostMapping("/migrate") public CartSyncService.Snapshot migrate(@Valid @RequestBody CartSyncService.Migration input){return carts.migrate(input);}
    @ExceptionHandler(ResponseStatusException.class) public ResponseEntity<?> failure(ResponseStatusException e){
        return ResponseEntity.status(e.getStatus()).body(Map.of("message",e.getReason()==null?"Không thể cập nhật giỏ":e.getReason()));
    }
}
