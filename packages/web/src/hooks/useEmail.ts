import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getErrorMessage } from "@ephemera/shared";
import type {
  EmailSettings,
  UpdateEmailSettings,
  EmailRecipient,
  EmailRecipientCreate,
  EmailRecipientUpdate,
  EmailTestRequest,
  EmailTestResponse,
  SendEmailResponse,
} from "@ephemera/shared";
import { notifications } from "@mantine/notifications";

// Query keys
export const emailKeys = {
  settings: ["emailSettings"] as const,
  recipients: ["emailRecipients"] as const,
};

// Fetch email settings
export const useEmailSettings = () => {
  return useQuery({
    queryKey: emailKeys.settings,
    queryFn: () => apiFetch<EmailSettings | null>("/email/settings"),
  });
};

// Update email settings
export const useUpdateEmailSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: UpdateEmailSettings) => {
      return apiFetch<EmailSettings>("/email/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.settings });
      notifications.show({
        title: "Email Settings Updated",
        message: "Email configuration has been saved successfully",
        color: "green",
      });
    },
    onError: (error: unknown) => {
      notifications.show({
        title: "Update Failed",
        message: getErrorMessage(error) || "Failed to update email settings",
        color: "red",
      });
    },
  });
};

// Test email connection with provided settings or saved settings
export const useTestEmailConnection = () => {
  return useMutation({
    mutationFn: async (settings?: EmailTestRequest) => {
      return apiFetch<EmailTestResponse>("/email/settings/test", {
        method: "POST",
        headers: settings ? { "Content-Type": "application/json" } : undefined,
        body: settings ? JSON.stringify(settings) : undefined,
      });
    },
    onSuccess: (data) => {
      if (data.success) {
        notifications.show({
          title: "Connection Successful",
          message: data.message,
          color: "green",
        });
      } else {
        notifications.show({
          title: "Connection Failed",
          message: data.error || data.message,
          color: "red",
        });
      }
    },
    onError: (error: unknown) => {
      notifications.show({
        title: "Connection Test Failed",
        message: getErrorMessage(error) || "Failed to test SMTP connection",
        color: "red",
      });
    },
  });
};

// Fetch email recipients
export const useEmailRecipients = () => {
  return useQuery({
    queryKey: emailKeys.recipients,
    queryFn: () => apiFetch<EmailRecipient[]>("/email/recipients"),
  });
};

// Add email recipient
export const useAddEmailRecipient = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: EmailRecipientCreate) => {
      return apiFetch<EmailRecipient>("/email/recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.recipients });
      notifications.show({
        title: "Recipient Added",
        message: "Email recipient has been added successfully",
        color: "green",
      });
    },
    onError: (error: unknown) => {
      notifications.show({
        title: "Add Failed",
        message: getErrorMessage(error) || "Failed to add email recipient",
        color: "red",
      });
    },
  });
};

// Delete email recipient
export const useDeleteEmailRecipient = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      return apiFetch(`/email/recipients/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.recipients });
      notifications.show({
        title: "Recipient Deleted",
        message: "Email recipient has been removed",
        color: "green",
      });
    },
    onError: (error: unknown) => {
      notifications.show({
        title: "Delete Failed",
        message: getErrorMessage(error) || "Failed to delete email recipient",
        color: "red",
      });
    },
  });
};

// Update email recipient
export const useUpdateEmailRecipient = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: { id: number } & EmailRecipientUpdate) => {
      return apiFetch<EmailRecipient>(`/email/recipients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.recipients });
    },
    onError: (error: unknown) => {
      notifications.show({
        title: "Update Failed",
        message: getErrorMessage(error) || "Failed to update email recipient",
        color: "red",
      });
    },
  });
};

// Send book via email
export const useSendBookEmail = () => {
  return useMutation({
    mutationFn: async (data: { recipientId: number; md5: string }) => {
      return apiFetch<SendEmailResponse>("/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      notifications.show({
        title: "Email Sent",
        message: "Book has been sent successfully",
        color: "green",
      });
    },
    onError: (error: unknown) => {
      notifications.show({
        title: "Send Failed",
        message: getErrorMessage(error) || "Failed to send email",
        color: "red",
      });
    },
  });
};
