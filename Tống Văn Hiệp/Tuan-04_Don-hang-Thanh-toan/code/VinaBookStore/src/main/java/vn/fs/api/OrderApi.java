/*
 * (C) Copyright 2022. All Rights Reserved.
 *
 * @author DongTHD
 * @date Mar 10, 2022
*/
package vn.fs.api;

import java.util.Date;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import vn.fs.entity.Cart;
import vn.fs.entity.CartDetail;
import vn.fs.entity.Order;
import vn.fs.entity.OrderDetail;
import vn.fs.entity.Product;
import vn.fs.repository.CartDetailRepository;
import vn.fs.repository.CartRepository;
import vn.fs.repository.OrderDetailRepository;
import vn.fs.repository.OrderRepository;
import vn.fs.repository.ProductRepository;
import vn.fs.repository.UserRepository;
import vn.fs.utils.SendMailUtil;
import vn.fs.config.CurrentUserAccess;

@CrossOrigin("*")
@RestController
@RequestMapping("api/orders")
public class OrderApi {
	@Autowired vn.fs.service.OrderCancellationService cancellation;
	@Autowired vn.fs.service.ChatCheckoutService checkoutService;
	@Autowired vn.fs.service.CartSyncService cartSync;
	@Autowired javax.validation.Validator validator;
	@javax.persistence.PersistenceContext javax.persistence.EntityManager em;

	@Autowired
	OrderRepository orderRepository;

	@Autowired
	OrderDetailRepository orderDetailRepository;

	@Autowired
	UserRepository userRepository;

	@Autowired
	CartRepository cartRepository;

	@Autowired
	CartDetailRepository cartDetailRepository;

	@Autowired
	ProductRepository productRepository;

	@Autowired
	SendMailUtil senMail;

	@Autowired
	CurrentUserAccess access;

	@GetMapping
	public ResponseEntity<List<Order>> findAll() {
		return ResponseEntity.ok(orderRepository.findAllByOrderByOrdersIdDesc());
	}

	@GetMapping("{id}")
	public ResponseEntity<Order> getById(@PathVariable("id") Long id) {
		if (!orderRepository.existsById(id)) {
			return ResponseEntity.notFound().build();
		}
		return ResponseEntity.ok(orderRepository.findById(id).get());
	}

