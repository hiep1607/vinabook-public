package vn.fs.service;

import java.util.List;
import java.util.stream.Collectors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import vn.fs.dto.chat.ChatIntent;
import vn.fs.entity.Product;

/** Resolves references against the current catalog, preserving displayed order. */
final class ChatConversationContext {
    private final ChatIntentService intents;
    ChatConversationContext(ChatIntentService intents) { this.intents = intents; }

    String resolve(String question, List<Long> ids, List<Product> catalog) {
        String q = intents.normalize(question);
        ChatIntent intent = intents.classify(question);
        if (intent == ChatIntent.POLICY || intent == ChatIntent.ORDER_SUPPORT || intent == ChatIntent.SMALL_TALK)
            return question;
        if (catalog.stream().anyMatch(p -> p.getName() != null && intents.normalize(p.getName()).length() >= 4
                && q.contains(intents.normalize(p.getName())))) return question;
        if (ids == null || ids.isEmpty()) return question;
        List<Product> context = ids.stream().distinct().flatMap(id -> catalog.stream()
                .filter(p -> id.equals(p.getProductId()) && Boolean.TRUE.equals(p.getStatus())))
                .collect(Collectors.toList());
        if (context.isEmpty()) return question;
        Matcher ordinal = Pattern.compile("(?:cuon|quyen|sach) (?:thu )?(\\d+|dau tien|dau|nhat|hai|ba|tu|cuoi)(?:\\b)").matcher(q);
        if (ordinal.find()) {
            String value = ordinal.group(1);
            int index;
            switch (value) {
                case "dau tien": case "dau": case "nhat": index = 0; break;
                case "hai": index = 1; break;
                case "ba": index = 2; break;
                case "tu": index = 3; break;
                case "cuoi": index = context.size() - 1; break;
                default: try { index = Integer.parseInt(value) - 1; } catch (NumberFormatException ex) { return question; }
            }
            return index >= 0 && index < context.size() ? question + " — " + context.get(index).getName() : question;
        }
        if (intent == ChatIntent.COMPARE_BOOKS && q.contains("nay"))
            return question + " — " + context.stream().map(Product::getName).collect(Collectors.joining(" và "));
        if (isDetail(q) && context.size() == 1) return question + " — " + context.get(0).getName();
        return question;
    }

    boolean isDetail(String q) {
        return q.matches(".*(?:cuon nay|sach nay|tac pham nay|noi ro|noi them|chi tiet|phan tich|tom tat|thong diep|nhan vat|ket thuc|noi dung|co kho doc|phong cach|cuon thu|cuon dau|cuon cuoi).*" );
    }
}
