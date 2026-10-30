package vn.fs.entity;

import java.io.Serializable;
import java.time.LocalDateTime;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.FetchType;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.ManyToOne;
import javax.persistence.PrePersist;
import javax.persistence.PreUpdate;
import javax.persistence.Table;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@SuppressWarnings("serial")
@Data
@AllArgsConstructor
@NoArgsConstructor
@Entity
@Table(name = "product_preview_pages")
public class ProductPreviewPage implements Serializable {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long previewPageId;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "product_id", nullable = false)
	private Product product;

	@Column(name = "page_order", nullable = false)
	private Integer pageOrder;

	@Column(name = "original_page_number")
	private Integer originalPageNumber;

	@Column(name = "image_url", nullable = false, length = 1000)
	private String imageUrl;

	@Column(length = 10)
	private String contentType;
	@Column(columnDefinition = "TEXT")
	private String textContent;
	@Column(length = 120)
	private String heading;
	@Column(length = 10)
	private String fontFamily;
	private Integer fontSize;
	@Column(length = 10)
	private String textAlign;

	@Column(nullable = false)
	private Boolean enabled = Boolean.TRUE;

	@Column(nullable = false, updatable = false)
	private LocalDateTime createdAt;

	@Column(nullable = false)
	private LocalDateTime updatedAt;

	@PrePersist
	void onCreate() {
		LocalDateTime now = LocalDateTime.now();
		createdAt = now;
		updatedAt = now;
		if (enabled == null) {
			enabled = Boolean.TRUE;
		}
	}

	@PreUpdate
	void onUpdate() {
		updatedAt = LocalDateTime.now();
	}
}
