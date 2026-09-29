"""메일: 로케일별 템플릿(없으면 ko), html만 이스케이프, SMTP 주소 해석, 실제 발송."""

from pathlib import Path

import pytest
from jinja2 import UndefinedError

from app.core.config import Settings
from app.core.mail import Mail, MailTemplates, SmtpServer, send, smtp_server
from tools.mailpit import Mailpit

pytestmark = pytest.mark.anyio


@pytest.fixture
def templates(tmp_path: Path) -> MailTemplates:
    for locale, greeting in (("ko", "안녕하세요"), ("en", "Hello")):
        folder = tmp_path / locale
        folder.mkdir()
        (folder / "welcome.subject.txt").write_text(
            f"{greeting},\n{{{{ name }}}}\n", encoding="utf-8"
        )
        (folder / "welcome.txt").write_text(
            f"{greeting} {{{{ name }}}}: {{{{ link }}}}\n", encoding="utf-8"
        )
        (folder / "welcome.html").write_text("<p>{{ name }}</p>", encoding="utf-8")
    return MailTemplates(tmp_path)


def test_renders_the_recipient_locale_and_falls_back_to_korean(templates: MailTemplates) -> None:
    english = templates.render(
        "welcome", locale="en", to="ada@example.com", name="Ada", link="https://x/?token=t"
    )
    assert english == Mail(
        to="ada@example.com",
        subject="Hello, Ada",
        text="Hello Ada: https://x/?token=t\n",
        html="<p>Ada</p>",
    )
    fallback = templates.render("welcome", locale="fr", to="a@example.com", name="Ada", link="l")
    assert fallback.subject == "안녕하세요, Ada"


def test_only_html_is_escaped(templates: MailTemplates) -> None:
    mail = templates.render("welcome", locale="ko", to="a@example.com", name="<b>Ada</b>", link="l")
    assert "<b>Ada</b>" in mail.text
    assert mail.html == "<p>&lt;b&gt;Ada&lt;/b&gt;</p>"


def test_a_missing_variable_is_an_error(templates: MailTemplates) -> None:
    with pytest.raises(UndefinedError):
        templates.render("welcome", locale="ko", to="a@example.com", name="Ada")


@pytest.mark.parametrize(
    ("url", "server"),
    [
        ("smtp://127.0.0.1:21025", SmtpServer("127.0.0.1", 21025, None, None, False, False)),
        (
            "smtp+starttls://mailer%40example.com:p%40ss@smtp.example.com",
            SmtpServer("smtp.example.com", 587, "mailer@example.com", "p@ss", False, True),
        ),
        ("smtps://smtp.example.com", SmtpServer("smtp.example.com", 465, None, None, True, False)),
    ],
)
def test_smtp_url_gives_host_port_login_and_tls(url: str, server: SmtpServer) -> None:
    assert smtp_server(url) == server


async def test_send_delivers_through_smtp(settings: Settings, mailbox: Mailpit) -> None:
    mail = Mail(to="send@example.com", subject="보낸 메일", text="본문", html="<p>본문</p>")
    await send(settings, mail)
    [received] = await mailbox.wait_for("send@example.com")
    assert (received.subject, received.text.strip()) == ("보낸 메일", "본문")
    assert "<p>본문</p>" in received.html
