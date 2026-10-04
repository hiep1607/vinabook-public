import { NgModule } from '@angular/core';
import {
  LucideAngularModule,
  Truck,
  ShieldCheck,
  RefreshCcw,
  Headphones,
  Search,
  ShoppingCart,
  Heart,
  User,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  Book,
  Tag,
  Minus,
  Plus,
  X,
  Menu,
  Palette,
  MessageCircle,
  Send,
  BookOpen,
  Trash2
} from 'lucide-angular';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { HomeComponent } from './pages/home/home.component';
import { ProductDetailComponent } from './pages/product-detail/product-detail.component';
import { CartComponent } from './pages/cart/cart.component';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';
import { CheckoutComponent } from './pages/checkout/checkout.component';
import { HeaderComponent } from './components/header/header.component';
import { ProductCardComponent } from './components/product-card/product-card.component';
import { ProfileComponent } from './pages/profile/profile.component';
import { OrdersComponent } from './pages/orders/orders.component';
import { SearchComponent } from './pages/search/search.component';
import { ToastComponent } from './shared/toast/toast.component';
import { WishlistComponent } from './pages/wishlist/wishlist.component';
import { CategoryComponent } from './pages/category/category.component';
import { BooksComponent } from './pages/books/books.component';
import { AboutComponent } from './pages/about/about.component';
import { ContactComponent } from './pages/contact/contact.component';
import { ChatbotComponent } from './components/chatbot/chatbot.component';
import { RevealDirective } from './shared/directives/reveal.directive';
import { CountUpDirective } from './shared/directives/count-up.directive';
import { NgrokSkipInterceptor } from './core/ngrok-skip.interceptor';
import { AuthInterceptor } from './core/interceptors/auth.interceptor';
import { FooterComponent } from './components/footer/footer.component';
import { NotFoundComponent } from './pages/not-found/not-found.component';
import { ThemeSwitcherComponent } from './components/theme-switcher/theme-switcher.component';
import { PaymentResultComponent } from './pages/payment-result/payment-result.component';
import { Book3dViewerComponent } from './components/book-3d-viewer/book-3d-viewer.component';
import { BookPreviewReaderComponent } from './components/book-preview-reader/book-preview-reader.component';

@NgModule({
  declarations: [
    AppComponent,
    HomeComponent,
    ProductDetailComponent,
    CartComponent,
    LoginComponent,
    RegisterComponent,
    CheckoutComponent,
    HeaderComponent,
    ProductCardComponent,
    ProfileComponent,
    OrdersComponent,
    SearchComponent,
    ToastComponent,
    WishlistComponent,
    CategoryComponent,
    BooksComponent,
    AboutComponent,
    ContactComponent,
    ChatbotComponent,
    RevealDirective,
    CountUpDirective,
    FooterComponent,
    NotFoundComponent,
    ThemeSwitcherComponent,
    PaymentResultComponent,
    Book3dViewerComponent,
    BookPreviewReaderComponent
  ],

  imports: [
    BrowserModule,
    AppRoutingModule,

    HttpClientModule,

    FormsModule,
    LucideAngularModule.pick({
      Truck,
      ShieldCheck,
      RefreshCcw,
      Headphones,
      Search,
      ShoppingCart,
      Heart,
      User,
      ChevronLeft,
      ChevronRight,
      ChevronDown,
      Clock,
      Book,
      Tag,
      Minus,
      Plus,
      X,
      Menu,
      Palette,
      MessageCircle,
      Send,
      BookOpen,
      Trash2
    }),
  ],

  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: NgrokSkipInterceptor,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    }
  ],

  bootstrap: [AppComponent]
})

export class AppModule { }
