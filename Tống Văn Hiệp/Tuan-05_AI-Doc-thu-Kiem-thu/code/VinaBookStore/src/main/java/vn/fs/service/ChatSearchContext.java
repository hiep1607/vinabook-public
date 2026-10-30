package vn.fs.service;

import java.util.List;
import vn.fs.dto.chat.ChatTurnDto;

/** Rebuild public search preferences from user turns only. No user data or static session cache. */
final class ChatSearchContext {
    private final ChatIntentService intents;
    ChatSearchContext(ChatIntentService intents) { this.intents = intents; }

    boolean followUp(String text) {
        String q = intents.normalize(text);
        return q.matches("^(chi lay|chi chon|trong so|trong nhung|toi moi bat dau|ngan sach cua|vay ban chon|hay chon cho toi|cuon nao dang mua).*" );
    }

    String resolve(String question, List<ChatTurnDto> history) {
        if (!followUp(question) || history == null) return question;
        String topic = "";
        String level = "";
        String budget = "";
        for (ChatTurnDto turn : history) {
            if (!"user".equals(turn.getRole())) continue;
            String value = turn.getContent();
            if (value == null) continue;
            String q = intents.normalize(value);
            if (!followUp(value)) {
                // Only a user search request can establish a new topic.
                if (q.matches(".*\\b(sach|hoc|truyen|python|java)\\b.*")) {
                    topic = value; level = ""; budget = "";
                }
            } else if (q.contains("bat dau")) level = " Người mới bắt đầu.";
            if (q.matches(".*\\b(duoi|tren|ngan sach|khoang)\\b.*\\d.*")) budget = value;
        }
        if (topic.isEmpty()) return question;
        // Replace, rather than append, previous budget when user supplies a new one.
        if (intents.normalize(question).matches(".*\\b(duoi|tren|ngan sach|khoang)\\b.*\\d.*")) budget = "";
        topic = topic.replaceAll("(?iu)(?:dưới|duoi|trên|tren|khoảng|khoang|ngân sách|ngan sach)\\s*\\d[\\d.,]*\\s*(?:đồng|dong|k|đ|vnd)?", "");
        return topic + level + " " + budget + " " + question;
    }
}
