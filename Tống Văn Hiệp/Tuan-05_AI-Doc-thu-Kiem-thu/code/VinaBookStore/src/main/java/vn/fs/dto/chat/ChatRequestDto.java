package vn.fs.dto.chat;

import java.util.ArrayList;
import java.util.List;

import javax.validation.Valid;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

public class ChatRequestDto {
    @Valid
    @Size(max = 100)
    private List<CartItem> cartItems = new ArrayList<>();
    public List<CartItem> getCartItems() { return cartItems; }
    public void setCartItems(List<CartItem> value) { cartItems = value == null ? new ArrayList<>() : value; }
    public static class CartItem {
        @javax.validation.constraints.NotNull
        @javax.validation.constraints.Positive
        private Long productId;
        @javax.validation.constraints.Min(1)
        @javax.validation.constraints.Max(99)
        private int quantity;
        public Long getProductId() { return productId; }
        public void setProductId(Long value) { productId=value; }
        public int getQuantity() { return quantity; }
        public void setQuantity(int value) { quantity=value; }
    }

	@NotBlank(message = "Vui lòng nhập câu hỏi")
	@Size(max = 1000, message = "Câu hỏi tối đa 1000 ký tự")
	private String message;

	@Size(max = 64)
	private String requestId;
	private Long activeProductId;
	public String getRequestId() { return requestId; }
	public void setRequestId(String value) { requestId = value; }
	public Long getActiveProductId() { return activeProductId; }
	public void setActiveProductId(Long value) { activeProductId = value; }

	@Valid
	@Size(max = 10, message = "Lịch sử hội thoại quá dài")
	private List<ChatTurnDto> history = new ArrayList<>();

	@Size(max = 64, message = "Mã phiên quá dài")
	private String sessionId;

	@Size(max = 8, message = "Ngữ cảnh sản phẩm quá dài")
	private List<Long> contextProductIds = new ArrayList<>();

	public String getMessage() { return message; }
	public void setMessage(String message) { this.message = message; }
	public List<ChatTurnDto> getHistory() { return history; }
	public void setHistory(List<ChatTurnDto> history) { this.history = history == null ? new ArrayList<>() : history; }
	public String getSessionId() { return sessionId; }
	public void setSessionId(String sessionId) { this.sessionId = sessionId; }
	public List<Long> getContextProductIds() { return contextProductIds; }
	public void setContextProductIds(List<Long> contextProductIds) {
		this.contextProductIds = contextProductIds == null ? new ArrayList<>() : contextProductIds;
	}
}
