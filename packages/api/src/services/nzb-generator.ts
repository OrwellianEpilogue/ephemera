import type { Book } from "../db/schema.js";

/**
 * Service to generate fake NZB files for books
 * The NZB format is used to trick *arr apps into thinking these are Usenet downloads
 */
export class NzbGenerator {
  /**
   * Generate a fake NZB file for a book
   * The MD5 is encoded in the filename and metadata for later extraction
   */
  generateNzb(book: Book): string {
    const poster = "ephemera@bookdownloader.local";
    const date = Math.floor(Date.now() / 1000);
    const groups = ["alt.binaries.ebooks"];

    // Encode MD5 in filename
    const filename = `[${book.md5}] ${book.title}${
      book.format ? `.${book.format}` : ""
    }`;

    // Create fake segments (required for valid NZB structure)
    const segments = this.generateFakeSegments(book.size || 1024 * 1024);

    // Build the NZB XML
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE nzb PUBLIC "-//newzBin//DTD NZB 1.1//EN" "http://www.newzbin.com/DTD/nzb-1.1.dtd">
<nzb xmlns="http://www.newzbin.com/DTD/nzb-1.1.dtd">
  <head>
    <meta type="title">${this.escapeXml(book.title)}</meta>
    ${
      book.authors && book.authors.length > 0
        ? `<meta type="author">${this.escapeXml(
            book.authors.join(", "),
          )}</meta>`
        : ""
    }
    ${
      book.publisher
        ? `<meta type="publisher">${this.escapeXml(book.publisher)}</meta>`
        : ""
    }
    ${book.year ? `<meta type="year">${book.year}</meta>` : ""}
    <meta type="md5">${book.md5}</meta>
    <meta type="source">ephemera</meta>
  </head>
  <file poster="${poster}" date="${date}" subject="${this.escapeXml(
    filename,
  )} yEnc (1/1)">
    <groups>
      ${groups.map((g) => `<group>${g}</group>`).join("\n      ")}
    </groups>
    <segments>
      ${segments
        .map(
          (seg) =>
            `<segment bytes="${seg.bytes}" number="${seg.number}">${seg.id}</segment>`,
        )
        .join("\n      ")}
    </segments>
  </file>
</nzb>`;

    return xml;
  }

  /**
   * Generate fake segment data for NZB
   * This creates realistic-looking segment information
   */
  private generateFakeSegments(
    totalBytes: number,
  ): Array<{ bytes: number; number: number; id: string }> {
    const segmentSize = 750000; // Standard yEnc segment size
    const numSegments = Math.ceil(totalBytes / segmentSize);
    const segments = [];

    for (let i = 1; i <= numSegments; i++) {
      const isLastSegment = i === numSegments;
      const bytes = isLastSegment
        ? totalBytes - (numSegments - 1) * segmentSize
        : segmentSize;

      segments.push({
        bytes,
        number: i,
        id: this.generateMessageId(),
      });
    }

    return segments;
  }

  /**
   * Generate a fake Usenet message ID
   */
  private generateMessageId(): string {
    const random = Math.random().toString(36).substring(2, 15);
    const timestamp = Date.now().toString(36);
    return `${random}.${timestamp}@ephemera.local`;
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}

export const nzbGenerator = new NzbGenerator();
