import JSZip from 'jszip';
import { Novel } from '../types';

const escapeXml = (unsafe: string) => {
  // 先将常见的 HTML 实体替换为实际字符喵~
  const decoded = unsafe
    .replace(/&nbsp;/g, ' ')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rsquo;/g, '’')
    .replace(/&hellip;/g, '…')
    .replace(/&middot;/g, '·')
    .replace(/&mdash;/g, '—')
    .replace(/&copy;/g, '©')
    .replace(/&reg;/g, '®');

  // 然后再进行 XML 必要的转义喵~
  return decoded.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return c;
    }
  });
};

export const generateEpub = async (novel: Novel, coverBlob?: Blob): Promise<Blob> => {
  const zip = new JSZip();
  const uuid = `urn:uuid:${novel.id}`;

  // 1. mimetype
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  // 2. META-INF/container.xml
  zip.folder("META-INF")?.file(
    "container.xml",
    `<?xml version="1.0"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
      </rootfiles>
    </container>`
  );

  const oebps = zip.folder("OEBPS");
  if (!oebps) throw new Error("Failed to create OEBPS folder");

  // Handle Cover
  let coverItem = "";
  let coverMeta = "";
  if (coverBlob) {
    const ext = coverBlob.type.includes('png') ? 'png' : 'jpg';
    const filename = `cover.${ext}`;
    oebps.file(filename, coverBlob);
    coverItem = `<item id="cover-image" href="${filename}" media-type="${coverBlob.type}" properties="cover-image"/>`;
    coverMeta = `<meta name="cover" content="cover-image"/>`;
  }

  // 3. Chapters XHTML
  novel.chapters.forEach((chapter) => {
    const escapedTitle = escapeXml(chapter.title);
    const escapedContent = (chapter.content || '')
      .split('\n')
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map(p => `<p>${escapeXml(p)}</p>`)
      .join('\n');

    const content = `<?xml version="1.0" encoding="utf-8"?>
    <!DOCTYPE html>
    <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
    <head>
      <title>${escapedTitle}</title>
      <style>
        body { font-family: sans-serif; line-height: 1.6; padding: 1em; }
        h1 { text-align: center; border-bottom: 1px solid #ddd; padding-bottom: 0.5em; font-size: 1.5em; margin-bottom: 1em; }
        p { text-indent: 2em; margin-bottom: 0.8em; text-align: justify; }
      </style>
    </head>
    <body>
      <h1>${escapedTitle}</h1>
      ${escapedContent}
    </body>
    </html>`;

    oebps.file(`chapter_${chapter.number}.xhtml`, content);
  });

  // 4. content.opf
  const manifestItems = novel.chapters
    .map(c => `<item id="ch${c.number}" href="chapter_${c.number}.xhtml" media-type="application/xhtml+xml"/>`)
    .join('\n');

  const spineItems = novel.chapters
    .map(c => `<itemref idref="ch${c.number}"/>`)
    .join('\n');

  const opfContent = `<?xml version="1.0" encoding="UTF-8"?>
  <package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>${escapeXml(novel.title)}</dc:title>
      <dc:creator>${escapeXml(novel.author)}</dc:creator>
      <dc:language>zh-CN</dc:language>
      <dc:identifier id="BookId">${uuid}</dc:identifier>
      <dc:description>${escapeXml(novel.description)}</dc:description>
      <meta property="dcterms:modified">${new Date().toISOString().split('.')[0]}Z</meta>
      ${coverMeta}
    </metadata>
    <manifest>
      <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
      ${coverItem}
      ${manifestItems}
    </manifest>
    <spine toc="ncx">
      ${spineItems}
    </spine>
  </package>`;

  oebps.file("content.opf", opfContent);

  // 5. toc.ncx (For backward compatibility)
  const navMap = novel.chapters.map((c, i) => `
    <navPoint id="navPoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(c.title)}</text></navLabel>
      <content src="chapter_${c.number}.xhtml"/>
    </navPoint>
  `).join('\n');

  const ncxContent = `<?xml version="1.0" encoding="UTF-8"?>
  <ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
    <head>
      <meta name="dtb:uid" content="${uuid}"/>
      <meta name="dtb:depth" content="1"/>
      <meta name="dtb:totalPageCount" content="0"/>
      <meta name="dtb:maxPageNumber" content="0"/>
    </head>
    <docTitle><text>${novel.title}</text></docTitle>
    <navMap>
      ${navMap}
    </navMap>
  </ncx>`;

  oebps.file("toc.ncx", ncxContent);

  return await zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
};
