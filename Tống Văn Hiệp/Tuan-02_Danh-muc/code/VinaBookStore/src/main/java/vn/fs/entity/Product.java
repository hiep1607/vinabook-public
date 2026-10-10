/*
 * (C) Copyright 2022. All Rights Reserved.
 *
 * @author DongTHD
 * @date Mar 10, 2022
*/
package vn.fs.entity;

import java.io.Serializable;
import java.time.LocalDate;

import com.fasterxml.jackson.annotation.JsonIgnore;

import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.ManyToOne;
import javax.persistence.Table;
import javax.persistence.Column;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@SuppressWarnings("serial")
@Data
@AllArgsConstructor
@NoArgsConstructor
@Entity
@Table(name = "products")
public class Product implements Serializable {

	/** Backwards-compatible constructor used by existing services/tests. */
	public Product(Long productId, String name, String author, int quantity, Double price, int discount,
			String image, String description, LocalDate enteredDate, Boolean status, int sold, Category category) {
		this.productId = productId;
		this.name = name;
		this.author = author;
		this.quantity = quantity;
		this.price = price;
		this.discount = discount;
		this.image = image;
		this.description = description;
		this.enteredDate = enteredDate;
		this.status = status;
		this.sold = sold;
		this.category = category;
	}

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long productId;
	private String name;
	private String author;
	private int quantity;
	private Double price;
	private int discount;
	private String image;
	private String description;
	private LocalDate enteredDate;
	private Boolean status;
	private int sold;
	@JsonIgnore
	@Column(name = "preview_enabled", nullable = false)
	private Boolean previewEnabled = Boolean.FALSE;
	@JsonIgnore
	@Column(name = "preview_rights_confirmed", nullable = false)
	private Boolean previewRightsConfirmed = Boolean.FALSE;

	@ManyToOne
	@JoinColumn(name = "categoryId")
	private Category category;

	@Override
	public String toString() {
		return "Product [productId=" + productId + ", name=" + name + ", author=" + author + ", quantity=" + quantity + ", price=" + price
				+ ", discount=" + discount + ", image=" + image + ", description=" + description + ", enteredDate="
				+ enteredDate + ", status=" + status + ", sold=" + sold + ", category=" + category + "]";
	}

}
