const MAX_CHARS = 100;

export class BubbleLayer {
  private el: HTMLElement;
  private textEl: HTMLElement;
  private headerEl: HTMLElement;
  private text = '';
  private hideTimer = 0;

  constructor() {
    this.el = document.getElementById('bubble')!;
    this.textEl = document.getElementById('bubble-text')!;
    this.headerEl = document.getElementById('session-header')!;
  }

  showSession(tool: string, session: string) {
    this.headerEl.textContent = `[${tool}] ${session}`;
    this.headerEl.style.display = 'block';
    this.text = '';
    this.textEl.textContent = '';
    this.show();
    clearTimeout(this.hideTimer);
  }

  appendDelta(delta: string) {
    this.text += delta;
    if (this.text.length > MAX_CHARS) {
      this.text = '…' + this.text.slice(this.text.length - MAX_CHARS);
    }
    this.textEl.textContent = this.text;
    this.show();
    clearTimeout(this.hideTimer);
  }

  showComplete() {
    this.headerEl.style.display = 'none';
    this.headerEl.textContent = '';
    this.text = '✅ 完成啦';
    this.textEl.textContent = this.text;
    this.show();
    this.hideTimer = window.setTimeout(() => this.hide(), 3000);
  }

  showPhrase(phrase: string) {
    this.headerEl.style.display = 'none';
    this.text = phrase;
    this.textEl.textContent = phrase;
    this.show();
    clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hide(), 2500);
  }

  private show() {
    this.el.classList.add('visible');
  }

  private hide() {
    this.el.classList.remove('visible');
    this.text = '';
  }
}
