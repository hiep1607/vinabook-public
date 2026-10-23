package vn.fs.service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.time.Duration;
import java.util.Base64;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.TimeZone;
import java.util.TreeMap;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import vn.fs.entity.Order;
import vn.fs.repository.OrderRepository;

@Service
public class PaymentGatewayService {

	private static final String COD = "COD";
	private static final String BANK_QR = "BANK_QR";
	private static final String VNPAY = "VNPAY";
	private static final String MOMO = "MOMO";
	private static final String PAID = "PAID";
	private static final String PENDING = "PENDING";
	private static final String FAILED = "FAILED";

	private final OrderRepository orderRepository;
	private final ObjectMapper objectMapper;
	private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

	@Value("${payment.frontend-url:http://localhost:4200}")
	private String frontendUrl;

	@Value("${payment.backend-url:http://localhost:8080}")
	private String backendUrl;

	@Value("${payment.bank.id:}")
	private String bankId;

	@Value("${payment.bank.account-no:}")
	private String bankAccountNo;

	@Value("${payment.bank.account-name:}")
	private String bankAccountName;

	@Value("${payment.bank.template:compact2}")
	private String bankTemplate;

	@Value("${payment.vnpay.tmn-code:}")
	private String vnpayTmnCode;

	@Value("${payment.vnpay.hash-secret:}")
	private String vnpayHashSecret;

	@Value("${payment.vnpay.pay-url:https://sandbox.vnpayment.vn/paymentv2/vpcpay.html}")
	private String vnpayPayUrl;

	@Value("${payment.momo.partner-code:}")
	private String momoPartnerCode;

	@Value("${payment.momo.access-key:}")
	private String momoAccessKey;

	@Value("${payment.momo.secret-key:}")
	private String momoSecretKey;

	@Value("${payment.momo.create-url:https://test-payment.momo.vn/v2/gateway/api/create}")
	private String momoCreateUrl;

	public PaymentGatewayService(OrderRepository orderRepository, ObjectMapper objectMapper) {
		this.orderRepository = orderRepository;
		this.objectMapper = objectMapper;
	}

	public Map<String, Object> availableMethods() {
		Map<String, Object> result = new LinkedHashMap<>();
		result.put(COD, method(true, "Thanh toán khi nhận hàng", "Thanh toán cho nhân viên giao hàng."));
		result.put(BANK_QR, method(bankConfigured(), "Chuyển khoản QR", bankConfigured()
				? "Quét mã VietQR và chờ cửa hàng xác nhận."
				: "Cửa hàng chưa cấu hình tài khoản nhận tiền."));
		result.put(VNPAY, method(vnpayConfigured(), "VNPay", vnpayConfigured()
				? "Thanh toán trên cổng VNPay Sandbox."
				: "Cần cấu hình tài khoản VNPay Sandbox."));
		result.put(MOMO, method(momoConfigured(), "MoMo", momoConfigured()
				? "Thanh toán trên cổng MoMo Test."
				: "Cần cấu hình tài khoản MoMo Test."));
		return result;
	}

	public Map<String, Object> start(Order order, String clientIp) {
		String method = paymentMethod(order);
		if (COD.equals(method)) {
			throw new IllegalArgumentException("Đơn COD không cần tạo giao dịch trực tuyến");
		}
		if (PAID.equals(paymentStatus(order))) {
			return orderStatus(order);
		}
		if (order.getStatus() == 2 || order.getStatus() == 3) {
			throw new IllegalStateException("Đơn hàng đã kết thúc, không thể thanh toán lại");
		}

		if (BANK_QR.equals(method)) {
			if (!bankConfigured()) {
				throw new IllegalStateException("Chuyển khoản QR chưa được cấu hình");
			}
			order.setPaymentReference("VB" + order.getOrdersId());
			order.setPaymentStatus(PENDING);
			orderRepository.save(order);
			return orderStatus(order);
		}
		if (VNPAY.equals(method)) {
			return startVnpay(order, clientIp);
		}
		if (MOMO.equals(method)) {
			return startMomo(order);
		}
		throw new IllegalArgumentException("Phương thức thanh toán không hợp lệ");
	}

