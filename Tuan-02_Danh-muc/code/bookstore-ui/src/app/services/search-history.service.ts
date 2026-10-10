import { Injectable } from '@angular/core';

const KEY = 'search_history';
const MAX = 8;

@Injectable({ providedIn: 'root' })
export class SearchHistoryService {

  getHistory(): string[] {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '[]');
    } catch {
      return [];
    }
  }

  addToHistory(query: string): void {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }
    // Remove duplicate then prepend
    const history = this.getHistory().filter(
      q => q.toLowerCase() !== trimmed.toLowerCase()
    );
    history.unshift(trimmed);
    localStorage.setItem(KEY, JSON.stringify(history.slice(0, MAX)));
  }

  removeFromHistory(query: string): void {
    const history = this.getHistory().filter(q => q !== query);
    localStorage.setItem(KEY, JSON.stringify(history));
  }

  clearHistory(): void {
    localStorage.removeItem(KEY);
  }

}
