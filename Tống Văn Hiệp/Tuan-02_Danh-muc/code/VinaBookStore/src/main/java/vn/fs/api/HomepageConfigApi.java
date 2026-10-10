package vn.fs.api;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import javax.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import vn.fs.dto.HomepageConfigDto;
import vn.fs.dto.HomepageConfigDto.BenefitItem;
import vn.fs.entity.HomepageConfig;
import vn.fs.repository.HomepageConfigRepository;

@CrossOrigin("*")
@RestController
@RequestMapping("api/homepage")
public class HomepageConfigApi {

	private static final Long CONFIG_ID = 1L;
	private static final Set<String> ALLOWED_ICONS = new LinkedHashSet<>(Arrays.asList("truck", "shield-check",
			"refresh-ccw", "headphones", "book-open", "badge-check", "gift", "heart-handshake"));

	private final HomepageConfigRepository repository;
	private final ObjectMapper objectMapper;

	public HomepageConfigApi(HomepageConfigRepository repository, ObjectMapper objectMapper) {
		this.repository = repository;
		this.objectMapper = objectMapper;
	}

	@GetMapping
	public ResponseEntity<HomepageConfigDto> getConfig() {
		return ResponseEntity.ok(loadConfig());
	}

	@PutMapping
	public ResponseEntity<HomepageConfigDto> updateConfig(@Valid @RequestBody HomepageConfigDto config)
			throws JsonProcessingException {
		normalize(config);

		HomepageConfig entity = repository.findById(CONFIG_ID).orElse(new HomepageConfig());
		entity.setId(CONFIG_ID);
		entity.setContentJson(objectMapper.writeValueAsString(config));
		entity.setUpdatedAt(LocalDateTime.now());
		repository.save(entity);

		return ResponseEntity.ok(config);
	}

	private HomepageConfigDto loadConfig() {
		return repository.findById(CONFIG_ID).map(entity -> {
			try {
				return objectMapper.readValue(entity.getContentJson(), HomepageConfigDto.class);
			} catch (JsonProcessingException exception) {
				return HomepageConfigDto.defaults();
			}
		}).orElseGet(HomepageConfigDto::defaults);
	}

	private void normalize(HomepageConfigDto config) {
		config.getHero().setPrimaryRoute(normalizeRoute(config.getHero().getPrimaryRoute(), "/books"));
		config.getHero().setSecondaryRoute(normalizeRoute(config.getHero().getSecondaryRoute(), "/books/new"));
		config.getLatest().setRoute(normalizeRoute(config.getLatest().getRoute(), "/books/new"));
		config.getBestseller().setRoute(normalizeRoute(config.getBestseller().getRoute(), "/books/bestseller"));
		config.getCta().setButtonRoute(normalizeRoute(config.getCta().getButtonRoute(), "/books"));

		config.getHero().setProductIds(distinctPositive(config.getHero().getProductIds(), 5));
		config.getCategories().setCategoryIds(distinctPositive(config.getCategories().getCategoryIds(), 8));

		for (BenefitItem item : config.getBenefits().getItems()) {
			if (!ALLOWED_ICONS.contains(item.getIcon())) {
				item.setIcon("book-open");
			}
		}
	}

	private List<Long> distinctPositive(List<Long> values, int limit) {
		if (values == null) {
			return java.util.Collections.emptyList();
		}
		return values.stream().filter(value -> value != null && value > 0).distinct().limit(limit)
				.collect(Collectors.toList());
	}

	private String normalizeRoute(String value, String fallback) {
		String route = value == null ? "" : value.trim();
		return route.startsWith("/") ? route : fallback;
	}
}
