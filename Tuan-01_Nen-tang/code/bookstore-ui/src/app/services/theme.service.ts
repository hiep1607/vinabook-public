import { Injectable } from '@angular/core';

export interface Theme {
  id: string;
  name: string;
  primary: string;
  accent: string;
  bg: string;
}

@Injectable({ providedIn: 'root' })
export class ThemeService {

  // Versioned once for the forest-night redesign so stale saved themes do not hide it.
  private readonly storageKey = 'theme-v2';
  private readonly defaultTheme = 'editorial';

  readonly themes: Theme[] = [
    { id: 'editorial', name: 'Thư viện đêm', primary: '#0f6b45', accent: '#d7a63b', bg: '#031a12' },
    { id: 'ocean', name: 'Đại dương tối giản', primary: '#155e75', accent: '#0e7490', bg: '#f8fafc' },
    { id: 'forest', name: 'Thư viện rừng', primary: '#166534', accent: '#a16207', bg: '#f7f8f5' },
    { id: 'berry', name: 'Mận chín trẻ trung', primary: '#831843', accent: '#e11d48', bg: '#fdfafb' }
  ];

  current = this.defaultTheme;

  init(): void {
    const saved = localStorage.getItem(this.storageKey);
    const valid = saved && this.themes.some(theme => theme.id === saved);
    this.setTheme(valid ? saved as string : this.defaultTheme);
  }

  setTheme(id: string): void {
    if (!this.themes.some(theme => theme.id === id)) {
      return;
    }

    this.current = id;
    document.documentElement.setAttribute('data-theme', id);
    localStorage.setItem(this.storageKey, id);
  }
}
