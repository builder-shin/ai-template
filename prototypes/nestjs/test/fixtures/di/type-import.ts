import { Injectable } from "@nestjs/common";
import type { Dependency } from "./dependency.js";

// 잘못된 type import는 타입 검사에 통과해도 Nest에서 주입할 클래스 토큰을 지운다.
@Injectable()
export class TypeImportConsumer {
  constructor(readonly dependency: Dependency) {}
}
