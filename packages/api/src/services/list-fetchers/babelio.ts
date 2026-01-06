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

      if (!response.ok) {
        return {
          valid: false,
          error: `Liste introuvable (Status: ${response.status})`,
        };
      }

      return { valid: true };
    } catch (error) {
      logger.error("[Babelio] Validation error:", error);
      return { valid: false, error: "Échec de la connexion à Babelio" };
    }
  }

  async parseProfileUrl(url: string): Promise<{ userId: string } | null> {
    const match = url.match(/\/liste\/(\d+)/);
    if (match) {
      return { userId: match[1] };
    }
    return null;
  }

  async fetchBooks(
    config: Record<string, unknown>,
    page: number = 1,
  ): Promise<FetchResult> {
    const babelioConfig = config as unknown as BabelioConfig;
    const listId =
      babelioConfig.listId || (config as { userId?: string }).userId;

    if (!listId) {
      return { books: [], hasMore: false, error: "ID de liste manquant" };
    }

    try {
      const url = `${BABELIO_BASE_URL}/liste/${listId}/?page=${page}`;
      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        return {
          books: [],
          hasMore: false,
          error: `Erreur HTTP ${response.status}`,
        };
      }

      const buffer = await response.arrayBuffer();
      const decoder = new TextDecoder("iso-8859-1");
      const html = decoder.decode(buffer);

      const books = this.parseBooks(html);
      const hasMore =
        html.includes(`page=${page + 1}`) ||
        html.includes(`href="/liste/${listId}/?page=${page + 1}"`);

      return {
        books,
        hasMore,
        nextPage: hasMore ? page + 1 : undefined,
      };
    } catch (error) {
      logger.error("[Babelio] Fetch error:", error);
      return {
        books: [],
        hasMore: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private parseBooks(html: string): ListBook[] {
    const books: ListBook[] = [];
    const itemRegex =
      /<div class="liste_item">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/g;
    let match;

    while ((match = itemRegex.exec(html)) !== null) {
      const section = match[1];

      const titleMatch = section.match(
        /href="\/livres\/[^/]+\/(\d+)"[^>]*class="titre_v2"[^>]*>([\s\S]*?)<\/a>/i,
      );
      if (!titleMatch) continue;

      const sourceBookId = titleMatch[1];
      const rawTitle = titleMatch[2].trim();

      const authorMatch = section.match(
        /class="auteur_v2"[^>]*>([\s\S]*?)<\/a>/i,
      );
      const rawAuthor = authorMatch ? authorMatch[1].trim() : "Auteur inconnu";

      const coverMatch = section.match(
        /src="(https:\/\/www\.babelio\.com\/couv\/[^"]+)"/i,
      );
      const coverUrl = coverMatch ? coverMatch[1] : undefined;

      const ratingMatch = section.match(/(\d+\.\d+)&#9733;/);
      const averageRating = ratingMatch
        ? parseFloat(ratingMatch[1])
        : undefined;

      const descMatch = section.match(
        /class="liste_txt"[^>]*>([\s\S]*?)<\/div>/i,
      );
      const description = descMatch ? this.cleanHtml(descMatch[1]) : undefined;

      const title = normalizeTitle(rawTitle);
      const author = normalizeAuthor(rawAuthor);

      books.push({
        title,
        author,
        hash: createBookHash(title, author),
        sourceBookId,
        sourceUrl: `${BABELIO_BASE_URL}/livres/x/${sourceBookId}`,
        coverUrl,
        averageRating,
        description,
      });
    }

    return books;
  }

  private cleanHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
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
