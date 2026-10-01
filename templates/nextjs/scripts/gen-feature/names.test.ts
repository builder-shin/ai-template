import { expect, it } from "vitest";
import { namesFor, rename } from "./names";

it("식별자의 단수·복수와 camel·Pascal·snake·대문자 표기를 바꾼다", () => {
  const names = namesFor("blog-posts");
  expect(
    rename(
      "POSTS POST Posts Post posts post getPosts getPost myPosts post_id posts_cache",
      names,
      "identifier",
    ),
  ).toBe(
    "BLOG_POSTS BLOG_POST BlogPosts BlogPost blogPosts blogPost getBlogPosts getBlogPost myBlogPosts blog_post_id blog_posts_cache",
  );
  expect(rename("postscript Postscript POSTSCRIPT", names, "identifier")).toBe(
    "postscript Postscript POSTSCRIPT",
  );
});

it("문자열의 경로는 kebab, 밑줄 표기는 snake이며 HTTP POST는 보존한다", () => {
  const names = namesFor("blog-posts");
  expect(rename("/posts /my-posts post-title posts_cache post_id POST", names)).toBe(
    "/blog-posts /my-blog-posts blog-post-title blog_posts_cache blog_post_id POST",
  );
});

it("이름에 post가 들어 있어도 한 번만 바꾸고 불규칙 단수형을 지정할 수 있다", () => {
  expect(rename("getPosts Post", namesFor("blog-posts"), "identifier")).toBe(
    "getBlogPosts BlogPost",
  );
  expect(namesFor("people", "person")).toMatchObject({
    kebab: "people",
    one: "person",
    pascalOne: "Person",
  });
  expect(namesFor("categories")).toMatchObject({ one: "category" });
  expect(() => namesFor("people")).toThrow(/복수형/);
  expect(() => namesFor("posts", "../escape")).toThrow(/단수형/);
});

it.each(["classes", "returns", "defaults", "functions", "imports", "news"])(
  "%s의 단수형이 예약어면 코드 생성 전에 거절한다",
  (name) => expect(() => namesFor(name)).toThrow(/예약어/),
);
