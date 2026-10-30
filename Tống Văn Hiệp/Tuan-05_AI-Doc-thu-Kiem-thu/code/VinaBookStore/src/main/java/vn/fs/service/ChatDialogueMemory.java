package vn.fs.service;

import java.util.*;
import vn.fs.dto.chat.ChatSearchCriteriaDto;

/** Bounded, expiring public book context. No addresses, order responses or raw chat transcripts. */
final class ChatDialogueMemory {
    private final Map<String, State> sessions = new LinkedHashMap<>();
    synchronized State get(String owner, String session) {
        long now = System.currentTimeMillis();
        sessions.values().removeIf(s -> now - s.touched > 30 * 60 * 1000L);
        if (session == null || session.isBlank()) return new State();
        String key = (owner == null ? "guest" : "user:" + owner) + ":" + session;
        State state = sessions.get(key);
        if (state == null) {
            if (sessions.size() >= 2000) sessions.remove(sessions.keySet().iterator().next());
            state = new State(); sessions.put(key, state);
        }
        state.touched = now;
        return state;
    }
    static final class State {
        long touched = System.currentTimeMillis();
        boolean initialized;
        String query = "", goal = "", level = "", missingTitle = "";
        ChatSearchCriteriaDto criteria = ChatSearchCriteriaDto.empty();
        List<Long> displayed = new ArrayList<>(), shortlist = new ArrayList<>();
        Long focus;
        Long recommendationBudget;
        Long focusedOrderId;
        boolean awaitingPurchase;
        boolean awaitingComparison;
        boolean emptySearch;
        String offered = "", alternativeFor = "";
        String lastTask = "";
        String pendingQuestion = "";
        Long comparisonAnchor;
        Map<String, Object> clarificationFacts = new LinkedHashMap<>();
        // Request identity handles a stream->JSON retry without repeating state transitions.
        String lastRequest;
        Map<String, Object> toolSearch = new LinkedHashMap<>();
        List<Map<String, String>> toolHistory = new ArrayList<>();
        vn.fs.dto.chat.ChatResponseDto lastResponse;
    }
}
