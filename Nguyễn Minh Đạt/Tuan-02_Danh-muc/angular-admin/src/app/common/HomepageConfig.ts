export interface HomepageHeroConfig {
  visible: boolean;
  eyebrow: string;
  title: string;
  description: string;
  primaryLabel: string;
  primaryRoute: string;
  secondaryLabel: string;
  secondaryRoute: string;
  showScrollCue: boolean;
  productIds: number[];
}

export interface HomepageBenefitItem {
  icon: string;
  title: string;
  description: string;
}

export interface HomepageBenefitsConfig {
  visible: boolean;
  title: string;
  items: HomepageBenefitItem[];
}

export interface HomepageProductSectionConfig {
  visible: boolean;
  overline: string;
  title: string;
  linkLabel: string;
  route: string;
}

export interface HomepageStatsConfig {
  visible: boolean;
  booksLabel: string;
  categoriesLabel: string;
  shippingValue: string;
  shippingLabel: string;
  freeShippingValue: string;
  freeShippingLabel: string;
}

export interface HomepageCategoriesConfig {
  visible: boolean;
  title: string;
  categoryIds: number[];
}

export interface HomepageCtaConfig {
  visible: boolean;
  title: string;
  description: string;
  buttonLabel: string;
  buttonRoute: string;
}

export interface HomepageConfig {
  hero: HomepageHeroConfig;
  benefits: HomepageBenefitsConfig;
  latest: HomepageProductSectionConfig;
  stats: HomepageStatsConfig;
  bestseller: HomepageProductSectionConfig;
  categories: HomepageCategoriesConfig;
  cta: HomepageCtaConfig;
}

export const DEFAULT_HOMEPAGE_CONFIG: HomepageConfig = {
  hero: {
    visible: true,
    eyebrow: 'Nhà sách trực tuyến',
    title: 'Khám phá thế giới tri thức',
    description: 'Những cuốn sách được chọn lọc kỹ lưỡng, đồng hành cùng bạn trên hành trình học hỏi và trưởng thành.',
    primaryLabel: 'Khám phá sách',
    primaryRoute: '/books',
    secondaryLabel: 'Sách bán chạy',
    secondaryRoute: '/books/bestseller',
    showScrollCue: true,
    productIds: []
  },
  benefits: {
    visible: true,
    title: 'An tâm khi mua sách tại VinaBook',
    items: [
      { icon: 'truck', title: 'Giao hàng nhanh', description: 'Vận chuyển toàn quốc, đóng gói cẩn thận.' },
      { icon: 'shield-check', title: 'Thanh toán thuận tiện', description: 'Thanh toán khi nhận hàng, rõ ràng và an toàn.' },
      { icon: 'refresh-ccw', title: 'Ưu đãi mỗi ngày', description: 'Nhiều tựa sách giảm giá, cập nhật liên tục.' },
      { icon: 'headphones', title: 'Hỗ trợ tận tâm', description: 'Đội ngũ tư vấn luôn sẵn sàng đồng hành.' }
    ]
  },
  latest: {
    visible: true,
    overline: 'Vừa cập nhật',
    title: 'Sách mới nhất',
    linkLabel: 'Xem tất cả',
    route: '/books/new'
  },
  stats: {
    visible: true,
    booksLabel: 'Đầu sách',
    categoriesLabel: 'Thể loại',
    shippingValue: '2-4',
    shippingLabel: 'Ngày giao hàng dự kiến',
    freeShippingValue: '300K',
    freeShippingLabel: 'Miễn phí vận chuyển từ'
  },
  bestseller: {
    visible: true,
    overline: '',
    title: 'Sách bán chạy',
    linkLabel: 'Xem bảng xếp hạng',
    route: '/books/bestseller'
  },
  categories: {
    visible: true,
    title: 'Danh mục nổi bật',
    categoryIds: []
  },
  cta: {
    visible: true,
    title: 'Cuốn sách tiếp theo đang chờ bạn',
    description: 'Khám phá kho sách đa dạng và tìm nguồn cảm hứng cho hành trình mới.',
    buttonLabel: 'Khám phá ngay',
    buttonRoute: '/books'
  }
};
