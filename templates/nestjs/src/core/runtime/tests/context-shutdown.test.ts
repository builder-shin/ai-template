import { Module, Injectable } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { expect, it } from "vitest";
import { drainBeforeClose } from "../context-shutdown.js";
@Injectable()
class MemoryDatabase {
  open = true;
  rows: string[] = [];
  onModuleDestroy() {
    this.open = false;
  }
  commit() {
    if (!this.open) throw new Error("이미 닫힌 저장소다");
    this.rows.push("완료");
  }
}
@Module({ providers: [MemoryDatabase] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- 사유: 실제 Nest 종료 순서를 확인할 시험 모듈이다
class FixtureModule {}
it("Nest close는 진행 중 작업이 commit한 뒤 의존 저장소를 닫는다", async () => {
  const app = await NestFactory.createApplicationContext(FixtureModule, { logger: false });
  const db = app.get(MemoryDatabase);
  let release!: () => void;
  const finished = new Promise<void>((resolve) => {
    release = resolve;
  });
  drainBeforeClose(app, async () => {
    await finished;
    db.commit();
  });
  const closing = app.close();
  release();
  await closing;
  expect(db.rows).toEqual(["완료"]);
  expect(db.open).toBe(false);
  await app.close();
  expect(db.rows).toEqual(["완료"]);
});
it("작업 drain이 실패해도 Nest 의존 저장소를 닫고 오류를 전한다", async () => {
  const app = await NestFactory.createApplicationContext(FixtureModule, { logger: false });
  const db = app.get(MemoryDatabase);
  drainBeforeClose(app, () => Promise.reject(new Error("작업 종료 실패")));
  await expect(app.close()).rejects.toThrow("작업 종료 실패");
  expect(db.open).toBe(false);
});
