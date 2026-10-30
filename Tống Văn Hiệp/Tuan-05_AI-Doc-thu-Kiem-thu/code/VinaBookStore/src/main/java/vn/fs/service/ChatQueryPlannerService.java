package vn.fs.service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;

import vn.fs.dto.chat.ChatIntent;
import vn.fs.dto.chat.ChatSearchCriteriaDto;
import vn.fs.dto.chat.ChatTurnDto;
import vn.fs.entity.Product;

@Service
public class ChatQueryPlannerService {
	private static final Set<ChatIntent> BOOK_INTENTS = Set.of(
			ChatIntent.UNKNOWN, ChatIntent.DISCOVER_BOOKS, ChatIntent.PRODUCT_INFO, ChatIntent.COMPARE_BOOKS);

	private final AiGateway ai;
	private final ObjectMapper mapper;
	private final ChatIntentService intents;

	public ChatQueryPlannerService(AiGateway ai, ObjectMapper mapper, ChatIntentService intents) {
		this.ai = ai;
		this.mapper = mapper;
		this.intents = intents;
	}

	public ChatQueryPlan plan(String question, List<ChatTurnDto> history, List<Product> catalog,
			ChatIntent baseIntent, ChatSearchCriteriaDto baseCriteria) {
		ChatQueryPlan fallback = new ChatQueryPlan(baseIntent, baseCriteria,
				deterministicTerms(question, baseCriteria), requestedCount(question), false);
		if (!ai.isConfigured() || !BOOK_INTENTS.contains(baseIntent)
				|| intents.isBudgetOnlyDiscovery(question) || !baseCriteria.getSort().isEmpty()
				|| baseCriteria.getMinRating() != null) return fallback;

		String categories = catalog.stream().filter(product -> product.getCategory() != null)
				.map(product -> product.getCategory().getCategoryName()).filter(value -> value != null && !value.isBlank())
				.distinct().sorted().collect(Collectors.joining(" | "));
		String prompt = "Bạn là bộ phân tích truy vấn tìm sách tiếng Việt. Chỉ trả một JSON object, không markdown, theo mẫu: "
				+ "{\"intent\":\"DISCOVER_BOOKS\",\"searchTerms\":[\"pháp luật\",\"luật dân sự\"],"
				+ "\"topics\":[\"pháp luật\"],\"minPrice\":null,\"maxPrice\":200000,"
				+ "\"category\":\"\",\"author\":\"\",\"sort\":\"\",\"requestedCount\":5}. "
				+ "Intent chỉ được là DISCOVER_BOOKS, PRODUCT_INFO, COMPARE_BOOKS hoặc UNKNOWN. "
				+ "Suy luận cả từ đồng nghĩa và nhu cầu ẩn, nhưng không bịa tên sách. searchTerms phải ngắn, hữu ích để tìm tên/category/mô tả. "
				+ "Category chỉ dùng đúng một giá trị trong danh sách sau hoặc để rỗng: " + categories + ". "
				+ "Sort chỉ được: price-asc, price-desc, new, sale, best hoặc rỗng. requestedCount từ 1 đến 12.";
		try {
			String raw = ai.complete(prompt, history == null ? Collections.emptyList() : history, question);
			PlanDraft draft = mapper.readValue(jsonObject(raw), PlanDraft.class);
			return merge(draft, question, baseIntent, baseCriteria);
		} catch (RuntimeException ex) {
			return fallback;
		} catch (Exception ex) {
			return fallback;
		}
	}

	private ChatQueryPlan merge(PlanDraft draft, String question,
			ChatIntent baseIntent, ChatSearchCriteriaDto base) {
		ChatIntent plannedIntent = parseIntent(draft.intent);
		ChatIntent finalIntent = baseIntent == ChatIntent.UNKNOWN && plannedIntent != ChatIntent.UNKNOWN
				? plannedIntent : baseIntent;
		if (!BOOK_INTENTS.contains(finalIntent)) finalIntent = baseIntent;

		// AI enriches semantic search, but hard filters must come from explicit user text.
		// Otherwise a plausible inferred category can hide the best book when catalog
		// metadata is imperfect (for example a communication book in a novel category).
		Long min = base.getMinPrice();
		Long max = base.getMaxPrice();
		if (min != null && max != null && min > max) {
			long swap = min; min = max; max = swap;
		}
		String category = base.getCategory();
		String author = base.getAuthor();
		String sort = base.getSort();

		LinkedHashSet<String> topics = new LinkedHashSet<>(base.getTopics());
		addClean(topics, draft.topics, 12);
		ChatSearchCriteriaDto criteria = new ChatSearchCriteriaDto(min, max, category, author, sort,
				new ArrayList<>(topics));
		criteria.setMinRating(base.getMinRating());

		LinkedHashSet<String> terms = new LinkedHashSet<>(deterministicTerms(question, criteria));
		addClean(terms, draft.searchTerms, 16);
		int count = requestedCount(question);
		return new ChatQueryPlan(finalIntent, criteria, new ArrayList<>(terms), count, true);
	}

