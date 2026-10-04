import { Component, OnInit } from '@angular/core';
import { CategoryService } from 'src/app/services/category.service';
import { ProductService } from 'src/app/services/product.service';

@Component({
  selector: 'app-about',
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.scss']
})
export class AboutComponent implements OnInit {

  bookCount = 0;
  categoryCount = 0;

  reasons = [
    {
      icon: '📚',
      title: 'Kho sách phong phú',
      text: 'Đầy đủ thể loại từ văn học, kinh tế đến thiếu nhi, được tuyển chọn kỹ lưỡng từ các nhà xuất bản uy tín.'
    },
    {
      icon: '🚚',
      title: 'Giao hàng toàn quốc',
      text: 'Đóng gói cẩn thận, giao nhanh trong 2-4 ngày, miễn phí vận chuyển cho đơn từ 300.000đ.'
    },
    {
      icon: '💰',
      title: 'Giá tốt mỗi ngày',
      text: 'Khuyến mãi liên tục và giá luôn cạnh tranh để bạn yên tâm chọn sách hay.'
    },
    {
      icon: '🤝',
      title: 'Tận tâm với bạn đọc',
      text: 'Đổi trả dễ dàng trong 7 ngày, hỗ trợ tư vấn chọn sách qua hotline và email.'
    }
  ];

  constructor(
    private productService: ProductService,
    private categoryService: CategoryService
  ) {}

  ngOnInit(): void {
    this.productService.getProducts().subscribe(
      products => this.bookCount = products.length,
      () => this.bookCount = 0
    );
    this.categoryService.getAll().subscribe(
      categories => this.categoryCount = categories.length,
      () => this.categoryCount = 0
    );
  }

}
