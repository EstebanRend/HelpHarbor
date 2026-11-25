import { htmlToText, sanitizeEmailHtml, toStoredBody } from "./email-body";

describe("inbound email bodies", () => {
  it("removes scripts, styles, event handlers and javascript: links", () => {
    const html = sanitizeEmailHtml(
      '<style>p{color:red}</style><p onclick="steal()">Hi<script>alert(1)</script></p>' +
        '<a href="javascript:alert(1)">x</a><img src="https://tracker.example/p.gif"><iframe src="https://evil.example"></iframe>',
    );
    expect(html).toBe('<p>Hi</p><a rel="noopener noreferrer nofollow" target="_blank">x</a>');
  });

  it("keeps safe formatting and hardens links", () => {
    const html = sanitizeEmailHtml('<p>See <a href="https://docs.example/billing" style="x">billing</a> <b>now</b></p>');
    expect(html).toBe(
      '<p>See <a href="https://docs.example/billing" rel="noopener noreferrer nofollow" target="_blank">billing</a> <b>now</b></p>',
    );
  });

  it("derives plain text from HTML with line breaks and decoded entities", () => {
    expect(htmlToText("<html><head><title>T</title></head><body><p>Hi &amp; hello</p><p>a &lt; b<br>c</p></body></html>")).toBe(
      "Hi & hello\na < b\nc",
    );
  });

  it("prefers the text part and normalizes line endings", () => {
    expect(toStoredBody({ text: "Line 1\r\nLine 2\r\n\r\n\r\n\r\nEnd  ", html: "<p>ignored for text</p>" })).toEqual({
      bodyText: "Line 1\nLine 2\n\nEnd",
      bodyHtml: "<p>ignored for text</p>",
    });
  });

  it("stores no HTML when nothing safe is left", () => {
    expect(toStoredBody({ html: "<script>alert(1)</script>" })).toEqual({ bodyText: "", bodyHtml: null });
    expect(toStoredBody({ text: "plain" })).toEqual({ bodyText: "plain", bodyHtml: null });
  });
});
