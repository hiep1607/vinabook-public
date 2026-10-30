package vn.fs.service;

import java.util.List;
import java.util.ArrayList;
import java.util.regex.Pattern;
import vn.fs.entity.Product;

/** Mandatory user constraints are evaluated independently from relevance scores. */
final class ChatExplicitFilters {
    private final ChatIntentService intents;
    ChatExplicitFilters(ChatIntentService intents) { this.intents = intents; }

    boolean matches(String question, Product product) {
        String q = intents.normalize(question);
        String name = intents.normalize(product.getName());
        String category = product.getCategory() == null ? "" : intents.normalize(product.getCategory().getCategoryName());
        String text = name + " " + intents.normalize(product.getDescription()) + " " + category;
        List<String> languages = new ArrayList<>();
        for (String language : List.of("java", "python", "javascript", "spring boot"))
            if (word(q, language)) languages.add(language);
        if (!languages.isEmpty()) {
            boolean either = word(q, "hoac") || word(q, "or");
            if (either ? languages.stream().noneMatch(l -> word(text, l))
                       : languages.stream().anyMatch(l -> !word(text, l))) return false;
        }
        if (word(q, "lap trinh") || word(q, "code") || word(q, "cong nghe") || word(q, "cntt") || word(q, "backend") || word(q, "web development")) {
            String technicalText = name + " " + intents.normalize(product.getDescription());
            if (!Pattern.compile("\\b(lap trinh|cong nghe|tri tue nhan tao|dien tu|robot|ma nguon|phan mem|cau truc du lieu|co so du lieu|may tinh|java|python|javascript|backend|frontend|html|css|web development)\\b").matcher(technicalText).find()) return false;
        }
        if (Pattern.compile("\\b(tre em|thieu nhi|cho be)\\b").matcher(q).find()
                && !Pattern.compile("\\b(tre em|thieu nhi|cho be|co tich|dong thoai)\\b").matcher(text).find()) return false;
        if (word(q, "tieng anh") && !word(text, "tieng anh") && !word(text, "english")) return false;
        if ((word(q,"truyen") || word(q,"tieu thuyet"))
                && !Pattern.compile("\\b(truyen|tieu thuyet|van hoc)\\b").matcher(text).find()) return false;
        if ((q.contains("khong lay") || q.contains("loai tru")) && q.contains("kinh nghiem")
                && Pattern.compile("\\b(nang cao|chuyen sau|advanced)\\b").matcher(text).find()
                && !Pattern.compile("\\b(can ban|co ban|nhap mon|nguoi moi)\\b").matcher(text).find()) return false;
        return true;
    }

    private boolean word(String text, String term) {
        return Pattern.compile("\\b" + Pattern.quote(term) + "\\b").matcher(text).find();
    }
}
