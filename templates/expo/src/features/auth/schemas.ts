import { z } from "zod";
export const emailSchema = z.string().trim().email("invalidField");
export const passwordSchema = z.string().min(8, "passwordLength").max(128, "passwordLength");
export const signupSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1, "invalidField").max(100, "invalidField"),
  password: passwordSchema,
});
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "invalidField"),
});
export const emailFormSchema = z.object({ email: emailSchema });
export const resetSchema = z.object({ password: passwordSchema });
export type SignupValues = z.infer<typeof signupSchema>;
