package vn.fs.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProductPreviewPageDto {
	private Long previewPageId;
	private Integer pageOrder;
	private Integer originalPageNumber;
	private String imageUrl;
	private Boolean enabled;
	private String contentType;
	private String textContent;
	private String heading;
	private String fontFamily;
	private Integer fontSize;
	private String textAlign;

}
