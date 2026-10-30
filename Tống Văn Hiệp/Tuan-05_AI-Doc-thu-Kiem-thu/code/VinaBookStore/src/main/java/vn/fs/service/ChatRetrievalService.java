package vn.fs.service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import vn.fs.dto.chat.ChatIntent;
import vn.fs.dto.chat.ChatSearchCriteriaDto;
import vn.fs.entity.Product;

/**
 * Retrieval layer của RAG. Tìm trên catalog thật bằng phrase, token, category,
 * author, mô tả và nhóm từ đồng nghĩa; không sinh sản phẩm mới.
 */
@Service
public class ChatRetrievalService {
	private static final int MAX_CANDIDATES = 20;
	private static final int MIN_ANCHOR_SCORE = 16;
	private static final List<List<String>> SYNONYM_GROUPS = List.of(
			List.of("phap luat", "phap ly", "luat", "hien phap", "dan su", "hinh su", "lao dong", "doanh nghiep"),
			List.of("giao tiep", "ung xu", "doi nhan xu the", "thuyet phuc", "ket noi", "noi chuyen"),
			List.of("phat trien ban than", "ky nang song", "tu duy", "thoi quen", "ban than", "self help"),
			List.of("kinh doanh", "quan tri", "doanh nghiep", "marketing", "khoi nghiep", "startup", "dau tu"),
			List.of("thieu nhi", "tre em", "cho be", "co tich", "dong thoai"),
			List.of("trinh tham", "tham tu", "pha an", "toi pham", "bi an"),
			List.of("lich su", "chien tranh", "trieu dai", "viet nam xua"),
			List.of("tam ly", "cam xuc", "hanh vi", "noi tam", "lo au"),
			List.of("khoa hoc", "vat ly", "hoa hoc", "sinh hoc", "vu tru"),
			List.of("cong nghe", "lap trinh", "phan mem", "du lieu", "may tinh", "java"),
			List.of("tinh yeu", "lang man", "tinh cam", "hon nhan"),
			List.of("tam linh", "ton giao", "thien", "phat giao", "nhan qua"),
			List.of("van hoc", "tieu thuyet", "truyen", "tho", "tac pham"),
			List.of("giao trinh", "hoc tap", "sinh vien", "nhap mon", "can ban"));

	private final ChatIntentService intents;
	private vn.fs.repository.RateRepository rates;
	@org.springframework.beans.factory.annotation.Autowired
	public void setRates(vn.fs.repository.RateRepository rates) { this.rates = rates; }

	public List<Product> rated(List<Product> products, ChatSearchCriteriaDto criteria) {
		if (criteria.getMinRating() == null && !"rating".equals(criteria.getSort())) return products;
		java.util.Map<Long, Double> averages = new java.util.HashMap<>();
		if (rates != null) for (Object[] row : rates.averageRatings())
			averages.put(((Number) row[0]).longValue(), ((Number) row[1]).doubleValue());
		java.util.stream.Stream<Product> stream = products.stream().filter(p -> averages.containsKey(p.getProductId())
				&& averages.get(p.getProductId()) >= (criteria.getMinRating() == null ? 0 : criteria.getMinRating()));
		if ("rating".equals(criteria.getSort())) stream = stream.sorted(Comparator
				.comparingDouble((Product p) -> averages.get(p.getProductId())).reversed().thenComparing(Product::getProductId));
		return stream.collect(Collectors.toList());
	}

	public ChatRetrievalService(ChatIntentService intents) {
		this.intents = intents;
	}

	public Double averageRating(Product product) {
		if (rates != null) for (Object[] row : rates.averageRatings())
			if (((Number) row[0]).longValue() == product.getProductId()) return ((Number) row[1]).doubleValue();
		return null;
	}

	public java.util.Map<Long,Double> ratingSnapshot() {
		java.util.Map<Long,Double> result = new java.util.HashMap<>();
		if (rates != null) for (Object[] row : rates.averageRatings())
			result.put(((Number) row[0]).longValue(), ((Number) row[1]).doubleValue());
		return result;
	}

