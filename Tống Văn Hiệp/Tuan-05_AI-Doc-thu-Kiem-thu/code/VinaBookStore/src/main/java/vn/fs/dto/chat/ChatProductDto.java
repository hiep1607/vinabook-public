package vn.fs.dto.chat;

public class ChatProductDto {

	private final Long id;
	private final String name;
	private final String author;
	private final String category;
	private final long price;
	private final double oldPrice;
	private final int discount;
	private final int quantity;
	private final String image;

	public ChatProductDto(Long id, String name, String author, String category, long price,
			double oldPrice, int discount, int quantity, String image) {
		this.id = id;
		this.name = name;
		this.author = author;
		this.category = category;
		this.price = price;
		this.oldPrice = oldPrice;
		this.discount = discount;
		this.quantity = quantity;
		this.image = image;
	}

	public Long getId() { return id; }
	public String getName() { return name; }
	public String getAuthor() { return author; }
	public String getCategory() { return category; }
	public long getPrice() { return price; }
	public double getOldPrice() { return oldPrice; }
	public int getDiscount() { return discount; }
	public int getQuantity() { return quantity; }
	public String getImage() { return image; }
}
