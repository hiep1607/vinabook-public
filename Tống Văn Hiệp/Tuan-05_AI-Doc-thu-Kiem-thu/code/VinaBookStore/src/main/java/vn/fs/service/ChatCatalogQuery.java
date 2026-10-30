package vn.fs.service;

import java.util.*;
import java.util.regex.*;
import java.util.stream.Collectors;
import vn.fs.dto.chat.*;
import vn.fs.entity.Product;

/** Eligibility over the entire catalog precedes sorting and limiting; relevance cannot hide cheaper matches. */
final class ChatCatalogQuery {
    private final ChatIntentService language;
    private final ChatRetrievalService data;
    ChatCatalogQuery(ChatIntentService language, ChatRetrievalService data) { this.language = language; this.data = data; }
    List<Product> named(String question, List<Product> catalog) {
        String q = language.normalize(question);
        return catalog.stream().filter(p -> {
            String name = language.normalize(p.getName());
            String shortName = name.replaceAll("\\s*\\([^)]*\\)", "").trim();
            return name.length() > 3 && (q.contains(name) || q.contains(shortName)
                    || (q.contains("harry potter") && name.startsWith("harry potter")));
        }).sorted(Comparator.comparingInt(p -> q.indexOf(language.normalize(p.getName()).split(" \\(")[0])))
                .collect(Collectors.toList());
    }
    String quoted(String question) {
        Matcher m = Pattern.compile("[\"“]([^\"”]{1,180})[\"”]").matcher(question);
        return m.find() ? m.group(1) : "";
    }
    List<Product> byIds(List<Long> ids, List<Product> catalog) {
        return ids.stream().distinct().flatMap(id -> catalog.stream().filter(p -> id.equals(p.getProductId())))
                .collect(Collectors.toList());
    }
    List<Product> search(String query, ChatSearchCriteriaDto c, List<Product> catalog) {
        String q = language.normalize(query);
        ChatExplicitFilters mandatory = new ChatExplicitFilters(language);
        List<Product> found = catalog.stream().filter(p -> Boolean.TRUE.equals(p.getStatus()))
                .filter(p -> c.getMinPrice() == null || data.effectivePrice(p) >= c.getMinPrice())
                .filter(p -> c.getMaxPrice() == null || data.effectivePrice(p) <= c.getMaxPrice())
                .filter(p -> c.getAuthor().isEmpty() || language.normalize(c.getAuthor()).equals(language.normalize(p.getAuthor())))
                .filter(p -> c.getCategory().isEmpty() || category(p).contains(language.normalize(c.getCategory())))
                .filter(p -> mandatory.matches(query, p)).collect(Collectors.toList());
        // Human concepts do not necessarily correspond to the database's broad categories.
        for (List<String> group : GROUPS) {
            if (group.stream().anyMatch(t -> word(q, t)))
                found = found.stream().filter(p -> group.stream().anyMatch(t -> word(content(p), t))).collect(Collectors.toList());
        }
        Comparator<Product> order = Comparator.comparingInt(Product::getSold).reversed().thenComparing(Product::getProductId);
        if ("price-asc".equals(c.getSort())) order = Comparator.comparingLong(data::effectivePrice).thenComparing(Product::getProductId);
        if ("price-desc".equals(c.getSort())) order = Comparator.comparingLong(data::effectivePrice).reversed().thenComparing(Product::getProductId);
        if ("new".equals(c.getSort())) order = Comparator.comparing(Product::getEnteredDate, Comparator.nullsLast(Comparator.reverseOrder())).thenComparing(Product::getProductId);
        if ("sale".equals(c.getSort())) { found.removeIf(p -> p.getDiscount() <= 0); order = Comparator.comparingInt(Product::getDiscount).reversed(); }
        if ("best".equals(c.getSort())) found.removeIf(p -> p.getSold() <= 0);
        found.sort(order);
        return data.rated(found, c);
    }
    boolean semanticConstraint(String query) {
        String q = language.normalize(query);
        return q.matches(".*\\b(java|python|javascript|spring boot|tieng anh|lap trinh|code|backend|cong nghe|cntt)\\b.*")
                || GROUPS.stream().anyMatch(g -> g.stream().anyMatch(t -> word(q, t)));
    }
    static boolean word(String text, String phrase) { return Pattern.compile("\\b" + Pattern.quote(phrase) + "\\b").matcher(text).find(); }
    private String category(Product p) { return p.getCategory() == null ? "" : language.normalize(p.getCategory().getCategoryName()); }
    private String text(Product p) { return language.normalize(p.getName() + " " + p.getDescription()) + " " + category(p); }
    private String content(Product p) { return language.normalize(p.getName() + " " + p.getDescription()); }
    private static final List<List<String>> GROUPS = List.of(
            List.of("kinh doanh", "quan tri", "khoi nghiep", "startup", "marketing", "dau tu", "doanh nghiep", "kinh te"),
            List.of("phap luat", "phap ly", "luat", "hien phap", "dan su", "lao dong"),
            List.of("giao tiep", "ung xu", "doi nhan xu the", "thuyet phuc"),
            List.of("phat trien ban than", "ky nang song", "thoi quen", "self help"),
            List.of("lich su", "chien tranh", "trieu dai", "su luoc"),
            List.of("tam ly", "cam xuc", "hanh vi", "noi tam"),
            List.of("trinh tham", "tham tu", "pha an"),
            List.of("tinh yeu", "lang man", "tinh cam"),
            List.of("tam linh", "ton giao", "thien dinh", "phat giao"));
}
