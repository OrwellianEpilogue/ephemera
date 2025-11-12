import { db } from "../db/index.js";
import { books, type Book, type NewBook } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { Book as SharedBook } from "@ephemera/shared";

export class BookService {
  /**
   * Create or update a book record
   * Increments searchCount and updates lastSeenAt if book already exists
   */
  async upsertBook(bookData: SharedBook): Promise<Book> {
    const now = Date.now();

    // Check if book exists
    const existing = await db
      .select()
      .from(books)
      .where(eq(books.md5, bookData.md5))
      .get();

    if (existing) {
      // Update existing book
      const updated = await db
        .update(books)
        .set({
          // Update metadata (in case it changed)
          title: bookData.title,
          authors: bookData.authors || null,
          publisher: bookData.publisher || null,
          description: bookData.description || null,
          coverUrl: bookData.coverUrl || null,
          filename: bookData.filename || null,
          language: bookData.language || null,
          format: bookData.format || null,
          size: bookData.size || null,
          year: bookData.year || null,
          contentType: bookData.contentType || null,
          source: bookData.source || null,
          saves: bookData.saves || null,
          lists: bookData.lists || null,
          issues: bookData.issues || null,
          // Increment search count and update timestamp
          searchCount: existing.searchCount + 1,
          lastSeenAt: now,
        })
        .where(eq(books.md5, bookData.md5))
        .returning()
        .get();

      return updated;
    } else {
      // Create new book
      const newBook: NewBook = {
        md5: bookData.md5,
        title: bookData.title,
        authors: bookData.authors || null,
        publisher: bookData.publisher || null,
        description: bookData.description || null,
        coverUrl: bookData.coverUrl || null,
        filename: bookData.filename || null,
        language: bookData.language || null,
        format: bookData.format || null,
        size: bookData.size || null,
        year: bookData.year || null,
        contentType: bookData.contentType || null,
        source: bookData.source || null,
        saves: bookData.saves || null,
        lists: bookData.lists || null,
        issues: bookData.issues || null,
        searchCount: 1,
        firstSeenAt: now,
        lastSeenAt: now,
      };

      const created = await db.insert(books).values(newBook).returning().get();
      return created;
    }
  }

  /**
   * Batch upsert multiple books
   * Much more efficient than individual upserts for search results
   */
  async upsertBooks(booksData: SharedBook[]): Promise<void> {
    if (booksData.length === 0) return;

    const now = Date.now();

    // Get all existing books in one query
    const existingBooks = await this.getBooksByMd5s(
      booksData.map((b) => b.md5),
    );
    const existingMd5s = new Set(existingBooks.map((b) => b.md5));
    const existingMap = new Map(existingBooks.map((b) => [b.md5, b]));

    // Separate into updates and inserts
    const toUpdate = booksData.filter((b) => existingMd5s.has(b.md5));
    const toInsert = booksData.filter((b) => !existingMd5s.has(b.md5));

    // Batch update existing books
    for (const bookData of toUpdate) {
      const existing = existingMap.get(bookData.md5)!;
      await db
        .update(books)
        .set({
          title: bookData.title,
          authors: bookData.authors || null,
          publisher: bookData.publisher || null,
          description: bookData.description || null,
          coverUrl: bookData.coverUrl || null,
          filename: bookData.filename || null,
          language: bookData.language || null,
          format: bookData.format || null,
          size: bookData.size || null,
          year: bookData.year || null,
          contentType: bookData.contentType || null,
          source: bookData.source || null,
          saves: bookData.saves || null,
          lists: bookData.lists || null,
          issues: bookData.issues || null,
          searchCount: existing.searchCount + 1,
          lastSeenAt: now,
        })
        .where(eq(books.md5, bookData.md5));
    }

    // Batch insert new books
    if (toInsert.length > 0) {
      const newBooks: NewBook[] = toInsert.map((bookData) => ({
        md5: bookData.md5,
        title: bookData.title,
        authors: bookData.authors || null,
        publisher: bookData.publisher || null,
        description: bookData.description || null,
        coverUrl: bookData.coverUrl || null,
        filename: bookData.filename || null,
        language: bookData.language || null,
        format: bookData.format || null,
        size: bookData.size || null,
        year: bookData.year || null,
        contentType: bookData.contentType || null,
        source: bookData.source || null,
        saves: bookData.saves || null,
        lists: bookData.lists || null,
        issues: bookData.issues || null,
        searchCount: 1,
        firstSeenAt: now,
        lastSeenAt: now,
      }));

      await db.insert(books).values(newBooks);
    }
  }

  /**
   * Get a book by MD5
   */
  async getBook(md5: string): Promise<Book | undefined> {
    return await db.select().from(books).where(eq(books.md5, md5)).get();
  }

  /**
   * Get multiple books by MD5s
   */
  async getBooksByMd5s(md5s: string[]): Promise<Book[]> {
    if (md5s.length === 0) return [];

    // Use IN query to get multiple books at once
    const results = await db.select().from(books).all();
    return results.filter((book) => md5s.includes(book.md5));
  }

  /**
   * Delete a book by MD5
   */
  async deleteBook(md5: string): Promise<void> {
    await db.delete(books).where(eq(books.md5, md5));
  }

  /**
   * Get all books (with optional limit and offset)
   */
  async getAllBooks(limit?: number, offset?: number): Promise<Book[]> {
    let query = db.select().from(books);

    if (limit !== undefined) {
      query = query.limit(limit) as typeof query;
    }

    if (offset !== undefined) {
      query = query.offset(offset) as typeof query;
    }

    return await query.all();
  }
}

export const bookService = new BookService();
