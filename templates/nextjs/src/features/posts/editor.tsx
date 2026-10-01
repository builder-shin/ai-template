"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SubmitButton } from "../../components/submit-button";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Link } from "../../lib/i18n/navigation";
import { FileUpload, type FileValue } from "../files";
import type { PostAction, PostResult, PostValues } from "./state";

function Feedback({ state }: { state: PostResult }) {
  const t = useTranslations("posts");
  return (
    <>
      {!state.ok && state.formError && (
        <p role="alert" className="whitespace-pre-line text-sm text-destructive">
          {state.formError}
        </p>
      )}
      {state.invalidTransition && <p className="text-sm">{t("invalidTransitionGuidance")}</p>}
      {state.retryAfter != null && (
        <p className="text-sm">{t("retryAfter", { seconds: state.retryAfter })}</p>
      )}
    </>
  );
}

export function PostEditor({
  action,
  permalink,
  values,
  coverUrl,
}: {
  action: PostAction;
  permalink: string;
  values?: PostValues;
  coverUrl?: string | null;
}) {
  const t = useTranslations("posts");
  const [state, submit] = useActionState(action, { ok: true } as PostResult, permalink);
  const [title, setTitle] = useState(state.values?.title ?? values?.title ?? "");
  const [body, setBody] = useState(state.values?.body ?? values?.body ?? "");
  const [preview, setPreview] = useState(false);
  const [cover, setCover] = useState<FileValue>({
    id: state.values?.coverImage ?? values?.coverImage ?? "",
    url: coverUrl ?? "",
  });
  const [uploading, setUploading] = useState(false);
  const errors = state.ok ? {} : state.fieldErrors;
  return (
    <form id="post-editor" action={submit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="post-title">{t("titleLabel")}</Label>
        <Input
          id="post-title"
          name="title"
          required
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-invalid={Boolean(errors.title?.length)}
          aria-describedby={errors.title?.length ? "post-title-errors" : undefined}
        />
        {errors.title?.length && (
          <div id="post-title-errors" className="text-sm text-destructive">
            {errors.title.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <div role="tablist" aria-label={t("bodyMode")} className="flex gap-2">
          <Button
            type="button"
            role="tab"
            id="post-write-tab"
            aria-controls="post-write"
            aria-selected={!preview}
            variant={preview ? "outline" : "default"}
            onClick={() => setPreview(false)}
          >
            {t("write")}
          </Button>
          <Button
            type="button"
            role="tab"
            id="post-preview-tab"
            aria-controls="post-preview"
            aria-selected={preview}
            variant={preview ? "default" : "outline"}
            onClick={() => setPreview(true)}
          >
            {t("preview")}
          </Button>
        </div>
        <div
          id="post-write"
          role="tabpanel"
          aria-labelledby="post-write-tab"
          hidden={preview}
          className="space-y-2"
        >
          <Label htmlFor="post-body">{t("bodyLabel")}</Label>
          {/* 기본 textarea는 JS 없이 본문을 제출한다. 미리보기만 클라이언트 상태다. */}
          <textarea
            id="post-body"
            name="body"
            maxLength={100000}
            rows={16}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="w-full rounded-lg border border-input bg-background p-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
            aria-invalid={Boolean(errors.body?.length)}
            aria-describedby={errors.body?.length ? "post-body-errors" : undefined}
          />
          {errors.body?.length && (
            <div id="post-body-errors" className="text-sm text-destructive">
              {errors.body.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}
        </div>
        <div
          id="post-preview"
          role="tabpanel"
          aria-labelledby="post-preview-tab"
          hidden={!preview}
          className="min-h-48 break-words rounded-lg border p-4 leading-relaxed [&_a]:underline [&_h2]:text-xl [&_p]:my-3 [&_pre]:overflow-x-auto [&_table]:block [&_table]:overflow-x-auto"
        >
          <Markdown skipHtml remarkPlugins={[remarkGfm]}>
            {body}
          </Markdown>
        </div>
      </div>
      <FileUpload
        name="coverImage"
        label={t("coverLabel")}
        value={cover}
        onChange={setCover}
        returnTo={permalink}
        onPendingChange={setUploading}
      />
      <Feedback state={state} />
      <SubmitButton disabled={uploading}>{t("save")}</SubmitButton>
    </form>
  );
}

export function PostMutationForm({
  intent,
  action,
  permalink,
  title = "",
  cancelHref,
}: {
  intent: "publish" | "unpublish" | "delete";
  action: PostAction;
  permalink: string;
  title?: string;
  cancelHref?: string;
}) {
  const t = useTranslations("posts");
  const [state, submit] = useActionState(action, { ok: true } as PostResult, permalink);
  return (
    <form id={`post-${intent}`} action={submit} className="space-y-3">
      {intent === "delete" && <p>{t("deleteConfirmation", { title })}</p>}
      <Feedback state={state} />
      <div className="flex items-center gap-4">
        <SubmitButton>{t(intent === "delete" ? "deletePost" : intent)}</SubmitButton>
        {cancelHref && (
          <Link href={cancelHref} className="text-sm underline">
            {t("cancel")}
          </Link>
        )}
      </div>
    </form>
  );
}
