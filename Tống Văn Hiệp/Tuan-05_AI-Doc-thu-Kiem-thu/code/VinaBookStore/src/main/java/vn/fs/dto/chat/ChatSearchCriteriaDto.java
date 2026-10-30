package vn.fs.dto.chat;

import java.util.Collections;
import java.util.List;

public class ChatSearchCriteriaDto {
	private final Long minPrice;
	private final Long maxPrice;
	private final String category;
	private final String author;
	private final String sort;
	private final List<String> topics;
	private Double minRating;
	public Double getMinRating() { return minRating; }
	public void setMinRating(Double value) { minRating = value; }

	public ChatSearchCriteriaDto(Long minPrice, Long maxPrice, String category, String author,
			String sort, List<String> topics) {
		this.minPrice = minPrice;
		this.maxPrice = maxPrice;
		this.category = category;
		this.author = author;
		this.sort = sort;
		this.topics = topics == null ? Collections.emptyList() : topics;
	}

	public static ChatSearchCriteriaDto empty() {
		return new ChatSearchCriteriaDto(null, null, "", "", "", Collections.emptyList());
	}

	public Long getMinPrice() { return minPrice; }
	public Long getMaxPrice() { return maxPrice; }
	public String getCategory() { return category; }
	public String getAuthor() { return author; }
	public String getSort() { return sort; }
	public List<String> getTopics() { return topics; }
}
