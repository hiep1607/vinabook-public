import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { shareReplay } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class CategoryService {

  private url = environment.apiUrl + '/api/categories';
  private categoriesCache$: Observable<any[]> | null = null;

  constructor(private http: HttpClient) { }

  getAll(): Observable<any[]> {
    if (!this.categoriesCache$) {
      this.categoriesCache$ = this.http.get<any[]>(this.url).pipe(
        shareReplay(1)
      );
    }
    return this.categoriesCache$;
  }

  getOne(id: number): Observable<any> {
    return this.http.get<any>(this.url + '/' + id);
  }
}
