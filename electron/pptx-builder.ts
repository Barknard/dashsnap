import PptxGenJS from 'pptxgenjs';
import path from 'path';
import fs from 'fs';
import JSZip from 'jszip';
import { nativeImage } from 'electron';
import { ConfigManager } from './config-manager';
import { enumerateTemplateSlides } from './template-reader';
import type { PptxLayout, Flow } from '../shared/types';

const DEFAULT_LAYOUT: PptxLayout = {
  imageX: 0.3,
  imageY: 0.8,
  imageW: 12.7,
  imageH: 6.2,
  showHeader: true,
  showFooter: true,
  fitMode: 'contain',
};

// 1 inch = 914400 EMUs (English Metric Units)
const EMU = 914400;

export class PptxBuilder {
  private config: ConfigManager;

  constructor(config: ConfigManager) {
    this.config = config;
  }

  async build(
    flowId: string,
    screenshots: Array<{ name: string; path: string; slideLayout?: PptxLayout }>,
  ): Promise<string> {
    const flowConfig = this.config.loadFlows();
    const flow = flowConfig.flows.find((f: { id: string }) => f.id === flowId) as Flow | undefined;
    const settings = this.config.loadSettings();
    const layout: PptxLayout = { ...DEFAULT_LAYOUT, ...settings.pptxLayout };

    // Determine output path
    const outputDir = settings.outputPath ||
      path.join(this.config.getBasePath(), '..', 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `DashSnap_${ts}.pptx`;
    const outputPath = path.join(outputDir, filename);

    // Check if flow has a template
    const templatePath = flow?.template || settings.defaultTemplate;
    if (templatePath && fs.existsSync(templatePath)) {
      await this.buildFromTemplate(templatePath, screenshots, layout, outputPath);
    } else {
      await this.buildFromScratch(screenshots, layout, outputPath);
    }

    return outputPath;
  }

  // ─── Template-based build: clone template slides, inject screenshots ─────

  private async buildFromTemplate(
    templatePath: string,
    screenshots: Array<{ name: string; path: string; slideLayout?: PptxLayout }>,
    globalLayout: PptxLayout,
    outputPath: string,
  ): Promise<void> {
    const templateSlides = await enumerateTemplateSlides(templatePath);
    if (templateSlides.length === 0) {
      // Fall back to scratch build if template is empty/corrupt
      return this.buildFromScratch(screenshots, globalLayout, outputPath);
    }

    const templateBuffer = fs.readFileSync(templatePath);
    const zip = await JSZip.loadAsync(templateBuffer);

    // Find the highest existing media number to avoid collisions
    let maxMediaNum = 0;
    zip.forEach((relativePath) => {
      const m = relativePath.match(/^ppt\/media\/image(\d+)\./);
      if (m) maxMediaNum = Math.max(maxMediaNum, parseInt(m[1], 10));
    });

    // We'll build new slides by cloning template slides and injecting images.
    // Strategy: keep the template structure, remove all original slides,
    // then add our new slides based on the selected template slide for each capture.

    // First, collect all original slide paths
    const originalSlidePaths: string[] = [];
    zip.forEach((relativePath) => {
      if (/^ppt\/slides\/slide\d+\.xml$/.test(relativePath)) {
        originalSlidePaths.push(relativePath);
      }
    });

    // Read original slide XMLs and rels (indexed by slide number)
    const slideXmlCache = new Map<string, string>();
    const slideRelsCache = new Map<string, string>();
    for (const slidePath of originalSlidePaths) {
      const xml = await zip.file(slidePath)?.async('string');
      if (xml) slideXmlCache.set(slidePath, xml);

      const relsPath = slidePath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
      const rels = await zip.file(relsPath)?.async('string');
      if (rels) slideRelsCache.set(relsPath, rels);
    }

    // Read presentation.xml and Content_Types
    const presentationXml = await zip.file('ppt/presentation.xml')?.async('string') || '';
    const presentationRels = await zip.file('ppt/_rels/presentation.xml.rels')?.async('string') || '';
    const contentTypes = await zip.file('[Content_Types].xml')?.async('string') || '';

    // Remove all original slides from ZIP
    for (const slidePath of originalSlidePaths) {
      zip.remove(slidePath);
      const relsPath = slidePath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
      zip.remove(relsPath);
    }

    // Build new slides
    const newSlideIds: Array<{ num: number; rId: string }> = [];
    let nextRId = 100; // Start high to avoid collisions with existing rels

    for (let i = 0; i < screenshots.length; i++) {
      const screenshot = screenshots[i];
      const sl: PptxLayout = screenshot.slideLayout
        ? { ...globalLayout, ...screenshot.slideLayout }
        : globalLayout;

      // Which template slide to clone (0-based)
      const templateIdx = sl.templateSlideIndex ?? 0;
      const clampedIdx = Math.min(templateIdx, templateSlides.length - 1);
      const sourceSlide = templateSlides[clampedIdx];

      // Clone the template slide XML
      let slideXml = slideXmlCache.get(sourceSlide.xmlPath) || '';
      const sourceRelsPath = sourceSlide.xmlPath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
      let slideRels = slideRelsCache.get(sourceRelsPath) || '';

      // Prepare the screenshot image
      const slideNum = i + 1;
      const mediaNum = maxMediaNum + slideNum;
      const mediaFilename = `image${mediaNum}.png`;
      const mediaPath = `ppt/media/${mediaFilename}`;

      if (fs.existsSync(screenshot.path)) {
        // Crop the image if needed
        const imgBuffer = this.cropImage(fs.readFileSync(screenshot.path), sl);
        zip.file(mediaPath, imgBuffer);

        // Add relationship for the new image in slide rels
        const imgRId = `rIdDSImg${slideNum}`;
        const relEntry = `<Relationship Id="${imgRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaFilename}"/>`;

        // Insert before </Relationships>
        slideRels = slideRels.replace('</Relationships>', `${relEntry}</Relationships>`);

        // Build the <p:pic> element for the screenshot
        const picXml = this.buildPicXml(imgRId, sl, screenshot.name, slideNum);

        // Insert before </p:spTree> in the slide XML (on top of existing content)
        slideXml = slideXml.replace('</p:spTree>', `${picXml}</p:spTree>`);
      }

      // Write the new slide
      const newSlidePath = `ppt/slides/slide${slideNum}.xml`;
      const newRelsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
      zip.file(newSlidePath, slideXml);
      zip.file(newRelsPath, slideRels);

      // Track for presentation.xml update
      const slideRId = `rIdSlide${nextRId++}`;
      newSlideIds.push({ num: slideNum, rId: slideRId });
    }

    // Update presentation.xml — replace <p:sldIdLst> with our new slides
    let updatedPresentation = presentationXml;
    const sldIdLstMatch = updatedPresentation.match(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/);
    if (sldIdLstMatch) {
      const newSldIdLst = '<p:sldIdLst>' +
        newSlideIds.map((s, i) => `<p:sldId id="${256 + i}" r:id="${s.rId}"/>`).join('') +
        '</p:sldIdLst>';
      updatedPresentation = updatedPresentation.replace(sldIdLstMatch[0], newSldIdLst);
    }
    zip.file('ppt/presentation.xml', updatedPresentation);

    // Update presentation.xml.rels — remove old slide rels, add new ones
    let updatedPresRels = presentationRels;
    // Remove existing slide relationships
    updatedPresRels = updatedPresRels.replace(
      /<Relationship[^>]*Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/slide"[^>]*\/>/g,
      ''
    );
    // Add new slide relationships
    const newSlideRels = newSlideIds
      .map(s => `<Relationship Id="${s.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${s.num}.xml"/>`)
      .join('');
    updatedPresRels = updatedPresRels.replace('</Relationships>', `${newSlideRels}</Relationships>`);
    zip.file('ppt/_rels/presentation.xml.rels', updatedPresRels);

    // Update [Content_Types].xml — remove old slide entries, add new ones
    let updatedContentTypes = contentTypes;
    updatedContentTypes = updatedContentTypes.replace(
      /<Override[^>]*PartName="\/ppt\/slides\/slide\d+\.xml"[^>]*\/>/g,
      ''
    );
    const newContentTypeEntries = newSlideIds
      .map(s => `<Override PartName="/ppt/slides/slide${s.num}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`)
      .join('');
    updatedContentTypes = updatedContentTypes.replace('</Types>', `${newContentTypeEntries}</Types>`);
    // Ensure PNG content type exists
    if (!updatedContentTypes.includes('Extension="png"')) {
      updatedContentTypes = updatedContentTypes.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
    }
    zip.file('[Content_Types].xml', updatedContentTypes);

    // Write output
    const outputBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    fs.writeFileSync(outputPath, outputBuffer);
  }

  /**
   * Build a <p:pic> XML element for injecting a screenshot into a slide.
   */
  private buildPicXml(rId: string, sl: PptxLayout, name: string, uniqueId: number): string {
    const x = Math.round(sl.imageX * EMU);
    const y = Math.round(sl.imageY * EMU);
    const cx = Math.round(sl.imageW * EMU);
    const cy = Math.round(sl.imageH * EMU);

    return `
      <p:pic>
        <p:nvPicPr>
          <p:cNvPr id="${1000 + uniqueId}" name="${this.escapeXml(name)}"/>
          <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="${rId}"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm>
            <a:off x="${x}" y="${y}"/>
            <a:ext cx="${cx}" cy="${cy}"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
      </p:pic>`;
  }

  private escapeXml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * Crop an image buffer according to PptxLayout crop percentages.
   * Returns a PNG buffer.
   */
  private cropImage(rawBuffer: Buffer, sl: PptxLayout): Buffer {
    let img = nativeImage.createFromBuffer(rawBuffer);
    const fullSize = img.getSize();

    const ct = sl.cropTop ?? 0;
    const cr = sl.cropRight ?? 0;
    const cb = sl.cropBottom ?? 0;
    const cl = sl.cropLeft ?? 0;

    if (ct > 0 || cr > 0 || cb > 0 || cl > 0) {
      const cropX = Math.round(fullSize.width * cl / 100);
      const cropY = Math.round(fullSize.height * ct / 100);
      const cropW = Math.round(fullSize.width * (100 - cl - cr) / 100);
      const cropH = Math.round(fullSize.height * (100 - ct - cb) / 100);
      if (cropW > 0 && cropH > 0) {
        img = nativeImage.createFromBuffer(
          img.crop({ x: cropX, y: cropY, width: cropW, height: cropH }).toPNG()
        );
      }
    }

    return img.toPNG();
  }

  // ─── From-scratch build (existing pptxgenjs path) ─────────────────────

  private async buildFromScratch(
    screenshots: Array<{ name: string; path: string; slideLayout?: PptxLayout }>,
    globalLayout: PptxLayout,
    outputPath: string,
  ): Promise<void> {
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';

    const headerBg = '13111C';
    const headerText = 'EEEDF5';
    const accentColor = '7C5CFC';
    const footerText = '716D87';

    for (const screenshot of screenshots) {
      const sl: PptxLayout = screenshot.slideLayout
        ? { ...globalLayout, ...screenshot.slideLayout }
        : globalLayout;
      const slide = pptx.addSlide();

      if (sl.showHeader) {
        slide.addShape(pptx.ShapeType.rect, {
          x: 0, y: 0, w: '100%', h: 0.6,
          fill: { color: headerBg },
        });
        slide.addShape(pptx.ShapeType.rect, {
          x: 0, y: 0.58, w: '100%', h: 0.02,
          fill: { color: accentColor },
        });
        slide.addText(screenshot.name, {
          x: 0.4, y: 0.05, w: 8, h: 0.5,
          fontSize: 16, fontFace: 'Segoe UI', color: headerText, bold: true,
        });
      }

      if (fs.existsSync(screenshot.path)) {
        const imgBuffer = this.cropImage(fs.readFileSync(screenshot.path), sl);
        const imageData = imgBuffer.toString('base64');
        const img = nativeImage.createFromBuffer(imgBuffer);
        const imgSize = img.getSize();

        if (sl.fitMode === 'stretch') {
          slide.addImage({
            data: `image/png;base64,${imageData}`,
            x: sl.imageX, y: sl.imageY, w: sl.imageW, h: sl.imageH,
          });
        } else if (sl.fitMode === 'fill') {
          slide.addImage({
            data: `image/png;base64,${imageData}`,
            x: sl.imageX, y: sl.imageY, w: sl.imageW, h: sl.imageH,
            sizing: { type: 'cover', w: sl.imageW, h: sl.imageH },
          });
        } else {
          let imgW = imgSize.width / 96;
          let imgH = imgSize.height / 96;
          if (imgW > sl.imageW || imgH > sl.imageH) {
            const scale = Math.min(sl.imageW / imgW, sl.imageH / imgH);
            imgW *= scale;
            imgH *= scale;
          }
          const x = sl.imageX + (sl.imageW - imgW) / 2;
          const y = sl.imageY + (sl.imageH - imgH) / 2;
          slide.addImage({
            data: `image/png;base64,${imageData}`,
            x, y, w: imgW, h: imgH,
          });
        }
      }

      if (sl.showFooter) {
        const timestamp = new Date().toLocaleDateString('en-US', {
          year: 'numeric', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit',
        });
        slide.addText(`Generated by DashSnap — ${timestamp}`, {
          x: 0.4, y: 7.1, w: 10, h: 0.3,
          fontSize: 8, fontFace: 'Segoe UI', color: footerText,
        });
      }
    }

    await pptx.writeFile({ fileName: outputPath });
  }
}
