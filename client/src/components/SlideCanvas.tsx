import { useCallback, useRef, useState } from 'react';
import { Layout, Maximize2, Crop, Move } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DerivedSlide } from '@/lib/slides';
import type { PptxLayout, FlowStep } from '@shared/types';

// PowerPoint standard slide: 13.33" x 7.5" (widescreen 16:9)
const SLIDE_W = 13.33;
const SLIDE_H = 7.5;

interface SlideCanvasProps {
  slide: DerivedSlide;
  globalLayout?: PptxLayout;
  onUpdateStep: (stepId: string, updates: Partial<FlowStep>) => void;
}

export function SlideCanvas({ slide, globalLayout, onUpdateStep }: SlideCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; startX: number; startY: number; imageW: number; imageH: number } | null>(null);

  const sl = slide.layout;
  const layout: PptxLayout = {
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

  const updateLayout = useCallback((updates: Partial<PptxLayout>) => {
    onUpdateStep(slide.id, {
      slideLayout: { ...layout, ...updates },
    } as Partial<FlowStep>);
  }, [slide.id, layout, onUpdateStep]);

  // Convert inches to percentage of slide
  const toPct = (inches: number, total: number) => (inches / total) * 100;

  const imgLeft = toPct(layout.imageX, SLIDE_W);
  const imgTop = toPct(layout.imageY, SLIDE_H);
  const imgWidth = toPct(layout.imageW, SLIDE_W);
  const imgHeight = toPct(layout.imageH, SLIDE_H);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      startX: layout.imageX,
      startY: layout.imageY,
      imageW: layout.imageW,
      imageH: layout.imageH,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragStart.current || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = SLIDE_W / rect.width;
      const scaleY = SLIDE_H / rect.height;
      const dx = (ev.clientX - dragStart.current.x) * scaleX;
      const dy = (ev.clientY - dragStart.current.y) * scaleY;
      const newX = Math.max(0, Math.min(SLIDE_W - dragStart.current.imageW, dragStart.current.startX + dx));
      const newY = Math.max(0, Math.min(SLIDE_H - dragStart.current.imageH, dragStart.current.startY + dy));
      updateLayout({ imageX: Math.round(newX * 100) / 100, imageY: Math.round(newY * 100) / 100 });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStart.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const region = slide.captureStep.region;

  return (
    <div className="flex flex-col h-full bg-ds-bg">
      {/* Canvas toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-ds-border bg-ds-surface/60 shrink-0">
        <Layout className="w-4 h-4 text-ds-accent" />
        <span className="text-sm font-semibold text-ds-text">
          Slide {slide.slideIndex + 1}
        </span>
        <span className="text-xs font-mono px-2 py-0.5 rounded bg-ds-bg border border-ds-border text-ds-text-muted">
          {slide.title || 'Untitled'}
        </span>
        <span className="text-xs text-ds-text-dim ml-auto">
          {slide.captureStep.previewPath ? 'Live preview' : 'Placeholder'} · {region.width}x{region.height}px · Drag to reposition
        </span>
      </div>

      {/* Canvas area */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
        <div
          ref={canvasRef}
          className="relative bg-white shadow-2xl"
          style={{
            aspectRatio: `${SLIDE_W} / ${SLIDE_H}`,
            maxWidth: '100%',
            maxHeight: '100%',
            width: '100%',
          }}
        >
          {/* Header zone */}
          {layout.showHeader && (
            <div
              className="absolute left-0 right-0 top-0 bg-gray-100 border-b border-gray-200 flex items-center px-4"
              style={{ height: `${toPct(0.7, SLIDE_H)}%` }}
            >
              <span className="text-xs text-gray-500 font-medium">Header</span>
            </div>
          )}

          {/* Footer zone */}
          {layout.showFooter && (
            <div
              className="absolute left-0 right-0 bottom-0 bg-gray-100 border-t border-gray-200 flex items-center justify-between px-4"
              style={{ height: `${toPct(0.4, SLIDE_H)}%` }}
            >
              <span className="text-xs text-gray-400">Footer</span>
              <span className="text-xs text-gray-400">#</span>
            </div>
          )}

          {/* Image placement area — draggable */}
          <div
            onMouseDown={handleMouseDown}
            className={cn(
              'absolute border-2 transition-shadow',
              isDragging
                ? 'border-ds-accent shadow-[0_0_20px_rgba(187,134,252,0.4)] cursor-grabbing'
                : 'border-ds-accent/60 hover:border-ds-accent hover:shadow-[0_0_12px_rgba(187,134,252,0.25)] cursor-grab',
            )}
            style={{
              left: `${imgLeft}%`,
              top: `${imgTop}%`,
              width: `${imgWidth}%`,
              height: `${imgHeight}%`,
            }}
          >
            {/* Screenshot preview or placeholder */}
            {slide.captureStep.previewPath ? (
              <img
                src={`dsfile:///${slide.captureStep.previewPath.replace(/\\/g, '/')}`}
                alt={slide.title}
                className="absolute inset-0 w-full h-full"
                style={{ objectFit: layout.fitMode === 'stretch' ? 'fill' : layout.fitMode === 'fill' ? 'cover' : 'contain' }}
                draggable={false}
              />
            ) : (
              <>
                <div className="absolute inset-0 opacity-10" style={{
                  backgroundImage: 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%)',
                  backgroundSize: '20px 20px',
                }} />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ds-accent/5">
                  <Maximize2 className="w-6 h-6 text-ds-accent/50" />
                  <span className="text-xs font-medium text-ds-accent/70">
                    {region.width} x {region.height}px
                  </span>
                  <span className="text-xs text-ds-accent/40">
                    {layout.imageW.toFixed(1)}" x {layout.imageH.toFixed(1)}"
                  </span>
                </div>
              </>
            )}

            {/* Drag handle indicator */}
            <div className="absolute top-1 left-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-ds-accent/80 text-white">
              <Move className="w-3 h-3" />
              <span className="text-xs font-medium">Drag</span>
            </div>

            {/* Crop indicators */}
            {((layout.cropTop ?? 0) > 0 || (layout.cropBottom ?? 0) > 0 || (layout.cropLeft ?? 0) > 0 || (layout.cropRight ?? 0) > 0) && (
              <div className="absolute bottom-1 right-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-orange-500/80 text-white">
                <Crop className="w-3 h-3" />
                <span className="text-xs">Cropped</span>
              </div>
            )}
          </div>

          {/* Dimension overlay */}
          <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded bg-black/60 text-white text-xs font-mono">
            ({layout.imageX.toFixed(1)}", {layout.imageY.toFixed(1)}") — {layout.imageW.toFixed(1)}" x {layout.imageH.toFixed(1)}"
          </div>
        </div>
      </div>
    </div>
  );
}
