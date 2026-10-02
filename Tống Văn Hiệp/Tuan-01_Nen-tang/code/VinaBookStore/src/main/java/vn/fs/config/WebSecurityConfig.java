/*
 * (C) Copyright 2022. All Rights Reserved.
 *
 * @author DongTHD
 * @date Mar 10, 2022
*/
package vn.fs.config;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.builders.AuthenticationManagerBuilder;
import org.springframework.security.config.annotation.method.configuration.EnableGlobalMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configuration.WebSecurityConfigurerAdapter;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import vn.fs.service.implement.UserDetailsServiceImpl;

@Configuration
@EnableWebSecurity
@EnableGlobalMethodSecurity(prePostEnabled = true)
public class WebSecurityConfig extends WebSecurityConfigurerAdapter {

	@Autowired
	UserDetailsServiceImpl userDetailsService;

	@Autowired
	private AuthEntryPointJwt unauthorizedHandler;

	@Bean
	public AuthTokenFilter authenticationJwTokenFilter() {
		return new AuthTokenFilter();
	}

	@Override
	public void configure(AuthenticationManagerBuilder authenticationManagerBuilder) throws Exception {
		authenticationManagerBuilder.userDetailsService(userDetailsService).passwordEncoder(passwordEncoder());
	}

	@Bean
	@Override
	public AuthenticationManager authenticationManagerBean() throws Exception {
		return super.authenticationManagerBean();
	}

	@Bean
	public PasswordEncoder passwordEncoder() {
		return new BCryptPasswordEncoder();
	}

