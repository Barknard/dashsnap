import { useCallback, useRef, useState } from 'react';
import * as Switch from '@radix-ui/react-switch';
import { Layout, Maximize2, Crop, Move, Presentation } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import type { DerivedSlide } from '@/lib/slides';
import type { PptxLayout, FlowStep } from '@shared/types';

// PowerPoint standard slide: 13.33" x 7.5" (widescreen 16:9)
const SLIDE_W = 13.33;
const SLIDE_H = 7.5;

type HandleId = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
type InteractionMode = 'move' | 'resize' | 'crop';

const HANDLE_CURSORS: Record<HandleId, string> = {
  n: 'cursor-ns-resize', s: 'cursor-ns-resize',
  e: 'cursor-ew-resize', w: 'cursor-ew-resize',
  ne: 'cursor-nesw-resize', sw: 'cursor-nesw-resize',
  nw: 'cursor-nwse-resize', se: 'cursor-nwse-resize',
};

interface SlideCanvasProps {
  slide: DerivedSlide;
  globalLayout?: PptxLayout;
  onUpdateStep: (stepId: string, updates: Partial<FlowStep>) => void;
}

export function SlideCanvas({ slide, globalLayout, onUpdateStep }: SlideCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [activeInteraction, setActiveInteraction] = useState<InteractionMode | null>(null);
  const [cropMode, setCropMode] = useState(false);
  const templateSlides = useAppStore(s => s.templateSlides);

  const dragRef = useRef<{
    mode: InteractionMode;
    handle?: HandleId;
    startMouseX: number;
    startMouseY: number;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startCropTop: number;
    startCropRight: number;
    startCropBottom: number;
    startCropLeft: number;
  } | null>(null);

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

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const toPct = (inches: number, total: number) => (inches / total) * 100;

  const imgLeft = toPct(layout.imageX, SLIDE_W);
  const imgTop = toPct(layout.imageY, SLIDE_H);
  const imgWidth = toPct(layout.imageW, SLIDE_W);
  const imgHeight = toPct(layout.imageH, SLIDE_H);

  // ─── Drag: move the image box ──────────────────────────────────────
  const startMove = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    setActiveInteraction('move');
    dragRef.current = {
      mode: 'move',
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startX: layout.imageX,
      startY: layout.imageY,
      startW: layout.imageW,
      startH: layout.imageH,
      startCropTop: layout.cropTop ?? 0,
      startCropRight: layout.cropRight ?? 0,
      startCropBottom: layout.cropBottom ?? 0,
      startCropLeft: layout.cropLeft ?? 0,
    };
    attachListeners();
  };

  // ─── Handle: resize or crop ────────────────────────────────────────
  const startHandle = (e: React.MouseEvent, handle: HandleId) => {
    if (!canvasRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const mode = cropMode ? 'crop' : 'resize';
    setActiveInteraction(mode);
    dragRef.current = {
      mode,
      handle,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startX: layout.imageX,
      startY: layout.imageY,
      startW: layout.imageW,
      startH: layout.imageH,
      startCropTop: layout.cropTop ?? 0,
      startCropRight: layout.cropRight ?? 0,
      startCropBottom: layout.cropBottom ?? 0,
      startCropLeft: layout.cropLeft ?? 0,
    };
    attachListeners();
  };

  const attachListeners = () => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const onMouseMove = (ev: MouseEvent) => {
    const d = dragRef.current;
    if (!d || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = SLIDE_W / rect.width;
    const scaleY = SLIDE_H / rect.height;
    const dx = (ev.clientX - d.startMouseX) * scaleX;
    const dy = (ev.clientY - d.startMouseY) * scaleY;

    if (d.mode === 'move') {
      const newX = Math.max(0, Math.min(SLIDE_W - d.startW, d.startX + dx));
      const newY = Math.max(0, Math.min(SLIDE_H - d.startH, d.startY + dy));
      updateLayout({ imageX: round2(newX), imageY: round2(newY) });
      return;
    }

    if (d.mode === 'resize') {
      applyResize(d, dx, dy);
      return;
    }

    if (d.mode === 'crop') {
      applyCrop(d, dx, dy);
    }
  };

  const applyResize = (d: NonNullable<typeof dragRef.current>, dx: number, dy: number) => {
    const h = d.handle!;
    let x = d.startX, y = d.startY, w = d.startW, h2 = d.startH;
    const MIN = 0.5; // minimum 0.5 inches

    // Horizontal
    if (h.includes('e')) {
      w = Math.max(MIN, Math.min(SLIDE_W - x, d.startW + dx));
    }
    if (h.includes('w')) {
      const newX = Math.max(0, d.startX + dx);
      const maxDx = d.startW - MIN;
      x = Math.min(newX, d.startX + maxDx);
      w = d.startW - (x - d.startX);
    }
    // Vertical
    if (h.includes('s')) {
      h2 = Math.max(MIN, Math.min(SLIDE_H - y, d.startH + dy));
    }
    if (h === 'n' || h === 'ne' || h === 'nw') {
      const newY = Math.max(0, d.startY + dy);
      const maxDy = d.startH - MIN;
      y = Math.min(newY, d.startY + maxDy);
      h2 = d.startH - (y - d.startY);
    }

    updateLayout({ imageX: round2(x), imageY: round2(y), imageW: round2(w), imageH: round2(h2) });
  };

  const applyCrop = (d: NonNullable<typeof dragRef.current>, dx: number, dy: number) => {
    const h = d.handle!;
    // Convert pixel drag to percentage of the image dimensions
    const cropDx = (dx / d.startW) * 100;
    const cropDy = (dy / d.startH) * 100;
    const updates: Partial<PptxLayout> = {};

    if (h.includes('e')) {
      // Dragging east edge inward increases cropRight
      updates.cropRight = Math.max(0, Math.min(50, round2(d.startCropRight - cropDx)));
    }
    if (h.includes('w')) {
      // Dragging west edge inward increases cropLeft
      updates.cropLeft = Math.max(0, Math.min(50, round2(d.startCropLeft + cropDx)));
    }
    if (h.includes('s') || h === 's') {
      updates.cropBottom = Math.max(0, Math.min(50, round2(d.startCropBottom - cropDy)));
    }
    if (h === 'n' || h === 'ne' || h === 'nw') {
      updates.cropTop = Math.max(0, Math.min(50, round2(d.startCropTop + cropDy)));
    }

    updateLayout(updates);
  };

  const onMouseUp = () => {
    setActiveInteraction(null);
    dragRef.current = null;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  const region = slide.captureStep.region;
  const hasCrop = (layout.cropTop ?? 0) > 0 || (layout.cropBottom ?? 0) > 0 || (layout.cropLeft ?? 0) > 0 || (layout.cropRight ?? 0) > 0;

  // Crop inset for image clipping (percentage based)
  const cropInset = {
    top: `${layout.cropTop ?? 0}%`,
    right: `${layout.cropRight ?? 0}%`,
    bottom: `${layout.cropBottom ?? 0}%`,
    left: `${layout.cropLeft ?? 0}%`,
  };

  // ─── Handle positions ──────────────────────────────────────────────
  const handles: Array<{ id: HandleId; style: React.CSSProperties }> = [
    // Corners
    { id: 'nw', style: { top: -4, left: -4 } },
    { id: 'ne', style: { top: -4, right: -4 } },
    { id: 'sw', style: { bottom: -4, left: -4 } },
    { id: 'se', style: { bottom: -4, right: -4 } },
    // Edges
    { id: 'n', style: { top: -4, left: '50%', transform: 'translateX(-50%)' } },
    { id: 's', style: { bottom: -4, left: '50%', transform: 'translateX(-50%)' } },
    { id: 'w', style: { top: '50%', left: -4, transform: 'translateY(-50%)' } },
    { id: 'e', style: { top: '50%', right: -4, transform: 'translateY(-50%)' } },
  ];

  return (
    <div className="flex flex-col h-full bg-ds-bg">
      {/* ═══ Top bar: slide info ═══ */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-ds-border bg-ds-surface/60 shrink-0">
        <Layout className="w-4 h-4 text-ds-accent" />
        <span className="text-sm font-semibold text-ds-text">
          Slide {slide.slideIndex + 1}
        </span>
        <span className="text-xs font-mono px-2 py-0.5 rounded bg-ds-bg border border-ds-border text-ds-text-muted">
          {slide.title || 'Untitled'}
        </span>
        <span className="text-xs text-ds-text-dim ml-auto">
          {slide.captureStep.previewPath ? 'Live preview' : 'Placeholder'} · {region.width}x{region.height}px
        </span>
      </div>

      {/* ═══ Layout controls bar ═══ */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-b border-ds-border/50 bg-ds-surface/30 shrink-0 flex-wrap">
        {/* Fit mode */}
        <div className="flex items-center gap-1.5">
          <Maximize2 className="w-3 h-3 text-ds-text-dim" />
          <span className="text-xs text-ds-text-dim">Fit:</span>
          {(['contain', 'fill', 'stretch'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => updateLayout({ fitMode: mode })}
              className={cn(
                'px-2 py-0.5 text-xs rounded border transition-colors capitalize',
                layout.fitMode === mode
                  ? 'bg-ds-accent/20 border-ds-accent text-ds-accent'
                  : 'bg-ds-bg border-ds-border text-ds-text-muted hover:text-ds-text hover:border-ds-border-bright',
              )}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="w-px h-4 bg-ds-border/50" />

        {/* Header / Footer toggles */}
        <label className="flex items-center gap-1.5 cursor-pointer">
          <Switch.Root
            checked={layout.showHeader}
            onCheckedChange={v => updateLayout({ showHeader: v })}
            className="w-7 h-4 rounded-full bg-ds-bg border border-ds-border data-[state=checked]:bg-ds-accent transition-colors"
          >
            <Switch.Thumb className="block w-3 h-3 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-3 translate-x-0.5" />
          </Switch.Root>
          <span className="text-xs text-ds-text">Header</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <Switch.Root
            checked={layout.showFooter}
            onCheckedChange={v => updateLayout({ showFooter: v })}
            className="w-7 h-4 rounded-full bg-ds-bg border border-ds-border data-[state=checked]:bg-ds-accent transition-colors"
          >
            <Switch.Thumb className="block w-3 h-3 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-3 translate-x-0.5" />
          </Switch.Root>
          <span className="text-xs text-ds-text">Footer</span>
        </label>

        {/* Divider */}
        <div className="w-px h-4 bg-ds-border/50" />

        {/* Crop toggle button */}
        <button
          onClick={() => setCropMode(!cropMode)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border transition-colors',
            cropMode
              ? 'bg-orange-500/20 border-orange-500 text-orange-400'
              : 'bg-ds-bg border-ds-border text-ds-text-muted hover:text-ds-text hover:border-ds-border-bright',
          )}
        >
          <Crop className="w-3 h-3" />
          Crop
          {hasCrop && !cropMode && (
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
          )}
        </button>

        {/* Reset crop (only visible when crop is active and has values) */}
        {cropMode && hasCrop && (
          <button
            onClick={() => updateLayout({ cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0 })}
            className="text-xs text-orange-400 hover:text-orange-300 underline underline-offset-2"
          >
            Reset
          </button>
        )}

        {/* Crop readout when active */}
        {cropMode && hasCrop && (
          <span className="text-xs font-mono text-orange-400/70">
            T{layout.cropTop ?? 0}% R{layout.cropRight ?? 0}% B{layout.cropBottom ?? 0}% L{layout.cropLeft ?? 0}%
          </span>
        )}

        {/* Template slide selector (only when template is set) */}
        {templateSlides.length > 0 && (
          <>
            <div className="w-px h-4 bg-ds-border/50" />
            <div className="flex items-center gap-1.5">
              <Presentation className="w-3 h-3 text-ds-text-dim" />
              <span className="text-xs text-ds-text-dim">Base:</span>
              <select
                value={layout.templateSlideIndex ?? 0}
                onChange={e => updateLayout({ templateSlideIndex: parseInt(e.target.value, 10) })}
                className="h-5 px-1 text-xs bg-ds-bg border border-ds-border rounded focus:outline-none focus:border-ds-accent text-ds-text-muted cursor-pointer"
              >
                {templateSlides.map(ts => (
                  <option key={ts.index} value={ts.index}>
                    {ts.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* Dimensions readout */}
        <span className="text-xs font-mono text-ds-text-dim ml-auto">
          ({layout.imageX.toFixed(1)}", {layout.imageY.toFixed(1)}") {layout.imageW.toFixed(1)}" × {layout.imageH.toFixed(1)}"
        </span>
      </div>

      {/* ═══ Canvas area ═══ */}
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

          {/* Image placement area */}
          <div
            onMouseDown={!cropMode ? startMove : undefined}
            className={cn(
              'absolute transition-shadow',
              cropMode
                ? 'border-2 border-dashed border-orange-500/60'
                : cn(
                    'border-2',
                    activeInteraction === 'move'
                      ? 'border-ds-accent shadow-[0_0_20px_rgba(187,134,252,0.4)] cursor-grabbing'
                      : 'border-ds-accent/60 hover:border-ds-accent hover:shadow-[0_0_12px_rgba(187,134,252,0.25)] cursor-grab',
                  ),
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
                style={{
                  objectFit: layout.fitMode === 'stretch' ? 'fill' : layout.fitMode === 'fill' ? 'cover' : 'contain',
                  clipPath: hasCrop ? `inset(${cropInset.top} ${cropInset.right} ${cropInset.bottom} ${cropInset.left})` : undefined,
                }}
                draggable={false}
              />
            ) : (
              <>
                <div className="absolute inset-0 opacity-10" style={{
                  backgroundImage: 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%)',
                  backgroundSize: '20px 20px',
                  clipPath: hasCrop ? `inset(${cropInset.top} ${cropInset.right} ${cropInset.bottom} ${cropInset.left})` : undefined,
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

            {/* Crop overlay — shaded areas being cropped */}
            {cropMode && hasCrop && (
              <>
                {(layout.cropTop ?? 0) > 0 && (
                  <div className="absolute top-0 left-0 right-0 bg-black/40" style={{ height: cropInset.top }} />
                )}
                {(layout.cropBottom ?? 0) > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/40" style={{ height: cropInset.bottom }} />
                )}
                {(layout.cropLeft ?? 0) > 0 && (
                  <div className="absolute left-0 bg-black/40" style={{
                    top: cropInset.top, bottom: cropInset.bottom, width: cropInset.left,
                  }} />
                )}
                {(layout.cropRight ?? 0) > 0 && (
                  <div className="absolute right-0 bg-black/40" style={{
                    top: cropInset.top, bottom: cropInset.bottom, width: cropInset.right,
                  }} />
                )}
              </>
            )}

            {/* Mode indicator badge */}
            {!cropMode && (
              <div className="absolute top-1 left-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-ds-accent/80 text-white">
                <Move className="w-3 h-3" />
                <span className="text-xs font-medium">Move</span>
              </div>
            )}
            {cropMode && (
              <div className="absolute top-1 left-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-orange-500/80 text-white">
                <Crop className="w-3 h-3" />
                <span className="text-xs font-medium">Crop</span>
              </div>
            )}

            {/* ─── Resize / Crop handles ─── */}
            {handles.map(({ id, style }) => (
              <div
                key={id}
                onMouseDown={e => startHandle(e, id)}
                className={cn(
                  'absolute w-[8px] h-[8px] z-10',
                  HANDLE_CURSORS[id],
                  cropMode
                    ? 'bg-orange-500 border border-orange-300 hover:bg-orange-400'
                    : 'bg-white border-2 border-ds-accent hover:bg-ds-accent/30',
                  // Corner handles are slightly larger
                  (id.length === 2) && 'w-[10px] h-[10px]',
                )}
                style={{
                  ...style,
                  borderRadius: id.length === 2 ? '2px' : '1px',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
