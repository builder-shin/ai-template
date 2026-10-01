import type { FormResult } from "../../lib/api/errors";
import type { FileValue } from "../files";

export type Profile = {
  name: string | null;
  locale: "ko" | "en";
  avatar: FileValue;
};
export type ProfileValues = { name: string; locale: string; avatar?: string };
export type ProfileResult = FormResult & {
  values?: ProfileValues;
  saved?: boolean;
  retryAfter?: number | null;
};
export type PasswordResult = FormResult & { changed?: boolean; retryAfter?: number | null };
export type ProfileAction = (state: ProfileResult, data: FormData) => Promise<ProfileResult>;
export type PasswordAction = (state: PasswordResult, data: FormData) => Promise<PasswordResult>;
export type DeletionResult = FormResult & {
  lastAdminProtected?: boolean;
  retryAfter?: number | null;
};
export type DeletionAction = (state: DeletionResult, data: FormData) => Promise<DeletionResult>;
