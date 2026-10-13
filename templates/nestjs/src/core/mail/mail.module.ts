import { Global, Module } from "@nestjs/common";
import { MailSender } from "./sender.js";
@Global()
@Module({ providers: [MailSender], exports: [MailSender] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest DI 모듈은 선언용 클래스를 사용한다
export class MailModule {}
