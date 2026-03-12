import { useState, useRef, useCallback, useEffect } from 'react';
import { Maximize2, Layout, PanelTop, Minimize2, Columns2, Columns3, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PptxLayout } from '@shared/types';

// PowerPoint LAYOUT_WIDE dimensions in inches
const SLIDE_W = 13.33;
const SLIDE_H = 7.5;
const MIN_SIZE = 0.5; // minimum image dimension in inches

// Header/footer fixed positions (must match pptx-builder.ts)
const HEADER_H = 0.6;   // header bar height
const ACCENT_H = 0.02;  // accent line
const FOOTER_Y = 7.1;   // footer text Y

type DragMode = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface Preset {
  label: string;
  icon: typeof Maximize2;
  layout: Partial<PptxLayout>;
}

const PRESETS: Preset[] = [
  {
    label: 'Full Bleed',
    icon: Maximize2,
    layout: { imageX: 0, imageY: 0, imageW: SLIDE_W, imageH: SLIDE_H, showHeader: false, showFooter: false },
  },
  {
    label: 'Standard',
    icon: PanelTop,
    layout: { imageX: 0.3, imageY: 0.8, imageW: 12.7, imageH: 6.2, showHeader: true, showFooter: true },
  },
  {
    label: 'Split Panel',
    icon: Columns2,
    layout: { imageX: 5.33, imageY: 0.8, imageW: 7.7, imageH: 6.2, showHeader: true, showFooter: true },
  },
  {
    label: 'Two-Panel',
    icon: Columns2,
    layout: { imageX: 0.3, imageY: 0.8, imageW: 6.2, imageH: 6.2, showHeader: true, showFooter: true },
  },
  {
    label: 'Triple',
    icon: Columns3,
    layout: { imageX: 0.3, imageY: 0.8, imageW: 4.1, imageH: 6.2, showHeader: true, showFooter: true },
  },
  {
    label: 'Appendix',
    icon: BookOpen,
    layout: { imageX: 1.5, imageY: 1.2, imageW: 10.33, imageH: 5.5, showHeader: true, showFooter: true },
  },
];

