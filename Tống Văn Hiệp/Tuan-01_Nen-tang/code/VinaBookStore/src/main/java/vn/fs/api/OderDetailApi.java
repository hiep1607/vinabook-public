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
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import vn.fs.entity.OrderDetail;
import vn.fs.repository.OrderDetailRepository;
import vn.fs.repository.OrderRepository;
import vn.fs.entity.Order;
import vn.fs.config.CurrentUserAccess;

@CrossOrigin("*")
@RestController
@RequestMapping("api/orderDetail")
public class OderDetailApi {

	@Autowired
	OrderDetailRepository orderDetailRepository;

	@Autowired
	OrderRepository orderRepository;

	@Autowired
	CurrentUserAccess access;

	@GetMapping("/order/{id}")
	public ResponseEntity<List<OrderDetail>> getByOrder(@PathVariable("id") Long id) {
		if (!orderRepository.existsById(id)) {
			return ResponseEntity.notFound().build();
		}
		Order order = orderRepository.findById(id).get();
		if (order.getUser() == null || !access.canAccessUserId(order.getUser().getUserId())) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
		}
		return ResponseEntity.ok(orderDetailRepository.findByOrder(order));
	}

}
