import { z } from 'zod';

const wordPattern = /^[\p{L}\p{M}'’-]+(?:\s+[\p{L}\p{M}'’-]+){0,2}$/u;

export const translateRequestSchema = z.object({
  word: z.string().trim().min(1).max(80).refine((value) => wordPattern.test(value), {
    message: 'Enter one word or a short phrase using letters only.'
  }),
  contextWords: z.array(
    z.string().trim().min(1).max(50).refine((value) => wordPattern.test(value))
  ).max(20).default([])
}).strict();

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(500)
}).strict();

export const loginRequestSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200)
}).strict();

export const translationResponseSchema = z.object({
  word: z.string().trim().min(1).max(80),
  translation: z.string().trim().min(1).max(160),
  sentence: z.string().trim().min(1).max(300),
  sentenceAr: z.string().trim().min(1).max(400)
}).strict();

export const chatResponseSchema = z.object({
  reply: z.string().trim().min(1).max(1200)
}).strict();
