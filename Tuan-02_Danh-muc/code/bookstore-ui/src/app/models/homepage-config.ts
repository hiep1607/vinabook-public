export interface HomepageConfig {
  hero: {
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
  };
  benefits: {
    visible: boolean;
    title: string;
    items: Array<{ icon: string; title: string; description: string }>;
  };
  latest: ProductHomepageSection;
  stats: {
    visible: boolean;
    booksLabel: string;
    categoriesLabel: string;
    shippingValue: string;
    shippingLabel: string;
    freeShippingValue: string;
    freeShippingLabel: string;
  };
  bestseller: ProductHomepageSection;
  categories: {
    visible: boolean;
    title: string;
    categoryIds: number[];
  };
  cta: {
    visible: boolean;
    title: string;
    description: string;
    buttonLabel: string;
    buttonRoute: string;
  };
}
export interface ProductHomepageSection {
  visible: boolean;
  overline: string;
  title: string;
  linkLabel: string;
  route: string;
}

export const DEFAULT_HOMEPAGE_CONFIG: HomepageConfig = {
  hero: {
    visible: true,
    eyebrow: 'Nhà sách trực tuyến',
    title: 'Khám phá thế giới tri thức',
    description: 'Sách chọn lọc, giao nhanh toàn quốc và nhiều ưu đãi để bạn tìm thấy cuốn sách đáng đọc tiếp theo.',
    primaryLabel: 'Khám phá sách',
    primaryRoute: '/books',
    secondaryLabel: 'Sách mới nhất',
    secondaryRoute: '/books/new',
    showScrollCue: true,
    productIds: []
  },
  benefits: {
    visible: true,
    title: 'An tâm khi mua sách tại VinaBook',
    items: [
      { icon: 'truck', title: 'Giao hàng nhanh', description: 'Vận chuyển toàn quốc, đóng gói cẩn thận, theo dõi đơn 24/7.' },
      { icon: 'shield-check', title: 'Thanh toán thuận tiện', description: 'Thanh toán khi nhận hàng, rõ ràng và dễ kiểm tra kiện sách.' },
      { icon: 'refresh-ccw', title: 'Ưu đãi mỗi ngày', description: 'Hàng trăm tựa sách giảm giá, cập nhật khuyến mãi liên tục.' },
      { icon: 'headphones', title: 'Hỗ trợ tận tâm', description: 'Đội ngũ tư vấn nhiệt tình, đồng hành cùng bạn mọi lúc.' }
    ]
  },
  latest: { visible: true, overline: 'Vừa cập nhật', title: 'Sách mới nhất', linkLabel: 'Xem tất cả', route: '/books/new' },
  stats: {
    visible: true,
    booksLabel: 'Đầu sách',
    categoriesLabel: 'Thể loại',
    shippingValue: '2-4',
    shippingLabel: 'Ngày giao hàng dự kiến',
    freeShippingValue: '300K',
    freeShippingLabel: 'Miễn phí vận chuyển từ'
  },
  bestseller: { visible: true, overline: '', title: 'Sách bán chạy nhất', linkLabel: 'Xem tất cả', route: '/books/bestseller' },
  categories: { visible: true, title: 'Danh mục nổi bật', categoryIds: [] },
  cta: {
    visible: true,
    title: 'Tìm cuốn sách tiếp theo của bạn',
    description: 'Khám phá danh mục mới, sách bán chạy và những tựa sách đang được giảm giá.',
    buttonLabel: 'Xem tất cả sách',
    buttonRoute: '/books'
  }
};

export function normalizeHomepageConfig(value: Partial<HomepageConfig> | null | undefined): HomepageConfig {
  const config: any = value || {};
  const items = config.benefits && Array.isArray(config.benefits.items) && config.benefits.items.length === 4
    ? config.benefits.items
    : DEFAULT_HOMEPAGE_CONFIG.benefits.items;

  return {
    hero: { ...DEFAULT_HOMEPAGE_CONFIG.hero, ...(config.hero || {}), productIds: config.hero?.productIds || [] },
    benefits: { ...DEFAULT_HOMEPAGE_CONFIG.benefits, ...(config.benefits || {}), items },
    latest: { ...DEFAULT_HOMEPAGE_CONFIG.latest, ...(config.latest || {}) },
    stats: { ...DEFAULT_HOMEPAGE_CONFIG.stats, ...(config.stats || {}) },
    bestseller: { ...DEFAULT_HOMEPAGE_CONFIG.bestseller, ...(config.bestseller || {}) },
    categories: { ...DEFAULT_HOMEPAGE_CONFIG.categories, ...(config.categories || {}), categoryIds: config.categories?.categoryIds || [] },
    cta: { ...DEFAULT_HOMEPAGE_CONFIG.cta, ...(config.cta || {}) }
  };
}
