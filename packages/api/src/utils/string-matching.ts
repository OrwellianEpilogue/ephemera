/**
 * String matching utilities for comparing book titles and authors
 */

/**
 * Calculate Levenshtein distance between two strings
 * Returns the minimum number of single-character edits needed to change one string into another
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  // Create a matrix to store distances
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Initialize base cases
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate similarity ratio between two strings (0 to 1)
 * 1 = identical, 0 = completely different
 */
export function similarityRatio(str1: string, str2: string): number {
  if (!str1 && !str2) return 1;
  if (!str1 || !str2) return 0;

  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(str1, str2);
  return 1 - distance / maxLen;
}

/**
 * Normalize a string for comparison
 * - Lowercase
 * - Remove special characters
 * - Normalize whitespace
 * - Remove common articles and subtitles
 */
export function normalizeForComparison(str: string | undefined): string {
  if (!str) return "";

  return (
    str
      .toLowerCase()
      // Remove content in parentheses and brackets (often edition info, subtitles)
      .replace(/\([^)]*\)/g, "")
      .replace(/\[[^\]]*\]/g, "")
      // Remove special characters except spaces
      .replace(/[^a-z0-9\s]/g, " ")
      // Normalize whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Calculate how well a book matches a request
 * Returns a score from 0 to 1, where 1 is a perfect match
 */
export function calculateBookMatchScore(
  requestTitle: string | undefined,
  requestAuthor: string | undefined,
  bookTitle: string | undefined,
  bookAuthors: string[] | undefined,
): number {
  const normRequestTitle = normalizeForComparison(requestTitle);
  const normRequestAuthor = normalizeForComparison(requestAuthor);
  const normBookTitle = normalizeForComparison(bookTitle);
  const normBookAuthor = normalizeForComparison(bookAuthors?.join(" "));

  let titleScore = 0;
  let authorScore = 0;
  let titleWeight = 0;
  let authorWeight = 0;

  // Calculate title similarity if both are present
  if (normRequestTitle && normBookTitle) {
    titleScore = similarityRatio(normRequestTitle, normBookTitle);
    titleWeight = 0.6; // Title is more important
  }

  // Calculate author similarity if both are present
  if (normRequestAuthor && normBookAuthor) {
    authorScore = similarityRatio(normRequestAuthor, normBookAuthor);
    authorWeight = 0.4;
  }

  // Adjust weights if only one field is available
  const totalWeight = titleWeight + authorWeight;
  if (totalWeight === 0) return 0;

  // Normalize weights
  titleWeight = titleWeight / totalWeight;
  authorWeight = authorWeight / totalWeight;

  return titleScore * titleWeight + authorScore * authorWeight;
}

/**
 * Check if a book is a good match for a request
 * Uses a threshold to determine if the match is acceptable
 */
export function isGoodMatch(
  requestTitle: string | undefined,
  requestAuthor: string | undefined,
  bookTitle: string | undefined,
  bookAuthors: string[] | undefined,
  threshold: number = 0.6,
): boolean {
  const score = calculateBookMatchScore(
    requestTitle,
    requestAuthor,
    bookTitle,
    bookAuthors,
  );
  return score >= threshold;
}
