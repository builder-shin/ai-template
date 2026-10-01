import { notFound } from "next/navigation";

// 알 수 없는 경로도 로케일 레이아웃의 번역된 404로 연결한다.
export default function UnknownPage() {
  notFound();
}
