package vn.fs.service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import vn.fs.config.AiSettings;
import vn.fs.dto.chat.ChatTurnDto;

@Service
public class AiGateway {

	private static final String OPENAI = "openai";
	private static final String OPENAI_COMPATIBLE = "openai-compatible";
	private static final String GEMINI = "gemini";
	private static final String ANTHROPIC = "anthropic";

	private final AiSettings settings;
	private final ObjectMapper mapper;
	private final HttpClient client;

	public AiGateway(AiSettings settings, ObjectMapper mapper) {
		this.settings = settings;
		this.mapper = mapper;
		this.client = HttpClient.newBuilder()
				.connectTimeout(Duration.ofSeconds(Math.max(3, settings.getTimeoutSeconds())))
				.build();
	}

	public boolean isConfigured() {
		String provider = provider();
		if (!(OPENAI.equals(provider) || OPENAI_COMPATIBLE.equals(provider)
				|| GEMINI.equals(provider) || ANTHROPIC.equals(provider))) {
			return false;
		}
		if (blank(settings.getApiKey()) || blank(settings.getModel())) {
			return false;
		}
		return !OPENAI_COMPATIBLE.equals(provider) || !blank(settings.getBaseUrl());
	}

	public String provider() {
		return value(settings.getProvider(), "local").trim().toLowerCase(Locale.ROOT).replace('_', '-');
	}

	public String model() {
		return value(settings.getModel(), "").trim();
	}

	public String complete(String systemPrompt, List<ChatTurnDto> history, String message) {
		if (!isConfigured()) {
			throw new IllegalStateException("Nhà cung cấp AI chưa được cấu hình đầy đủ");
		}
		switch (provider()) {
		case OPENAI:
			return callOpenAi(systemPrompt, history, message);
		case OPENAI_COMPATIBLE:
			return callOpenAiCompatible(systemPrompt, history, message);
		case GEMINI:
			return callGemini(systemPrompt, history, message);
		case ANTHROPIC:
			return callAnthropic(systemPrompt, history, message);
		default:
			throw new IllegalStateException("Nhà cung cấp AI không được hỗ trợ");
		}
	}

	private String callOpenAi(String systemPrompt, List<ChatTurnDto> history, String message) {
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("model", model());
		body.put("instructions", systemPrompt);
		body.put("input", conversation(history, message, false));
		body.put("max_output_tokens", safeMaxTokens());
		body.put("store", false);
		JsonNode json = post(join(defaultBase("https://api.openai.com/v1"), "responses"), body,
				Map.of("Authorization", "Bearer " + settings.getApiKey()));
		List<String> text = new ArrayList<>();
		for (JsonNode output : json.path("output")) {
			for (JsonNode content : output.path("content")) {
				if (content.path("text").isTextual()) text.add(content.path("text").asText());
			}
		}
		return requireText(text);
	}

	private String callOpenAiCompatible(String systemPrompt, List<ChatTurnDto> history, String message) {
		List<Map<String, String>> messages = new ArrayList<>();
		messages.add(message("system", systemPrompt));
		messages.addAll(conversation(history, message, false));
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("model", model());
		body.put("messages", messages);
		body.put("max_tokens", safeMaxTokens());
		body.put("temperature", safeTemperature());
		body.put("stream", false);
		JsonNode json = post(join(settings.getBaseUrl(), "chat/completions"), body,
				Map.of("Authorization", "Bearer " + settings.getApiKey()));
		JsonNode content = json.path("choices").path(0).path("message").path("content");
		if (content.isTextual()) return requireText(List.of(content.asText()));
		List<String> text = new ArrayList<>();
		for (JsonNode part : content) {
			if (part.path("text").isTextual()) text.add(part.path("text").asText());
		}
		return requireText(text);
	}