	@GetMapping("/user/{email}")
	public ResponseEntity<List<Order>> getByUser(@PathVariable("email") String email) {
		if (!access.canAccessEmail(email)) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
		}
		if (!userRepository.existsByEmail(email)) {
			return ResponseEntity.notFound().build();
		}
		return ResponseEntity
				.ok(orderRepository.findByUserOrderByOrdersIdDesc(userRepository.findByEmail(email).get()));
	}

	@PostMapping("/{email}")
	public ResponseEntity<Order> checkout(@PathVariable("email") String email, @RequestBody Cart cart,
			@RequestParam(value = "paymentMethod", defaultValue = "COD") String paymentMethod) {
		if (!access.ownsEmail(email)) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
		}
		if (!userRepository.existsByEmail(email)) {
			return ResponseEntity.notFound().build();
		}
		if (!cartRepository.existsById(cart.getCartId())) {
			return ResponseEntity.notFound().build();
		}
		Cart storedCart = cartRepository.findById(cart.getCartId()).get();
		if (storedCart.getUser() == null || !access.ownsUserId(storedCart.getUser().getUserId())) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
		}
        vn.fs.service.CartSyncService.Snapshot snapshot = cartSync.get();
        vn.fs.service.ChatCheckoutService.Input input = new vn.fs.service.ChatCheckoutService.Input();
        input.setItems(snapshot.items().stream().map(item -> {
            vn.fs.service.CartSyncService.Line line = new vn.fs.service.CartSyncService.Line();
            line.setProductId(item.id()); line.setQuantity(item.quantity()); return line;
        }).collect(java.util.stream.Collectors.toList()));
        input.setRecipient(storedCart.getUser().getName());
        input.setStreet(storedCart.getAddress()); input.setPhone(storedCart.getPhone());
        input.setPaymentMethod(normalizePaymentMethod(paymentMethod));
        input.setFromCart(true); input.setCartRevision(snapshot.revision());
        if (!validator.validate(input).isEmpty() || input.getItems().isEmpty()) return ResponseEntity.badRequest().build();
        // Compatibility endpoint shares price, inventory and cart transaction with the storefront.
        String token = checkoutService.quote(input).getToken();
        Long id = checkoutService.confirm(token).get("orderId");
        return ResponseEntity.ok(orderRepository.findById(id).orElseThrow());
	}

	@PutMapping("cancel/{orderId}")
	public ResponseEntity<Void> cancel(@PathVariable("orderId") Long id) {
		cancellation.cancelAsAdmin(id);
		return ResponseEntity.ok().build();
	}

	@PutMapping("deliver/{orderId}")
	@org.springframework.transaction.annotation.Transactional
	public ResponseEntity<Void> deliver(@PathVariable("orderId") Long id) {
		if (!orderRepository.existsById(id)) {
			return ResponseEntity.notFound().build();
		}
		Order order = em.find(Order.class,id,javax.persistence.LockModeType.PESSIMISTIC_WRITE);
		if(order.getStatus()==2 || order.getStatus()==3)return ResponseEntity.status(HttpStatus.CONFLICT).build();
		if (!"COD".equals(paymentMethod(order)) && !"PAID".equals(paymentStatus(order))) {
			return ResponseEntity.status(HttpStatus.CONFLICT).build();
		}
		order.setStatus(1);
		orderRepository.save(order);
		senMail.sendMailOrderDeliver(order);
		return ResponseEntity.ok().build();
	}

	@PutMapping("success/{orderId}")
	@org.springframework.transaction.annotation.Transactional
	public ResponseEntity<Void> success(@PathVariable("orderId") Long id) {
		if (!orderRepository.existsById(id)) {
			return ResponseEntity.notFound().build();
		}
		Order order = em.find(Order.class,id,javax.persistence.LockModeType.PESSIMISTIC_WRITE);
		if(order.getStatus()==2)return ResponseEntity.ok().build();
		if(order.getStatus()==3)return ResponseEntity.status(HttpStatus.CONFLICT).build();
		if (!"COD".equals(paymentMethod(order)) && !"PAID".equals(paymentStatus(order))) {
			return ResponseEntity.status(HttpStatus.CONFLICT).build();
		}
		order.setStatus(2);
		if ("COD".equals(paymentMethod(order))) {
			order.setPaymentStatus("PAID");
			order.setPaidAt(new Date());
		}
		orderRepository.save(order);
		senMail.sendMailOrderSuccess(order);
		updateProduct(order);
		return ResponseEntity.ok().build();
	}

	private String normalizePaymentMethod(String value) {
		if (value == null) {
			return "COD";
		}
		String normalized = value.trim().toUpperCase();
		return normalized.matches("COD|BANK_QR|VNPAY|MOMO") ? normalized : null;
	}

	private String paymentMethod(Order order) {
		return order.getPaymentMethod() == null ? "COD" : order.getPaymentMethod();
	}

	private String paymentStatus(Order order) {
		return order.getPaymentStatus() == null ? "UNPAID" : order.getPaymentStatus();
	}

	public void updateProduct(Order order) {
		List<OrderDetail> listOrderDetail = orderDetailRepository.findByOrder(order);
		listOrderDetail.sort(java.util.Comparator.comparing(d -> d.getProduct().getProductId()));
		for (OrderDetail orderDetail : listOrderDetail) {
			Product product = em.find(Product.class, orderDetail.getProduct().getProductId(), javax.persistence.LockModeType.PESSIMISTIC_WRITE);
			if (product != null) {
				if(!order.isStockReserved())product.setQuantity(product.getQuantity() - orderDetail.getQuantity());
				product.setSold(product.getSold() + orderDetail.getQuantity());
				productRepository.save(product);
			}
		}
	}

}
