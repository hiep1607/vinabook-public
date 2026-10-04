import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { ProductDetailComponent } from './pages/product-detail/product-detail.component';
import { CartComponent } from './pages/cart/cart.component';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';
import { CheckoutComponent } from './pages/checkout/checkout.component';
import { ProfileComponent } from './pages/profile/profile.component';
import { OrdersComponent } from './pages/orders/orders.component';
import { SearchComponent } from './pages/search/search.component';
import { WishlistComponent } from './pages/wishlist/wishlist.component';
import { CategoryComponent } from './pages/category/category.component';
import { BooksComponent } from './pages/books/books.component';
import { AboutComponent } from './pages/about/about.component';
import { ContactComponent } from './pages/contact/contact.component';
import { NotFoundComponent } from './pages/not-found/not-found.component';
import { AuthGuard } from './core/guards/auth.guard';
import { PaymentResultComponent } from './pages/payment-result/payment-result.component';

const routes: Routes = [

  { path: '', component: HomeComponent, data: { pageTitle: 'Nhà sách trực tuyến' } },

  { path: 'books', component: BooksComponent, data: { mode: 'all', pageTitle: 'Tất cả sách' } },

  { path: 'books/new', component: BooksComponent, data: { mode: 'new', pageTitle: 'Sách mới' } },

  { path: 'books/bestseller', component: BooksComponent, data: { mode: 'bestseller', pageTitle: 'Sách bán chạy' } },

  { path: 'books/sale', component: BooksComponent, data: { mode: 'sale', pageTitle: 'Sách khuyến mãi' } },

  { path: 'about', component: AboutComponent, data: { pageTitle: 'Giới thiệu' } },

  { path: 'contact', component: ContactComponent, data: { pageTitle: 'Liên hệ' } },

  { path: 'category/:id', component: CategoryComponent, data: { pageTitle: 'Thể loại sách' } },

  { path: 'product/:id', component: ProductDetailComponent, data: { pageTitle: 'Chi tiết sách' } },

  { path: 'cart', component: CartComponent, data: { pageTitle: 'Giỏ hàng' } },

  { path: 'login', component: LoginComponent, data: { pageTitle: 'Đăng nhập' } },

  { path: 'register', component: RegisterComponent, data: { pageTitle: 'Đăng ký' } },

  { path: 'checkout', component: CheckoutComponent, canActivate: [AuthGuard], data: { pageTitle: 'Thanh toán' } },

  { path: 'payment/result', component: PaymentResultComponent, canActivate: [AuthGuard], data: { pageTitle: 'Kết quả thanh toán' } },

  { path: 'profile', component: ProfileComponent, canActivate: [AuthGuard], data: { pageTitle: 'Tài khoản' } },

  { path: 'orders', component: OrdersComponent, canActivate: [AuthGuard], data: { pageTitle: 'Đơn hàng' } },

  { path: 'search', component: SearchComponent, data: { pageTitle: 'Tìm kiếm' } },

  { path: 'wishlist', component: WishlistComponent, canActivate: [AuthGuard], data: { pageTitle: 'Yêu thích' } },

  { path: '**', component: NotFoundComponent, data: { pageTitle: 'Không tìm thấy trang' } }

];

@NgModule({
  imports: [
    RouterModule.forRoot(
      routes,
      {
        scrollPositionRestoration: 'top'
      }
    )
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
