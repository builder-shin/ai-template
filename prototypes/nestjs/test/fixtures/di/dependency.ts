import { Injectable } from "@nestjs/common";

@Injectable()
export class Dependency {
  read(): string {
    return "cross-file";
  }
}
