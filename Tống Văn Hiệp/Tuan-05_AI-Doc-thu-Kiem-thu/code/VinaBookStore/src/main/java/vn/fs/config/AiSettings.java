package vn.fs.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "ai")
public class AiSettings {

	private String provider = "local";
	private String model = "";
	private String apiKey = "";
	private String baseUrl = "";
	private int timeoutSeconds = 25;
	private int maxOutputTokens = 600;
	private double temperature = 0.35;
	private int rateLimitPerMinute = 20;
	private int maxHistoryMessages = 8;

	public String getProvider() { return provider; }
	public void setProvider(String provider) { this.provider = provider; }
	public String getModel() { return model; }
	public void setModel(String model) { this.model = model; }
	public String getApiKey() { return apiKey; }
	public void setApiKey(String apiKey) { this.apiKey = apiKey; }
	public String getBaseUrl() { return baseUrl; }
	public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
	public int getTimeoutSeconds() { return timeoutSeconds; }
	public void setTimeoutSeconds(int timeoutSeconds) { this.timeoutSeconds = timeoutSeconds; }
	public int getMaxOutputTokens() { return maxOutputTokens; }
	public void setMaxOutputTokens(int maxOutputTokens) { this.maxOutputTokens = maxOutputTokens; }
	public double getTemperature() { return temperature; }
	public void setTemperature(double temperature) { this.temperature = temperature; }
	public int getRateLimitPerMinute() { return rateLimitPerMinute; }
	public void setRateLimitPerMinute(int rateLimitPerMinute) { this.rateLimitPerMinute = rateLimitPerMinute; }
	public int getMaxHistoryMessages() { return maxHistoryMessages; }
	public void setMaxHistoryMessages(int maxHistoryMessages) { this.maxHistoryMessages = maxHistoryMessages; }
}
