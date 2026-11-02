import { Subject } from 'rxjs';
import { ChatbotComponent } from './chatbot.component';
import { ChatMessage } from '../../services/chatbot.service';

describe('Chat account isolation', () => {
  let component: ChatbotComponent;
  let auth: any;
  let bot: any;
  let response: Subject<ChatMessage>;
  const key = (email: string) => 'vinabook_chat_session_v2:user:' + encodeURIComponent(email);
  const a = 'chat-test-a@example.test';
  const b = 'chat-test-b@example.test';
  const clean = () => [key(a), key(b), 'vinabook_chat_session_v2:guest', 'vinabook_chat_session']
    .forEach(k => sessionStorage.removeItem(k));
  beforeEach(() => {
    clean();
    auth = { currentUser: { email: a } };
    response = new Subject<ChatMessage>();
    bot = { greeting: () => ({ from: 'bot', text: 'Chào bạn' }),
      useAccount: jasmine.createSpy(), resetSession: jasmine.createSpy(), ask: jasmine.createSpy().and.returnValue(response) };
    component = new ChatbotComponent(bot, {} as any, {} as any, {} as any, auth, {} as any, {} as any);
    component.ngOnInit();
  });
  afterEach(() => { component.ngOnDestroy(); clean(); });
  it('switches histories and restores only the returning account', () => {
    component.send('Tin riêng tài khoản A');
    response.next({ from: 'bot', text: 'Trả lời A' }); response.complete();
    auth.currentUser = { email: b }; component.ngDoCheck();
    expect(component.messages.map(m => m.text)).toEqual(['Chào bạn']);
    expect(sessionStorage.getItem(key(b))).toBeNull();
    auth.currentUser = { email: a }; component.ngDoCheck();
    expect(component.messages.map(m => m.text)).toContain('Tin riêng tài khoản A');
    expect(bot.useAccount.calls.allArgs()).toEqual([[a], [b], [a]]);
    expect(bot.resetSession).not.toHaveBeenCalled();
  });
  it('clears drafts, actions, errors and pending responses on logout', () => {
    component.send('Tin riêng A');
    component.draft = 'Đang gõ riêng';
    component.lastFailedInput = 'Câu hỏi lỗi';
    component.errorText = 'Lỗi cũ';
    component.addedProductIds.add(1);
    component.pendingAction = {} as any;
    auth.currentUser = null; component.ngDoCheck();
    response.next({ from: 'bot', text: 'Phản hồi muộn của A' });
    expect(component.messages.map(m => m.text)).toEqual(['Chào bạn']);
    expect(component.draft).toBe('');
    expect(component.lastFailedInput).toBe('');
    expect(component.errorText).toBe('');
    expect(component.pendingAction).toBeUndefined();
    expect(component.addedProductIds.size).toBe(0);
    expect(component.typing).toBeFalse();
  });
  it('does not accept a late response before change detection runs', () => {
    component.send('Tin A');
    auth.currentUser = { email: b };
    response.next({ from: 'bot', text: 'Phản hồi muộn' });
    expect(component.messages.some(m => m.text === 'Phản hồi muộn')).toBeFalse();
    component.ngDoCheck();
    expect(component.messages.map(m => m.text)).toEqual(['Chào bạn']);
  });
  it('never restores shared legacy history with unknown ownership', () => {
    sessionStorage.setItem('vinabook_chat_session', JSON.stringify([{ from: 'user', text: 'Tin cũ không rõ chủ' }]));
    component.ngOnInit();
    expect(component.messages.map(m => m.text)).toEqual(['Chào bạn']);
    expect(sessionStorage.getItem('vinabook_chat_session')).toBeNull();
  });
  it('restores the correct account after reload', () => {
    sessionStorage.setItem(key(b), JSON.stringify([{ from: 'user', text: 'Tin của B' }]));
    auth.currentUser = { email: b }; component.ngOnInit();
    expect(component.messages.map(m => m.text)).toEqual(['Tin của B']);
  });
});
