package vn.fs.api;
import javax.validation.Valid;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.*;
import vn.fs.service.ChatCheckoutService;

@CrossOrigin("*") @RestController @RequestMapping("/api/chat/checkout")
public class ChatCheckoutApi {
    private final ChatCheckoutService checkout;
    public ChatCheckoutApi(ChatCheckoutService checkout) { this.checkout=checkout; }
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String,String>> failure(ResponseStatusException error) {
        return ResponseEntity.status(error.getStatus()).body(Map.of("message",
            error.getReason()==null ? "Không thể xử lý bản nháp. Vui lòng kiểm tra lại." : error.getReason()));
    }
    @PostMapping("/quote") public ChatCheckoutService.Draft quote(@Valid @RequestBody ChatCheckoutService.Input input) {
        return checkout.quote(input);
    }
    @PostMapping("/{token}/confirm") public Map<String,Long> confirm(@PathVariable String token) {
        return checkout.confirm(token);
    }
    @DeleteMapping("/{token}") public void cancel(@PathVariable String token){checkout.cancelDraft(token);}
}
