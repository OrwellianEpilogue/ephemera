import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch, getErrorMessage } from "@ephemera/shared";
import type {
  CalibreStatusResponse,
  CalibreFormatsResponse,
  CalibreConvertRequest,
  CalibreConvertResponse,
} from "@ephemera/shared";
import { notifications } from "@mantine/notifications";

// Query keys
export const calibreKeys = {
  status: ["calibreStatus"] as const,
  formats: ["calibreFormats"] as const,
};

/**
 * Get Calibre CLI status and version
 * Cached for 5 minutes since it rarely changes
 */
export const useCalibreStatus = () => {
  return useQuery({
    queryKey: calibreKeys.status,
    queryFn: () => apiFetch<CalibreStatusResponse>("/calibre/status"),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

/**
 * Get supported input/output formats
 * This is static data so cache for a long time
 */
export const useCalibreFormats = () => {
  return useQuery({
    queryKey: calibreKeys.formats,
    queryFn: () => apiFetch<CalibreFormatsResponse>("/calibre/formats"),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 2 * 60 * 60 * 1000, // 2 hours
  });
};

/**
 * Convert a book to a different format
 */
export const useConvertBook = () => {
  return useMutation({
    mutationFn: async (request: CalibreConvertRequest) => {
      return apiFetch<CalibreConvertResponse>("/calibre/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
    },
    onSuccess: (data) => {
      if (data.success) {
        notifications.show({
          title: "Conversion Complete",
          message: "Book has been converted successfully",
          color: "green",
        });
      } else {
        notifications.show({
          title: "Conversion Failed",
          message: data.error || "Failed to convert book",
          color: "red",
        });
      }
    },
    onError: (error: unknown) => {
      notifications.show({
        title: "Conversion Failed",
        message: getErrorMessage(error) || "Failed to convert book",
        color: "red",
      });
    },
  });
};

/**
 * Check if a book format can be converted
 * Helper function to determine if conversion is possible
 */
export const useCanConvert = (
  inputFormat: string | undefined,
  outputFormat: string,
) => {
  const { data: formats } = useCalibreFormats();

  if (!inputFormat || !formats) {
    return false;
  }

  const normalizedInput = inputFormat.toLowerCase().replace(/^\./, "");
  const normalizedOutput = outputFormat.toLowerCase().replace(/^\./, "");

  return (
    formats.input.includes(normalizedInput) &&
    formats.output.includes(normalizedOutput)
  );
};
