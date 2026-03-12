import type { FlowStep, SnapStep, PptxLayout } from '@shared/types';

/**
 * A "slide" is derived from the flat FlowStep array.
 * Each SNAP step defines a slide. The actions leading up to it
 * (since the previous SNAP or start of the flow) are that slide's actions.
 */
export interface DerivedSlide {
  id: string;              // SNAP step's ID
  slideIndex: number;      // 0-based
  title: string;           // SNAP step's label
  captureStep: SnapStep;   // The SNAP step itself
  actions: FlowStep[];     // Steps leading up to this SNAP
  layout?: PptxLayout;     // slideLayout from the SNAP step
  allStepIndices: number[]; // Original indices in the flow.steps array
}

/**
 * Derives slides from a flat step array.
 * Groups steps into slides — each SNAP step terminates a slide.
 * Steps after the last SNAP with no following SNAP are "pending actions" (no slide yet).
 */
export function deriveSlides(steps: FlowStep[]): {
  slides: DerivedSlide[];
  pendingActions: FlowStep[];
  pendingIndices: number[];
} {
  const slides: DerivedSlide[] = [];
  let currentActions: FlowStep[] = [];
  let currentIndices: number[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.type === 'SNAP') {
      slides.push({
        id: step.id,
        slideIndex: slides.length,
        title: step.label,
        captureStep: step as SnapStep,
        actions: currentActions,
        layout: (step as SnapStep).slideLayout,
        allStepIndices: [...currentIndices, i],
      });
      currentActions = [];
      currentIndices = [];
    } else {
      currentActions.push(step);
      currentIndices.push(i);
    }
  }

  return {
    slides,
    pendingActions: currentActions,
    pendingIndices: currentIndices,
  };
}

/**
 * Gets the action count label for a slide.
 */
export function slideActionLabel(slide: DerivedSlide): string {
  const n = slide.actions.length;
  return `${n} action${n !== 1 ? 's' : ''}`;
}

/**
 * Gets a human-readable capture region description.
 */
export function slideCaptureLabel(slide: DerivedSlide): string {
  const r = slide.captureStep.region;
  return `${r.width}×${r.height}px`;
}
