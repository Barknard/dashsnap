import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock pptxgenjs ──────────────────────────────────────────────────────────

const mockSlide = {
  addImage: vi.fn(),
  addText: vi.fn(),
  background: { fill: '000000' },
};

const mockPptx = {
  addSlide: vi.fn(() => mockSlide),
  defineLayout: vi.fn(),
  layout: '',
  writeFile: vi.fn(async ({ fileName }: { fileName: string }) => fileName),
  write: vi.fn(async () => Buffer.from('fake-pptx')),
  title: '',
  subject: '',
  author: '',
};

vi.mock('pptxgenjs', () => ({
  default: vi.fn(() => mockPptx),
}));

// ─── PptxBuilder reference implementation ────────────────────────────────────

interface SlideInput {
  name: string;
  path: string;
  title?: string;
}

interface PptxBuilderOptions {
  outputPath: string;
  flowName: string;
  template?: string;
  slides: SlideInput[];
}

// 16:9 dimensions in inches (standard PowerPoint)
const SLIDE_WIDTH = 13.333;
const SLIDE_HEIGHT = 7.5;

class PptxBuilder {
  private options: PptxBuilderOptions;

  constructor(options: PptxBuilderOptions) {
    this.options = options;
  }

  async build(): Promise<string> {
    const PptxGenJs = (await import('pptxgenjs')).default;
    const pptx = new PptxGenJs();

    // Set 16:9 layout
    pptx.defineLayout({ name: 'DASHSNAP', width: SLIDE_WIDTH, height: SLIDE_HEIGHT });
    pptx.layout = 'DASHSNAP';
    pptx.title = this.options.flowName;
    pptx.author = 'DashSnap';

    for (const slide of this.options.slides) {
      const s = pptx.addSlide();

      // Add screenshot image filling the slide
      s.addImage({
        path: slide.path,
        x: 0,
        y: 0,
        w: SLIDE_WIDTH,
        h: SLIDE_HEIGHT,
        sizing: { type: 'contain', w: SLIDE_WIDTH, h: SLIDE_HEIGHT },
      });

      // Add title text at bottom
      const title = slide.title || slide.name;
      s.addText(title, {
        x: 0.5,
        y: SLIDE_HEIGHT - 0.6,
        w: SLIDE_WIDTH - 1,
        h: 0.4,
        fontSize: 12,
        color: 'FFFFFF',
        align: 'left',
        valign: 'bottom',
        shadow: { type: 'outer', blur: 3, offset: 1, color: '000000', opacity: 0.6 },
      });
    }

    const outputFile = this.generateOutputPath();
    await pptx.writeFile({ fileName: outputFile });
    return outputFile;
  }