	public List<Product> retrieve(String question, ChatQueryPlan plan, List<Product> catalog,
			List<Long> contextIds, boolean alternative) {
		if (plan.getIntent() == ChatIntent.POLICY || plan.getIntent() == ChatIntent.ORDER_SUPPORT
				|| plan.getIntent() == ChatIntent.SMALL_TALK) return List.of();
		List<Product> active = catalog.stream().filter(product -> Boolean.TRUE.equals(product.getStatus()))
				.collect(Collectors.toList());
		List<Product> named = exactNamed(question, active);
		if (!named.isEmpty() && (plan.getIntent() == ChatIntent.PRODUCT_INFO
				|| plan.getIntent() == ChatIntent.COMPARE_BOOKS || plan.getIntent() == ChatIntent.UNKNOWN)) {
			return named;
		}

		if (plan.getIntent() == ChatIntent.COMPARE_BOOKS && named.size() < 2 && contextIds != null) {
			List<Product> context = byIds(active, contextIds);
			if (context.size() >= 2) return context;
		}
		String normalized = intents.normalize(question);
		if (named.isEmpty() && plan.getIntent() == ChatIntent.PRODUCT_INFO
				&& contextIds != null && (normalized.contains("cuon nay") || normalized.contains("sach nay")
				|| normalized.contains("tac pham nay"))) {
			// Multiple previous suggestions are ambiguous; do not silently choose one.
			List<Product> context = byIds(active, contextIds);
			return context.size() == 1 ? context : List.of();
		}
		// A product fact requires an identified title/reference, never the best fuzzy hit.
		if (named.isEmpty() && plan.getIntent() == ChatIntent.PRODUCT_INFO) return List.of();
		if (plan.getIntent() == ChatIntent.COMPARE_BOOKS && named.isEmpty()
				&& normalized.matches(".*\\b(nay|do|vua|hon)\\b.*")) return List.of();
		ChatExplicitFilters mandatory = new ChatExplicitFilters(intents);
		active = active.stream().filter(p -> mandatory.matches(question, p)).collect(Collectors.toList());

		ChatSearchCriteriaDto criteria = plan.getCriteria();
		boolean budgetOnly = intents.isBudgetOnlyDiscovery(question) && criteria.getTopics().isEmpty()
				&& criteria.getCategory().isEmpty() && criteria.getAuthor().isEmpty();
		RetrievalTerms terms = expandedTerms(question, plan);
		boolean structured = !criteria.getSort().isEmpty() || criteria.getMinRating() != null;
		List<ScoredProduct> scored = score(active, terms, criteria, !budgetOnly && (!structured || !criteria.getTopics().isEmpty()));
		boolean unconstrained = criteria.getTopics().isEmpty() && criteria.getCategory().isEmpty()
				&& criteria.getAuthor().isEmpty() && criteria.getMinPrice() == null && criteria.getMaxPrice() == null;
		if (scored.isEmpty() && !structured && (isGenericDiscovery(plan, terms.scoring) || (alternative && unconstrained))) {
			scored = active.stream().map(product -> new ScoredProduct(product,
					Math.max(0, product.getSold()) + (product.getQuantity() > 0 ? 20 : 0)))
					.collect(Collectors.toList());
		}

		if (alternative && contextIds != null && !contextIds.isEmpty()) {
			Set<Long> seen = new HashSet<>(contextIds);
			scored = scored.stream().filter(item -> !seen.contains(item.product.getProductId()))
					.collect(Collectors.toList());
			if (normalized.contains("re hon")) {
				long ceiling = byIds(active, contextIds).stream().mapToLong(this::effectivePrice).min().orElse(Long.MAX_VALUE);
				scored = scored.stream().filter(item -> effectivePrice(item.product) < ceiling).collect(Collectors.toList());
			}
		}
		applySort(scored, criteria.getSort());

		int limit = Math.min(MAX_CANDIDATES, Math.max(12, plan.getRequestedCount() * 3));
		if (plan.getIntent() == ChatIntent.PRODUCT_INFO) limit = 1;
		if (plan.getIntent() == ChatIntent.COMPARE_BOOKS) limit = Math.max(2, Math.min(6, plan.getRequestedCount()));
		return rated(scored.stream().map(item -> item.product).distinct().collect(Collectors.toList()), criteria)
				.stream().limit(limit).collect(Collectors.toList());
	}

