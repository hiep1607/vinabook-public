package vn.fs.api;

import java.util.Map;
import java.util.concurrent.CompletableFuture;

import javax.servlet.http.HttpServletRequest;
import javax.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import vn.fs.dto.chat.ChatRequestDto;
import vn.fs.dto.chat.ChatResponseDto;
import vn.fs.dto.chat.ChatStatusDto;
import vn.fs.dto.chat.ChatFeedbackRequestDto;
import vn.fs.dto.chat.ChatMetricsDto;
import vn.fs.service.ChatAnalyticsService;
import vn.fs.service.ChatRateLimiter;
import vn.fs.service.ChatService;

@CrossOrigin("*")
@RestController
@RequestMapping("api/chat")
public class ChatApi {

	private final ChatService chat;
	private final ChatRateLimiter rateLimiter;
	private final ChatAnalyticsService analytics;

	public ChatApi(ChatService chat, ChatRateLimiter rateLimiter, ChatAnalyticsService analytics) {
		this.chat = chat;
		this.rateLimiter = rateLimiter;
		this.analytics = analytics;
	}

	@GetMapping("status")
	public ResponseEntity<ChatStatusDto> status() {
		return ResponseEntity.ok(chat.status());
	}

	@PostMapping
	public ResponseEntity<?> reply(@Valid @RequestBody ChatRequestDto request, HttpServletRequest servletRequest) {
		String clientId = clientIp(servletRequest);
		if (!rateLimiter.allow(clientId)) {
			return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
					.body(Map.of("message", "Bạn gửi câu hỏi quá nhanh. Vui lòng thử lại sau một phút."));
		}
		ChatResponseDto response = chat.reply(request);
		return ResponseEntity.ok(response);
	}

	@PostMapping(value = "stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
	public SseEmitter stream(@Valid @RequestBody ChatRequestDto request, HttpServletRequest servletRequest) {
		SseEmitter emitter = new SseEmitter(90_000L);
		String clientId = clientIp(servletRequest);
		if (!rateLimiter.allow(clientId)) {
			try {
				emitter.send(SseEmitter.event().name("error").data(Map.of("message",
						"Bạn gửi câu hỏi quá nhanh. Vui lòng thử lại sau một phút.")));
				emitter.complete();
			} catch (Exception ex) {
				emitter.completeWithError(ex);
			}
			return emitter;
		}
		SecurityContext callerContext = SecurityContextHolder.getContext();
		CompletableFuture.runAsync(() -> {
			SecurityContextHolder.setContext(callerContext);
			try {
				emitter.send(SseEmitter.event().name("ready").data(Map.of("status", "thinking")));
				ChatResponseDto response = chat.reply(request);
				for (String chunk : response.getAnswer().split("(?<=\\s)")) {
					emitter.send(SseEmitter.event().name("chunk").data(Map.of("text", chunk)));
				}
				emitter.send(SseEmitter.event().name("done").data(response));
				emitter.complete();
			} catch (Exception ex) {
				emitter.completeWithError(ex);
			} finally {
				SecurityContextHolder.clearContext();
			}
		});
		return emitter;
	}

	@PostMapping("feedback")
	public ResponseEntity<Void> feedback(@Valid @RequestBody ChatFeedbackRequestDto request) {
		return analytics.feedback(request) ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
	}

	@GetMapping("admin/metrics")
	public ResponseEntity<ChatMetricsDto> metrics() {
		return ResponseEntity.ok(analytics.metrics());
	}

	private String clientIp(HttpServletRequest request) {
		String remote = request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr();
		String forwarded = request.getHeader("X-Forwarded-For");
		if (isTrustedProxy(remote) && forwarded != null && !forwarded.trim().isEmpty()) {
			return forwarded.split(",")[0].trim();
		}
		return remote;
	}

	private boolean isTrustedProxy(String address) {
		return "127.0.0.1".equals(address) || "::1".equals(address)
				|| address.startsWith("10.") || address.startsWith("192.168.")
				|| address.matches("172\\.(1[6-9]|2\\d|3[01])\\..*");
	}
}
