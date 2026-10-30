package vn.fs.api;

import java.net.URI;
import java.util.HashSet;
import java.util.List;
import java.util.stream.Collectors;

import javax.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import vn.fs.dto.ProductPreviewDto;
import vn.fs.dto.ProductPreviewPageDto;
import vn.fs.dto.ProductPreviewPageRequest;
import vn.fs.dto.ProductPreviewSettingsRequest;
import vn.fs.entity.Product;
import vn.fs.entity.ProductPreviewPage;
import vn.fs.repository.ProductPreviewPageRepository;
import vn.fs.repository.ProductRepository;

@CrossOrigin("*")
@RestController
public class ProductPreviewApi {

	private static final int MIN_PAGES = 5;
	private static final int MAX_PAGES = 20;

	@Autowired
	private ProductRepository productRepository;

	@Autowired
	private ProductPreviewPageRepository previewRepository;

	@GetMapping("/api/products/{productId}/preview")
	@Transactional(readOnly = true)
	public ResponseEntity<ProductPreviewDto> getPublicPreview(@PathVariable Long productId) {
		Product product = productRepository.findByProductIdAndStatusTrue(productId);
		if (product == null) {
			return ResponseEntity.notFound().build();
		}
		List<ProductPreviewPage> pages = previewRepository.findByProductAndEnabledTrueOrderByPageOrderAsc(product);
		return ResponseEntity.ok(toDto(product, pages, false));
	}

	@GetMapping("/api/admin/products/{productId}/preview")
	@Transactional(readOnly = true)
	public ResponseEntity<ProductPreviewDto> getAdminPreview(@PathVariable Long productId) {
		Product product = productRepository.findById(productId).orElse(null);
		if (product == null) {
			return ResponseEntity.notFound().build();
		}
		return ResponseEntity.ok(toDto(product, previewRepository.findByProductOrderByPageOrderAsc(product), true));
	}

	@PostMapping("/api/admin/products/{productId}/preview/pages")
	@Transactional
	public ResponseEntity<?> addPage(@PathVariable Long productId,
			@Valid @RequestBody ProductPreviewPageRequest request) {
		Product product = productRepository.findById(productId).orElse(null);
		if (product == null) {
			return ResponseEntity.notFound().build();
		}
		List<ProductPreviewPage> current = previewRepository.findByProductOrderByPageOrderAsc(product);
		if (current.size() >= MAX_PAGES) {
			return ResponseEntity.badRequest().body("Bản đọc thử tối đa 20 trang");
		}
		if (current.stream().anyMatch(page -> page.getPageOrder().equals(request.getPageOrder()))) {
			return ResponseEntity.badRequest().body("Thứ tự trang đã tồn tại");
		}
		if (!"text".equals(request.getContentType()) && !isImageUrl(request.getImageUrl())) {
			return ResponseEntity.badRequest().body("Chỉ chấp nhận URL ảnh JPG, PNG hoặc WebP");
		}

		ProductPreviewPage page = new ProductPreviewPage();
		page.setProduct(product);
		applyContent(page, request);
		page.setPageOrder(request.getPageOrder());
		page.setOriginalPageNumber(request.getOriginalPageNumber());
		page.setEnabled(!Boolean.FALSE.equals(request.getEnabled()));
		return ResponseEntity.ok(toPageDto(previewRepository.save(page)));
	}

	@PutMapping("/api/admin/products/{productId}/preview")
	@Transactional
	public ResponseEntity<?> updateSettings(@PathVariable Long productId,
			@Valid @RequestBody ProductPreviewSettingsRequest request) {
		Product product = productRepository.findById(productId).orElse(null);
		if (product == null) {
			return ResponseEntity.notFound().build();
		}
		List<ProductPreviewPage> pages = previewRepository.findByProductOrderByPageOrderAsc(product);
		if (Boolean.TRUE.equals(request.getEnabled())) {
			long enabledCount = pages.stream().filter(page -> !Boolean.FALSE.equals(page.getEnabled())).count();
			if (enabledCount < MIN_PAGES || enabledCount > MAX_PAGES) {
				return ResponseEntity.badRequest().body("Bản đọc thử phải có từ 5 đến 20 trang đang bật");
			}
		}
		product.setPreviewEnabled(Boolean.TRUE.equals(request.getEnabled()));
		product.setPreviewRightsConfirmed(Boolean.TRUE.equals(request.getRightsConfirmed()));
		productRepository.save(product);
		return ResponseEntity.ok(toDto(product,
				pages.stream().filter(page -> !Boolean.FALSE.equals(page.getEnabled())).collect(Collectors.toList()), true));
	}

	@PutMapping("/api/admin/products/{productId}/preview/pages/{pageId}")
	@Transactional
	public ResponseEntity<?> updatePage(@PathVariable Long productId, @PathVariable Long pageId,
			@Valid @RequestBody ProductPreviewPageRequest request) {
		ProductPreviewPage page = previewRepository.findById(pageId).orElse(null);
		if (page == null || page.getProduct() == null || !productId.equals(page.getProduct().getProductId())) {
			return ResponseEntity.notFound().build();
		}
		if (!"text".equals(request.getContentType()) && !isImageUrl(request.getImageUrl())) {
			return ResponseEntity.badRequest().body("Chỉ chấp nhận URL ảnh JPG, PNG hoặc WebP");
		}
		List<ProductPreviewPage> current = previewRepository.findByProductOrderByPageOrderAsc(page.getProduct());
		if (current.stream().anyMatch(item -> !item.getPreviewPageId().equals(pageId)
				&& item.getPageOrder().equals(request.getPageOrder()))) {
			return ResponseEntity.badRequest().body("Thứ tự trang đã tồn tại");
		}
		applyContent(page, request);
		page.setPageOrder(request.getPageOrder());
		page.setOriginalPageNumber(request.getOriginalPageNumber());
		page.setEnabled(!Boolean.FALSE.equals(request.getEnabled()));
		return ResponseEntity.ok(toPageDto(previewRepository.save(page)));
	}