	/**
	 * Conservative subset for local fallback. It uses only words explicitly present
	 * in the question and deterministic criteria, never AI-inferred expansion.
	 */
	public List<Product> directMatches(String question, ChatSearchCriteriaDto criteria,
			List<Product> candidates) {
		if (intents.isBudgetOnlyDiscovery(question) && criteria.getTopics().isEmpty()
				&& criteria.getCategory().isEmpty() && criteria.getAuthor().isEmpty()) {
			return candidates.stream().filter(p ->
					(criteria.getMinPrice() == null || effectivePrice(p) >= criteria.getMinPrice())
					&& (criteria.getMaxPrice() == null || effectivePrice(p) <= criteria.getMaxPrice()))
					.collect(Collectors.toList());
		}
		LinkedHashSet<String> anchors = new LinkedHashSet<>();
		for (String topic : criteria.getTopics()) addTerm(anchors, topic);
		addTerm(anchors, criteria.getCategory());
		addTerm(anchors, criteria.getAuthor());
		for (String token : intents.normalize(question).split("\\s+")) {
			if (token.length() >= 3 && !STOP_WORDS.contains(token)) anchors.add(token);
		}
		List<String> explicit = new ArrayList<>(anchors);
		return candidates.stream().filter(product -> relevance(product, explicit) >= MIN_ANCHOR_SCORE)
				.collect(Collectors.toList());
	}

	private List<ScoredProduct> score(List<Product> products, RetrievalTerms terms,
			ChatSearchCriteriaDto criteria, boolean strictMetadata) {
		String categoryNeedle = intents.normalize(criteria.getCategory());
		String authorNeedle = intents.normalize(criteria.getAuthor());
		boolean hasMetadataFilter = !categoryNeedle.isEmpty() || !authorNeedle.isEmpty();
		List<ScoredProduct> result = new ArrayList<>();
		for (Product product : products) {
			long price = effectivePrice(product);
			if (criteria.getMinPrice() != null && price < criteria.getMinPrice()) continue;
			if (criteria.getMaxPrice() != null && price > criteria.getMaxPrice()) continue;
			String category = category(product);
			String author = intents.normalize(product.getAuthor());
			boolean categoryMatch = categoryNeedle.isEmpty() || category.contains(categoryNeedle)
					|| categoryNeedle.contains(category);
			boolean authorMatch = authorNeedle.isEmpty() || author.equals(authorNeedle);
			if (!categoryMatch || !authorMatch) continue;
			String explicitTopic = intents.normalize(String.join(" ", criteria.getTopics()));
			String bookText = intents.normalize(product.getName() + " " + product.getDescription() + " " + category);

			int anchorValue = relevance(product, terms.anchors);
			int value = relevance(product, terms.scoring);
			if (!categoryNeedle.isEmpty() && categoryMatch) value += 80;
			if (!authorNeedle.isEmpty() && authorMatch) value += 80;
			boolean relevant = anchorValue >= MIN_ANCHOR_SCORE
					|| (hasMetadataFilter && categoryMatch && authorMatch);
			if (strictMetadata && !relevant) continue;
			if (product.getQuantity() > 0) value += 8;
			else value -= 35;
			result.add(new ScoredProduct(product, value));
		}
		result.sort(Comparator.comparingInt((ScoredProduct item) -> item.score).reversed()
				.thenComparing(item -> item.product.getSold(), Comparator.reverseOrder())
				.thenComparing(item -> item.product.getProductId()));
		return result;
	}

	private int relevance(Product product, List<String> terms) {
		String name = intents.normalize(product.getName());
		String author = intents.normalize(product.getAuthor());
		String category = category(product);
		String description = intents.normalize(product.getDescription());
		int score = 0;
		for (String term : terms) {
			if (term.length() < 2) continue;
			boolean phrase = term.contains(" ");
			if (name.contains(term)) score += phrase ? 70 : 28;
			if (author.contains(term)) score += phrase ? 45 : 20;
			if (category.contains(term)) score += phrase ? 65 : 25;
			if (description.contains(term)) score += phrase ? 30 : 8;
		}
		return score;
	}

	private RetrievalTerms expandedTerms(String question, ChatQueryPlan plan) {
		LinkedHashSet<String> base = new LinkedHashSet<>();
		LinkedHashSet<String> anchors = new LinkedHashSet<>();
		String normalizedQuestion = intents.normalize(question);
		for (String value : plan.getSearchTerms()) {
			String normalized = intents.normalize(value);
			if (!STOP_WORDS.contains(normalized)) {
				addTerm(base, normalized);
				if (!BROAD_INFERRED_TERMS.contains(normalized) || normalizedQuestion.contains(normalized)) {
					addTerm(anchors, normalized);
				}
			}
		}
		for (String value : plan.getCriteria().getTopics()) {
			addTerm(base, value);
			addTerm(anchors, value);
		}
		addTerm(base, plan.getCriteria().getCategory());
		addTerm(base, plan.getCriteria().getAuthor());
		addTerm(anchors, plan.getCriteria().getCategory());
		addTerm(anchors, plan.getCriteria().getAuthor());
		for (String token : normalizedQuestion.split("\\s+")) {
			if (token.length() >= 3 && !STOP_WORDS.contains(token)) {
				base.add(token);
				anchors.add(token);
			}
		}

		LinkedHashSet<String> expanded = new LinkedHashSet<>(base);
		String searchable = normalizedQuestion + " " + String.join(" ", base);
		for (List<String> group : SYNONYM_GROUPS) {
			if (group.stream().anyMatch(searchable::contains)) expanded.addAll(group);
		}
		return new RetrievalTerms(new ArrayList<>(expanded), new ArrayList<>(anchors));
	}

