package vn.fs.dto.chat;

import java.util.Map;

public class ChatMetricsDto {
	private final long totalMessages;
	private final long fallbackCount;
	private final double fallbackRate;
	private final long positiveFeedback;
	private final long negativeFeedback;
	private final double averageLatencyMs;
	private final Map<String, Long> intents;

	public ChatMetricsDto(long totalMessages, long fallbackCount, double fallbackRate,
			long positiveFeedback, long negativeFeedback, double averageLatencyMs,
			Map<String, Long> intents) {
		this.totalMessages = totalMessages;
		this.fallbackCount = fallbackCount;
		this.fallbackRate = fallbackRate;
		this.positiveFeedback = positiveFeedback;
		this.negativeFeedback = negativeFeedback;
		this.averageLatencyMs = averageLatencyMs;
		this.intents = intents;
	}

	public long getTotalMessages() { return totalMessages; }
	public long getFallbackCount() { return fallbackCount; }
	public double getFallbackRate() { return fallbackRate; }
	public long getPositiveFeedback() { return positiveFeedback; }
	public long getNegativeFeedback() { return negativeFeedback; }
	public double getAverageLatencyMs() { return averageLatencyMs; }
	public Map<String, Long> getIntents() { return intents; }
}
