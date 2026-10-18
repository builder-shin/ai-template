import type pg from "pg";

// 같은 prototype에 spy를 다시 설치해도 spy 자체를 위임 대상으로 잡지 않는다.
export function queryObserver(original: pg.Client["query"]) {
  const observations = new Set<string[]>();
  const query = new Proxy(original, {
    apply(target, receiver: unknown, args: unknown[]) {
      const first = args[0];
      const text =
        typeof first === "string"
          ? first
          : first && typeof first === "object" && "text" in first && typeof first.text === "string"
            ? first.text
            : undefined;
      if (text !== undefined) for (const sql of observations) sql.push(text);
      return Reflect.apply(target, receiver, args) as unknown;
    },
  });
  return () => {
    const sql: string[] = [];
    observations.add(sql);
    return { sql, query };
  };
}
