/** 골든 기능의 단수·복수 표기를 새 기능 이름으로 한 번만 바꾼다. */
export class GenerateError extends Error {}
export type Names = {
  kebab: string;
  one: string;
  camel: string;
  camelOne: string;
  pascal: string;
  pascalOne: string;
  snake: string;
  snakeOne: string;
  upper: string;
  upperOne: string;
};

export function namesFor(name: string, singular?: string): Names {
  if (!/^[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*$/.test(name) || name.length > 20)
    throw new GenerateError(
      "이름은 20자 이하 영어 소문자 복수형 kebab-case로 쓴다(예: blog-posts).",
    );
  const words = name.split("-");
  const last = words.at(-1)!;
  const one =
    singular ??
    (last.endsWith("ies")
      ? last.slice(0, -3) + "y"
      : /(?:sses|xes|ches|shes)$/.test(last)
        ? last.slice(0, -2)
        : last.endsWith("s") && !last.endsWith("ss")
          ? last.slice(0, -1)
          : "");
  if (!/^[a-z][a-z0-9]*$/.test(one) || one === last)
    throw new GenerateError(
      "복수형으로 쓴다. 단수형이 다르면 --singular로 끝 단어의 단수형을 준다.",
    );
  const ones = [...words.slice(0, -1), one];
  const pascal = (parts: string[]) =>
    parts.map((word) => word[0]!.toUpperCase() + word.slice(1)).join("");
  const camel = (parts: string[]) => parts[0]! + pascal(parts.slice(1));
  if (ones.join("-").length > 20) throw new GenerateError("단수형도 20자 이하로 쓴다.");
  const reserved = new Set(
    "await break case catch class const continue debugger default delete do else enum export extends false finally for function if implements import in instanceof interface let new null package private protected public return static super switch this throw true try typeof var void while with yield arguments eval".split(
      " ",
    ),
  );
  if (reserved.has(camel(words)) || reserved.has(camel(ones)))
    throw new GenerateError("이름의 단수형·복수형에는 JavaScript 예약어를 쓰지 않는다.");
  return {
    kebab: name,
    one: ones.join("-"),
    camel: camel(words),
    camelOne: camel(ones),
    pascal: pascal(words),
    pascalOne: pascal(ones),
    snake: words.join("_"),
    snakeOne: ones.join("_"),
    upper: words.join("_").toUpperCase(),
    upperOne: ones.join("_").toUpperCase(),
  };
}

export function rename(value: string, names: Names, mode: "identifier" | "text" = "text") {
  return value.replace(
    /POSTS?(?![A-Z])|Posts?(?![a-z])|(?<![a-zA-Z0-9])posts?(?![a-z0-9])/g,
    (word: string, offset: number) => {
      const plural = word.toLowerCase() === "posts";
      if (word === word.toUpperCase()) {
        // 문자열 POST는 HTTP 메서드다. 식별자 POST는 이름이다.
        return mode === "text" && word === "POST" ? word : plural ? names.upper : names.upperOne;
      }
      if (word[0] === "P") return plural ? names.pascal : names.pascalOne;
      const snake = value[offset - 1] === "_" || value[offset + word.length] === "_";
      if (mode === "identifier" || snake) {
        return plural
          ? snake
            ? names.snake
            : names.camel
          : snake
            ? names.snakeOne
            : names.camelOne;
      }
      if ((offset === 0 && value === word) || value === `"${word}"` || value === `'${word}'`)
        return plural ? names.camel : names.camelOne;
      return plural ? names.kebab : names.one;
    },
  );
}
