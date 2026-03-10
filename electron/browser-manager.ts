import { BrowserView, BrowserWindow } from 'electron';

export class BrowserManager {
  private view: BrowserView;
  private window: BrowserWindow;

  constructor(view: BrowserView, window: BrowserWindow) {
    this.view = view;
    this.window = window;
    this.setupListeners();
  }

  private setupListeners() {
    const wc = this.view.webContents;

    wc.on('did-navigate', (_e, url) => {
      this.window.webContents.send('browser:url-changed', url);
    });

    wc.on('did-navigate-in-page', (_e, url) => {
      this.window.webContents.send('browser:url-changed', url);
    });

    wc.on('page-title-updated', (_e, title) => {
      this.window.webContents.send('browser:title-changed', title);
    });

    wc.on('did-start-loading', () => {
      this.window.webContents.send('browser:loading', true);
    });

    wc.on('did-stop-loading', () => {
      this.window.webContents.send('browser:loading', false);
    });

    // Handle new windows — open in same view
    wc.setWindowOpenHandler(({ url }) => {
      this.navigate(url);
      return { action: 'deny' };
    });

    // Set a standard Chrome user agent
    const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    wc.setUserAgent(chromeUA);
  }

  navigate(url: string) {
    try {
      this.view.webContents.loadURL(url);
    } catch (err) {
      console.error('Navigation error:', err);
    }
  }

  back() {
    if (this.view.webContents.canGoBack()) {
      this.view.webContents.goBack();
    }
  }

  forward() {
    if (this.view.webContents.canGoForward()) {
      this.view.webContents.goForward();
    }
  }

  reload() {
    this.view.webContents.reload();
  }

  getUrl(): string {
    return this.view.webContents.getURL();
  }

  getWebContents() {
    return this.view.webContents;
  }
}
