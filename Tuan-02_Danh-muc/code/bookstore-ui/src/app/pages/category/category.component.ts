import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, Subscription } from 'rxjs';
import { CategoryService } from 'src/app/services/category.service';
import { ProductService } from 'src/app/services/product.service';

@Component({
  selector: 'app-category',
  templateUrl: './category.component.html',
  styleUrls: ['./category.component.scss']
})
export class CategoryComponent implements OnInit, OnDestroy {

  categoryId: number = 0;
  category: any = null;
  products: any[] = [];
  loading = true;
  error = '';

  readonly skeletonItems = [1, 2, 3, 4, 5, 6, 7, 8];
  private subscriptions = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private categoryService: CategoryService,
    private productService: ProductService
  ) {}

  ngOnInit(): void {

    this.subscriptions.add(this.route.params.subscribe(params => {

      this.categoryId = parseInt(params['id'], 10);

      if (!this.categoryId) {
        this.router.navigate(['/']);
        return;
      }

      this.loadData();

    }));

  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  retry(): void {
    this.loading = true;
    this.error = '';
    this.productService.refresh();
    this.loadData();
  }

  private loadData(): void {
    this.loading = true;
    this.error = '';

    this.subscriptions.add(forkJoin({
      category: this.categoryService.getOne(this.categoryId),
      products: this.productService.getProductsByCategory(this.categoryId)
    }).subscribe(
      ({ category, products }) => {
        this.category = category;
        this.products = products;
        this.loading = false;
      },
      () => {
        this.error = 'Không tải được thể loại và danh sách sản phẩm';
        this.loading = false;
      }
    ));
  }

}
