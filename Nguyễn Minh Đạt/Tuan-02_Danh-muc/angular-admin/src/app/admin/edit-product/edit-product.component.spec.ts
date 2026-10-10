import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModal, NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { of, throwError } from 'rxjs';
import { EditProductComponent } from './edit-product.component';
import { ProductService } from '../../services/product.service';
import { CategoryService } from '../../services/category.service';
import { UploadService } from '../../services/upload.service';

describe('EditProduct preview text', () => {
  let component: EditProductComponent, fixture: ComponentFixture<EditProductComponent>, products: any;
  beforeEach(async () => {
    products = {
      getOne: () => of({productId:10,name:'Sách kiểm thử',author:'Tác giả',quantity:5,price:10000,discount:0,description:'Mô tả',image:'/cover.png',category:{categoryId:1},sold:0}),
      getPreview: () => of({enabled:false,rightsConfirmed:false,pages:[]}),
      addPreviewPage: jasmine.createSpy().and.callFake((_id:number,p:any) => of({...p,previewPageId:1})),
      updatePreviewPage: jasmine.createSpy().and.callFake((_id:number,pid:number,p:any) => of({...p,previewPageId:pid})),
      reorderPreviewPages: jasmine.createSpy().and.returnValue(throwError('offline'))
    };
    await TestBed.configureTestingModule({
      imports:[FormsModule,ReactiveFormsModule,NgbModule], declarations:[EditProductComponent],
      providers:[
        {provide:ProductService,useValue:products},
        {provide:CategoryService,useValue:{getAll:()=>of([])}},
        {provide:UploadService,useValue:{}},
        {provide:ToastrService,useValue:{success:()=>{},warning:()=>{},error:()=>{}}}
      ]
    }).compileComponents();
    fixture=TestBed.createComponent(EditProductComponent); component=fixture.componentInstance;
    component.id=10; fixture.detectChanges();
  });
  afterEach(() => { TestBed.inject(NgbModal).dismissAll(); fixture.destroy(); });
  it('saves typed content against the selected book', () => {
    component.editTextPage(); component.textDraft!.textContent='Chữ tiếng Việt rõ ràng';
    component.saveTextPage();
    expect(products.addPreviewPage).toHaveBeenCalledWith(10,jasmine.objectContaining({contentType:'text',textContent:'Chữ tiếng Việt rõ ràng'}));
    expect(component.previewPages.length).toBe(1); expect(component.textDraft).toBeUndefined();
  });
  it('retains edits when saving fails', () => {
    products.addPreviewPage.and.returnValue(throwError('offline'));
    component.editTextPage(); component.textDraft!.textContent='Giữ nội dung'; component.saveTextPage();
    expect(component.textDraft!.textContent).toBe('Giữ nội dung'); expect(component.previewUploading).toBeFalse();
  });
  it('rejects blank and oversized text', () => {
    component.editTextPage(); expect(component.validTextDraft).toBeFalse();
    component.textDraft!.textContent='x'.repeat(1001); expect(component.validTextDraft).toBeFalse();
  });
  it('allows adding preview pages through the twentieth page only', () => {
    component.previewPages = Array.from({length: 19}, (_, index) => ({pageOrder: index + 1, imageUrl: '/page.png'}));
    component.editTextPage();
    expect(component.textDraft).toBeDefined();
    component.textDraft = undefined;
    component.previewPages = Array.from({length: 20}, (_, index) => ({pageOrder: index + 1, imageUrl: '/page.png'}));
    component.editTextPage();
    expect(component.textDraft).toBeUndefined();
  });
  it('edits a copy, not the saved image page', () => {
    const old={previewPageId:2,pageOrder:1,imageUrl:'/old.png'};
    component.editTextPage(old); component.textDraft!.textContent='Nội dung mới';
    expect(old.imageUrl).toBe('/old.png'); component.saveTextPage();
    expect(products.updatePreviewPage).toHaveBeenCalledWith(10,2,jasmine.objectContaining({imageUrl:'',contentType:'text'}));
  });
  it('renders a labelled textarea in the real edit modal', () => {
    component.editTextPage(); fixture.detectChanges();
    fixture.nativeElement.querySelector('button[aria-label="Chỉnh sửa sách"]').click();
    fixture.detectChanges();
    expect(document.querySelector('label[for="previewText"]')?.textContent).toContain('Nội dung đọc thử');
    expect(document.querySelector('#previewText')).not.toBeNull();
  });
});
