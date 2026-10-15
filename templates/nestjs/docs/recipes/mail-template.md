# 메일 템플릿 추가

`src/modules/<모듈>/templates/<ko|en>/<이름>.{subject.txt,txt,html}` 세 파일을 두
로케일에 모두 만든다. `loadMailTemplates`와 `renderMail`을 사용한다. HTML 값은
이스케이프되며 누락한 치환 값은 실패한다. 제목과 일반 본문에도 값을 빠뜨리지 않는다.

로케일 선택은 모듈의 기존 흐름을 따르고 MailSender 호출은 도메인 잡 처리기에 둔다.
토큰·주소·비밀번호를 로그나 잡 데이터에 싣지 않는다. HTML 이스케이프·누락 값·
ko/en 선택·메일 실패의 재시도를 단위 시험으로 확인한다.
하네스는 로케일별 세 형식의 누락을 검사한다. 실제 발송은 CI의 Mailpit에서 확인한다.
