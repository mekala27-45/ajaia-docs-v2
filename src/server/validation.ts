import { z } from "zod";
import { MAX_CONTENT_CHARS, MAX_TITLE_LENGTH } from "@/lib/limits";

const title = z
  .string({ error: "Title must be text." })
  .max(MAX_TITLE_LENGTH * 4, "Title is too long.");

export const createDocumentSchema = z.object({
  title: title.optional(),
});

export const updateDocumentSchema = z
  .object({
    title: title.optional(),
    content: z
      .string({ error: "Content must be text." })
      .max(MAX_CONTENT_CHARS, "This document is too large to save.")
      .optional(),
    baseVersion: z
      .number({ error: "baseVersion must be a number." })
      .int("baseVersion must be a whole number.")
      .positive("baseVersion must be positive.")
      .optional(),
  })
  .refine((value) => value.title !== undefined || value.content !== undefined, {
    message: "Send a title, content, or both.",
  });

export const shareSchema = z
  .object({
    userId: z.string().min(1).optional(),
    email: z.string().trim().min(3, "Enter an email address.").optional(),
    role: z.enum(["viewer", "editor"], { error: "Role must be viewer or editor." }),
  })
  .refine((value) => Boolean(value.userId) || Boolean(value.email), {
    message: "Choose a person to share with.",
  });

export const sessionSchema = z.object({
  userId: z.string({ error: "userId is required." }).min(1, "userId is required."),
});
