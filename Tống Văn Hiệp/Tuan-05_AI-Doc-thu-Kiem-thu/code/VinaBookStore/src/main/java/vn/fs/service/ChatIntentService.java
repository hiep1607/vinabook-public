package vn.fs.service;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;

import vn.fs.dto.chat.ChatIntent;
import vn.fs.dto.chat.ChatSearchCriteriaDto;
import vn.fs.entity.Product;

@Service
public class ChatIntentService {
	private static final List<String> TOPICS = Arrays.asList(
			"phiêu lưu", "giao tiếp", "phát triển bản thân", "thiếu nhi", "kinh doanh",
			"khởi nghiệp", "trinh thám", "tình yêu", "lãng mạn", "lịch sử", "tâm lý",
			"khoa học", "công nghệ", "kỹ năng", "làm quà", "pháp luật", "pháp lý",
			"chính trị", "giáo trình", "tâm linh", "tôn giáo", "văn học", "python", "tiếng Anh", "lập trình");

	public ChatIntent classify(String question) {
		String q = normalize(question);
		if (containsAny(q, "so sanh", "khac nhau", "giong nhau")) return ChatIntent.COMPARE_BOOKS;
		if (q.matches(".*\\b(tim|cho|muon|goi y).*\\b(tac gia|danh muc|re nhat|thap nhat|doc truyen)\\b.*")) return ChatIntent.DISCOVER_BOOKS;
		if (isBudgetOnlyDiscovery(question)) return ChatIntent.DISCOVER_BOOKS;
		if (q.matches(".*\\b(danh gia cao|danh gia tot|rating|[0-5] sao|ban chay|sach moi|nhung sach moi)\\b.*")) return ChatIntent.DISCOVER_BOOKS;
		if (q.startsWith("gia ")) return ChatIntent.PRODUCT_INFO;
		if (containsAny(q, "so sanh", "khac nhau", "nen chon cuon nao", "cuon nao tot hon")) {
			return ChatIntent.COMPARE_BOOKS;
		}
		if (containsAny(q, "don hang", "theo doi don", "ma don", "dang giao", "don cua toi")
				|| q.matches(".*(?:#|\\bdon\\s+)[0-9]{1,18}\\b.*")) {
			return ChatIntent.ORDER_SUPPORT;
		}
		if (containsAny(q, "phi ship", "phi giao", "van chuyen", "giao hang", "doi tra",
				"hoan tien", "thanh toan", "vnpay", "momo", "vietqr", "bao hanh",
				"lien he", "cua hang", "chinh sach") || containsWord(q, "cod")) {
			return ChatIntent.POLICY;
		}
		if (containsAny(q, "sach gia duoi", "sach gia tren", "tim sach gia duoi", "tim sach gia tren")) {
			return ChatIntent.DISCOVER_BOOKS;
		}
		if (containsAny(q, "gia bao nhieu", "con hang", "ton kho", "bao nhieu ban", "bao nhieu cuon",
				"con may", "noi dung", "tac gia", "giam bao nhieu", "danh gia cuon", "cuon nay", "sach nay")) {
			return ChatIntent.PRODUCT_INFO;
		}
		if (containsAny(q, "tim sach", "tim cuon", "goi y", "tu van", "nen doc", "nen mua",
				"doc gi", "sach hay", "sach moi", "ban chay", "khuyen mai", "gia duoi",
				"gia tren", "danh cho", "phu hop", "lam qua", "the loai", "sach ve", "chu de",
				"phieu luu", "giao tiep", "phat trien ban than", "cuon khac", "sach khac", "re hon",
				"phap luat", "phap ly", "sach luat", "luat dan su", "luat doanh nghiep", "de hoc", "tieng anh", "lap trinh", "python", "java", "mua qua", "muon mua sach")) {
			return ChatIntent.DISCOVER_BOOKS;
		}
		if (q.length() <= 80 && (containsAny(q, "xin chao", "chao", "hello", "cam on",
				"tam biet", "ban la ai", "ban lam duoc gi") || containsWord(q, "hi"))) {
			return ChatIntent.SMALL_TALK;
		}
		return ChatIntent.UNKNOWN;
	}

