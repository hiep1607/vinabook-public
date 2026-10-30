package vn.fs.dto;

import javax.validation.constraints.Max;
import javax.validation.constraints.Min;
import javax.validation.constraints.AssertTrue;
import javax.validation.constraints.Pattern;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;

import lombok.Data;

@Data
public class ProductPreviewPageRequest {
	@Size(max = 1000)
	private String imageUrl;

	@Pattern(regexp = "image|text")
	private String contentType;
	@Size(max = 1000)
	private String textContent;
	@Size(max = 120)
	private String heading;
	@Pattern(regexp = "serif|sans")
	private String fontFamily;
	@Min(18) @Max(22)
	private Integer fontSize;
	@Pattern(regexp = "left|center")
	private String textAlign;

	@AssertTrue(message = "Trang chữ cần nội dung, tối đa 1000 ký tự và 24 dòng")
	public boolean isTextValid() {
		return !"text".equals(contentType) || (textContent != null && !textContent.trim().isEmpty()
				&& textContent.split("\\r?\\n", -1).length <= 24);
	}

	@NotNull
	@Min(1)
	@Max(20)
	private Integer pageOrder;

	@Min(1)
	private Integer originalPageNumber;

	private Boolean enabled = Boolean.TRUE;
}
