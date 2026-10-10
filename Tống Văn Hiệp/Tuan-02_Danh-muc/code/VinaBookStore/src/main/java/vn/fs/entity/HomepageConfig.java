package vn.fs.entity;

import java.io.Serializable;
import java.time.LocalDateTime;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Lob;
import javax.persistence.Table;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@SuppressWarnings("serial")
@Data
@AllArgsConstructor
@NoArgsConstructor
@Entity
@Table(name = "homepage_config")
public class HomepageConfig implements Serializable {

	@Id
	private Long id;

	@Lob
	@Column(name = "content_json", nullable = false, columnDefinition = "LONGTEXT")
	private String contentJson;

	@Column(name = "updated_at", nullable = false)
	private LocalDateTime updatedAt;
}
