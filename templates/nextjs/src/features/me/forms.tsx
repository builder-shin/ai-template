"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { SubmitButton } from "../../components/submit-button";
import { FileUpload, type FileValue } from "../files";
import type {
  Profile,
  ProfileAction,
  ProfileResult,
  PasswordAction,
  PasswordResult,
} from "./state";

function FieldErrors({ id, messages }: { id: string; messages: string[] | undefined }) {
  if (!messages?.length) return null;
  return (
    <div id={id} className="text-sm text-destructive">
      {messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
    </div>
  );
}
function Feedback({ state }: { state: ProfileResult | PasswordResult }) {
  const t = useTranslations("me");
  return (
    <>
      {!state.ok && state.formError && (
        <p role="alert" className="whitespace-pre-line text-sm text-destructive">
          {state.formError}
        </p>
      )}
      {state.retryAfter != null && (
        <p className="text-sm">{t("retryAfter", { seconds: state.retryAfter })}</p>
      )}
    </>
  );
}

export function ProfileForm({
  profile,
  action,
  permalink,
}: {
  profile: Profile;
  action: ProfileAction;
  permalink: string;
}) {
  const t = useTranslations("me");
  const language = useTranslations("locale");
  const [state, submit] = useActionState(action, { ok: true } as ProfileResult, permalink);
  const [name, setName] = useState(state.values?.name ?? profile.name ?? "");
  const [avatar, setAvatar] = useState<FileValue>({
    id: state.values?.avatar ?? profile.avatar.id,
    url: profile.avatar.url,
  });
  const [uploading, setUploading] = useState(false);
  const errors = state.ok ? {} : state.fieldErrors;
  return (
    <form id="profile-form" action={submit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="profile-name">{t("nameLabel")}</Label>
        <Input
          id="profile-name"
          name="name"
          required
          maxLength={100}
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={Boolean(errors.name?.length)}
          aria-describedby={errors.name?.length ? "profile-name-errors" : undefined}
        />
        <FieldErrors id="profile-name-errors" messages={errors.name} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-locale">{t("localeLabel")}</Label>
        <select
          key={state.values?.locale ?? profile.locale}
          id="profile-locale"
          name="locale"
          defaultValue={state.values?.locale ?? profile.locale}
          className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
          aria-invalid={Boolean(errors.locale?.length)}
          aria-describedby={errors.locale?.length ? "profile-locale-errors" : undefined}
        >
          <option value="ko">{language("ko")}</option>
          <option value="en">{language("en")}</option>
        </select>
        <FieldErrors id="profile-locale-errors" messages={errors.locale} />
      </div>
      <FileUpload
        name="avatar"
        label={t("avatarLabel")}
        value={avatar}
        onChange={setAvatar}
        returnTo={permalink}
        onPendingChange={setUploading}
      />
      <Feedback state={state} />
      {state.ok && state.saved && (
        <p role="status" className="text-sm">
          {t("saved")}
        </p>
      )}
      <SubmitButton disabled={uploading}>{t("save")}</SubmitButton>
    </form>
  );
}

export function PasswordChangeForm({
  action,
  permalink,
}: {
  action: PasswordAction;
  permalink: string;
}) {
  const t = useTranslations("me");
  const [state, submit] = useActionState(action, { ok: true } as PasswordResult, permalink);
  const errors = state.ok ? {} : state.fieldErrors;
  return (
    <section className="space-y-5 border-t pt-6">
      <h2 className="text-xl font-semibold">{t("passwordTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("passwordGuidance")}</p>
      <form id="password-change-form" action={submit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="current-password">{t("currentPasswordLabel")}</Label>
          <Input
            id="current-password"
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            aria-invalid={Boolean(errors.currentPassword?.length)}
            aria-describedby={
              errors.currentPassword?.length ? "current-password-errors" : undefined
            }
          />
          <FieldErrors id="current-password-errors" messages={errors.currentPassword} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-password">{t("newPasswordLabel")}</Label>
          <Input
            id="new-password"
            name="newPassword"
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            aria-invalid={Boolean(errors.newPassword?.length)}
            aria-describedby={errors.newPassword?.length ? "new-password-errors" : undefined}
          />
          <FieldErrors id="new-password-errors" messages={errors.newPassword} />
        </div>
        <Feedback state={state} />
        {state.ok && state.changed && (
          <p role="status" className="text-sm">
            {t("passwordChanged")}
          </p>
        )}
        <SubmitButton>{t("passwordTitle")}</SubmitButton>
      </form>
    </section>
  );
}
