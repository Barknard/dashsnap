import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, RotateCw, Globe } from 'lucide-react';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { browser } from '@/lib/ipc';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/lib/utils';

export function UrlBar() {
  const browserUrl = useAppStore(s => s.browserUrl);
  const setBrowserUrl = useAppStore(s => s.setBrowserUrl);
  const [inputValue, setInputValue] = useState(browserUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isFocused) {
      setInputValue(browserUrl);
    }
  }, [browserUrl, isFocused]);

  useEffect(() => {
    const handler = (url: string) => {
      setBrowserUrl(url);
      setIsLoading(false);
    };
    browser.onUrlChanged(handler);
    return () => browser.offUrlChanged(handler);
  }, [setBrowserUrl]);

  const navigate = () => {
    let url = inputValue.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('about:')) {
      url = 'https://' + url;
    }
    setIsLoading(true);
    browser.navigate(url);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') navigate();
    if (e.key === 'Escape') {
      setInputValue(browserUrl);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-ds-border">
      <Tooltip content="Back">
        <Button variant="ghost" size="icon-sm" onClick={() => browser.back()}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
      </Tooltip>
      <Tooltip content="Forward">
        <Button variant="ghost" size="icon-sm" onClick={() => browser.forward()}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </Tooltip>
      <Tooltip content="Reload">
        <Button variant="ghost" size="icon-sm" onClick={() => { setIsLoading(true); browser.reload(); }}>
          <RotateCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
        </Button>
      </Tooltip>

      <div className={cn(
        'flex-1 relative flex items-center rounded-lg border bg-ds-bg transition-all duration-200',
        isFocused ? 'border-ds-accent shadow-[0_0_12px_rgba(59,130,246,0.15)]' : 'border-ds-border',
      )}>
        <Globe className="absolute left-2.5 w-3.5 h-3.5 text-ds-text-dim pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { setIsFocused(true); inputRef.current?.select(); }}
          onBlur={() => setIsFocused(false)}
          placeholder="Enter URL or search..."
          className="w-full h-7 pl-8 pr-3 text-xs bg-transparent text-ds-text placeholder:text-ds-text-dim focus:outline-none font-mono"
          spellCheck={false}
        />
        {isLoading && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-ds-accent/30 overflow-hidden rounded-b-lg">
            <div className="h-full bg-ds-accent animate-pulse w-2/3" />
          </div>
        )}
      </div>
    </div>
  );
}