	private List<String> deterministicTerms(String question, ChatSearchCriteriaDto criteria) {
		LinkedHashSet<String> values = new LinkedHashSet<>();
		if (criteria != null) {
			values.addAll(criteria.getTopics());
			if (!criteria.getCategory().isEmpty()) values.add(criteria.getCategory());
			if (!criteria.getAuthor().isEmpty()) values.add(criteria.getAuthor());
		}
		String normalized = intents.normalize(question);
		for (String token : normalized.split("\\s+")) {
			if (token.length() >= 3 && !STOP_WORDS.contains(token)) values.add(token);
		}
		return new ArrayList<>(values);
	}

	private int requestedCount(String question) {
		String q = intents.normalize(question);
		if (q.matches(".*\\bhai\\s+(cuon|quyen|sach)\\b.*")) return 2;
		java.util.regex.Matcher matcher = java.util.regex.Pattern
				.compile("(?:goi y|gioi thieu|tim|chon)?\\s*(\\d{1,2})\\s*(?:cuon|quyen|sach)")
				.matcher(q);
		if (matcher.find()) {
			try { return Math.max(1, Math.min(12, Integer.parseInt(matcher.group(1)))); }
			catch (NumberFormatException ignored) { }
		}
		if (q.contains("re nhat") || q.contains("thap nhat") || q.contains("phu hop nhat") || q.contains("cao nhat")) return 1;
		return 5;
	}

	private ChatIntent parseIntent(String value) {
		String normalized = value == null ? "" : value.trim().toUpperCase();
		if (normalized.contains("COMPARE")) return ChatIntent.COMPARE_BOOKS;
		if (normalized.contains("PRODUCT") || normalized.contains("INFO")) return ChatIntent.PRODUCT_INFO;
		if (normalized.contains("DISCOVER") || normalized.contains("FIND") || normalized.contains("RECOMMEND")) {
			return ChatIntent.DISCOVER_BOOKS;
		}
		return ChatIntent.UNKNOWN;
	}

	private void addClean(Set<String> target, List<String> values, int limit) {
		if (values == null) return;
		for (String value : values) {
			if (target.size() >= limit) break;
			String clean = value == null ? "" : value.trim();
			if (clean.length() >= 2 && clean.length() <= 80) target.add(clean);
		}
	}

	private String jsonObject(String raw) {
		String value = raw == null ? "" : raw.trim().replaceFirst("(?is)^```(?:json)?\\s*", "")
				.replaceFirst("(?is)\\s*```$", "");
		int start = value.indexOf('{');
		int end = value.lastIndexOf('}');
		if (start < 0 || end <= start) throw new IllegalArgumentException("AI planner không trả JSON");
		return value.substring(start, end + 1);
	}

	private static final Set<String> STOP_WORDS = new LinkedHashSet<>(Arrays.asList(
			"toi", "minh", "ban", "sach", "cuon", "quyen", "cho", "voi", "mot", "nhung", "cac",
			"cua", "la", "co", "khong", "nao", "gi", "ve", "tim", "muon", "can", "hay", "giup",
			"goi", "gioi", "thieu", "phu", "hop", "danh", "doc", "mua", "duoc", "nhe", "a",
			"con", "khac", "re", "hon"));

	public static class PlanDraft {
		public String intent;
		public List<String> searchTerms;
		public List<String> topics;
		public Long minPrice;
		public Long maxPrice;
		public String category;
		public String author;
		public String sort;
		public Integer requestedCount;
	}
}
