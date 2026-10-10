import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { forkJoin } from 'rxjs';
import { Category } from '../../common/Category';
import { DEFAULT_HOMEPAGE_CONFIG, HomepageConfig } from '../../common/HomepageConfig';
import { Product } from '../../common/Product';
import { CategoryService } from '../../services/category.service';
import { HomepageService } from '../../services/homepage.service';
import { PageService } from '../../services/page.service';
import { ProductService } from '../../services/product.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-homepage',
  templateUrl: './homepage.component.html',
  styleUrls: ['./homepage.component.css']
})
export class HomepageComponent implements OnInit {
  form!: FormGroup;
  products: Product[] = [];
  categories: Category[] = [];
  loading = true;
  saving = false;
  loadError = false;
  readonly storefrontUrl = environment.storefrontUrl;
  readonly iconOptions = [
    { value: 'truck', label: 'Giao hàng', icon: 'fa-truck' },
    { value: 'shield-check', label: 'Bảo mật', icon: 'fa-shield-alt' },
    { value: 'refresh-ccw', label: 'Đổi mới', icon: 'fa-sync-alt' },
    { value: 'headphones', label: 'Hỗ trợ', icon: 'fa-headphones-alt' },
    { value: 'gift', label: 'Quà tặng', icon: 'fa-gift' },
    { value: 'book-open', label: 'Sách', icon: 'fa-book-open' },
    { value: 'badge-check', label: 'Đảm bảo', icon: 'fa-check-circle' },
    { value: 'heart-handshake', label: 'Đồng hành', icon: 'fa-heart' }
  ];

  constructor(
    private fb: FormBuilder,
    private homepageService: HomepageService,
    private productService: ProductService,
    private categoryService: CategoryService,
    private pageService: PageService,
    private toastr: ToastrService
  ) { }

  ngOnInit(): void {
    this.pageService.setPageActive('homepage');
    this.createForm(DEFAULT_HOMEPAGE_CONFIG);
    this.loadData();
  }

  get benefitItems(): FormArray {
    return this.form.get('benefits.items') as FormArray;
  }

  private loadData(): void {
    this.loading = true;
    forkJoin({
      config: this.homepageService.getConfig(),
      products: this.productService.getAll(),
      categories: this.categoryService.getAll()
    }).subscribe(result => {
      this.products = (result.products as Product[]).filter(item => item.status !== false);
      this.categories = (result.categories as Category[]).filter(item => item.status !== false);
      this.createForm(this.mergeDefaults(result.config));
      this.loading = false;
    }, () => {
      this.loadError = true;
      this.loading = false;
      this.toastr.error('Không thể tải cấu hình trang chủ.', 'VinaBook');
    });
  }

  private createForm(config: HomepageConfig): void {
    this.form = this.fb.group({
      hero: this.fb.group({
        visible: [config.hero.visible],
        eyebrow: [config.hero.eyebrow, [Validators.required, Validators.maxLength(80)]],
        title: [config.hero.title, [Validators.required, Validators.maxLength(160)]],
        description: [config.hero.description, [Validators.required, Validators.maxLength(500)]],
        primaryLabel: [config.hero.primaryLabel, Validators.required],
        primaryRoute: [config.hero.primaryRoute, Validators.required],
        secondaryLabel: [config.hero.secondaryLabel, Validators.required],
        secondaryRoute: [config.hero.secondaryRoute, Validators.required],
        showScrollCue: [config.hero.showScrollCue],
        productIds: [[...config.hero.productIds]]
      }),
      benefits: this.fb.group({
        visible: [config.benefits.visible],
        title: [config.benefits.title, Validators.required],
        items: this.fb.array(config.benefits.items.map(item => this.fb.group({
          icon: [item.icon, Validators.required],
          title: [item.title, Validators.required],
          description: [item.description, Validators.required]
        })))
      }),
      latest: this.createProductSection(config.latest),
      stats: this.fb.group({
        visible: [config.stats.visible],
        booksLabel: [config.stats.booksLabel, Validators.required],
        categoriesLabel: [config.stats.categoriesLabel, Validators.required],
        shippingValue: [config.stats.shippingValue, Validators.required],
        shippingLabel: [config.stats.shippingLabel, Validators.required],
        freeShippingValue: [config.stats.freeShippingValue, Validators.required],
        freeShippingLabel: [config.stats.freeShippingLabel, Validators.required]
      }),
      bestseller: this.createProductSection(config.bestseller),
      categories: this.fb.group({
        visible: [config.categories.visible],
        title: [config.categories.title, Validators.required],
        categoryIds: [[...config.categories.categoryIds]]
      }),
      cta: this.fb.group({
        visible: [config.cta.visible],
        title: [config.cta.title, Validators.required],
        description: [config.cta.description, Validators.required],
        buttonLabel: [config.cta.buttonLabel, Validators.required],
        buttonRoute: [config.cta.buttonRoute, Validators.required]
      })
    });
  }

