package vn.fs.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.ObjectMapper;

import vn.fs.entity.Order;
import vn.fs.repository.OrderRepository;
import vn.fs.service.PaymentGatewayService.CallbackResult;

@ExtendWith(MockitoExtension.class)
class PaymentGatewayServiceTest {

	@Mock
	private OrderRepository orderRepository;

	private PaymentGatewayService service;

	@BeforeEach
	void setUp() {
		service = new PaymentGatewayService(orderRepository, new ObjectMapper());
		ReflectionTestUtils.setField(service, "bankId", "970422");
		ReflectionTestUtils.setField(service, "bankAccountNo", "123456789");
		ReflectionTestUtils.setField(service, "bankAccountName", "VINABOOK TEST");
		ReflectionTestUtils.setField(service, "bankTemplate", "compact2");
		ReflectionTestUtils.setField(service, "vnpayTmnCode", "TESTCODE");
		ReflectionTestUtils.setField(service, "vnpayHashSecret", "test-secret");
		ReflectionTestUtils.setField(service, "momoPartnerCode", "");
		ReflectionTestUtils.setField(service, "momoAccessKey", "");
		ReflectionTestUtils.setField(service, "momoSecretKey", "");
	}

	@Test
	void methodsExposeAvailabilityButNeverCredentials() {
		String json = service.availableMethods().toString();

		assertThat(json).contains("BANK_QR={available=true")
				.contains("VNPAY={available=true")
				.contains("MOMO={available=false")
				.doesNotContain("test-secret")
				.doesNotContain("123456789");
	}

	@Test
	void bankQrIsBoundToOrderAmountAndReference() {
		Order order = order(57L, 70520D, "BANK_QR", "PENDING", "VB57");

		Map<String, Object> status = service.orderStatus(order);

		assertThat(status.get("transferContent")).isEqualTo("VB57");
		assertThat(status.get("amount")).isEqualTo(70520L);
		assertThat(status.get("qrUrl").toString())
				.contains("amount=70520")
				.contains("addInfo=VB57");
	}

	@Test
	void invalidVnpaySignatureNeverChangesPaymentStatus() {
		Order order = order(58L, 100000D, "VNPAY", "PENDING", "VB58-1");
		Map<String, String> callback = new LinkedHashMap<>();
		callback.put("vnp_TxnRef", "VB58-1");
		callback.put("vnp_Amount", "10000000");
		callback.put("vnp_ResponseCode", "00");
		callback.put("vnp_TransactionStatus", "00");
		callback.put("vnp_SecureHash", "invalid");

		CallbackResult result = service.handleVnpay(callback);

		assertThat(result.isSuccess()).isFalse();
		assertThat(result.getResponseCode()).isEqualTo("97");
		assertThat(order.getPaymentStatus()).isEqualTo("PENDING");
		verify(orderRepository, never()).findByPaymentReference("VB58-1");
		verify(orderRepository, never()).save(order);
	}

	private Order order(Long id, Double amount, String method, String status, String reference) {
		Order order = new Order();
		order.setOrdersId(id);
		order.setAmount(amount);
		order.setPaymentMethod(method);
		order.setPaymentStatus(status);
		order.setPaymentReference(reference);
		return order;
	}
}
