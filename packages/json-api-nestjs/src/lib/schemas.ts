import { z } from "zod";

export const nonEmptyString = z.string().min(1);

export const booleanString = z.enum(["true", "false"]).transform((value) => value === "true");
