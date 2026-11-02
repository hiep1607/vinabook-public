import { ChatbotService, ChatMessage } from './chatbot.service';

describe('Chat history transport', () => {
  const service = new ChatbotService({} as any);
  it('keeps account session IDs across reload and isolates a new account', () => {
    service.useAccount('session-a@example.test'); service.resetSession();
    const first = (service as any).sessionId();
    const reloaded = new ChatbotService({} as any);
    reloaded.useAccount('session-a@example.test');
    expect((reloaded as any).sessionId()).toBe(first);
    reloaded.useAccount('session-b@example.test'); reloaded.resetSession();
    expect((reloaded as any).sessionId()).not.toBe(first);
    reloaded.resetSession(); service.resetSession();
  });
  it('does not resurrect old books after an empty search result', () => {
    const messages = [{from: 'bot', text: 'Java', products: [{id: 1}]},
      {from: 'user', text: 'Python'}, {from: 'bot', text: 'Không tìm thấy', products: []}];
    expect((service as any).contextProductIds(messages)).toEqual([]);
  });
  it('bounds long history without modifying visible messages or book context', () => {
    const messages: ChatMessage[] = Array.from({length: 8}, () => ({from: 'bot', text: 'a'.repeat(9000)}));
    const history = (service as any).prepareHistory(messages);
    expect(history.reduce((n: number, m: any) => n + m.content.length, 0)).toBe(24000);
    expect(history.every((m: any) => m.content.length <= 8000)).toBeTrue();
    expect(messages[0].text.length).toBe(9000);
  });
  it('keeps a long reply and its follow-up in order', () => {
    const history = (service as any).prepareHistory([
      {from: 'bot', text: 'a'.repeat(1500)}, {from: 'user', text: 'Nói thêm về cuốn này'}
    ]);
    expect(history[0].content.length).toBe(1500);
    expect(history[1].role).toBe('user');
  });
  it('distinguishes validation, rate limit and connection errors', () => {
    expect((service as any).transportError(400).message).toContain('không hợp lệ');
    expect((service as any).transportError(429).message).toContain('quá nhanh');
    expect((service as any).transportError(0).message).toContain('Không kết nối');
  });
});