	private List<Product> exactNamed(String question, List<Product> catalog) {
		String q = intents.normalize(question);
		return catalog.stream().filter(product -> {
			String name = intents.normalize(product.getName());
			return name.length() >= 4 && q.contains(name);
		}).sorted(Comparator.comparingInt(product -> q.indexOf(intents.normalize(product.getName()))))
				.collect(Collectors.toList());
	}

	private List<Product> byIds(List<Product> catalog, List<Long> ids) {
		return catalog.stream().filter(product -> ids.contains(product.getProductId()))
				.sorted(Comparator.comparingInt(product -> ids.indexOf(product.getProductId())))
				.collect(Collectors.toList());
	}

	private void applySort(List<ScoredProduct> products, String sort) {
		if ("price-asc".equals(sort)) products.sort(Comparator.comparingLong(item -> effectivePrice(item.product)));
		else if ("price-desc".equals(sort)) products.sort(Comparator.comparingLong(
				(ScoredProduct item) -> effectivePrice(item.product)).reversed());
		else if ("new".equals(sort)) products.sort(Comparator.comparing(
				(ScoredProduct item) -> item.product.getEnteredDate(), Comparator.nullsLast(Comparator.reverseOrder())));
		else if ("sale".equals(sort)) products.sort(Comparator.comparingInt(
				(ScoredProduct item) -> item.product.getDiscount()).reversed());
		else if ("best".equals(sort)) products.sort(Comparator.comparingInt(
				(ScoredProduct item) -> item.product.getSold()).reversed());
	}

	private boolean isGenericDiscovery(ChatQueryPlan plan, List<String> terms) {
		return plan.getIntent() == ChatIntent.DISCOVER_BOOKS && terms.isEmpty()
				&& plan.getCriteria().getCategory().isEmpty() && plan.getCriteria().getAuthor().isEmpty()
				&& plan.getCriteria().getMinPrice() == null && plan.getCriteria().getMaxPrice() == null;
	}

	private void addTerm(Set<String> values, String value) {
		String normalized = intents.normalize(value);
		if (normalized.length() >= 2) values.add(normalized);
	}

	private String category(Product product) {
		return product.getCategory() == null ? "" : intents.normalize(product.getCategory().getCategoryName());
	}

	public long effectivePrice(Product product) {
		double price = product.getPrice() == null ? 0 : product.getPrice();
		return Math.round(price * (100 - Math.max(0, product.getDiscount())) / 100);
	}

	private static final Set<String> STOP_WORDS = new HashSet<>(Arrays.asList(
			"toi", "minh", "ban", "sach", "cuon", "quyen", "cho", "voi", "mot", "nhung", "cac", "cua",
			"la", "co", "khong", "nao", "gi", "ve", "tim", "muon", "can", "hay", "giup", "goi", "y",
			"gioi", "thieu", "phu", "hop", "danh", "doc", "mua", "duoc", "nhe", "a", "it", "vai",
			"con", "khac", "re", "hon", "nguoi", "moi", "bat", "dau", "hieu"));

	private static final Set<String> BROAD_INFERRED_TERMS = Set.of(
			"khoa hoc", "cong nghe", "phat trien ban than", "ky nang song", "tam ly",
			"van hoc", "kinh doanh", "sach giao trinh", "giao trinh");

	private static final class RetrievalTerms {
		private final List<String> scoring;
		private final List<String> anchors;
		private RetrievalTerms(List<String> scoring, List<String> anchors) {
			this.scoring = scoring;
			this.anchors = anchors;
		}
	}

	private static final class ScoredProduct {
		private final Product product;
		private final int score;
		private ScoredProduct(Product product, int score) { this.product = product; this.score = score; }
	}
}