	@Override
	protected void configure(HttpSecurity http) throws Exception {
		http.cors().and().csrf().disable().exceptionHandling().authenticationEntryPoint(unauthorizedHandler).and()
				.sessionManagement().sessionCreationPolicy(SessionCreationPolicy.STATELESS);

		http.authorizeRequests()

				// ---- 1) CÔNG KHAI — duyệt catalog, đăng nhập/đăng ký, quên mật khẩu ----
				.antMatchers(HttpMethod.GET, "/api/products/*/preview")
				.permitAll()
				.antMatchers(HttpMethod.GET, "/api/products", "/api/products/bestseller", "/api/products/latest",
						"/api/products/rated", "/api/products/suggest/**", "/api/products/category/**",
						"/api/products/*")
				.permitAll()
				.antMatchers(HttpMethod.GET, "/api/categories", "/api/categories/*").permitAll()
				.antMatchers(HttpMethod.GET, "/api/homepage").permitAll()
				.antMatchers(HttpMethod.GET, "/api/chat/status").permitAll()
				.antMatchers("/api/chat/checkout/**").hasRole("USER")
				.antMatchers(HttpMethod.POST, "/api/chat").permitAll()
				.antMatchers(HttpMethod.POST, "/api/chat/stream", "/api/chat/feedback").permitAll()
				.antMatchers(HttpMethod.GET, "/api/payments/methods", "/api/payments/vnpay/**",
						"/api/payments/momo/return").permitAll()
				.antMatchers(HttpMethod.POST, "/api/payments/momo/ipn").permitAll()
				.antMatchers(HttpMethod.GET, "/api/rates", "/api/rates/*", "/api/rates/product/*").permitAll()
				.antMatchers(HttpMethod.POST, "/api/auth/signin", "/api/auth/signup",
						"/api/auth/send-mail-forgot-password-token")
				.permitAll()
				.antMatchers(HttpMethod.GET, "/api/auth/logout").permitAll()
				.antMatchers(HttpMethod.POST, "/api/send-mail/otp").permitAll()
				.antMatchers("/forgot-password", "/forgot-password/**").permitAll()
				// handshake WebSocket thông báo — trình duyệt không gắn được header JWT khi mở kết nối
				.antMatchers("/notification").permitAll()

				// ---- 2) CẦN ĐĂNG NHẬP (bất kỳ role) ----
				// gọi ngay sau khi admin-panel đăng nhập, trước khi biết được role
				.antMatchers(HttpMethod.GET, "/api/auth/email/*").authenticated()
				// người dùng tự cập nhật hồ sơ của mình
				.antMatchers(HttpMethod.PUT, "/api/auth/*").authenticated()

				// ---- 3) CHỈ KHÁCH ĐÃ ĐĂNG NHẬP (ROLE_USER) — giỏ hàng, đơn hàng, đánh giá của chính mình ----
				.antMatchers(HttpMethod.GET, "/api/orders/user/**").hasRole("USER")
				.antMatchers(HttpMethod.POST, "/api/orders/me/*/cancel").hasRole("USER")
				.antMatchers(HttpMethod.GET, "/api/orderDetail/**").hasAnyRole("USER", "ADMIN")
				.antMatchers(HttpMethod.POST, "/api/orders/*").hasRole("USER")
				.antMatchers(HttpMethod.POST, "/api/payments/orders/*/start").hasRole("USER")
				.antMatchers(HttpMethod.GET, "/api/payments/orders/*/status").hasAnyRole("USER", "ADMIN")
				.antMatchers("/api/cart/**", "/api/cartDetail/**", "/api/favorites/**").hasRole("USER")
				.antMatchers(HttpMethod.POST, "/api/rates").hasRole("USER")
				.antMatchers(HttpMethod.PUT, "/api/rates").hasRole("USER")

				// ---- 4) CHỈ ADMIN — quản trị catalog, đơn hàng, khách hàng, thống kê ----
				.antMatchers("/api/admin/products/**").hasRole("ADMIN")
				.antMatchers(HttpMethod.POST, "/api/products").hasRole("ADMIN")
				.antMatchers(HttpMethod.PUT, "/api/products/*").hasRole("ADMIN")
				.antMatchers(HttpMethod.DELETE, "/api/products/*").hasRole("ADMIN")
				.antMatchers(HttpMethod.GET, "/api/products/bestseller-admin").hasRole("ADMIN")
				.antMatchers(HttpMethod.POST, "/api/categories").hasRole("ADMIN")
				.antMatchers(HttpMethod.PUT, "/api/categories/*").hasRole("ADMIN")
				.antMatchers(HttpMethod.DELETE, "/api/categories/*").hasRole("ADMIN")
				.antMatchers(HttpMethod.DELETE, "/api/rates/*").hasRole("ADMIN")
				.antMatchers(HttpMethod.PUT, "/api/homepage").hasRole("ADMIN")
				.antMatchers(HttpMethod.GET, "/api/chat/admin/**").hasRole("ADMIN")
				.antMatchers("/api/statistical/**").hasRole("ADMIN")
				.antMatchers("/api/notification/**").hasRole("ADMIN")
				.antMatchers(HttpMethod.GET, "/api/orders", "/api/orders/*").hasRole("ADMIN")
				.antMatchers(HttpMethod.PUT, "/api/orders/cancel/*", "/api/orders/deliver/*",
						"/api/orders/success/*")
				.hasRole("ADMIN")
				.antMatchers(HttpMethod.PUT, "/api/payments/orders/*/mark-paid").hasRole("ADMIN")
				.antMatchers(HttpMethod.GET, "/api/auth", "/api/auth/*").hasRole("ADMIN")
				.antMatchers(HttpMethod.POST, "/api/auth").hasRole("ADMIN")
				.antMatchers(HttpMethod.PUT, "/api/auth/admin/*").hasRole("ADMIN")
				.antMatchers(HttpMethod.DELETE, "/api/auth/*").hasRole("ADMIN")

				// ---- 5) MẶC ĐỊNH — bất kỳ endpoint nào không liệt kê ở trên đều yêu cầu đăng nhập.
				// Đây là hàng rào cuối: kể cả API mới thêm sau này quên khai báo rule cũng
				// không bị mở công khai ngoài ý muốn (khác với trước đây — thiếu rule này +
				// thiếu dấu "/" ở đầu pattern khiến MỌI request đều lọt qua không bị chặn).
				.anyRequest().authenticated();

		http.addFilterBefore(authenticationJwTokenFilter(), UsernamePasswordAuthenticationFilter.class);
	}

}
