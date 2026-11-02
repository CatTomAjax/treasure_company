import type { BusinessRecord } from './platform-config';
import { PlatformError } from './platform-auth';
const xml = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;',
      })[c]!,
  );
export async function produceArtifact(record: BusinessRecord, format: string) {
  const content =
      record.data.content ||
      record.data.script ||
      record.data.description ||
      '',
    title = record.title;
  let bytes: Uint8Array, mime: string;
  if (format === 'md') {
    bytes = new TextEncoder().encode(
      `# ${title}\n\n${content}\n\n来源：${record.id}\n版本：${record.version}`,
    );
    mime = 'text/markdown';
  } else if (format === 'svg') {
    const color = /^#[\da-f]{6}$/i.test(record.data.brandColor || '')
        ? record.data.brandColor
        : '#218FAE',
      lines =
        content
          .replace(/\n/g, ' ')
          .match(/.{1,23}/g)
          ?.slice(0, 20) || [];
    bytes = new TextEncoder().encode(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#07182A"/><stop offset="1" stop-color="${color}"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#g)"/><text x="80" y="110" font-size="30" fill="white" font-family="Microsoft YaHei,sans-serif">前海创客中心</text>${(
        title.match(/.{1,12}/g) || []
      )
        .slice(0, 3)
        .map(
          (s, i) =>
            `<text x="80" y="${260 + i * 85}" font-size="65" fill="white" font-family="Microsoft YaHei,sans-serif">${xml(s)}</text>`,
        )
        .join(
          '',
        )}${lines.map((s, i) => `<text x="80" y="${590 + i * 30}" font-size="25" fill="#D6EEF5" font-family="Microsoft YaHei,sans-serif">${xml(s)}</text>`).join('')}<text x="80" y="1290" fill="#C2E4ED" font-size="19">${xml(record.status)} · ${record.version.slice(0, 8)}</text></svg>`,
    );
    mime = 'image/svg+xml';
  } else if (format === 'docx') {
    const { default: JSZip } = await import('jszip'),
      zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    );
    zip.file(
      '_rels/.rels',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    );
    zip.file(
      'word/document.xml',
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${[title, ...content.split('\n'), `来源 ${record.id} / ${record.version}`].map((s, i) => `<w:p><w:pPr><w:spacing w:after="150"/></w:pPr><w:r><w:rPr><w:rFonts w:eastAsia="Microsoft YaHei"/><w:sz w:val="${i === 0 ? 36 : 22}"/></w:rPr><w:t xml:space="preserve">${xml(s)}</w:t></w:r></w:p>`).join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`,
    );
    bytes = await zip.generateAsync({ type: 'uint8array' });
    mime =
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  } else if (format === 'pptx') {
    const { default: PptxGenJS } = await import('pptxgenjs'),
      pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.title = title;
    pptx.author = '前海创客中心';
    const lines = content
      .split('\n')
      .flatMap((s) => s.match(/.{1,60}/g) || ['']);
    for (let i = 0; i < Math.max(lines.length, 1); i += 10) {
      const slide = pptx.addSlide();
      slide.background = { color: '0C2032' };
      slide.addText(title, {
        x: 0.6,
        y: 0.4,
        w: 12,
        h: 0.8,
        fontSize: 27,
        color: 'FFFFFF',
        fontFace: 'Microsoft YaHei',
        fit: 'shrink',
      });
      slide.addText(lines.slice(i, i + 10).join('\n'), {
        x: 0.6,
        y: 1.5,
        w: 12,
        h: 5.3,
        fontSize: 18,
        color: 'DAEDF5',
        fontFace: 'Microsoft YaHei',
        fit: 'shrink',
      });
      slide.addText(`${record.status} · ${record.version.slice(0, 8)}`, {
        x: 0.6,
        y: 7,
        w: 12,
        h: 0.2,
        fontSize: 9,
        color: '93B3C8',
      });
    }
    bytes = new Uint8Array(
      (await pptx.write({ outputType: 'uint8array' })) as ArrayBuffer,
    );
    mime =
      'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  } else
    throw new PlatformError(
      '本地生产支持SVG、DOCX、PPTX、Markdown；视频请通过时间线渲染',
    );
  return { bytes, mime, name: `${title}.${format}` };
}
