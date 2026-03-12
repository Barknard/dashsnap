import * as Switch from '@radix-ui/react-switch';
import { Maximize2, Layout, Crop } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SlideLayoutPreview } from './SlideLayoutPreview';
import { Input } from './ui/Input';
import type { FlowStep, PptxLayout } from '@shared/types';
import type { DerivedSlide } from '@/lib/slides';

interface SlideLayoutPanelProps {
  slide: DerivedSlide;
  globalLayout?: PptxLayout;
  onUpdateStep: (stepId: string, updates: Partial<FlowStep>) => void;
}

export function SlideLayoutPanel({ slide, globalLayout, onUpdateStep }: SlideLayoutPanelProps) {
  const sl = slide.layout;

  const effectiveLayout: PptxLayout = {
    imageX: sl?.imageX ?? globalLayout?.imageX ?? 0.3,
    imageY: sl?.imageY ?? globalLayout?.imageY ?? 0.8,
    imageW: sl?.imageW ?? globalLayout?.imageW ?? 12.7,
    imageH: sl?.imageH ?? globalLayout?.imageH ?? 6.2,
    showHeader: sl?.showHeader ?? globalLayout?.showHeader ?? true,
    showFooter: sl?.showFooter ?? globalLayout?.showFooter ?? true,
    fitMode: sl?.fitMode ?? globalLayout?.fitMode ?? 'contain',
    cropTop: sl?.cropTop ?? globalLayout?.cropTop ?? 0,
    cropRight: sl?.cropRight ?? globalLayout?.cropRight ?? 0,
    cropBottom: sl?.cropBottom ?? globalLayout?.cropBottom ?? 0,
    cropLeft: sl?.cropLeft ?? globalLayout?.cropLeft ?? 0,
  };

  const updateLayout = (updates: Record<string, number | boolean | string>) => {
    onUpdateStep(slide.id, {
      slideLayout: { ...effectiveLayout, ...updates },
    } as Partial<FlowStep>);
  };

  const handlePreset = (preset: Partial<PptxLayout>) => {
    const defaults: PptxLayout = {
      imageX: globalLayout?.imageX ?? 0.3,
      imageY: globalLayout?.imageY ?? 0.8,
      imageW: globalLayout?.imageW ?? 12.7,
      imageH: globalLayout?.imageH ?? 6.2,
      showHeader: globalLayout?.showHeader ?? true,
      showFooter: globalLayout?.showFooter ?? true,
      fitMode: globalLayout?.fitMode ?? 'contain',
      cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0,
    };
    onUpdateStep(slide.id, {
      slideLayout: { ...defaults, ...preset },
    } as Partial<FlowStep>);
  };

  const clearLayout = () => {
    onUpdateStep(slide.id, { slideLayout: undefined } as Partial<FlowStep>);
  };

  return (
    <div className="space-y-3">
      {/* Layout header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ds-text flex items-center gap-1.5">
          <Layout className="w-3.5 h-3.5 text-ds-accent" />
          Slide {slide.slideIndex + 1} Layout
        </span>
        {sl && (
          <button
            onClick={clearLayout}
            className="text-xs text-ds-text-dim hover:text-ds-red transition-colors"
          >
            Reset to global
          </button>
        )}
      </div>

      {/* Visual slide preview with drag-to-place */}
      <SlideLayoutPreview
        layout={effectiveLayout}
        onChange={updateLayout}
        onPreset={handlePreset}
      />

      {/* Fit mode */}
      <div className="space-y-1.5">
        <span className="text-xs text-ds-text-dim uppercase tracking-wide font-medium flex items-center gap-1">
          <Maximize2 className="w-3 h-3" /> Fit Mode
        </span>
        <div className="flex gap-1">
          {(['contain', 'fill', 'stretch'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => updateLayout({ fitMode: mode })}
              className={cn(
                'flex-1 px-2 py-1.5 text-xs rounded-lg border transition-colors capitalize',
                effectiveLayout.fitMode === mode
                  ? 'bg-ds-accent/20 border-ds-accent text-ds-accent'
                  : 'bg-ds-bg border-ds-border text-ds-text-muted hover:text-ds-text hover:border-ds-border-bright',
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Header / Footer toggles */}
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <Switch.Root
            checked={effectiveLayout.showHeader}
            onCheckedChange={v => updateLayout({ showHeader: v })}
            className="w-8 h-5 rounded-full bg-ds-bg border border-ds-border data-[state=checked]:bg-ds-accent transition-colors"
          >
            <Switch.Thumb className="block w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-3.5 translate-x-0.5" />
          </Switch.Root>
          <span className="text-xs text-ds-text">Header</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Switch.Root
            checked={effectiveLayout.showFooter}
            onCheckedChange={v => updateLayout({ showFooter: v })}
            className="w-8 h-5 rounded-full bg-ds-bg border border-ds-border data-[state=checked]:bg-ds-accent transition-colors"
          >
            <Switch.Thumb className="block w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-3.5 translate-x-0.5" />
          </Switch.Root>
          <span className="text-xs text-ds-text">Footer</span>
        </label>
      </div>

      {/* Crop */}
      <div className="space-y-1.5 pt-1 border-t border-ds-border/30">
        <span className="text-xs text-ds-text-dim uppercase tracking-wide font-medium flex items-center gap-1">
          <Crop className="w-3 h-3" /> Crop (%)
        </span>
        <div className="grid grid-cols-4 gap-1.5">
          {([
            ['cropTop', 'Top'],
            ['cropRight', 'Right'],
            ['cropBottom', 'Bottom'],
            ['cropLeft', 'Left'],
          ] as const).map(([field, label]) => (
            <div key={field} className="space-y-0.5">
              <span className="text-xs text-ds-text-dim">{label}</span>
              <Input
                type="number"
                min="0"
                max="50"
                step="1"
                value={effectiveLayout[field] ?? 0}
                onChange={e => updateLayout({ [field]: Math.min(50, Math.max(0, parseInt(e.target.value) || 0)) })}
                className="font-mono text-xs h-7 px-1.5 text-center"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Auto-save indicator */}
      <p className="text-xs text-ds-text-dim text-center pt-1">
        Changes save automatically
      </p>
    </div>
  );
}
