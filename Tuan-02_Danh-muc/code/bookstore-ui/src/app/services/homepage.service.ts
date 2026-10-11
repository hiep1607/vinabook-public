import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { DEFAULT_HOMEPAGE_CONFIG, HomepageConfig, normalizeHomepageConfig } from '../models/homepage-config';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class HomepageService {
  private readonly url = environment.apiUrl + '/api/homepage';
  private config$?: Observable<HomepageConfig>;

  constructor(private http: HttpClient) { }

  getConfig(): Observable<HomepageConfig> {
    if (!this.config$) {
      this.config$ = this.http.get<HomepageConfig>(this.url).pipe(
        map(config => normalizeHomepageConfig(config)),
        catchError(() => of(normalizeHomepageConfig(DEFAULT_HOMEPAGE_CONFIG))),
        shareReplay(1)
      );
    }
    return this.config$;
  }
}