	@DeleteMapping("/api/admin/products/{productId}/preview/pages/{pageId}")
	@Transactional
	public ResponseEntity<Void> deletePage(@PathVariable Long productId, @PathVariable Long pageId) {
		ProductPreviewPage page = previewRepository.findById(pageId).orElse(null);
		if (page == null || page.getProduct() == null || !productId.equals(page.getProduct().getProductId())) {
			return ResponseEntity.notFound().build();
		}
		Product product = page.getProduct();
		previewRepository.delete(page);
		previewRepository.flush();
		List<ProductPreviewPage> remaining = previewRepository.findByProductOrderByPageOrderAsc(product);
		// Dùng số âm ở lượt đầu để không đụng unique key (product_id, page_order)
		// khi một trang ở giữa danh sách bị xóa.
		for (int index = 0; index < remaining.size(); index++) {
			remaining.get(index).setPageOrder(-(index + 1));
		}
		previewRepository.saveAll(remaining);
		previewRepository.flush();
		for (int index = 0; index < remaining.size(); index++) {
			remaining.get(index).setPageOrder(index + 1);
		}
		previewRepository.saveAll(remaining);
		return ResponseEntity.noContent().build();
	}

	@PutMapping("/api/admin/products/{productId}/preview/reorder")
	@Transactional
	public ResponseEntity<?> reorder(@PathVariable Long productId, @RequestBody List<Long> pageIds) {
		Product product = productRepository.findById(productId).orElse(null);
		if (product == null) {
			return ResponseEntity.notFound().build();
		}
		List<ProductPreviewPage> pages = previewRepository.findByProductOrderByPageOrderAsc(product);
		if (pageIds == null || pageIds.size() != pages.size() || new HashSet<>(pageIds).size() != pages.size()
				|| !pages.stream().map(ProductPreviewPage::getPreviewPageId).collect(Collectors.toSet()).equals(new HashSet<>(pageIds))) {
			return ResponseEntity.badRequest().body("Danh sách sắp xếp trang không hợp lệ");
		}
		for (int index = 0; index < pages.size(); index++) {
			pages.get(index).setPageOrder(-(index + 1));
		}
		previewRepository.saveAll(pages);
		previewRepository.flush();
		for (int index = 0; index < pageIds.size(); index++) {
			Long pageId = pageIds.get(index);
			for (ProductPreviewPage page : pages) {
				if (page.getPreviewPageId().equals(pageId)) {
					page.setPageOrder(index + 1);
					break;
				}
			}
		}
		previewRepository.saveAll(pages);
		return ResponseEntity.ok(toDto(product, previewRepository.findByProductOrderByPageOrderAsc(product), true));
	}

	private ProductPreviewDto toDto(Product product, List<ProductPreviewPage> pages, boolean admin) {
		List<ProductPreviewPageDto> pageDtos = pages.stream().map(this::toPageDto).collect(Collectors.toList());
		long activePageCount = pages.stream().filter(page -> !Boolean.FALSE.equals(page.getEnabled())).count();
		boolean enabled = Boolean.TRUE.equals(product.getPreviewEnabled())
				&& Boolean.TRUE.equals(product.getPreviewRightsConfirmed())
				&& activePageCount >= MIN_PAGES && activePageCount <= MAX_PAGES;
		if (!admin && !enabled) { pageDtos = java.util.Collections.emptyList(); }
		return new ProductPreviewDto(product.getProductId(), admin ? Boolean.TRUE.equals(product.getPreviewEnabled()) : enabled,
				admin && Boolean.TRUE.equals(product.getPreviewRightsConfirmed()), pageDtos.size(), pageDtos);
	}

	private ProductPreviewPageDto toPageDto(ProductPreviewPage page) {
		return new ProductPreviewPageDto(page.getPreviewPageId(), page.getPageOrder(), page.getOriginalPageNumber(), page.getImageUrl(), page.getEnabled(),
				page.getContentType() == null ? "image" : page.getContentType(),
				page.getTextContent(), page.getHeading(), page.getFontFamily(), page.getFontSize(), page.getTextAlign());
	}

	private void applyContent(ProductPreviewPage page, ProductPreviewPageRequest request) {
		boolean text = "text".equals(request.getContentType());
		page.setContentType(text ? "text" : "image");
		page.setImageUrl(text ? "" : request.getImageUrl().trim());
		page.setTextContent(text ? request.getTextContent().trim() : null);
		page.setHeading(text && request.getHeading() != null ? request.getHeading().trim() : null);
		page.setFontFamily(text && "sans".equals(request.getFontFamily()) ? "sans" : "serif");
		page.setFontSize(text && request.getFontSize() != null ? request.getFontSize() : 20);
		page.setTextAlign(text && "center".equals(request.getTextAlign()) ? "center" : "left");
	}

	private boolean isImageUrl(String value) {
		try {
			String path = URI.create(value == null ? "" : value.trim()).getPath();
			if (path == null || value == null) { return false; }
			path = path.toLowerCase(java.util.Locale.ROOT);
			return (path.endsWith(".jpg") || path.endsWith(".jpeg") || path.endsWith(".png") || path.endsWith(".webp"))
					&& (value.startsWith("https://") || value.startsWith("http://"));
		} catch (IllegalArgumentException ex) {
			return false;
		}
	}
}
