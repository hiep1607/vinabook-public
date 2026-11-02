// Separate manual QA entry point. Never imported by src/main.ts or production routes.
import 'zone.js';
import { Component, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { Observable } from 'rxjs';
import { BookPreviewReaderComponent } from '../src/app/components/book-preview-reader/book-preview-reader.component';
import { Book3dViewerComponent } from '../src/app/components/book-3d-viewer/book-3d-viewer.component';
import { ProductService } from '../src/app/services/product.service';
import { BookPreviewManifest } from '../src/app/models/book-preview';
import { LucideAngularModule, BookOpen } from 'lucide-angular';

const excerpts = [
  'Sáng hôm ấy, An lên chuyến tàu đầu tiên, mang theo một chiếc túi nhỏ và cuốn sổ chưa viết hết. Thành phố còn ngái ngủ. Trên ô cửa, những giọt sương níu nhau thành một đường mảnh.',
  'Lần đầu sau nhiều tháng, cô không đặt báo thức cho ngày mai. Vé tàu chỉ có một chiều. Ở cuối đường ray là căn nhà cũ của bà, khu vườn đầy nắng và một mùa hè mà cô tưởng mình đã quên.',
  'Người ngồi đối diện bóc một quả quýt. Mùi vỏ quýt dịu và tươi, làm An nhớ những buổi chiều đi học về. Bà thường để sẵn hai quả trên bậc cửa, cạnh một cốc nước đã nguội.'
];
function pageImage(index: number): string {
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 1084;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f5f0e5'; ctx.fillRect(0, 0, 768, 1084);
  ctx.fillStyle = '#392f26'; ctx.font = '20px sans-serif';
  ctx.fillText('NỘI DUNG MINH HỌA — KHÔNG PHẢI NỘI DUNG SÁCH', 44, 64);
  ctx.font = '40px Georgia'; ctx.fillText('Paperbound · Trang ' + (index + 1), 70, 160);
  ctx.font = '28px Georgia';
  let line = '', y = 255;
  for (const word of excerpts[index % excerpts.length].split(' ')) {
    if (ctx.measureText(line + word).width > 620) { ctx.fillText(line, 70, y); y += 48; line = ''; }
    line += word + ' ';
  }
  ctx.fillText(line, 70, y);
  ctx.font = '22px sans-serif'; ctx.fillText('TRÁI ←   ' + (index + 1) + '   → PHẢI', 235, 1000);
  return canvas.toDataURL('image/png');
}
let count = 5, delay = 0, broken = false, textMode = false;
const images = new Map<number, string>();
function imageAt(i: number): string { if (!images.has(i)) { images.set(i, pageImage(i)); } return images.get(i)!; }
class PreviewStub {
  getPreview(productId: number): Observable<BookPreviewManifest> {
    return new Observable(sub => {
      const requestedCount = count, requestedBroken = broken, requestedText = textMode;
      const timer = setTimeout(() => {
        sub.next({ productId, enabled: true, pageCount: requestedCount,
          pages: Array.from({length:requestedCount}, (_, i) => ({
            pageOrder:i + 1, originalPageNumber:i + 11,
            contentType: requestedText ? 'text' as const : 'image' as const,
            heading: requestedText ? 'Trang minh họa ' + (i + 1) : undefined,
            textContent: requestedText ? excerpts.join('\n\n') : undefined, fontSize:20,
            fontFamily:'serif' as const, textAlign:'left' as const,
            imageUrl: requestedBroken && i === 1 ? '/missing-test-page.png' : imageAt(i)
          })) }); sub.complete();
      }, delay);
      return () => clearTimeout(timer);
    });
  }
}
@Component({
  selector:'app-root',
  template: `
    <main style="padding:32px; min-height:150vh">
      <h1>Kiểm thử Paperbound</h1>
      <p>Nội dung minh họa — không phải nội dung sách. Trang này không thuộc bản production.</p>
      <p *ngFor="let n of [0,1,5,6,20,100]"><button (click)="configure(n)">Đọc thử {{n}} trang</button></p>
      <button (click)="textPages()">Đọc thử văn bản</button>
      <button (click)="slow()">Tải chậm 5 giây</button>
      <button (click)="error()">Một trang bị lỗi</button>
      <button (click)="swap()">Đổi sản phẩm sau 1 giây</button>
      <div style="height:450px;width:450px;max-width:90vw">
        <app-book-3d-viewer [title]="product.name" [coverImage]="product.image" [paused]="open"
          [previewEnabled]="true" (previewRequested)="open=true"></app-book-3d-viewer>
      </div>
      <app-book-preview-reader *ngIf="open" [product]="product" (closed)="open=false"></app-book-preview-reader>
    </main>
  `
})
class QaComponent {
  open = false;
  product = { id:1, name:'Paperbound · Bản kiểm thử', author:'Nội dung minh họa', image:imageAt(0), pageCount:280 };
  configure(n:number):void { textMode=false; count=n; delay=0; broken=false; this.open=true; }
  textPages():void { textMode=true; count=5; delay=0; broken=false; this.open=true; }
  slow():void { count=5; delay=5000; broken=false; this.open=true; }
  error():void { count=5; delay=0; broken=true; this.open=true; }
  swap():void {
    this.slow();
    setTimeout(() => { delay=0; this.product={...this.product,id:this.product.id+1,name:'Sản phẩm mới · Minh họa'}; },1000);
  }
}
@NgModule({
  imports:[BrowserModule, LucideAngularModule.pick({BookOpen})],
  declarations:[QaComponent, BookPreviewReaderComponent, Book3dViewerComponent],
  providers:[{provide:ProductService,useClass:PreviewStub}],
  bootstrap:[QaComponent]
})
class QaModule {}
platformBrowserDynamic().bootstrapModule(QaModule).catch(console.error);
