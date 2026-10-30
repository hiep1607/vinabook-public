package vn.fs.service;

import javax.validation.Validation;
import org.junit.jupiter.api.Test;
import vn.fs.dto.chat.ChatTurnDto;
import static org.junit.jupiter.api.Assertions.*;

class ChatHistoryTest {
    @Test void acceptsLongRepliesButRetainsLimit() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            assertTrue(validator.validate(new ChatTurnDto("assistant", "x".repeat(8000))).isEmpty());
            assertFalse(validator.validate(new ChatTurnDto("assistant", "x".repeat(8001))).isEmpty());
        }
    }
}
