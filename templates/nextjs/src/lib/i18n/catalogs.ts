import sharedKo from "../../../messages/shared/ko.json" with { type: "json" };
import sharedEn from "../../../messages/shared/en.json" with { type: "json" };
import appKo from "../../../messages/ko.json" with { type: "json" };
import appEn from "../../../messages/en.json" with { type: "json" };
import { mergeMessages } from "./merge";

/** 요청 밖의 오류 화면과 테스트도 같은 병합 규칙을 쓴다. */
export const ko = mergeMessages(sharedKo, appKo);
export const en = mergeMessages(sharedEn, appEn);
