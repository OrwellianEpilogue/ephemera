import type { Book } from "@ephemera/shared";

interface NewznabItem {
  title: string;
  guid: string;
  pubDate: string;
  description: string;
  enclosureUrl: string;
  enclosureLength: number;
  category: number;
  attributes: Record<string, string | number>;
}

interface NewznabCapabilities {
  server: {
    version: string;
    title: string;
    email: string;
    url: string;
  };
  limits: {
    max: number;
    default: number;
  };
  registration: {
    available: string;
    open: string;
  };
  searching: {
    search: { available: string };
    "tv-search": { available: string };
    "movie-search": { available: string };
    "book-search": { available: string; supportedParams: string };
  };
  categories: Array<{
    id: number;
    name: string;
    subcategories?: Array<{ id: number; name: string }>;
  }>;
}

/**
 * Service to format responses in Newznab API format (XML or JSON)
 */
class NewznabFormatter {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    // Use environment variable or default to localhost
    // This allows the API to know its public URL
    this.baseUrl =
      baseUrl ||
      process.env.PUBLIC_URL ||
      process.env.BASE_URL ||
      "http://localhost:8286";
  }

  /**
   * Format search results as Newznab RSS XML
   */
  formatSearchResultsXml(
    books: Book[],
    offset: number = 0,
    total: number | null = null,
    apikey: string = "",
    query: string = "",
  ): string {
    const actualTotal = total ?? books.length;
    const items = books.map((book, index) =>
      this.bookToNewznabItem(book, index + offset, apikey),
    );

    // Build query string for atom:link
    const queryParams = new URLSearchParams();
    if (query) queryParams.append("q", query);
    queryParams.append("apikey", apikey);
    queryParams.append("offset", offset.toString());
    queryParams.append("limit", "100");
    const atomLink = `${this.baseUrl}/newznab/api?${queryParams.toString()}`;

    const xml = `<?xml version="1.0" encoding="utf-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:newznab="http://www.newznab.com/DTD/2010/feeds/attributes/">
<channel>
<atom:link href="${this.escapeXml(atomLink)}" rel="self" type="application/rss+xml" />
<title>Ephemera</title>
<description>Ephemera Feed</description>
<link>${this.baseUrl}/</link>
<language>en-gb</language>
<webMaster>admin@ephemera.local (Ephemera)</webMaster>
<category></category>
<image>
    <url>${this.baseUrl}/favicon.ico</url>
    <title>Ephemera</title>
    <link>${this.baseUrl}/</link>
    <description>Ephemera Book Downloader</description>
</image>

<newznab:response offset="${offset}" total="${actualTotal}" />
${items.map((item) => this.formatItemXml(item)).join("\n")}
</channel>
</rss>`;

    return xml;
  }

  /**
   * Format search results as JSON
   */
  formatSearchResultsJson(
    books: Book[],
    offset: number = 0,
    total: number | null = null,
    apikey: string = "",
  ): object {
    const actualTotal = total ?? books.length;
    const items = books.map((book, index) =>
      this.bookToNewznabItem(book, index + offset, apikey),
    );

    return {
      "@version": "2.0",
      "@xmlns:newznab": "http://www.newznab.com/DTD/2010/feeds/attributes/",
      channel: {
        title: "Ephemera Book Index",
        description: "Ephemera Newznab API",
        link: `${this.baseUrl}/newznab`,
        language: "en-gb",
        webMaster: "admin@ephemera.local",
        "newznab:response": {
          "@offset": offset,
          "@total": actualTotal,
        },
        item: items.map((item) => this.formatItemJson(item)),
      },
    };
  }

  /**
   * Format capabilities response as XML
   */
  formatCapabilitiesXml(): string {
    const caps = this.getCapabilities();

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<caps>
  <server version="${caps.server.version}" title="${caps.server.title}" email="${caps.server.email}" url="${caps.server.url}"/>
  <limits max="${caps.limits.max}" default="${caps.limits.default}"/>
  <registration available="${caps.registration.available}" open="${caps.registration.open}"/>
  <searching>
    <search available="${caps.searching.search.available}"/>
    <tv-search available="${caps.searching["tv-search"].available}"/>
    <movie-search available="${caps.searching["movie-search"].available}"/>
    <book-search available="${caps.searching["book-search"].available}" supportedParams="${caps.searching["book-search"].supportedParams}"/>
  </searching>
  <categories>
    ${caps.categories
      .map(
        (cat) => `<category id="${cat.id}" name="${cat.name}">
      ${
        cat.subcategories
          ?.map((sub) => `<subcat id="${sub.id}" name="${sub.name}"/>`)
          .join("\n      ") || ""
      }
    </category>`,
      )
      .join("\n    ")}
  </categories>
</caps>`;

    return xml;
  }

  /**
   * Format capabilities response as JSON
   */
  formatCapabilitiesJson(): object {
    return this.getCapabilities();
  }

  /**
   * Format error response as XML
   */
  formatErrorXml(code: number, description: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<error code="${code}" description="${this.escapeXml(description)}"/>`;
  }

  /**
   * Format error response as JSON
   */
  formatErrorJson(code: number, description: string): object {
    return {
      error: {
        "@code": code,
        "@description": description,
      },
    };
  }

  /**
   * Convert a book to Newznab item format
   */
  private bookToNewznabItem(
    book: Book,
    resultIndex: number = 0,
    apikey: string = "",
  ): NewznabItem {
    const nzbUrl = `${this.baseUrl}/newznab/api?t=get&id=${book.md5}&apikey=${apikey}`;

    // Calculate a staggered date - each result is 1 day older than the previous
    // This simulates a realistic usenet posting pattern
    const now = new Date();
    const usenetDate = new Date(
      now.getTime() - (resultIndex + 1) * 24 * 60 * 60 * 1000,
    );
    const pubDate = usenetDate.toUTCString();

    // Build comprehensive title with author, title, year, language and format
    let fullTitle = "";
    if (book.authors && book.authors.length > 0) {
      // Format: "Author - Title - Year - Language - Format"
      fullTitle = `${book.authors.join(", ")} - ${book.title}`;
    } else {
      fullTitle = book.title;
    }

    // Add year if available
    if (book.year) {
      fullTitle += ` - ${book.year}`;
    }

    // Add language (important for international books)
    if (book.language) {
      fullTitle += ` - ${book.language.toUpperCase()}`;
    }

    // Add format (important for Readarr)
    if (book.format) {
      fullTitle += ` - ${book.format.toUpperCase()}`;
    }

    // Build description - can be same as title for consistency
    const description = fullTitle;

    const attributes: Record<string, string | number> = {
      category: 7020, // eBooks category
      size: book.size || 0,
    };

    // Add book-specific attributes
    if (book.title) {
      attributes.booktitle = book.title;
    }
    if (book.authors && book.authors.length > 0) {
      attributes.author = book.authors.join(", ");
    }
    if (book.publisher) {
      attributes.publisher = book.publisher;
    }
    if (book.year) {
      attributes.publishdate = new Date(book.year, 0, 1).toUTCString();
    }
    if (book.coverUrl) {
      attributes.coverurl = book.coverUrl;
    }
    if (book.description) {
      attributes.review = book.description.substring(0, 500); // Limit review length
    }
    if (book.language) {
      attributes.language = book.language.toUpperCase();
    }

    // Add some standard Newznab attributes
    attributes.files = 1;
    attributes.poster = "ephemera@localhost";

    return {
      title: fullTitle,
      guid: nzbUrl,
      pubDate,
      description: description,
      enclosureUrl: nzbUrl,
      enclosureLength: book.size || 0,
      category: 7020,
      attributes,
    };
  }

  /**
   * Format a single item as XML
   */
  private formatItemXml(item: NewznabItem): string {
    // Format attributes - category should appear twice for main and subcategory
    let xmlAttrs = `    <newznab:attr name="category" value="7000" />
    <newznab:attr name="category" value="7020" />
    <newznab:attr name="size" value="${item.attributes.size || 0}" />`;

    // Add other attributes
    const skipAttrs = ["category", "size"];
    for (const [name, value] of Object.entries(item.attributes)) {
      if (!skipAttrs.includes(name)) {
        xmlAttrs += `\n    <newznab:attr name="${name}" value="${this.escapeXml(String(value))}" />`;
      }
    }

    // Add standard attributes
    xmlAttrs += `\n    <newznab:attr name="grabs" value="0" />
    <newznab:attr name="comments" value="0" />
    <newznab:attr name="password" value="0" />
    <newznab:attr name="usenetdate" value="${item.pubDate}" />
    <newznab:attr name="group" value="alt.binaries.ebooks" />`;

    return `<item>
    <title>${this.escapeXml(item.title)}</title>
    <guid isPermaLink="true">${this.escapeXml(item.guid)}</guid>
    <link>${this.escapeXml(item.enclosureUrl)}</link>
    <comments>${this.escapeXml(item.guid)}#comments</comments>
    <pubDate>${item.pubDate}</pubDate>
    <category>Books &gt; EBook</category>
    <description>${this.escapeXml(item.description)}</description>
    <enclosure url="${this.escapeXml(
      item.enclosureUrl,
    )}" length="${item.enclosureLength}" type="application/x-nzb" />
${xmlAttrs}

</item>`;
  }

  /**
   * Format a single item as JSON
   */
  private formatItemJson(item: NewznabItem): object {
    return {
      title: item.title,
      guid: {
        "@isPermaLink": "true",
        "#text": item.guid,
      },
      pubDate: item.pubDate,
      description: item.description,
      enclosure: {
        "@url": item.enclosureUrl,
        "@length": item.enclosureLength,
        "@type": "application/x-nzb",
      },
      category: item.category,
      "newznab:attr": Object.entries(item.attributes).map(([name, value]) => ({
        "@name": name,
        "@value": value,
      })),
    };
  }

  /**
   * Get capabilities configuration
   */
  private getCapabilities(): NewznabCapabilities {
    return {
      server: {
        version: "1.0.0",
        title: "Ephemera Book Index",
        email: "admin@ephemera.local",
        url: `${this.baseUrl}/newznab`,
      },
      limits: {
        max: 100,
        default: 50,
      },
      registration: {
        available: "no",
        open: "no",
      },
      searching: {
        search: { available: "yes" },
        "tv-search": { available: "no" },
        "movie-search": { available: "no" },
        "book-search": {
          available: "yes",
          supportedParams: "title,author",
        },
      },
      categories: [
        {
          id: 7000,
          name: "Books",
          subcategories: [
            { id: 7010, name: "Books/Mags" },
            { id: 7020, name: "Books/EBook" },
            { id: 7030, name: "Books/Comics" },
          ],
        },
      ],
    };
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

export const newznabFormatter = new NewznabFormatter();
export { NewznabFormatter };
