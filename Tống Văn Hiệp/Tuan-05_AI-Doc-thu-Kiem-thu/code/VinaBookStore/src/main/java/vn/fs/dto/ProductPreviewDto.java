package vn.fs.dto;

import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProductPreviewDto {
	private Long productId;
	private Boolean enabled;
	private Boolean rightsConfirmed;
	private Integer pageCount;
	private List<ProductPreviewPageDto> pages;
}
