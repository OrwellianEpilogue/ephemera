/* global TextDecoder */
import {
  type ListFetcher,
  type FetchResult,
  type ListBook,
  type AvailableList,
  type BabelioConfig,
  createBookHash,
  normalizeTitle,
  normalizeAuthor,
} from "./types.js";
import { logger } from "../../utils/logger.js";
import * as cheerio from "cheerio";

const BABELIO_BASE_URL = "https://www.babelio.com";

export class BabelioFetcher implements ListFetcher {
  readonly source = "babelio" as const;

  async validateConfig(
    config: Record<string, unknown>,
  ): Promise<{ valid: boolean; error?: string }> {
    const babelioConfig = config as unknown as BabelioConfig;
    const listId =
      babelioConfig.listId || (config as { userId?: string }).userId;

    if (!listId) {
      return { valid: false, error: "L'identifiant de la liste est requis" };
    }

    try {
      const url = `${BABELIO_BASE_URL}/liste/${listId}/`;
      const response = await this.fetchWithTimeout(url);
      return { valid: response.ok };
    } catch {
      return { valid: false, error: "Échec de la connexion à Babelio" };
    }
  }

  async parseProfileUrl(url: string): Promise<{ userId: string } | null> {
    const match = url.match(/\/liste\/(\d+)/);
    if (match) return { userId: match[1] };
    return null;
  }

  async fetchBooks(
    config: Record<string, unknown>,
    page: number = 1,
  ): Promise<FetchResult> {
    const babelioConfig = config as unknown as BabelioConfig;
    const listId =
      babelioConfig.listId || (config as { userId?: string }).userId;

    try {
      const url = `${BABELIO_BASE_URL}/liste/${listId}/?page=${page}`;
      const response = await this.fetchWithTimeout(url);

      if (!response.ok)
        return {
          books: [],
          hasMore: false,
          error: `Erreur HTTP ${response.status}`,
        };

      const html = await this.decodeHtml(response);

      const { books: basicBooks, hasNext } = this.parseListItems(html);

      const enrichedBooks: ListBook[] = [];

      for (const book of basicBooks) {
        if (book.sourceUrl) {
          try {
            const details = await this.fetchBookDetails(book.sourceUrl);
            enrichedBooks.push({ ...book, ...details });
          } catch (err) {
            logger.error(
              `[Babelio DEBUG] Erreur détails pour "${book.title}": ${err instanceof Error ? err.message : String(err)}`,
            );
            enrichedBooks.push(book);
          }
        } else {
          enrichedBooks.push(book);
        }
      }

      return {
        books: enrichedBooks,
        hasMore: hasNext,
        nextPage: hasNext ? page + 1 : undefined,
      };
    } catch (error) {
      logger.error("[Babelio] Fetch error:", error);
      return {
        books: [],
        hasMore: false,
        error: "Erreur lors de la récupération",
      };
    }
  }

  private parseListItems(html: string): {
    books: ListBook[];
    hasNext: boolean;
  } {
    const books: ListBook[] = [];
    const $ = cheerio.load(html);

    $(".liste_item").each((index, element) => {
      const el = $(element);

      const titleLink = el.find("a.titre_v2").first();

      if (titleLink.length === 0) return;

      const rawTitle = titleLink.text().trim();
      const relativeUrl = titleLink.attr("href");

      if (!relativeUrl) {
        logger.warn(
          `[Babelio DEBUG] Bloc #${index}: Titre "${rawTitle}" trouvé mais pas de href`,
        );
        return;
      }
      logger.debug(
        `[Babelio DEBUG] Bloc #${index}: Titre="${rawTitle}" <===> URL="${relativeUrl}"`,
      );

      const idMatch = relativeUrl.match(/\/(\d+)$/);
      const sourceBookId = idMatch ? idMatch[1] : "";

      const authorLink = el.find("a.auteur_v2").first();
      const rawAuthor = authorLink.length
        ? authorLink.text().trim()
        : "Auteur inconnu";

      let coverUrl = el.find(".liste_couv img").attr("src");
      if (!coverUrl || coverUrl.includes("couv-defaut")) {
        coverUrl = undefined;
      } else if (coverUrl && !coverUrl.startsWith("http")) {
        coverUrl = `${BABELIO_BASE_URL}${coverUrl}`;
      }

      const fullText = el.text();
      const ratingMatch = fullText.match(/(\d+[.,]\d+)★/);
      let averageRating: number | undefined;
      if (ratingMatch) {
        averageRating = parseFloat(ratingMatch[1].replace(",", "."));
      }

      const description = el.find(".liste_txt").text().trim();

      const title = normalizeTitle(rawTitle);
      const author = normalizeAuthor(rawAuthor);

      books.push({
        title,
        author,
        hash: createBookHash(title, author),
        sourceBookId,
        sourceUrl: `${BABELIO_BASE_URL}${relativeUrl}`,
        coverUrl,
        averageRating,
        description: description || undefined,
      });
    });

    const hasNext =
      $('.pagination a.next, a:contains("Suivant")').length > 0 ||
      html.includes(`page=`);

    return { books, hasNext };
  }

  private async fetchBookDetails(url: string): Promise<Partial<ListBook>> {
    try {
      const response = await this.fetchWithTimeout(url);
      if (!response.ok) {
        logger.warn(
          `[Babelio DEBUG] Erreur HTTP ${response.status} pour ${url}`,
        );
        return {};
      }

      const html = await this.decodeHtml(response);
      const $ = cheerio.load(html);
      const details: Partial<ListBook> = {};

      const refsText = $(".livre_refs").text();

      const eanMatch = refsText.match(/EAN\s*:\s*([\dX]{10,13})/i);
      if (eanMatch) {
        details.isbn = eanMatch[1].trim();
      } else {
        logger.debug(
          `[Babelio DEBUG] Pas d'EAN trouvé dans le texte ref pour ${url}`,
        );
      }

      const bodyText = $("body").text();
      const pagesMatch = bodyText.match(/(\d+)\s*pages/i);
      if (pagesMatch) {
        details.pages = parseInt(pagesMatch[1], 10);
      }

      const dateMatch = refsText.match(/\(\d{2}\/\d{2}\/(\d{4})\)/);
      if (dateMatch) {
        details.publishedYear = parseInt(dateMatch[1], 10);
      } else {
        const yearMatch = refsText.match(/\b(19|20)\d{2}\b/);
        if (yearMatch) {
          details.publishedYear = parseInt(yearMatch[0], 10);
        }
      }

      return details;
    } catch (e) {
      logger.error(`[Babelio DEBUG] Exception dans fetchBookDetails: ${e}`);
      return {};
    }
  }

  private async decodeHtml(response: Response): Promise<string> {
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder("iso-8859-1");
    return decoder.decode(buffer);
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    return fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(15000),
    });
  }

  async getAvailableLists(
    _config: Record<string, unknown>,
  ): Promise<AvailableList[]> {
    return [];
  }
}
