package vn.fs.api;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import javax.servlet.http.HttpServletRequest;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import vn.fs.config.CurrentUserAccess;
import vn.fs.entity.Order;
import vn.fs.repository.OrderRepository;
import vn.fs.service.PaymentGatewayService;
import vn.fs.service.PaymentGatewayService.CallbackResult;

@CrossOrigin("*")
@RestController
@RequestMapping("api/payments")
public class PaymentApi {

	private final OrderRepository orderRepository;
	private final PaymentGatewayService payments;
	private final CurrentUserAccess access;

	public PaymentApi(OrderRepository orderRepository, PaymentGatewayService payments, CurrentUserAccess access) {
		this.orderRepository = orderRepository;
		this.payments = payments;
		this.access = access;
	}

	@GetMapping("methods")
	public ResponseEntity<Map<String, Object>> methods() {
		return ResponseEntity.ok(payments.availableMethods());
	}

	@PostMapping("orders/{orderId}/start")
	public ResponseEntity<?> start(@PathVariable Long orderId, HttpServletRequest request) {
		Optional<Order> found = orderRepository.findById(orderId);
		if (!found.isPresent()) {
			return ResponseEntity.notFound().build();
		}
		Order order = found.get();
		if (order.getUser() == null || !access.ownsUserId(order.getUser().getUserId())) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
		}
		try {
			String forwarded = request.getHeader("X-Forwarded-For");
			String ip = forwarded == null || forwarded.isEmpty() ? request.getRemoteAddr() : forwarded;
			return ResponseEntity.ok(payments.start(order, ip));
		} catch (IllegalArgumentException ex) {
			return error(HttpStatus.BAD_REQUEST, ex.getMessage());
		} catch (IllegalStateException ex) {
			return error(HttpStatus.CONFLICT, ex.getMessage());
		}
	}

	@GetMapping("orders/{orderId}/status")
	public ResponseEntity<?> status(@PathVariable Long orderId) {
		Optional<Order> found = orderRepository.findById(orderId);
		if (!found.isPresent()) {
			return ResponseEntity.notFound().build();
		}
		Order order = found.get();
		if (order.getUser() == null || !access.canAccessUserId(order.getUser().getUserId())) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
		}
		return ResponseEntity.ok(payments.orderStatus(order));
	}

	@PutMapping("orders/{orderId}/mark-paid")
	public ResponseEntity<?> markPaid(@PathVariable Long orderId) {
		Optional<Order> found = orderRepository.findById(orderId);
		if (!found.isPresent()) {
			return ResponseEntity.notFound().build();
		}
		try {
			return ResponseEntity.ok(payments.markBankTransferPaid(found.get()));
		} catch (IllegalArgumentException ex) {
			return error(HttpStatus.BAD_REQUEST, ex.getMessage());
		}
	}

	@GetMapping("vnpay/ipn")
	public ResponseEntity<Map<String, String>> vnpayIpn(@RequestParam Map<String, String> params) {
		CallbackResult result = payments.handleVnpay(params);
		Map<String, String> body = new LinkedHashMap<>();
		body.put("RspCode", result.getResponseCode());
		body.put("Message", result.getMessage());
		return ResponseEntity.ok(body);
	}

	@GetMapping("vnpay/return")
	public ResponseEntity<Void> vnpayReturn(@RequestParam Map<String, String> params) {
		return redirect(payments.frontendResultUrl(payments.handleVnpay(params), "VNPAY"));
	}

	@PostMapping("momo/ipn")
	public ResponseEntity<Void> momoIpn(@RequestBody Map<String, Object> params) {
		payments.handleMomo(params);
		return ResponseEntity.noContent().build();
	}

	@GetMapping("momo/return")
	public ResponseEntity<Void> momoReturn(@RequestParam Map<String, String> params) {
		return redirect(payments.frontendResultUrl(payments.handleMomo(params), "MOMO"));
	}

	private ResponseEntity<Map<String, String>> error(HttpStatus status, String message) {
		Map<String, String> body = new LinkedHashMap<>();
		body.put("message", message);
		return ResponseEntity.status(status).body(body);
	}

	private ResponseEntity<Void> redirect(String url) {
		HttpHeaders headers = new HttpHeaders();
		headers.setLocation(URI.create(url));
		return new ResponseEntity<>(headers, HttpStatus.FOUND);
	}
}
