import { z } from "zod";

export const roleSchema = z.enum(["advocate", "skeptic", "analyst"]);
export const confidenceSchema = z.number().min(0).max(1);

const generatedClaimSchema = z.object({
  claim: z.string(),
  confidence: confidenceSchema,
  reasoning: z.string(),
  assumptions: z.array(z.string()),
});

export const claimSchema = generatedClaimSchema.extend({
  assumptions: z.array(z.string()).default([]),
});

export const generatedPerspectiveResultSchema = z.object({
  role: roleSchema,
  summary: z.string(),
  claims: z.array(generatedClaimSchema).min(1).max(5),
  openQuestions: z.array(z.string()),
});

export const perspectiveResultSchema = generatedPerspectiveResultSchema.extend({
  claims: z.array(claimSchema).min(1).max(5),
  openQuestions: z.array(z.string()).default([]),
});

export const generatedDeliberationResultSchema = z.object({
  answer: z.string(),
  keyTakeaways: z.array(z.string()).min(1).max(7),
  consensus: z.array(z.string()),
  disagreements: z.array(z.string()),
  recommendation: z.string().nullable(),
  confidence: confidenceSchema,
  caveats: z.array(z.string()),
  openQuestions: z.array(z.string()),
});

export const deliberationResultSchema = generatedDeliberationResultSchema.extend({
  consensus: z.array(z.string()).default([]),
  disagreements: z.array(z.string()).default([]),
  caveats: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
});

export type Role = z.infer<typeof roleSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type PerspectiveResult = z.infer<typeof perspectiveResultSchema>;
export type DeliberationResult = z.infer<typeof deliberationResultSchema>;