/** Snap to 0.1" grid */
function snap(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Clamp a value between min and max */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Tolerance-based float comparison for preset matching */
function near(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return Math.abs(a - b) < 0.05;
}

interface SlideLayoutPreviewProps {
  layout: PptxLayout;
  onChange: (updates: Record<string, number | boolean | string>) => void;
  onPreset: (preset: Partial<PptxLayout>) => void;
}

export function SlideLayoutPreview({ layout, onChange, onPreset }: SlideLayoutPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<DragMode | null>(null);
  const dragStartRef = useRef<{ mx: number; my: number; ix: number; iy: number; iw: number; ih: number }>({ mx: 0, my: 0, ix: 0, iy: 0, iw: 0, ih: 0 });

  // Use ref for onChange to avoid effect teardown/reattach on every render during drag
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const getScale = useCallback(() => {
    if (!containerRef.current) return null;
    return containerRef.current.clientWidth / SLIDE_W;
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent, mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();
    dragStartRef.current = {
      mx: e.clientX,
      my: e.clientY,
      ix: layout.imageX,
      iy: layout.imageY,
      iw: layout.imageW,
      ih: layout.imageH,
    };
    setDragging(mode);
  }, [layout.imageX, layout.imageY, layout.imageW, layout.imageH]);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const scale = getScale();
      if (!scale) return;
      const dx = (e.clientX - dragStartRef.current.mx) / scale;
      const dy = (e.clientY - dragStartRef.current.my) / scale;
      const { ix, iy, iw, ih } = dragStartRef.current;

      if (dragging === 'move') {
        onChangeRef.current({
          imageX: snap(clamp(ix + dx, 0, SLIDE_W - iw)),
          imageY: snap(clamp(iy + dy, 0, SLIDE_H - ih)),
        });
      } else {
        let newX = ix, newY = iy, newW = iw, newH = ih;

        // Each edge moves independently — opposite edge stays fixed
        if (dragging.includes('w')) {
          // Left edge: move X, adjust W to keep right edge fixed
          const rightEdge = ix + iw;
          newX = snap(clamp(ix + dx, 0, rightEdge - MIN_SIZE));
          newW = Math.max(MIN_SIZE, snap(rightEdge - newX));
        }
        if (dragging.includes('e')) {
          // Right edge: only change W, X stays fixed
          newW = Math.max(MIN_SIZE, snap(clamp(iw + dx, MIN_SIZE, SLIDE_W - ix)));
        }
        if (dragging.includes('n')) {
          // Top edge: move Y, adjust H to keep bottom edge fixed
          const bottomEdge = iy + ih;
          newY = snap(clamp(iy + dy, 0, bottomEdge - MIN_SIZE));
          newH = Math.max(MIN_SIZE, snap(bottomEdge - newY));
        }
        if (dragging.includes('s')) {
          // Bottom edge: only change H, Y stays fixed
          newH = Math.max(MIN_SIZE, snap(clamp(ih + dy, MIN_SIZE, SLIDE_H - iy)));
        }

        // Single batched update — all 4 values at once, no intermediate renders
        onChangeRef.current({ imageX: newX, imageY: newY, imageW: newW, imageH: newH });
      }
    };

    const handleMouseUp = () => setDragging(null);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, getScale]);

  const activePreset = PRESETS.findIndex(p => {
    const pl = p.layout;
    return (
      near(pl.imageX, layout.imageX) &&
      near(pl.imageY, layout.imageY) &&
      near(pl.imageW, layout.imageW) &&
      near(pl.imageH, layout.imageH) &&
      pl.showHeader === layout.showHeader &&
      pl.showFooter === layout.showFooter
    );
  });

  // Resize handle definitions — edges are wide for easy grabbing
  const handles: Array<{ mode: DragMode; cursor: string; style: React.CSSProperties }> = [
    // Corners (visible dots)
    { mode: 'nw', cursor: 'nwse-resize', style: { top: -4, left: -4, width: 9, height: 9 } },
    { mode: 'ne', cursor: 'nesw-resize', style: { top: -4, right: -4, width: 9, height: 9 } },
    { mode: 'sw', cursor: 'nesw-resize', style: { bottom: -4, left: -4, width: 9, height: 9 } },
    { mode: 'se', cursor: 'nwse-resize', style: { bottom: -4, right: -4, width: 9, height: 9 } },
    // Edges (wide invisible hit areas spanning full edge)
    { mode: 'n', cursor: 'ns-resize', style: { top: -6, left: 9, right: 9, height: 12 } },
    { mode: 's', cursor: 'ns-resize', style: { bottom: -6, left: 9, right: 9, height: 12 } },
    { mode: 'w', cursor: 'ew-resize', style: { left: -6, top: 9, bottom: 9, width: 12 } },
    { mode: 'e', cursor: 'ew-resize', style: { right: -6, top: 9, bottom: 9, width: 12 } },
  ];

  return (
    <div className="space-y-2">
      {/* Preset buttons — 2 rows of 3 */}
      <div className="grid grid-cols-3 gap-1">
        {PRESETS.map((preset, i) => {
          const Icon = preset.icon;
          return (
            <button
              key={preset.label}
              onClick={() => onPreset(preset.layout)}
              className={cn(
                'flex items-center justify-center gap-1 px-2 py-2 text-xs font-medium rounded-lg border transition-colors',
                activePreset === i
                  ? 'bg-ds-accent/20 border-ds-accent text-ds-accent'
                  : 'bg-ds-bg border-ds-border text-ds-text-muted hover:text-ds-text hover:border-ds-border-bright',
              )}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Slide canvas */}
      <div
        ref={containerRef}
        className="relative w-full bg-white rounded border border-ds-border overflow-hidden select-none"
        style={{ aspectRatio: `${SLIDE_W} / ${SLIDE_H}` }}
      >
        {/* Header zone */}
        {layout.showHeader && (
          <>
            <div
              className="absolute left-0 right-0 top-0 bg-[#1e293b]"
              style={{ height: `${(HEADER_H / SLIDE_H) * 100}%` }}
            />
            <div
              className="absolute left-0 right-0 bg-[#7c5cfc]"
              style={{
                top: `${(0.58 / SLIDE_H) * 100}%`,
                height: `${(ACCENT_H / SLIDE_H) * 100}%`,
              }}
            />
            {/* Title placeholder text */}
            <div
              className="absolute flex items-center px-[3%]"
              style={{
                top: `${(0.05 / SLIDE_H) * 100}%`,
                height: `${(0.5 / SLIDE_H) * 100}%`,
              }}
            >
              <span className="text-[8px] text-white/60 font-medium">Slide Title</span>
            </div>
          </>
        )}

        {/* Footer zone */}
        {layout.showFooter && (
          <div
            className="absolute left-0 right-0 flex items-center px-[3%]"
            style={{
              top: `${(FOOTER_Y / SLIDE_H) * 100}%`,
              height: `${(0.3 / SLIDE_H) * 100}%`,
            }}
          >
            <span className="text-[6px] text-gray-400">Generated by DashSnap</span>
          </div>
        )}

        {/* Image placement rectangle */}
        <div
          className={cn(
            'absolute border-2 transition-colors',
            dragging ? 'border-ds-accent bg-ds-accent/20' : 'border-ds-accent/60 bg-ds-accent/10 hover:border-ds-accent hover:bg-ds-accent/15',
          )}
          style={{
            left: `${(layout.imageX / SLIDE_W) * 100}%`,
            top: `${(layout.imageY / SLIDE_H) * 100}%`,
            width: `${(layout.imageW / SLIDE_W) * 100}%`,
            height: `${(layout.imageH / SLIDE_H) * 100}%`,
            cursor: dragging === 'move' ? 'grabbing' : 'grab',
          }}
          onMouseDown={(e) => handleMouseDown(e, 'move')}
        >
          {/* Center label */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-0.5">
              <Layout className="w-3.5 h-3.5 text-ds-accent/50" />
              <span className="text-[7px] font-mono text-ds-accent/70 bg-white/80 px-1 rounded">
                {layout.imageW.toFixed(1)}" x {layout.imageH.toFixed(1)}"
              </span>
            </div>
          </div>

          {/* Resize handles */}
          {handles.map(({ mode, cursor, style }) => (
            <div
              key={mode}
              className={cn(
                'absolute z-10',
                mode.length === 2
                  ? 'bg-ds-accent border border-white shadow-sm rounded-sm'  // corners: visible dots
                  : 'bg-transparent',                                         // edges: invisible wide hit area
              )}
              style={{ ...style, cursor, position: 'absolute' }}
              onMouseDown={(e) => handleMouseDown(e, mode)}
            />
          ))}
        </div>

        {/* Position label */}
        <div className="absolute bottom-0.5 right-1 text-[7px] font-mono text-gray-400 bg-white/80 px-1 rounded">
          ({layout.imageX.toFixed(1)}, {layout.imageY.toFixed(1)}) — {layout.imageW.toFixed(1)} x {layout.imageH.toFixed(1)} in
        </div>
      </div>

      {/* Dimensions readout */}
      <div className="flex items-center justify-between text-xs text-ds-text-dim px-0.5">
        <span>Slide: {SLIDE_W} x {SLIDE_H} in</span>
        <span className="font-mono">Snap: 0.1&quot;</span>
      </div>
    </div>
  );
}
