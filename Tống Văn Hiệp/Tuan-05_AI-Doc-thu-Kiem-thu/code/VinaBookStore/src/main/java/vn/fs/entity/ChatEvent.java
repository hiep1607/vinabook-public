package vn.fs.entity;

import java.time.LocalDateTime;

import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;
import javax.persistence.Column;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@Entity
@Table(name = "chat_events")
public class ChatEvent {
	@Id
	private String messageId;
	private String sessionId;
	private String intent;
	private String provider;
	private boolean fallback;
	private int productCount;
	private long latencyMs;
	private String feedback;
	@Column(length = 500)
	private String feedbackComment;
	private LocalDateTime createdAt;
}
