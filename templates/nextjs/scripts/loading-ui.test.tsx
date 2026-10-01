// @vitest-environment jsdom
import { expect, it } from "vitest";
import { render } from "@testing-library/react";
import Loading from "../src/app/[locale]/loading";

it("경로 로딩은 문구 없는 스켈레톤이다", () => {
  const { container, unmount } = render(<Loading />);
  expect(container.textContent).toBe("");
  expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  unmount();
});
