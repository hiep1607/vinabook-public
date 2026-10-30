package vn.fs.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import java.util.*;
import java.util.stream.*;
import javax.validation.Validation;
import javax.validation.Validator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import vn.fs.dto.*;
import vn.fs.entity.*;
import vn.fs.repository.*;

class ProductPreviewApiTest {
    private ProductRepository products;
    private ProductPreviewPageRepository pages;
    private ProductPreviewApi api;
    private Product book;
    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @BeforeEach void setup() {
        products = mock(ProductRepository.class); pages = mock(ProductPreviewPageRepository.class);
        api = new ProductPreviewApi();
        ReflectionTestUtils.setField(api, "productRepository", products);
        ReflectionTestUtils.setField(api, "previewRepository", pages);
        book = new Product(); book.setProductId(10L);
        book.setPreviewEnabled(true); book.setPreviewRightsConfirmed(true);
        when(products.findById(10L)).thenReturn(Optional.of(book));
        when(products.findByProductIdAndStatusTrue(10L)).thenReturn(book);
        when(pages.findByProductOrderByPageOrderAsc(book)).thenReturn(new ArrayList<>());
        when(pages.save(any())).thenAnswer(i -> i.getArgument(0));
    }
    private ProductPreviewPageRequest text() {
        ProductPreviewPageRequest request = new ProductPreviewPageRequest();
        request.setContentType("text"); request.setTextContent("Tiếng Việt rõ ràng\nDòng thứ hai");
        request.setPageOrder(1); request.setFontFamily("serif"); request.setFontSize(20);
        request.setTextAlign("left"); return request;
    }
    @Test void savesTextWithoutImageAndPreservesTypography() {
        ProductPreviewPageRequest request = text();
        assertTrue(validator.validate(request).isEmpty());
        ProductPreviewPageDto saved = (ProductPreviewPageDto) api.addPage(10L, request).getBody();
        assertEquals("text", saved.getContentType());
        assertEquals(request.getTextContent(), saved.getTextContent());
        assertEquals(20, saved.getFontSize()); assertEquals("", saved.getImageUrl());
    }
    @Test void rejectsBlankOversizedAndTooManyLines() {
        ProductPreviewPageRequest request = text();
        request.setTextContent(" "); assertFalse(validator.validate(request).isEmpty());
        request.setTextContent("x".repeat(1001)); assertFalse(validator.validate(request).isEmpty());
        request.setTextContent("x\n".repeat(25)); assertFalse(validator.validate(request).isEmpty());
        request = text(); request.setFontFamily("url(evil)"); assertFalse(validator.validate(request).isEmpty());
        request = text(); request.setFontSize(8); assertFalse(validator.validate(request).isEmpty());
        request = text(); request.setPageOrder(21); assertFalse(validator.validate(request).isEmpty());
    }
    @Test void allowsTwentyPagesAndRejectsTwentyFirst() {
        List<ProductPreviewPage> existing = IntStream.rangeClosed(1, 19).mapToObj(order -> {
            ProductPreviewPage page = new ProductPreviewPage(); page.setProduct(book); page.setPageOrder(order); return page;
        }).collect(Collectors.toCollection(ArrayList::new));
        when(pages.findByProductOrderByPageOrderAsc(book)).thenReturn(existing);

        ProductPreviewPageRequest twentieth = text(); twentieth.setPageOrder(20);
        assertEquals(200, api.addPage(10L, twentieth).getStatusCodeValue());
        existing.add(new ProductPreviewPage());
        assertEquals(400, api.addPage(10L, text()).getStatusCodeValue());
    }
    @Test void oldImageRequestsRemainCompatible() {
        ProductPreviewPageRequest request = new ProductPreviewPageRequest();
        request.setPageOrder(1); request.setImageUrl("https://example.org/page.png");
        assertTrue(validator.validate(request).isEmpty());
        ProductPreviewPageDto saved = (ProductPreviewPageDto) api.addPage(10L, request).getBody();
        assertEquals("image", saved.getContentType()); assertNull(saved.getTextContent());
        request.setImageUrl("javascript:alert(1)"); assertEquals(400, api.addPage(10L, request).getStatusCodeValue());
    }
    @Test void neverReturnsUnapprovedContentToPublic() {
        List<ProductPreviewPage> authorized = IntStream.range(0,5).mapToObj(i -> {
            ProductPreviewPage page = new ProductPreviewPage(); page.setProduct(book);
            page.setPageOrder(i+1); page.setContentType("text"); page.setTextContent("Được duyệt");
            return page;
        }).collect(Collectors.toList());
        when(pages.findByProductAndEnabledTrueOrderByPageOrderAsc(book)).thenReturn(authorized);
        assertEquals(5, api.getPublicPreview(10L).getBody().getPages().size());
        book.setPreviewRightsConfirmed(false);
        assertTrue(api.getPublicPreview(10L).getBody().getPages().isEmpty());
        assertEquals(0, api.getPublicPreview(10L).getBody().getPageCount());
    }
    @Test void preventsEditingAnotherProductsPage() {
        Product other = new Product(); other.setProductId(99L);
        ProductPreviewPage page = new ProductPreviewPage(); page.setProduct(other);
        when(pages.findById(1L)).thenReturn(Optional.of(page));
        assertEquals(404, api.updatePage(10L, 1L, text()).getStatusCodeValue());
        verify(pages, never()).save(any());
    }
}