	public Map<String, Object> orderStatus(Order order) {
		Map<String, Object> result = new LinkedHashMap<>();
		result.put("orderId", order.getOrdersId());
		result.put("amount", Math.round(order.getAmount()));
		result.put("paymentMethod", paymentMethod(order));
		result.put("paymentStatus", paymentStatus(order));
		result.put("paymentReference", order.getPaymentReference());
		result.put("paymentTransactionId", order.getPaymentTransactionId());
		result.put("paidAt", order.getPaidAt());
		result.put("orderStatus", order.getStatus());
		if (BANK_QR.equals(paymentMethod(order)) && bankConfigured()) {
			String content = order.getPaymentReference() == null ? "VB" + order.getOrdersId() : order.getPaymentReference();
			result.put("qrUrl", buildBankQrUrl(order, content));
			result.put("bankId", bankId);
			result.put("bankAccountNo", bankAccountNo);
			result.put("bankAccountName", bankAccountName);
			result.put("transferContent", content);
		}
		return result;
	}

	public Order markBankTransferPaid(Order order) {
		if (!BANK_QR.equals(paymentMethod(order))) {
			throw new IllegalArgumentException("Chỉ đơn chuyển khoản QR mới cần xác nhận thủ công");
		}
		markPaid(order, order.getPaymentReference());
		return order;
	}

	public CallbackResult handleVnpay(Map<String, String> params) {
		String reference = params.get("vnp_TxnRef");
		if (!verifyVnpay(params)) {
			return new CallbackResult(null, false, "97", "Invalid signature");
		}
		if (!notBlank(reference)) {
			return new CallbackResult(null, false, "01", "Order not found");
		}
		Optional<Order> found = orderRepository.findByPaymentReference(reference);
		if (!found.isPresent()) {
			return new CallbackResult(null, false, "01", "Order not found");
		}
		Order order = found.get();
		long callbackAmount = parseLong(params.get("vnp_Amount"), -1L);
		if (callbackAmount != Math.round(order.getAmount() * 100)) {
			return new CallbackResult(order, false, "04", "Invalid amount");
		}
		boolean success = "00".equals(params.get("vnp_ResponseCode"))
				&& "00".equals(params.get("vnp_TransactionStatus"));
		if (success) {
			markPaid(order, params.get("vnp_TransactionNo"));
		} else if (!PAID.equals(paymentStatus(order))) {
			order.setPaymentStatus(FAILED);
			orderRepository.save(order);
		}
		return new CallbackResult(order, success, "00", "Confirm Success");
	}

	public CallbackResult handleMomo(Map<String, ?> params) {
		String reference = string(params, "orderId");
		if (!verifyMomo(params)) {
			return new CallbackResult(null, false, "97", "Invalid signature");
		}
		if (!notBlank(reference)) {
			return new CallbackResult(null, false, "01", "Order not found");
		}
		Optional<Order> found = orderRepository.findByPaymentReference(reference);
		if (!found.isPresent()) {
			return new CallbackResult(null, false, "01", "Order not found");
		}
		Order order = found.get();
		long callbackAmount = parseLong(string(params, "amount"), -1L);
		if (callbackAmount != Math.round(order.getAmount())) {
			return new CallbackResult(order, false, "04", "Invalid amount");
		}
		boolean success = "0".equals(string(params, "resultCode"));
		if (success) {
			markPaid(order, string(params, "transId"));
		} else if (!PAID.equals(paymentStatus(order))) {
			order.setPaymentStatus(FAILED);
			orderRepository.save(order);
		}
		return new CallbackResult(order, success, "0", "Success");
	}

