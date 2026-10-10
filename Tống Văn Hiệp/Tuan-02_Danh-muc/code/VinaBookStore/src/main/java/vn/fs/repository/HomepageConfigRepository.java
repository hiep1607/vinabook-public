package vn.fs.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import vn.fs.entity.HomepageConfig;

@Repository
public interface HomepageConfigRepository extends JpaRepository<HomepageConfig, Long> {
}
