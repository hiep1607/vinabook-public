package vn.fs.api;
import java.util.Map;
import javax.validation.Valid;
import javax.validation.constraints.AssertTrue;
import lombok.Data;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;
import vn.fs.service.OrderCancellationService;

@RestController @RequestMapping("/api/orders/me")
public class MyOrderActionsApi {
    private final OrderCancellationService service;
    public MyOrderActionsApi(OrderCancellationService service){this.service=service;}
    @PostMapping("/{id}/cancel") public Map<String,Object> cancel(@PathVariable Long id,@Valid @RequestBody Confirmation body){return service.cancel(id);}
    @Data public static class Confirmation { @AssertTrue private boolean confirmed; }
    @ExceptionHandler(ResponseStatusException.class) public ResponseEntity<?> failure(ResponseStatusException e){return ResponseEntity.status(e.getStatus()).body(Map.of("message",e.getReason()==null?"Không thể hủy đơn":e.getReason()));}
}