	public String frontendResultUrl(CallbackResult result, String gateway) {
		String base = frontendUrl.replaceAll("/+$", "") + "/payment/result";
		if (result.getOrder() == null) {
			return base + "?gateway=" + encode(gateway) + "&gatewayError=invalid";
		}
		return base + "?orderId=" + result.getOrder().getOrdersId() + "&gateway=" + encode(gateway);
	}

	private Map<String, Object> startVnpay(Order order, String clientIp) {
		if (!vnpayConfigured()) {
			throw new IllegalStateException("VNPay Sandbox chưa được cấu hình");
		}
		long amount = Math.round(order.getAmount());
		if (amount < 5000) {
			throw new IllegalArgumentException("VNPay yêu cầu số tiền tối thiểu 5.000đ");
		}
		String reference = "VB" + order.getOrdersId() + "-" + System.currentTimeMillis();
		Map<String, String> fields = new TreeMap<>();
		fields.put("vnp_Version", "2.1.0");
		fields.put("vnp_Command", "pay");
		fields.put("vnp_TmnCode", vnpayTmnCode);
		fields.put("vnp_Amount", String.valueOf(amount * 100));
		fields.put("vnp_CurrCode", "VND");
		fields.put("vnp_TxnRef", reference);
		fields.put("vnp_OrderInfo", "Thanh toan don hang " + order.getOrdersId());
		fields.put("vnp_OrderType", "other");
		fields.put("vnp_Locale", "vn");
		fields.put("vnp_ReturnUrl", backendUrl.replaceAll("/+$", "") + "/api/payments/vnpay/return");
		fields.put("vnp_IpAddr", normalizeIp(clientIp));
		fields.put("vnp_CreateDate", vnpayDate(0));
		fields.put("vnp_ExpireDate", vnpayDate(15 * 60 * 1000L));
		String signData = canonicalUrlEncoded(fields);
		String secureHash = hmac("HmacSHA512", vnpayHashSecret, signData);
		order.setPaymentReference(reference);
		order.setPaymentStatus(PENDING);
		orderRepository.save(order);
		Map<String, Object> response = orderStatus(order);
		response.put("redirectUrl", vnpayPayUrl + "?" + signData + "&vnp_SecureHash=" + secureHash);
		return response;
	}

	private Map<String, Object> startMomo(Order order) {
		if (!momoConfigured()) {
			throw new IllegalStateException("MoMo Test chưa được cấu hình");
		}
		long amount = Math.round(order.getAmount());
		if (amount < 1000 || amount > 50000000) {
			throw new IllegalArgumentException("MoMo chỉ nhận giao dịch từ 1.000đ đến 50.000.000đ");
		}
		String reference = "VB" + order.getOrdersId() + "-" + System.currentTimeMillis();
		String requestId = reference;
		String redirectUrl = backendUrl.replaceAll("/+$", "") + "/api/payments/momo/return";
		String ipnUrl = backendUrl.replaceAll("/+$", "") + "/api/payments/momo/ipn";
		String orderInfo = "Thanh toan don hang " + order.getOrdersId();
		String extraData = Base64.getEncoder().encodeToString(
				("{\"orderId\":" + order.getOrdersId() + "}").getBytes(StandardCharsets.UTF_8));
		String rawSignature = "accessKey=" + momoAccessKey + "&amount=" + amount + "&extraData=" + extraData
				+ "&ipnUrl=" + ipnUrl + "&orderId=" + reference + "&orderInfo=" + orderInfo
				+ "&partnerCode=" + momoPartnerCode + "&redirectUrl=" + redirectUrl
				+ "&requestId=" + requestId + "&requestType=payWithMethod";
		Map<String, Object> payload = new LinkedHashMap<>();
		payload.put("partnerCode", momoPartnerCode);
		payload.put("partnerName", "VinaBook");
		payload.put("storeId", "VinaBookStore");
		payload.put("requestType", "payWithMethod");
		payload.put("ipnUrl", ipnUrl);
		payload.put("redirectUrl", redirectUrl);
		payload.put("orderId", reference);
		payload.put("amount", amount);
		payload.put("lang", "vi");
		payload.put("orderInfo", orderInfo);
		payload.put("requestId", requestId);
		payload.put("extraData", extraData);
		payload.put("signature", hmac("HmacSHA256", momoSecretKey, rawSignature));

		order.setPaymentReference(reference);
		order.setPaymentStatus(PENDING);
		orderRepository.save(order);
		try {
			HttpRequest request = HttpRequest.newBuilder(URI.create(momoCreateUrl))
					.timeout(Duration.ofSeconds(20))
					.header("Content-Type", "application/json")
					.POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
					.build();
			HttpResponse<String> gatewayResponse = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
			Map<String, Object> body = objectMapper.readValue(gatewayResponse.body(), new TypeReference<Map<String, Object>>() { });
			if (gatewayResponse.statusCode() < 200 || gatewayResponse.statusCode() >= 300
					|| !"0".equals(string(body, "resultCode")) || string(body, "payUrl").isEmpty()) {
				throw new IllegalStateException(string(body, "message").isEmpty()
						? "MoMo không tạo được giao dịch" : string(body, "message"));
			}
			Map<String, Object> response = orderStatus(order);
			response.put("redirectUrl", string(body, "payUrl"));
			return response;
		} catch (Exception ex) {
			order.setPaymentStatus(FAILED);
			orderRepository.save(order);
			if (ex instanceof IllegalStateException) {
				throw (IllegalStateException) ex;
			}
			throw new IllegalStateException("Không kết nối được MoMo Test", ex);
		}
	}

