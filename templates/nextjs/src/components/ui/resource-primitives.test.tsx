// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from "./dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { ko, en } from "../../lib/i18n/catalogs";

afterEach(cleanup);
it.each(["ko", "en"] as const)("대화상자의 닫기 이름을 번역한다: %s", async (locale) => {
  const user = userEvent.setup();
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "ko" ? ko : en}>
      <Dialog>
        <DialogTrigger>열기</DialogTrigger>
        <DialogContent>
          <DialogTitle>확인</DialogTitle>
          <DialogDescription>선택을 확인하세요.</DialogDescription>
        </DialogContent>
      </Dialog>
    </NextIntlClientProvider>,
  );
  await user.click(screen.getByRole("button", { name: "열기" }));
  await user.click(await screen.findByRole("button", { name: locale === "ko" ? "닫기" : "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("선택 부품은 여러 값과 폼 이름을 보존한다", async () => {
  const user = userEvent.setup();
  render(
    <form aria-label="선택">
      <Select multiple name="roles" defaultValue={["a"]}>
        <SelectTrigger aria-label="역할">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="a">A</SelectItem>
            <SelectItem value="b">B</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </form>,
  );
  await user.click(screen.getByRole("combobox", { name: "역할" }));
  await user.click(await screen.findByRole("option", { name: "B" }));
  expect(new FormData(screen.getByRole("form") as HTMLFormElement).getAll("roles")).toEqual([
    "a",
    "b",
  ]);
});
