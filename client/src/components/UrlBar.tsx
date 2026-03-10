import { useState, useEffect, useRef } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronLeft, ChevronRight, RotateCw, Globe, Star, Trash2, Pencil, Check, Bookmark as BookmarkIcon } from 'lucide-react';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { browser } from '@/lib/ipc';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/lib/utils';
import type { Bookmark } from '@shared/types';

export function UrlBar() {
  const browserUrl = useAppStore(s => s.browserUrl);
  const setBrowserUrl = useAppStore(s => s.setBrowserUrl);
  const settings = useAppStore(s => s.settings);
  const saveSettings = useAppStore(s => s.saveSettings);
  const [inputValue, setInputValue] = useState(browserUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const bookmarks: Bookmark[] = settings.bookmarks || [];
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

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

  const isBookmarked = bookmarks.some(b => b.url === browserUrl);

  const toggleBookmark = () => {
    if (isBookmarked) {
      saveSettings({ bookmarks: bookmarks.filter(b => b.url !== browserUrl) });
    } else {
      const url = browserUrl;
      if (!url || url === 'about:blank') return;
      let name: string;
      try {
        name = new URL(url).hostname;
      } catch {
        name = url.slice(0, 30);
      }
      saveSettings({ bookmarks: [...bookmarks, { name, url }] });
    }
  };

  const removeBookmark = (url: string) => {
    saveSettings({ bookmarks: bookmarks.filter(b => b.url !== url) });
  };

  const goToBookmark = (url: string) => {
    setIsLoading(true);
    browser.navigate(url);
  };

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditName(bookmarks[index].name);
  };

  const saveEdit = () => {
    if (editingIndex === null) return;
    const updated = bookmarks.map((b, i) =>
      i === editingIndex ? { ...b, name: editName.trim() || b.name } : b
    );
    saveSettings({ bookmarks: updated });
    setEditingIndex(null);
  };

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 h-full">
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

      {/* Bookmark star — toggles current page */}
      <Tooltip content={isBookmarked ? 'Remove bookmark' : 'Bookmark this page'}>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleBookmark}
          className={isBookmarked ? 'text-ds-amber' : ''}
        >
          <Star className={cn('w-3.5 h-3.5', isBookmarked && 'fill-ds-amber')} />
        </Button>
      </Tooltip>

      {/* Bookmarks picker dropdown */}
      <DropdownMenu.Root onOpenChange={(open) => { if (!open) setEditingIndex(null); }}>
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" size="icon-sm" className="relative" title="Bookmarks">
            <BookmarkIcon className="w-3.5 h-3.5" />
            {bookmarks.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-ds-accent text-[9px] font-bold text-white leading-none px-0.5">
                {bookmarks.length}
              </span>
            )}
          </Button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="z-50 min-w-[220px] max-w-[340px] rounded-lg border border-ds-border bg-ds-surface shadow-xl p-1"
            sideOffset={4}
            align="end"
          >
            <DropdownMenu.Label className="px-2 py-1 text-xs font-semibold text-ds-text-dim uppercase tracking-wider">
              Bookmarks
            </DropdownMenu.Label>
            {bookmarks.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <Star className="w-5 h-5 text-ds-text-dim/40 mx-auto mb-1.5" />
                <p className="text-xs text-ds-text-dim">No bookmarks yet</p>
                <p className="text-[10px] text-ds-text-dim/60 mt-0.5">Click the star to save the current page</p>
              </div>
            ) : (
              bookmarks.map((bm, i) => (
                editingIndex === i ? (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md"
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingIndex(null); }}
                  >
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="flex-1 h-6 px-1.5 text-xs bg-ds-bg border border-ds-border rounded text-ds-text outline-none focus:border-ds-accent"
                    />
                    <button
                      onClick={saveEdit}
                      className="p-0.5 rounded hover:bg-ds-emerald/10 text-ds-emerald"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <DropdownMenu.Item
                    key={i}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-ds-text cursor-pointer hover:bg-ds-surface-hover outline-none group"
                    onSelect={() => goToBookmark(bm.url)}
                  >
                    <Globe className="w-3 h-3 text-ds-text-dim shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{bm.name}</p>
                      <p className="text-[10px] text-ds-text-dim truncate">{bm.url}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); startEditing(i); }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-ds-accent/10 hover:text-ds-accent transition-all"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); removeBookmark(bm.url); }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-ds-red/10 hover:text-ds-red transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </DropdownMenu.Item>
                )
              ))
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
