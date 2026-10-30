package vn.fs.service;

import java.math.BigDecimal;
import java.util.*;
import java.util.regex.*;

/** Money requires a currency unit or a price expression; title years and quantities are not prices. */
final class ChatMoney {
    static List<Long> parse(String normalized) {
        String q = normalized.replaceAll("[\"“][^\"”]*[\"”]", " ");
        List<Long> result = new ArrayList<>();
        Matcher m = Pattern.compile("(?<![\\w])([0-9]+(?:[.,][0-9]+)*)\\s*(trieu|nghin|ngan|dong|vnd|lit|tr|k|d)?\\b").matcher(q);
        while (m.find()) {
            String tail = q.substring(m.end()).trim();
            if (tail.matches("^(sao|cuon|quyen|ban|trang|nam)\\b.*")) continue;
            String prefix = q.substring(0, m.start());
            String unit = m.group(2);
            if (unit == null && !prefix.matches(".*\\b(duoi|tren|tu|den|khoang|tam|toi da|toi thieu|ngan sach(?: cua toi)?|toi co|gia)\\s*$")) continue;
            try {
                String raw = m.group(1);
                boolean decimal = unit != null && raw.matches("\\d+[.,]\\d{1,2}");
                BigDecimal number = new BigDecimal(decimal ? raw.replace(',', '.') : raw.replaceAll("[.,]", ""));
                long multiplier = List.of("trieu", "tr").contains(unit == null ? "" : unit) ? 1000000
                        : "lit".equals(unit) ? 100000 : List.of("k", "nghin", "ngan").contains(unit == null ? "" : unit) ? 1000
                        : unit == null && number.longValue() < 1000 ? 1000 : 1;
                long value = number.multiply(BigDecimal.valueOf(multiplier)).longValueExact();
                if (value > 0 && value <= 1000000000L) result.add(value);
            } catch (ArithmeticException | NumberFormatException ignored) { }
        }
        return result;
    }
}
