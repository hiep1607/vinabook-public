package vn.fs.service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import vn.fs.dto.chat.ChatIntent;
import vn.fs.dto.chat.ChatSearchCriteriaDto;

/**
 * Kế hoạch truy xuất đã được backend kiểm tra. AI chỉ gợi ý cách hiểu câu hỏi;
 * mọi category, author, giá và số lượng đều được chuẩn hóa trước khi tìm catalog.
 */
public final class ChatQueryPlan {
	private final ChatIntent intent;
	private final ChatSearchCriteriaDto criteria;
	private final List<String> searchTerms;
	private final int requestedCount;
	private final boolean aiPlanned;

	public ChatQueryPlan(ChatIntent intent, ChatSearchCriteriaDto criteria, List<String> searchTerms,
			int requestedCount, boolean aiPlanned) {
		this.intent = intent == null ? ChatIntent.UNKNOWN : intent;
		this.criteria = criteria == null ? ChatSearchCriteriaDto.empty() : criteria;
		this.searchTerms = searchTerms == null ? Collections.emptyList()
				: Collections.unmodifiableList(new ArrayList<>(searchTerms));
		this.requestedCount = Math.max(1, Math.min(12, requestedCount));
		this.aiPlanned = aiPlanned;
	}

	public ChatIntent getIntent() { return intent; }
	public ChatSearchCriteriaDto getCriteria() { return criteria; }
	public List<String> getSearchTerms() { return searchTerms; }
	public int getRequestedCount() { return requestedCount; }
	public boolean isAiPlanned() { return aiPlanned; }
}
