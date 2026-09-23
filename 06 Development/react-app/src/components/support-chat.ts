import { ApiError } from "../api/client";
import type { Chat } from "../api/types";

// Validate the chat boundary before React reads messages or renders message bodies.
export function parseSupportChat(value: unknown): Chat {
  const chat = value as Partial<Chat> | null;
  if (!chat || typeof chat !== "object" ||
      !(chat.id === null || typeof chat.id === "number") || typeof chat.status !== "string" ||
      !Array.isArray(chat.messages) || !chat.messages.every(message =>
        message && typeof message === "object" && typeof message.id === "number" &&
        (message.author_type === "client" || message.author_type === "staff") &&
        typeof message.body === "string" && typeof message.created_at === "string")) {
    throw new ApiError("Invalid support chat response", { kind: "invalid_response" });
  }
  return chat as Chat;
}
