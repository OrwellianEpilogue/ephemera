/**
 * Service to parse NZB files and extract book MD5
 */
export class NzbParser {
  /**
   * Extract MD5 from an NZB file content
   * The MD5 is encoded in the filename or metadata
   */
  extractMd5(nzbContent: string): string | null {
    try {
      // First try to extract from meta tag
      const metaMatch = nzbContent.match(
        /<meta\s+type="md5">([a-f0-9]{32})<\/meta>/i,
      );
      if (metaMatch) {
        return metaMatch[1].toLowerCase();
      }

      // Try to extract from filename in subject
      const subjectMatch = nzbContent.match(
        /subject="[^"]*\[([a-f0-9]{32})\][^"]*"/i,
      );
      if (subjectMatch) {
        return subjectMatch[1].toLowerCase();
      }

      // Try to extract from file element subject attribute
      const fileSubjectMatch = nzbContent.match(/\[([a-f0-9]{32})\]/i);
      if (fileSubjectMatch) {
        return fileSubjectMatch[1].toLowerCase();
      }

      return null;
    } catch (error) {
      console.error("Error parsing NZB:", error);
      return null;
    }
  }

  /**
   * Validate if the content is a valid NZB file
   */
  isValidNzb(content: string): boolean {
    try {
      // Check for basic NZB structure
      return (
        content.includes('<?xml version="1.0"') &&
        content.includes("<nzb") &&
        content.includes("</nzb>") &&
        content.includes("<file")
      );
    } catch {
      return false;
    }
  }

  /**
   * Extract book title from NZB if available
   */
  extractTitle(nzbContent: string): string | null {
    try {
      const titleMatch = nzbContent.match(
        /<meta\s+type="title">([^<]+)<\/meta>/i,
      );
      if (titleMatch) {
        return this.unescapeXml(titleMatch[1]);
      }

      // Try to extract from subject, removing MD5 if present
      const subjectMatch = nzbContent.match(/subject="([^"]+)"/i);
      if (subjectMatch) {
        let title = subjectMatch[1];
        // Remove MD5 pattern if present
        title = title.replace(/\[[a-f0-9]{32}\]\s*/i, "");
        // Remove file extension and yEnc suffix
        title = title.replace(
          /\.(epub|pdf|mobi|azw3|djvu|fb2|txt|rtf|doc|docx)(\s+yEnc.*)?$/i,
          "",
        );
        return this.unescapeXml(title).trim();
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Unescape XML entities
   */
  private unescapeXml(str: string): string {
    return str
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }
}

export const nzbParser = new NzbParser();
