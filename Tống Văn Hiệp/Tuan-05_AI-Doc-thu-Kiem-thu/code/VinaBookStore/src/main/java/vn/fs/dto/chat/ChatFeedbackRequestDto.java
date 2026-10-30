package vn.fs.dto.chat;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Pattern;
import javax.validation.constraints.Size;

public class ChatFeedbackRequestDto {
	@NotBlank
	private String messageId;

	@NotBlank
	@Pattern(regexp = "positive|negative", message = "Feedback không hợp lệ")
	private String value;

	@Size(max = 500)
	private String comment;

	public String getMessageId() { return messageId; }
	public void setMessageId(String messageId) { this.messageId = messageId; }
	public String getValue() { return value; }
	public void setValue(String value) { this.value = value; }
	public String getComment() { return comment; }
	public void setComment(String comment) { this.comment = comment; }
}
