// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs, TabsList, TabsTrigger } from "./tabs";

afterEach(cleanup);
beforeEach(() => {
  render(
    <Tabs orientation="vertical" defaultValue="first">
      <TabsList>
        <TabsTrigger value="first">First</TabsTrigger>
        <TabsTrigger value="second">Second</TabsTrigger>
      </TabsList>
    </Tabs>,
  );
});

it("exposes vertical orientation on the tab list", () => {
  expect(screen.getByRole("tablist").getAttribute("aria-orientation")).toBe("vertical");
});

it("moves focus to the next vertical tab with ArrowDown", async () => {
  const user = userEvent.setup();
  const first = screen.getByRole("tab", { name: "First" });
  const second = screen.getByRole("tab", { name: "Second" });
  await user.click(first);
  expect(document.activeElement).toBe(first);
  await user.keyboard("{ArrowDown}");
  expect(document.activeElement).toBe(second);
});
