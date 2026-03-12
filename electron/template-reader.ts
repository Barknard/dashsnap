import fs from 'fs';
import JSZip from 'jszip';

export interface TemplateSlideInfo {
  index: number;   // 0-based
  name: string;    // "Slide 1", or extracted title
  xmlPath: string; // e.g. "ppt/slides/slide1.xml"
}

/**
 * Read a .pptx file and enumerate its slides.
 */
export async function enumerateTemplateSlides(templatePath: string): Promise<TemplateSlideInfo[]> {
  if (!fs.existsSync(templatePath)) return [];

  const buffer = fs.readFileSync(templatePath);
  const zip = await JSZip.loadAsync(buffer);

  // Find all slide XML entries
  const slideEntries: Array<{ num: number; path: string }> = [];
  zip.forEach((relativePath) => {
    const match = relativePath.match(/^ppt\/slides\/slide(\d+)\.xml$/);
    if (match) {
      slideEntries.push({ num: parseInt(match[1], 10), path: relativePath });
    }
  });

  // Sort by slide number
  slideEntries.sort((a, b) => a.num - b.num);

  // Try to extract slide titles from XML
  const results: TemplateSlideInfo[] = [];
  for (let i = 0; i < slideEntries.length; i++) {
    const entry = slideEntries[i];
    let name = `Slide ${i + 1}`;

    try {
      const xml = await zip.file(entry.path)?.async('string');
      if (xml) {
        // Look for title placeholder text — rough extraction
        const titleMatch = xml.match(/<p:ph[^>]*type="title"[^>]*\/>/);
        if (titleMatch) {
          // Find the parent sp element and extract its text
          const spIndex = xml.lastIndexOf('<p:sp', xml.indexOf(titleMatch[0]));
          const spEnd = xml.indexOf('</p:sp>', spIndex);
          if (spIndex >= 0 && spEnd >= 0) {
            const spXml = xml.substring(spIndex, spEnd);
            // Extract all <a:t> text nodes
            const texts: string[] = [];
            const tRegex = /<a:t>([^<]*)<\/a:t>/g;
            let m;
            while ((m = tRegex.exec(spXml)) !== null) {
              if (m[1].trim()) texts.push(m[1].trim());
            }
            if (texts.length > 0) {
              name = texts.join(' ').substring(0, 60);
            }
          }
        }
      }
    } catch {
      // Fall back to generic name
    }

    results.push({ index: i, name, xmlPath: entry.path });
  }

  return results;
}

/**
 * Load a .pptx template as a JSZip instance for manipulation.
 */
export async function loadTemplate(templatePath: string): Promise<JSZip> {
  const buffer = fs.readFileSync(templatePath);
  return JSZip.loadAsync(buffer);
}
