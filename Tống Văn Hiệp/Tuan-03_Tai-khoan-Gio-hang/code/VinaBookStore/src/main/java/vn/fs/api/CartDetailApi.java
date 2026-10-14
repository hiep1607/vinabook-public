/*
 * (C) Copyright 2022. All Rights Reserved.
 *
 * @author DongTHD
 * @date Mar 10, 2022
*/
package vn.fs.api;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

import vn.fs.entity.CartDetail;
import vn.fs.entity.Product;
import vn.fs.repository.CartDetailRepository;
import vn.fs.repository.CartRepository;
import vn.fs.repository.ProductRepository;
import vn.fs.config.CurrentUserAccess;
import vn.fs.entity.Cart;

@CrossOrigin("*")
@RestController
@RequestMapping("api/cartDetail")
public class CartDetailApi {
	@javax.persistence.PersistenceContext javax.persistence.EntityManager em;

	@Autowired
	CartDetailRepository cartDetailRepository;

	@Autowired
	CartRepository cartRepository;

	@Autowired
	ProductRepository productRepository;

	@Autowired
	CurrentUserAccess access;

	@GetMapping("cart/{id}")
	public ResponseEntity<List<CartDetail>> getByCartId(@PathVariable("id") Long id) {
		if (!cartRepository.existsById(id)) {
			return ResponseEntity.notFound().build();
		}
		Cart cart = cartRepository.findById(id).get();
		if (cart.getUser() == null || !access.ownsUserId(cart.getUser().getUserId())) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
		}
		return ResponseEntity.ok(cartDetailRepository.findByCart(cart));
	}

	@RequestMapping(value = "{id}", method = RequestMethod.GET)
	public ResponseEntity<CartDetail> getOne(@PathVariable("id") Long id) {
		if (!cartDetailRepository.existsById(id)) {
			return ResponseEntity.notFound().build();
		}
		CartDetail stored = cartDetailRepository.findById(id).get();
		if (!owns(stored)) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
		}
		return ResponseEntity.ok(stored);
	}

	@PostMapping()
	@org.springframework.transaction.annotation.Transactional
	public ResponseEntity<CartDetail> post(@RequestBody CartDetail detail) {
		if (!cartRepository.existsById(detail.getCart().getCartId())) {
			return ResponseEntity.notFound().build();
		}
		Cart cart = cartRepository.findById(detail.getCart().getCartId()).get();
		if (cart.getUser() == null || !access.ownsUserId(cart.getUser().getUserId())) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
		}
		em.lock(cart, javax.persistence.LockModeType.PESSIMISTIC_WRITE);
		Product product = productRepository.findByProductIdAndStatusTrue(detail.getProduct().getProductId());
		if (product == null || detail.getQuantity() <= 0 || detail.getQuantity() > product.getQuantity()) {
			return ResponseEntity.notFound().build();
		}
		List<CartDetail> listD = cartDetailRepository.findByCart(cart);
		for (CartDetail item : listD) {
			if (item.getProduct().getProductId().equals(product.getProductId())) {
				int quantity = item.getQuantity() + detail.getQuantity();
				if (quantity > product.getQuantity()) {
					return ResponseEntity.badRequest().build();
				}
				bump(cart);
				item.setQuantity(quantity);
				item.setPrice(lineTotal(product, quantity));
				return ResponseEntity.ok(cartDetailRepository.save(item));
			}
		}
		bump(cart);
		detail.setCartDetailId(null);
		detail.setCart(cart);
		detail.setProduct(product);
		detail.setPrice(lineTotal(product, detail.getQuantity()));
		return ResponseEntity.ok(cartDetailRepository.save(detail));
	}

	@PutMapping()
	@org.springframework.transaction.annotation.Transactional
	public ResponseEntity<CartDetail> put(@RequestBody CartDetail detail) {
		if (detail.getCartDetailId() == null || !cartDetailRepository.existsById(detail.getCartDetailId())) {
			return ResponseEntity.notFound().build();
		}
		CartDetail stored = cartDetailRepository.findById(detail.getCartDetailId()).get();
		if (!owns(stored)) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
		}
		em.lock(stored.getCart(), javax.persistence.LockModeType.PESSIMISTIC_WRITE);
		em.refresh(stored);
		int quantity = detail.getQuantity();
		if (quantity <= 0 || quantity > stored.getProduct().getQuantity()) {
			return ResponseEntity.badRequest().build();
		}
		bump(stored.getCart());
		stored.setQuantity(quantity);
		stored.setPrice(lineTotal(stored.getProduct(), quantity));
		return ResponseEntity.ok(cartDetailRepository.save(stored));
	}

	@DeleteMapping("{id}")
	@org.springframework.transaction.annotation.Transactional
	public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
		if (!cartDetailRepository.existsById(id)) {
			return ResponseEntity.notFound().build();
		}
		CartDetail stored = cartDetailRepository.findById(id).get();
		if (!owns(stored)) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
		}
		em.lock(stored.getCart(), javax.persistence.LockModeType.PESSIMISTIC_WRITE);
		bump(stored.getCart());
		cartDetailRepository.deleteById(id);
		return ResponseEntity.ok().build();
	}

	private void bump(Cart cart) { cart.setSyncRevision(cart.getSyncRevision() + 1); cartRepository.save(cart); }

	private boolean owns(CartDetail detail) {
		return detail.getCart() != null && detail.getCart().getUser() != null
				&& access.ownsUserId(detail.getCart().getUser().getUserId());
	}

	private Double lineTotal(Product product, int quantity) {
		double unit = Math.round(product.getPrice() * (100 - product.getDiscount()) / 100);
		return unit * quantity;
	}

}
