package vn.fs.service;

import java.text.NumberFormat;
import java.util.List;
import java.util.Locale;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fs.config.CurrentUserAccess;
import vn.fs.entity.Order;
import vn.fs.entity.User;
import vn.fs.repository.OrderRepository;
import vn.fs.repository.UserRepository;

@Service
public class ChatOrderSupportService {
	private final CurrentUserAccess access;
	private final UserRepository users;
	private final OrderRepository orders;
	private vn.fs.repository.OrderDetailRepository details;
	@org.springframework.beans.factory.annotation.Autowired
	public void setDetails(vn.fs.repository.OrderDetailRepository details) { this.details=details; }

	@Transactional(readOnly = true)
	public Long latestOrderId() {
		String email=access.currentEmail();
		if(email==null)return null;
		User user=users.findByEmail(email).orElse(null);
		if(user==null)return null;
		return orders.findByUserOrderByOrdersIdDesc(user).stream().findFirst().map(Order::getOrdersId).orElse(null);
	}

	public ChatOrderSupportService(CurrentUserAccess access, UserRepository users, OrderRepository orders) {
		this.access = access;
		this.users = users;
		this.orders = orders;
	}

	@Transactional(readOnly = true)
	public String latestOrders() {
		String email = access.currentEmail();
		if (email == null) return "Bạn cần đăng nhập để mình tra cứu đơn hàng. Sau khi đăng nhập, hãy hỏi lại “Đơn hàng của tôi đang ở đâu?”.";
		User user = users.findByEmail(email).orElse(null);
		if (user == null) return "Mình chưa tìm thấy tài khoản hiện tại. Bạn vui lòng đăng nhập lại.";
		List<Order> list = orders.findByUserOrderByOrdersIdDesc(user);
		if (list.isEmpty()) return "Tài khoản của bạn chưa có đơn hàng nào.";
		StringBuilder answer = new StringBuilder("Các đơn gần nhất của bạn:\n");
		for (Order order : list.subList(0, Math.min(3, list.size()))) {
			answer.append("• #").append(order.getOrdersId()).append(" — ")
					.append(status(order.getStatus())).append(" — ")
					.append(NumberFormat.getNumberInstance(new Locale("vi", "VN")).format(order.getAmount())).append("đ\n");
		}
		answer.append("Mở mục Đơn hàng để xem đầy đủ và tiếp tục thanh toán nếu cần.");
		return answer.toString();
	}

	private String status(int value) {
		if (value == 1) return "Đang giao";
		if (value == 2) return "Hoàn thành";
		if (value == 3) return "Đã hủy";
		return "Đang xử lý";
	}

	@Transactional(readOnly = true)
	public String orderById(Long id) {
		String email = access.currentEmail();
		if (email == null) return "Bạn cần đăng nhập để tra cứu đơn hàng.";
		User user = users.findByEmail(email).orElse(null);
		if (user == null) return "Vui lòng đăng nhập lại.";
		Order order = orders.findByUserOrderByOrdersIdDesc(user).stream()
			.filter(o -> id.equals(o.getOrdersId())).findFirst().orElse(null);
		if (order == null) return "Mình không tìm thấy mã đơn này trong tài khoản của bạn. Bạn kiểm tra lại mã đơn nhé.";
		StringBuilder items=new StringBuilder();
		if(details!=null)for(var item:details.findByOrder(order)) {
			items.append("\n• ").append(item.getProduct()==null?"Sản phẩm không còn thông tin":item.getProduct().getName())
				.append(" — ").append(item.getQuantity()).append(" cuốn");
		}
		return "Đơn #" + id + ": " + status(order.getStatus())
			+ (order.getOrderDate()==null?"":". Ngày đặt: "+new java.text.SimpleDateFormat("dd/MM/yyyy HH:mm").format(order.getOrderDate())) + ". Tổng tiền "
			+ NumberFormat.getNumberInstance(new Locale("vi", "VN")).format(order.getAmount())
			+ "đ. Phương thức: " + order.getPaymentMethod() + ". "
			+ ("PAID".equals(order.getPaymentStatus()) ? "Đã thanh toán." : "Chưa ghi nhận thanh toán.")
			+ items.toString()
			+ "\nMình chưa có dữ liệu vị trí vận chuyển trực tiếp; bạn có thể mở mục Đơn hàng để xem chi tiết.";
	}
}
