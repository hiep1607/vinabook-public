package vn.fs.config;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import vn.fs.service.implement.UserDetailsImpl;

@Component
public class CurrentUserAccess {

	public boolean isAdmin() {
		UserDetailsImpl current = current();
		return current != null && current.getAuthorities().stream()
				.anyMatch(role -> "ROLE_ADMIN".equals(role.getAuthority()));
	}

	public boolean ownsEmail(String email) {
		UserDetailsImpl current = current();
		return current != null && email != null && current.getEmail().equalsIgnoreCase(email);
	}

	public boolean ownsUserId(Long userId) {
		UserDetailsImpl current = current();
		return current != null && userId != null && userId.equals(current.getId());
	}

	public boolean canAccessEmail(String email) {
		return isAdmin() || ownsEmail(email);
	}

	public boolean canAccessUserId(Long userId) {
		return isAdmin() || ownsUserId(userId);
	}

	public String currentEmail() {
		UserDetailsImpl current = current();
		return current == null ? null : current.getEmail();
	}

	public Long currentUserId() {
		UserDetailsImpl current = current();
		return current == null ? null : current.getId();
	}

	private UserDetailsImpl current() {
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		if (authentication == null || !(authentication.getPrincipal() instanceof UserDetailsImpl)) {
			return null;
		}
		return (UserDetailsImpl) authentication.getPrincipal();
	}
}
