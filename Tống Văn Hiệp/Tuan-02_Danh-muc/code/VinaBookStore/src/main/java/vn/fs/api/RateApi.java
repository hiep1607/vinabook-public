/*
 * (C) Copyright 2022. All Rights Reserved.
 *
 * @author DongTHD
 * @date Mar 10, 2022
*/
package vn.fs.api;

import java.util.List;
import java.util.Date;

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
import org.springframework.web.bind.annotation.RestController;

import vn.fs.entity.Rate;
import vn.fs.repository.OrderDetailRepository;
import vn.fs.repository.ProductRepository;
import vn.fs.repository.RateRepository;
import vn.fs.repository.UserRepository;
import vn.fs.config.CurrentUserAccess;

@CrossOrigin("*")
@RestController
@RequestMapping("api/rates")
public class RateApi {

	@Autowired
	RateRepository rateRepository;

	@Autowired
	UserRepository userRepository;

	@Autowired
	OrderDetailRepository orderDetailRepository;

	@Autowired
	ProductRepository productRepository;

	@Autowired
	CurrentUserAccess access;

	@GetMapping
	public ResponseEntity<List<Rate>> findAll() {
		return ResponseEntity.ok(rateRepository.findAllByOrderByIdDesc());
	}

	@GetMapping("{orderDetailId}")
	public ResponseEntity<Rate> findById(@PathVariable Long orderDetailId) {
		if (!orderDetailRepository.existsById(orderDetailId)) {
			return ResponseEntity.notFound().build();
		}
		return ResponseEntity.ok(rateRepository.findByOrderDetail(orderDetailRepository.findById(orderDetailId).get()));
	}

	@GetMapping("/product/{id}")
	public ResponseEntity<List<Rate>> findByProduct(@PathVariable("id") Long id) {
		if (!productRepository.existsById(id)) {
			return ResponseEntity.notFound().build();
		}
		return ResponseEntity.ok(rateRepository.findByProductOrderByIdDesc(productRepository.findById(id).get()));
	}

	@PostMapping
	public ResponseEntity<Rate> post(@RequestBody Rate rate) {
		if (!userRepository.existsById(rate.getUser().getUserId())) {
			return ResponseEntity.notFound().build();
		}
		if (!productRepository.existsById(rate.getProduct().getProductId())) {
			return ResponseEntity.notFound().build();
		}
		if (!access.ownsUserId(rate.getUser().getUserId())) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
		}
		if (!validRating(rate)) {
			return ResponseEntity.badRequest().build();
		}
		// orderDetail là tùy chọn — storefront cho phép đánh giá không cần mua hàng
		if (rate.getOrderDetail() != null
				&& !orderDetailRepository.existsById(rate.getOrderDetail().getOrderDetailId())) {
			return ResponseEntity.notFound().build();
		}
		rate.setUser(userRepository.findById(rate.getUser().getUserId()).get());
		rate.setProduct(productRepository.findById(rate.getProduct().getProductId()).get());
		rate.setRateDate(new Date());
		return ResponseEntity.ok(rateRepository.save(rate));
	}

	@PutMapping
	public ResponseEntity<Rate> put(@RequestBody Rate rate) {
		if (!rateRepository.existsById(rate.getId())) {
			return ResponseEntity.notFound().build();
		}
		Rate stored = rateRepository.findById(rate.getId()).get();
		if (stored.getUser() == null || !access.ownsUserId(stored.getUser().getUserId())) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
		}
		if (!validRating(rate)) {
			return ResponseEntity.badRequest().build();
		}
		stored.setRating(rate.getRating());
		stored.setComment(rate.getComment().trim());
		stored.setRateDate(new Date());
		return ResponseEntity.ok(rateRepository.save(stored));
	}

	@DeleteMapping("{id}")
	public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
		if (!rateRepository.existsById(id)) {
			return ResponseEntity.notFound().build();
		}
		rateRepository.deleteById(id);
		return ResponseEntity.ok().build();
	}

	private boolean validRating(Rate rate) {
		return rate.getRating() != null && rate.getRating() >= 1 && rate.getRating() <= 5
				&& rate.getComment() != null && !rate.getComment().trim().isEmpty()
				&& rate.getComment().trim().length() <= 2000;
	}

}