	private String buildBankQrUrl(Order order, String content) {
		return "https://img.vietqr.io/image/" + encode(bankId) + "-" + encode(bankAccountNo) + "-"
				+ encode(bankTemplate) + ".png?amount=" + Math.round(order.getAmount())
				+ "&addInfo=" + encode(content) + "&accountName=" + encode(bankAccountName);
	}

	private boolean verifyVnpay(Map<String, String> params) {
		if (!vnpayConfigured() || params.get("vnp_SecureHash") == null
				|| !vnpayTmnCode.equals(params.get("vnp_TmnCode"))) {
			return false;
		}
		Map<String, String> signed = new TreeMap<>();
		params.forEach((key, value) -> {
			if (key.startsWith("vnp_") && !"vnp_SecureHash".equals(key) && !"vnp_SecureHashType".equals(key)
					&& value != null && !value.isEmpty()) {
				signed.put(key, value);
			}
		});
		String expected = hmac("HmacSHA512", vnpayHashSecret, canonicalUrlEncoded(signed));
		return secureEquals(expected, params.get("vnp_SecureHash"));
	}

	private boolean verifyMomo(Map<String, ?> params) {
		if (!momoConfigured() || string(params, "signature").isEmpty()
				|| !momoPartnerCode.equals(string(params, "partnerCode"))) {
			return false;
		}
		String rawSignature = "accessKey=" + momoAccessKey + "&amount=" + string(params, "amount")
				+ "&extraData=" + string(params, "extraData") + "&message=" + string(params, "message")
				+ "&orderId=" + string(params, "orderId") + "&orderInfo=" + string(params, "orderInfo")
				+ "&orderType=" + string(params, "orderType") + "&partnerCode=" + string(params, "partnerCode")
				+ "&payType=" + string(params, "payType") + "&requestId=" + string(params, "requestId")
				+ "&responseTime=" + string(params, "responseTime") + "&resultCode=" + string(params, "resultCode")
				+ "&transId=" + string(params, "transId");
		return secureEquals(hmac("HmacSHA256", momoSecretKey, rawSignature), string(params, "signature"));
	}

