import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { CircularA } from "./circular-a.js";
import type { WrapperType } from "./circular-a.js";

@Injectable()
export class CircularB {
  constructor(@Inject(forwardRef(() => CircularA)) readonly other: WrapperType<CircularA>) {}
}