	public ChatSearchCriteriaDto criteria(String question, List<Product> catalog) {
		String q = normalize(question);
		Long minPrice = null;
		Long maxPrice = null;
		List<Long> amounts = amounts(q);
		boolean range = amounts.size() >= 2 && containsAny(q, "tu ", " den ", "khoang", "giua");
		if (range) {
			minPrice = Math.min(amounts.get(0), amounts.get(1));
			maxPrice = Math.max(amounts.get(0), amounts.get(1));
		} else if (!amounts.isEmpty() && q.matches(".*\\b(tren|hon|it nhat|toi thieu)\\b.*") && !q.contains("duoi")) {
			minPrice = amounts.get(0);
		} else if (!amounts.isEmpty()) {
			maxPrice = amounts.get(0);
		}

		String category = catalog.stream()
				.filter(product -> product.getCategory() != null && product.getCategory().getCategoryName() != null)
				.map(product -> product.getCategory().getCategoryName())
				.distinct()
				.filter(name -> q.contains(normalize(name)) || q.contains(normalize(name).replaceFirst("^sach\\s+", "")))
				.findFirst().orElse("");
		String author = catalog.stream().map(Product::getAuthor).filter(value -> value != null && value.length() > 3)
				.filter(value -> q.contains(normalize(value))).findFirst().orElse("");
		String sort = containsAny(q, "re nhat", "re hon", "gia tang", "gia thap", "thap nhat", "tiet kiem") ? "price-asc"
				: containsAny(q, "dat nhat", "gia giam", "cao cap") ? "price-desc"
				: containsAny(q, "moi nhat", "sach moi", "vua ve") ? "new"
				: containsAny(q, "giam gia", "khuyen mai", "sale") ? "sale"
				: containsAny(q, "ban chay", "pho bien", "hot") ? "best" : "";
		List<String> topics = new ArrayList<>();
		for (String topic : TOPICS) {
			if (q.contains(normalize(topic))) topics.add(topic);
		}
		if (q.contains("nhung sach moi")) sort = "new";
		Double minRating = null;
		Matcher rating = Pattern.compile("(?:rating\\s*(?:tu)?\\s*|tu\\s+)?([0-5](?:[.,]\\d)?)\\s*sao").matcher(q);
		if (rating.find()) minRating = Double.parseDouble(rating.group(1).replace(',', '.'));
		if (q.contains("danh gia cao") || q.contains("danh gia tot") || q.contains("rating")) {
			if (sort.isEmpty()) sort = "rating";
			if (minRating == null) minRating = q.contains("cao nhat") ? 0D : 4D;
		}
		ChatSearchCriteriaDto result = new ChatSearchCriteriaDto(minPrice, maxPrice, category, author, sort, topics);
		result.setMinRating(minRating);
		return result;
	}

	public String normalize(String value) {
		if (value == null) return "";
		return Normalizer.normalize(value, Normalizer.Form.NFD)
				.replaceAll("\\p{M}+", "")
				.replace('đ', 'd').replace('Đ', 'D')
				.toLowerCase(Locale.ROOT)
				.replaceAll("\\b(pyhton|pythn)\\b", "python").replaceAll("\\bsahc\\b", "sach").replaceAll("\\bmun\\b", "muon")
				.replaceAll("\\s+", " ").trim();
	}

	/** A budget-only request has no title/topic to match against catalog prose. */
	public boolean isBudgetOnlyDiscovery(String question) {
		String q = normalize(question);
		if (!q.matches(".*\\b(duoi|tren|tu|den|khoang|tam|toi da|toi thieu|ngan sach|toi co)\\b.*")
				|| amounts(q).isEmpty()) return false;
		String remaining = q.replaceAll("\\d[\\d.,]*\\s*(trieu|tr|nghin|ngan|vnd|dong|k|d)?", " ")
				.replaceAll("\\b(chon|lay|chi|nhung|muon|mua)\\b", " ")
				.replaceAll("[?!,.;:]+", " ");
		return remaining.replaceAll("\\b(goi|y|tim|sach|cuon|quyen|gia|duoi|tren|tu|den|khoang|tam|toi|da|thieu|ngan|sach|cho|minh|t|em|voi|nhe|giup|co|nao|khong|vai|mot|it|gioi|thieu|dong|nghin|ngan|hon|nhat)\\b", " ")
				.trim().isEmpty();
	}

	private List<Long> amounts(String q) {
		return ChatMoney.parse(q);
	}

	private boolean containsAny(String value, String... options) {
		return Arrays.stream(options).anyMatch(value::contains);
	}

	private boolean containsWord(String value, String word) {
		return Pattern.compile("(^|\\s)" + Pattern.quote(word) + "($|\\s)").matcher(value).find();
	}
}
