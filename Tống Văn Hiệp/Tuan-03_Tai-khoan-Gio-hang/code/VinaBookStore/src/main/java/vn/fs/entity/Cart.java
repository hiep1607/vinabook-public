/*
 * (C) Copyright 2022. All Rights Reserved.
 *
 * @author DongTHD
 * @date Mar 10, 2022
*/
package vn.fs.entity;

import java.io.Serializable;

import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.ManyToOne;
import javax.persistence.Table;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@SuppressWarnings("serial")
@Data
@AllArgsConstructor
@NoArgsConstructor
@Entity
@Table(name = "carts")
public class Cart implements Serializable {
	public Cart(Long cartId, Double amount, String address, String phone, User user) {
		this.cartId=cartId;this.Amount=amount;this.address=address;this.phone=phone;this.user=user;
	}

	@javax.persistence.Column(nullable = false, columnDefinition = "bigint default 0")
	private long syncRevision = 0;
	private String lastSyncRequest;
	@javax.persistence.ElementCollection(fetch = javax.persistence.FetchType.EAGER)
	@javax.persistence.CollectionTable(name = "cart_migration_keys", joinColumns = @JoinColumn(name = "cart_id"))
	@javax.persistence.Column(name = "client_key", length = 80)
	private java.util.Set<String> migrationKeys = new java.util.HashSet<>();

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long cartId;
	private Double Amount;
	private String address;
	private String phone;

	@ManyToOne
	@JoinColumn(name = "userId")
	private User user;

}
