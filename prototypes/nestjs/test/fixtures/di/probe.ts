import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { Type } from "@nestjs/common";
import { Dependency } from "./dependency.js";
import { PublicDependency, PublicModule } from "./public/index.js";
import { CircularA } from "./circular-a.js";
import { CircularB } from "./circular-b.js";
import { TypeImportConsumer } from "./type-import.js";
import {
  Consumer,
  TOKEN,
  TokenConsumer,
  ProbeController,
  ProbeGuard,
  ProbePipe,
  ProbeInterceptor,
  ProbeGateway,
} from "./providers.js";

const providers = [
  Dependency,
  Consumer,
  TokenConsumer,
  ProbeGuard,
  ProbePipe,
  ProbeInterceptor,
  ProbeGateway,
  CircularA,
  CircularB,
];
const classes = [...providers, PublicDependency, PublicModule, ProbeController];

export interface ProbeResult {
  metadata: Record<string, string[] | null>;
  graph: { compiled: boolean; verified: boolean; error: string | null };
  misuse: { metadata: string[] | null; rejected: boolean; error: string | null };
}

function paramtypes(provider: Type<unknown>): string[] | null {
  const types = Reflect.getMetadata("design:paramtypes", provider) as Type<unknown>[] | undefined;
  return types?.map((type) => type.name) ?? null;
}

export async function probe(): Promise<ProbeResult> {
  const result: ProbeResult = {
    metadata: Object.fromEntries(classes.map((provider) => [provider.name, paramtypes(provider)])),
    graph: { compiled: false, verified: false, error: null },
    misuse: { metadata: paramtypes(TypeImportConsumer), rejected: false, error: null },
  };
  try {
    const module = await Test.createTestingModule({
      imports: [PublicModule],
      controllers: [ProbeController],
      providers: [...providers, { provide: TOKEN, useValue: { label: "token" } }],
    }).compile();
    try {
      result.graph.compiled = true;
      result.graph.verified =
        module.get(Consumer).read() === "cross-file:public-index" &&
        module.get(TokenConsumer).value.label === "token" &&
        module.get(ProbeGuard).canActivate() &&
        module.get(ProbePipe).transform("input") === "input:cross-file" &&
        module.get(ProbeInterceptor).dependency === module.get(Dependency) &&
        module.get(ProbeGateway).dependency === module.get(Dependency) &&
        module.get(ProbeController).consumer === module.get(Consumer) &&
        module.get(CircularA).other === module.get(CircularB) &&
        module.get(CircularB).other === module.get(CircularA);
    } finally {
      await module.close();
    }
  } catch (error) {
    result.graph.error = error instanceof Error ? error.message : String(error);
  }
  try {
    const module = await Test.createTestingModule({
      providers: [Dependency, TypeImportConsumer],
    }).compile();
    try {
      const consumer = module.get(TypeImportConsumer);
      result.misuse.rejected = !(consumer.dependency instanceof Dependency);
      if (result.misuse.rejected) result.misuse.error = "compile omitted the required Dependency";
    } finally {
      await module.close();
    }
  } catch (error) {
    result.misuse.rejected = true;
    result.misuse.error = error instanceof Error ? error.message : String(error);
  }
  return result;
}
