import type { TimeFormat, DateFormat } from "./schemas.js";

/**
 * Format a date according to user preferences
 */
export function formatDate(
  date: Date | string | number,
  dateFormat: DateFormat,
  timeFormat: TimeFormat,
  includeTime = true,
): string {
  const d =
    typeof date === "string" || typeof date === "number"
      ? new Date(date)
      : date;

  if (isNaN(d.getTime())) {
    return "Invalid Date";
  }

  // Format date part
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();

  const datePart =
    dateFormat === "us" ? `${month}/${day}/${year}` : `${day}.${month}.${year}`;

  if (!includeTime) {
    return datePart;
  }

  // Format time part
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");

  let timePart: string;
  if (timeFormat === "24h") {
    const hoursStr = String(hours).padStart(2, "0");
    timePart = `${hoursStr}:${minutes}`;
  } else {
    // AM/PM format
    const period = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12; // Convert to 12-hour format
    timePart = `${hours}:${minutes} ${period}`;
  }

  return `${datePart} ${timePart}`;
}

/**
 * Format time only
 */
export function formatTime(
  date: Date | string | number,
  timeFormat: TimeFormat,
): string {
  const d =
    typeof date === "string" || typeof date === "number"
      ? new Date(date)
      : date;

  if (isNaN(d.getTime())) {
    return "Invalid Time";
  }

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");

  if (timeFormat === "24h") {
    const hoursStr = String(hours).padStart(2, "0");
    return `${hoursStr}:${minutes}`;
  } else {
    // AM/PM format
    const period = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${period}`;
  }
}