	private void markPaid(Order order, String gatewayTransactionId) {
		if (!PAID.equals(paymentStatus(order))) {
			order.setPaymentStatus(PAID);
			order.setPaidAt(new Date());
			if (gatewayTransactionId != null && !gatewayTransactionId.trim().isEmpty()) {
				order.setPaymentTransactionId(gatewayTransactionId.trim());
			}
			orderRepository.save(order);
		}
	}

	private Map<String, Object> method(boolean available, String label, String description) {
		Map<String, Object> value = new LinkedHashMap<>();
		value.put("available", available);
		value.put("label", label);
		value.put("description", description);
		return value;
	}

	private boolean bankConfigured() {
		return notBlank(bankId) && notBlank(bankAccountNo) && notBlank(bankAccountName);
	}

	private boolean vnpayConfigured() {
		return notBlank(vnpayTmnCode) && notBlank(vnpayHashSecret);
	}

	private boolean momoConfigured() {
		return notBlank(momoPartnerCode) && notBlank(momoAccessKey) && notBlank(momoSecretKey);
	}

	private String paymentMethod(Order order) {
		return order.getPaymentMethod() == null ? COD : order.getPaymentMethod();
	}

	private String paymentStatus(Order order) {
		return order.getPaymentStatus() == null ? "UNPAID" : order.getPaymentStatus();
	}

	private String canonicalUrlEncoded(Map<String, String> fields) {
		StringBuilder result = new StringBuilder();
		for (Map.Entry<String, String> field : new TreeMap<>(fields).entrySet()) {
			if (field.getValue() == null || field.getValue().isEmpty()) {
				continue;
			}
			if (result.length() > 0) {
				result.append('&');
			}
			result.append(encode(field.getKey())).append('=').append(encode(field.getValue()));
		}
		return result.toString();
	}

	private String vnpayDate(long offsetMs) {
		SimpleDateFormat format = new SimpleDateFormat("yyyyMMddHHmmss");
		format.setTimeZone(TimeZone.getTimeZone("GMT+7"));
		return format.format(new Date(System.currentTimeMillis() + offsetMs));
	}

	private String normalizeIp(String ip) {
		if (ip == null || ip.trim().isEmpty()) {
			return "127.0.0.1";
		}
		String first = ip.contains(",") ? ip.substring(0, ip.indexOf(',')).trim() : ip.trim();
		return first.matches("[0-9a-fA-F:.]+") ? first : "127.0.0.1";
	}

	private String hmac(String algorithm, String secret, String data) {
		try {
			Mac mac = Mac.getInstance(algorithm);
			mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), algorithm));
			byte[] digest = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
			StringBuilder hex = new StringBuilder(digest.length * 2);
			for (byte value : digest) {
				hex.append(String.format("%02x", value));
			}
			return hex.toString();
		} catch (Exception ex) {
			throw new IllegalStateException("Không thể ký yêu cầu thanh toán", ex);
		}
	}

	private boolean secureEquals(String first, String second) {
		if (first == null || second == null) {
			return false;
		}
		return MessageDigest.isEqual(first.toLowerCase().getBytes(StandardCharsets.UTF_8),
				second.toLowerCase().getBytes(StandardCharsets.UTF_8));
	}

	private String encode(String value) {
		return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
	}

	private String string(Map<String, ?> map, String key) {
		Object value = map.get(key);
		return value == null ? "" : String.valueOf(value);
	}

	private long parseLong(String value, long fallback) {
		try {
			return Long.parseLong(value);
		} catch (Exception ex) {
			return fallback;
		}
	}

	private boolean notBlank(String value) {
		return value != null && !value.trim().isEmpty();
	}

	public static class CallbackResult {
		private final Order order;
		private final boolean success;
		private final String responseCode;
		private final String message;

		public CallbackResult(Order order, boolean success, String responseCode, String message) {
			this.order = order;
			this.success = success;
			this.responseCode = responseCode;
			this.message = message;
		}

		public Order getOrder() { return order; }
		public boolean isSuccess() { return success; }
		public String getResponseCode() { return responseCode; }
		public String getMessage() { return message; }
	}
}
