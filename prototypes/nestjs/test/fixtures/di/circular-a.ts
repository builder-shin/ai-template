import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { CircularB } from "./circular-b.js";
export type WrapperType<T> = T;

@Injectable()
export class CircularA {
  constructor(@Inject(forwardRef(() => CircularB)) readonly other: WrapperType<CircularB>) {}
}