  generateOutputPath(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeName = this.options.flowName.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${this.options.outputPath}/${safeName}_${timestamp}.pptx`;
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PptxBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('slide creation from screenshots', () => {
    it('should create one slide per screenshot', async () => {
      const builder = new PptxBuilder({
        outputPath: '/mock/output',
        flowName: 'Test Report',
        slides: [
          { name: 'chart-1', path: '/mock/screenshots/chart-1.png' },
          { name: 'chart-2', path: '/mock/screenshots/chart-2.png' },
          { name: 'chart-3', path: '/mock/screenshots/chart-3.png' },
        ],
      });

      await builder.build();

      expect(mockPptx.addSlide).toHaveBeenCalledTimes(3);
    });

    it('should add image to each slide', async () => {
      const builder = new PptxBuilder({
        outputPath: '/mock/output',
        flowName: 'Images Test',
        slides: [
          { name: 'snap-1', path: '/screenshots/snap-1.png' },
        ],
      });

      await builder.build();

      expect(mockSlide.addImage).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/screenshots/snap-1.png',
          x: 0,
          y: 0,
        })
      );
    });

    it('should handle empty slides array', async () => {
      const builder = new PptxBuilder({
        outputPath: '/mock/output',
        flowName: 'Empty Report',
        slides: [],
      });

      await builder.build();

      expect(mockPptx.addSlide).not.toHaveBeenCalled();
      expect(mockPptx.writeFile).toHaveBeenCalled();
    });
  });

  describe('16:9 aspect ratio', () => {
    it('should define a 16:9 layout', async () => {
      const builder = new PptxBuilder({
        outputPath: '/mock/output',
        flowName: 'Aspect Test',
        slides: [{ name: 's1', path: '/s1.png' }],
      });

      await builder.build();

      expect(mockPptx.defineLayout).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'DASHSNAP',
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT,
        })
      );

      // Verify 16:9 ratio
      const ratio = SLIDE_WIDTH / SLIDE_HEIGHT;
      expect(ratio).toBeCloseTo(16 / 9, 1);
    });

    it('should size images to fill the slide', async () => {
      const builder = new PptxBuilder({
        outputPath: '/mock/output',
        flowName: 'Fill Test',
        slides: [{ name: 's1', path: '/s1.png' }],
      });

      await builder.build();

      expect(mockSlide.addImage).toHaveBeenCalledWith(
        expect.objectContaining({
          w: SLIDE_WIDTH,
          h: SLIDE_HEIGHT,
          sizing: expect.objectContaining({ type: 'contain' }),
        })
      );
    });
  });

  describe('slide titles', () => {
    it('should set title from slide title property', async () => {
      const builder = new PptxBuilder({
        outputPath: '/mock/output',
        flowName: 'Titles Test',
        slides: [
          { name: 'snap-1', path: '/s1.png', title: 'Revenue Dashboard Q4' },
        ],
      });

      await builder.build();

      expect(mockSlide.addText).toHaveBeenCalledWith(
        'Revenue Dashboard Q4',
        expect.objectContaining({
          fontSize: 12,
          color: 'FFFFFF',
        })
      );
    });

    it('should fall back to name when title is missing', async () => {
      const builder = new PptxBuilder({
        outputPath: '/mock/output',
        flowName: 'Fallback Test',
        slides: [
          { name: 'weekly-kpis', path: '/s1.png' },
        ],
      });

      await builder.build();

      expect(mockSlide.addText).toHaveBeenCalledWith(
        'weekly-kpis',
        expect.any(Object)
      );
    });

    it('should set presentation title to flow name', async () => {
      const builder = new PptxBuilder({
        outputPath: '/mock/output',
        flowName: 'Monthly Report',
        slides: [{ name: 's1', path: '/s1.png' }],
      });

      await builder.build();

      expect(mockPptx.title).toBe('Monthly Report');
    });
  });

  describe('output file path generation', () => {
    it('should generate path with flow name and timestamp', () => {
      const builder = new PptxBuilder({
        outputPath: '/output/pptx',
        flowName: 'My Report',
        slides: [],
      });

      const path = builder.generateOutputPath();

      expect(path).toMatch(/^\/output\/pptx\/My_Report_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.pptx$/);
    });

    it('should sanitize special characters in flow name', () => {
      const builder = new PptxBuilder({
        outputPath: '/output',
        flowName: 'Report: Q4/2025 (Final)',
        slides: [],
      });

      const path = builder.generateOutputPath();

      expect(path).not.toContain(':');
      expect(path).not.toContain('/2025');
      expect(path).not.toContain('(');
      expect(path).toContain('Report');
    });

    it('should use the configured output path', () => {
      const builder = new PptxBuilder({
        outputPath: '/custom/dir',
        flowName: 'Test',
        slides: [],
      });

      const path = builder.generateOutputPath();

      expect(path).toMatch(/^\/custom\/dir\//);
    });
  });

  describe('template handling', () => {
    it('should build without template', async () => {
      const builder = new PptxBuilder({
        outputPath: '/mock/output',
        flowName: 'No Template',
        slides: [{ name: 's1', path: '/s1.png' }],
      });

      // Should not throw
      const result = await builder.build();
      expect(result).toBeDefined();
      expect(mockPptx.writeFile).toHaveBeenCalled();
    });

    it('should accept template path in options', () => {
      const builder = new PptxBuilder({
        outputPath: '/mock/output',
        flowName: 'With Template',
        template: '/templates/branded.pptx',
        slides: [{ name: 's1', path: '/s1.png' }],
      });

      // Template stored for use
      expect(builder).toBeDefined();
    });
  });

  describe('author metadata', () => {
    it('should set author to DashSnap', async () => {
      const builder = new PptxBuilder({
        outputPath: '/mock/output',
        flowName: 'Meta Test',
        slides: [{ name: 's1', path: '/s1.png' }],
      });

      await builder.build();

      expect(mockPptx.author).toBe('DashSnap');
    });
  });
});
