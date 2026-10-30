package vn.fs.service;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.stereotype.Component;

import vn.fs.config.AiSettings;

@Component
public class ChatRateLimiter {

	private static final long WINDOW_SECONDS = 60;
	private final AiSettings settings;
	private final Map<String, Window> clients = new ConcurrentHashMap<>();
	private final AtomicInteger requests = new AtomicInteger();

	public ChatRateLimiter(AiSettings settings) {
		this.settings = settings;
	}

	public boolean allow(String clientId) {
		long now = Instant.now().getEpochSecond();
		Window window = clients.compute(clientId, (key, current) -> {
			if (current == null || now - current.startedAt >= WINDOW_SECONDS) {
				return new Window(now, 1);
			}
			current.count++;
			return current;
		});
		if (requests.incrementAndGet() % 500 == 0) {
			clients.entrySet().removeIf(entry -> now - entry.getValue().startedAt >= WINDOW_SECONDS * 2);
		}
		return window.count <= Math.max(1, settings.getRateLimitPerMinute());
	}

	private static final class Window {
		private final long startedAt;
		private int count;

		private Window(long startedAt, int count) {
			this.startedAt = startedAt;
			this.count = count;
		}
	}
}
