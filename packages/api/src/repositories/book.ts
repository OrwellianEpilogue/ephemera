import { db } from "../db/index.js";
import { books, type Book, type NewBook } from "../db/schema.js";
import { eq, inArray } from "drizzle-orm";

export class BookRepository {
  /**
   * Get a book by MD5
   */
  async getByMd5(md5: string): Promise<Book | undefined> {
    return await db.select().from(books).where(eq(books.md5, md5)).get();
  }

  /**
   * Get multiple books by MD5s
   */
  async getByMd5s(md5s: string[]): Promise<Book[]> {
    if (md5s.length === 0) {
      return [];
    }

    return await db.select().from(books).where(inArray(books.md5, md5s)).all();
  }

  /**
   * Create or update a book
   */
  async upsert(bookData: NewBook): Promise<Book> {
    const existing = await this.getByMd5(bookData.md5);

    if (existing) {
      // Update existing book
      const updated = await db
        .update(books)
        .set({
          ...bookData,
          searchCount: existing.searchCount + 1,
          lastSeenAt: Date.now(),
        })
        .where(eq(books.md5, bookData.md5))
        .returning()
        .get();

      return updated;
    } else {
      // Insert new book
      const inserted = await db
        .insert(books)
        .values({
          ...bookData,
          searchCount: 1,
          firstSeenAt: bookData.firstSeenAt || Date.now(),
          lastSeenAt: bookData.lastSeenAt || Date.now(),
        })
        .returning()
        .get();

      return inserted;
    }
  }
}

export const bookRepository = new BookRepository();
