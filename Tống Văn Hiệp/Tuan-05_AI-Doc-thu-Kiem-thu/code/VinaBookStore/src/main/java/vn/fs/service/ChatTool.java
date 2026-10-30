package vn.fs.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import java.util.List;
import vn.fs.dto.chat.*;

/** A capability registered by Spring. The model proposes arguments; only the handler executes. */
public interface ChatTool {
    String name();
    String description();
    Map<String, Parameter> parameters();
    Result execute(JsonNode arguments, Context context);

    record Parameter(String type, String description, boolean required, double minimum, double maximum,
                     List<String> values) {
        public static Parameter text(String description) {
            return new Parameter("string", description, false, 0, 240, List.of());
        }
        public static Parameter number(String description, double min, double max) {
            return new Parameter("number", description, false, min, max, List.of());
        }
        public static Parameter integer(String description, double min, double max) {
            return new Parameter("integer", description, false, min, max, List.of());
        }
        public static Parameter choice(String description, String... values) {
            return new Parameter("string", description, false, 0, 240, List.of(values));
        }
    }
    record Context(ChatRequestDto request, ChatDialogueMemory.State state) {}
    record Result(String answer, ChatIntent intent, List<ChatProductDto> products,
                  List<ChatActionDto> actions, String status) {
        static Result text(String answer, ChatIntent intent) {
            return new Result(answer, intent, List.of(), List.of(), "COMPLETED");
        }
        static Result clarify(String answer) {
            return new Result(answer, ChatIntent.UNKNOWN, List.of(), List.of(), "NEEDS_INPUT");
        }
    }
}
