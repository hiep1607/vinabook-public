package vn.fs.dto;

import javax.validation.constraints.AssertTrue;

import lombok.Data;

@Data
public class ProductPreviewSettingsRequest {
	private Boolean enabled = Boolean.FALSE;
	private Boolean rightsConfirmed = Boolean.FALSE;

	@AssertTrue(message = "Cần xác nhận quyền công khai trang đọc thử")
	public boolean isRightsValid() {
		return !Boolean.TRUE.equals(enabled) || Boolean.TRUE.equals(rightsConfirmed);
	}
}
