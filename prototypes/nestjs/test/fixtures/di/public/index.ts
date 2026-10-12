import { Injectable, Module } from "@nestjs/common";

@Injectable()
export class PublicDependency {
  read(): string {
    return "public-index";
  }
}

@Module({ providers: [PublicDependency], exports: [PublicDependency] })
export class PublicModule {}
