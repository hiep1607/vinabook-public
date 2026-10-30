package vn.fs.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import vn.fs.entity.ChatEvent;

@Repository
public interface ChatEventRepository extends JpaRepository<ChatEvent, String> {
	List<ChatEvent> findAllByOrderByCreatedAtDesc();
}
