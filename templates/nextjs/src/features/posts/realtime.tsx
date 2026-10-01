"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "../../lib/i18n/navigation";
import { useChannel } from "../../lib/realtime";

/** 연속 이벤트는 100ms마다 한 번 반영한다. 서버 데이터를 클라이언트에 저장하지 않는다. */
function usePostRefresh() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return () => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      router.refresh();
    }, 100);
  };
}

// gen:feature: 고칠 곳 — 새 계약의 채널·이벤트·갱신 조건을 맞춘다.
export function PostsRealtime() {
  const refresh = usePostRefresh();
  useChannel("posts", refresh); // gen:feature: 그대로
  return null;
}

/** 상세 layout에 두어 새 서버 응답이 404여도 변경 안내를 보존한다. */
export function PostRealtime({ id, children }: { id: string; children: ReactNode }) {
  const t = useTranslations("posts");
  const refresh = usePostRefresh();
  const [notice, setNotice] = useState<"deletedNotice" | "unpublishedNotice" | null>(null);
  useChannel("posts", (event) => {
    if (event.payload.data.id !== id) return;
    if (event.name === "post.deleted") setNotice("deletedNotice");
    else if (event.name === "post.unpublished") setNotice("unpublishedNotice");
    else setNotice(null);
    refresh();
  });
  if (!notice) return children;
  return (
    <section className="flex flex-col gap-4 py-8">
      <p role="alert">{t(notice)}</p>
      <Link href="/posts" className="rounded-md underline underline-offset-4">
        {t("back")}
      </Link>
    </section>
  );
}
