import { resolveMailbox } from "../../src/targets.ts";

/** 스위트를 시작할 때 메일함을 한 번 비운다. 흐름 파일은 병렬로 돌므로 파일마다 비우지 않는다. */
export default async function setup(): Promise<void> {
  await resolveMailbox(process.env).clear();
}
