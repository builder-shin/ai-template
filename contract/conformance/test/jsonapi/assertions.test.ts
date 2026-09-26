import { describe, expect, it } from "vitest";
import {
  JsonApiViolation,
  MEDIA_TYPE,
  assertCollection,
  assertDocument,
  assertErrorDocument,
  assertMediaType,
  assertSparseFieldset,
  collectionProblems,
  documentProblems,
  errorDocumentProblems,
  linkageProblems,
  sparseFieldsetProblems,
} from "../../src/jsonapi/assertions.ts";

const post = {
  type: "posts",
  id: "p1",
  attributes: { title: "안녕", status: "published" },
  relationships: { author: { data: { type: "users", id: "u1" } } },
};
const author = { type: "users", id: "u1", attributes: { name: "지우" } };

function collection(overrides: Record<string, unknown> = {}) {
  return {
    data: [post],
    links: { first: "/p?1", last: "/p?1", prev: null, next: null },
    meta: { page: { number: 1, size: 20, total: 1, totalPages: 1 } },
    ...overrides,
  };
}

describe("documentProblems", () => {
  it("올바른 단건 문서와 포함 리소스를 통과시킨다", () => {
    expect(() => {
      assertDocument({ data: post, included: [author] });
    }).not.toThrow();
  });

  it("data, errors, meta가 모두 없으면 잡는다", () => {
    expect(documentProblems({ links: {} })).toContain("data, errors, meta 중 하나는 있어야 한다");
  });

  it("data와 errors를 함께 담으면 잡는다", () => {
    expect(documentProblems({ data: null, errors: [] })).toContain(
      "data와 errors를 함께 담을 수 없다",
    );
  });

  it("정의되지 않은 최상위 멤버를 잡는다", () => {
    expect(documentProblems({ data: null, result: 1 })).toContain(
      '최상위에 정의되지 않은 멤버 "result"가 있다',
    );
  });

  it("id가 없는 리소스를 잡는다", () => {
    expect(documentProblems({ data: { type: "posts" } })).toContain("data.id: 문자열이어야 한다");
  });

  it("같은 리소스가 두 번 나오면 잡는다", () => {
    expect(documentProblems({ data: [author], included: [author] })).toContain(
      "리소스 users:u1가 문서에 두 번 나온다",
    );
  });
});

describe("linkageProblems", () => {
  it("아무도 참조하지 않는 포함 리소스를 잡는다", () => {
    const stray = { type: "files", id: "f1" };
    expect(linkageProblems({ data: post, included: [author, stray] })).toEqual([
      "included의 files:f1를 참조하는 관계가 없다(full linkage 위반)",
    ]);
  });
});

describe("errorDocumentProblems", () => {
  const error = { status: "422", code: "validation.required", title: "Required" };

  it("올바른 에러 문서를 통과시킨다", () => {
    expect(() => {
      assertErrorDocument({ errors: [error], meta: { traceId: "t1" } }, 422);
    }).not.toThrow();
  });

  it("traceId가 없으면 잡는다", () => {
    expect(errorDocumentProblems({ errors: [error], meta: {} })).toContain(
      "meta.traceId: 문자열이어야 한다",
    );
  });

  it("status가 응답 코드와 다르면 잡는다", () => {
    expect(errorDocumentProblems({ errors: [error], meta: { traceId: "t" } }, 400)).toContain(
      'errors[0].status: "400"여야 한다(현재: 422)',
    );
  });

  it("errors가 비어 있으면 잡는다", () => {
    expect(errorDocumentProblems({ errors: [], meta: { traceId: "t" } })).toContain(
      "errors는 비어 있지 않은 배열이어야 한다",
    );
  });
});

describe("collectionProblems", () => {
  it("올바른 컬렉션을 통과시킨다", () => {
    expect(() => {
      assertCollection(collection());
    }).not.toThrow();
  });

  it("totalPages가 ceil(total / size)가 아니면 잡는다", () => {
    const meta = { page: { number: 1, size: 20, total: 41, totalPages: 2 } };
    expect(collectionProblems(collection({ meta }))).toContain(
      "meta.page.totalPages는 ceil(total / size)여야 한다",
    );
  });

  it("다음 페이지 링크가 없으면 잡는다", () => {
    const links = { first: "/p", last: "/p", prev: null };
    expect(collectionProblems(collection({ links }))).toContain(
      "links.next: 문자열 또는 null이어야 한다",
    );
  });
});

describe("sparseFieldsetProblems", () => {
  it("요청한 필드만 있으면 통과시킨다", () => {
    const sparse = { data: { type: "posts", id: "p1", attributes: { title: "안녕" } } };
    expect(() => {
      assertSparseFieldset(sparse, { posts: ["title"] });
    }).not.toThrow();
  });

  it("요청하지 않은 속성과 관계를 잡는다", () => {
    expect(sparseFieldsetProblems({ data: post }, { posts: ["title"] })).toEqual([
      "posts:p1에 요청하지 않은 필드 status가 있다",
      "posts:p1에 요청하지 않은 필드 author가 있다",
    ]);
  });
});

describe("mediaTypeProblems", () => {
  it("본문이 있는 응답의 Content-Type을 검사한다", () => {
    const wrong = { status: 200, headers: new Headers({ "content-type": "application/json" }) };
    expect(() => {
      assertMediaType(wrong);
    }).toThrow(JsonApiViolation);
  });

  it("204와 202는 본문이 없으므로 검사하지 않는다", () => {
    expect(() => {
      assertMediaType({ status: 204, headers: new Headers() });
    }).not.toThrow();
    const ok = { status: 200, headers: new Headers({ "content-type": MEDIA_TYPE }) };
    expect(() => {
      assertMediaType(ok);
    }).not.toThrow();
  });
});