	private String callGemini(String systemPrompt, List<ChatTurnDto> history, String message) {
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("systemInstruction", Map.of("parts", List.of(Map.of("text", systemPrompt))));
		List<Map<String, Object>> contents = new ArrayList<>();
		for (Map<String, String> turn : conversation(history, message, true)) {
			contents.add(Map.of("role", turn.get("role"), "parts", List.of(Map.of("text", turn.get("content")))));
		}
		body.put("contents", contents);
		// Các model Gemini mới đã ngừng khuyến nghị sampling parameters như temperature.
		// Chỉ gửi giới hạn output để adapter dùng được cho cả model 2.5 và các model mới hơn.
		body.put("generationConfig", Map.of("maxOutputTokens", safeMaxTokens()));
		String endpoint = "models/" + URLEncoder.encode(model(), StandardCharsets.UTF_8) + ":generateContent";
		JsonNode json = post(join(defaultBase("https://generativelanguage.googleapis.com/v1beta"), endpoint), body,
				Map.of("x-goog-api-key", settings.getApiKey()));
		List<String> text = new ArrayList<>();
		for (JsonNode part : json.path("candidates").path(0).path("content").path("parts")) {
			if (part.path("text").isTextual()) text.add(part.path("text").asText());
		}
		return requireText(text);
	}

	private String callAnthropic(String systemPrompt, List<ChatTurnDto> history, String message) {
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("model", model());
		body.put("system", systemPrompt);
		body.put("messages", conversation(history, message, false));
		body.put("max_tokens", safeMaxTokens());
		body.put("temperature", safeTemperature());
		JsonNode json = post(join(defaultBase("https://api.anthropic.com/v1"), "messages"), body,
				Map.of("x-api-key", settings.getApiKey(), "anthropic-version", "2023-06-01"));
		List<String> text = new ArrayList<>();
		for (JsonNode part : json.path("content")) {
			if ("text".equals(part.path("type").asText()) && part.path("text").isTextual()) {
				text.add(part.path("text").asText());
			}
		}
		return requireText(text);
	}

	private JsonNode post(String url, Object body, Map<String, String> headers) {
		try {
			HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(url))
					.timeout(Duration.ofSeconds(Math.max(3, settings.getTimeoutSeconds())))
					.header("Content-Type", "application/json");
			headers.forEach(request::header);
			HttpResponse<String> response = client.send(
					request.POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body))).build(),
					HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
			if (response.statusCode() < 200 || response.statusCode() >= 300) {
				throw new IllegalStateException("Nhà cung cấp AI trả về mã " + response.statusCode());
			}
			return mapper.readTree(response.body());
		} catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException("Yêu cầu AI đã bị gián đoạn", ex);
		} catch (Exception ex) {
			if (ex instanceof IllegalStateException) throw (IllegalStateException) ex;
			throw new IllegalStateException("Không thể kết nối nhà cung cấp AI", ex);
		}
	}

	private List<Map<String, String>> conversation(List<ChatTurnDto> history, String latest, boolean gemini) {
		List<Map<String, String>> messages = new ArrayList<>();
		int limit = Math.max(0, settings.getMaxHistoryMessages());
		int start = Math.max(0, history.size() - limit);
		for (int i = start; i < history.size(); i++) {
			ChatTurnDto turn = history.get(i);
			String role = "assistant".equals(turn.getRole()) ? (gemini ? "model" : "assistant") : "user";
			messages.add(message(role, turn.getContent()));
		}
		messages.add(message("user", latest));
		return messages;
	}

	private Map<String, String> message(String role, String content) {
		Map<String, String> item = new LinkedHashMap<>();
		item.put("role", role);
		item.put("content", content);
		return item;
	}

	private String defaultBase(String fallback) {
		return blank(settings.getBaseUrl()) ? fallback : settings.getBaseUrl();
	}

	private String join(String base, String path) {
		String left = value(base, "").replaceAll("/+$", "");
		String right = value(path, "").replaceAll("^/+", "");
		return left.endsWith("/" + right) ? left : left + "/" + right;
	}

	private int safeMaxTokens() { return Math.max(100, Math.min(2000, settings.getMaxOutputTokens())); }
	private double safeTemperature() { return Math.max(0, Math.min(1, settings.getTemperature())); }
	private boolean blank(String value) { return value == null || value.trim().isEmpty(); }
	private String value(String value, String fallback) { return value == null ? fallback : value; }

	private String requireText(List<String> parts) {
		String result = String.join("\n", parts).trim();
		if (result.isEmpty()) throw new IllegalStateException("Nhà cung cấp AI không trả về nội dung");
		return result;
	}
}
