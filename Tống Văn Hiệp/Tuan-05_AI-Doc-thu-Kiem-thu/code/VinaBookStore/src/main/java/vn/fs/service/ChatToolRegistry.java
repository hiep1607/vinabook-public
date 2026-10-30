package vn.fs.service;

import java.util.*;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

@Component
public class ChatToolRegistry {
    private final Map<String, ChatTool> tools = new LinkedHashMap<>();
    public ChatToolRegistry(List<ChatTool> registrations) {
        for (ChatTool tool : registrations) {
            if (tools.putIfAbsent(tool.name(), tool) != null)
                throw new IllegalArgumentException("Duplicate chat tool: " + tool.name());
        }
    }
    public List<Map<String, Object>> definitions() {
        List<Map<String, Object>> result = new ArrayList<>();
        tools.values().forEach(t -> result.add(Map.of("name", t.name(), "description", t.description(),
                "parameters", t.parameters(), "additionalProperties", false)));
        return result;
    }
    public ChatTool.Result execute(String name, JsonNode arguments, ChatTool.Context context) {
        validate(name, arguments);
        return tools.get(name).execute(arguments, context);
    }
    public void validate(String name, JsonNode arguments) {
        ChatTool tool = tools.get(name);
        if (tool == null || arguments == null || !arguments.isObject())
            throw new IllegalArgumentException("Unknown tool or invalid arguments");
        arguments.fieldNames().forEachRemaining(key -> {
            if (!tool.parameters().containsKey(key)) throw new IllegalArgumentException("Unknown argument");
        });
        tool.parameters().forEach((key, spec) -> {
            JsonNode value = arguments.get(key);
            if (value == null || value.isNull()) {
                if (spec.required()) throw new IllegalArgumentException("Missing argument");
                return;
            }
            if ("string".equals(spec.type())) {
                if (!value.isTextual() || value.asText().length() > spec.maximum()
                        || (!spec.values().isEmpty() && !spec.values().contains(value.asText())))
                    throw new IllegalArgumentException("Invalid text argument");
            } else if (!value.isNumber() || !Double.isFinite(value.asDouble())
                    || ("integer".equals(spec.type()) && !value.isIntegralNumber())
                    || value.asDouble() < spec.minimum() || value.asDouble() > spec.maximum()) {
                throw new IllegalArgumentException("Invalid numeric argument");
            }
        });
    }
}