  private createProductSection(section: any): FormGroup {
    return this.fb.group({
      visible: [section.visible],
      overline: [section.overline],
      title: [section.title, Validators.required],
      linkLabel: [section.linkLabel, Validators.required],
      route: [section.route, Validators.required]
    });
  }

  private mergeDefaults(config: HomepageConfig): HomepageConfig {
    return {
      hero: { ...DEFAULT_HOMEPAGE_CONFIG.hero, ...(config && config.hero), productIds: config && config.hero && config.hero.productIds || [] },
      benefits: {
        ...DEFAULT_HOMEPAGE_CONFIG.benefits,
        ...(config && config.benefits),
        items: config && config.benefits && config.benefits.items && config.benefits.items.length
          ? config.benefits.items
          : DEFAULT_HOMEPAGE_CONFIG.benefits.items
      },
      latest: { ...DEFAULT_HOMEPAGE_CONFIG.latest, ...(config && config.latest) },
      stats: { ...DEFAULT_HOMEPAGE_CONFIG.stats, ...(config && config.stats) },
      bestseller: { ...DEFAULT_HOMEPAGE_CONFIG.bestseller, ...(config && config.bestseller) },
      categories: { ...DEFAULT_HOMEPAGE_CONFIG.categories, ...(config && config.categories), categoryIds: config && config.categories && config.categories.categoryIds || [] },
      cta: { ...DEFAULT_HOMEPAGE_CONFIG.cta, ...(config && config.cta) }
    };
  }

  isSelected(controlPath: string, id: number): boolean {
    const ids = this.form.get(controlPath)?.value as number[];
    return !!ids && ids.includes(id);
  }

  toggleSelection(controlPath: string, id: number, max?: number): void {
    const control = this.form.get(controlPath);
    const current = [...((control?.value || []) as number[])];
    const index = current.indexOf(id);
    if (index >= 0) {
      current.splice(index, 1);
    } else {
      if (max && current.length >= max) {
        this.toastr.info(`Bạn chỉ có thể chọn tối đa ${max} mục.`, 'VinaBook');
        return;
      }
      current.push(id);
    }
    control?.setValue(current);
    control?.markAsDirty();
  }

  restoreDefaults(): void {
    this.createForm(JSON.parse(JSON.stringify(DEFAULT_HOMEPAGE_CONFIG)));
    this.form.markAsDirty();
    this.toastr.info('Đã đưa nội dung về mặc định. Nhấn Lưu để áp dụng.', 'VinaBook');
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastr.warning('Vui lòng điền đầy đủ các trường bắt buộc.', 'VinaBook');
      return;
    }
    this.saving = true;
    this.homepageService.updateConfig(this.form.getRawValue() as HomepageConfig).subscribe(config => {
      this.createForm(this.mergeDefaults(config));
      this.saving = false;
      this.toastr.success('Trang chủ đã được cập nhật.', 'VinaBook');
    }, () => {
      this.saving = false;
      this.toastr.error('Lưu cấu hình thất bại. Vui lòng thử lại.', 'VinaBook');
    });
  }

  openStorefront(): void {
    window.open(this.storefrontUrl, '_blank', 'noopener');
  }
}
