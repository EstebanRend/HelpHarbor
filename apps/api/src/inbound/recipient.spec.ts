import { parseRecipient, replyAddress } from "./recipient";

const DOMAIN = "inbound.helpharbor.example";
const TOKEN = "abcdefghijklmnopqrstuvwxyz";

describe("parseRecipient", () => {
  it("reads the workspace slug and an optional reply token", () => {
    expect(parseRecipient(`acme-cloud@${DOMAIN}`, DOMAIN)).toEqual({ tenantSlug: "acme-cloud", replyToken: null });
    expect(parseRecipient(replyAddress("acme-cloud", TOKEN, DOMAIN), DOMAIN)).toEqual({
      tenantSlug: "acme-cloud",
      replyToken: TOKEN,
    });
  });

  it("is not fooled by other domains or look-alike subdomains", () => {
    expect(parseRecipient("acme-cloud@example.com", DOMAIN)).toBeNull();
    expect(parseRecipient(`acme-cloud@evil.${DOMAIN}`, DOMAIN)).toBeNull();
    expect(parseRecipient(`acme-cloud@${DOMAIN}.evil.example`, DOMAIN)).toBeNull();
  });

  it("rejects bad slugs and malformed tokens", () => {
    expect(parseRecipient(`Acme_Cloud@${DOMAIN}`, DOMAIN)).toBeNull();
    expect(parseRecipient(`ac@${DOMAIN}`, DOMAIN)).toBeNull();
    expect(parseRecipient(`acme-cloud+short@${DOMAIN}`, DOMAIN)).toBeNull();
    expect(parseRecipient(`acme-cloud+${TOKEN}1@${DOMAIN}`, DOMAIN)).toBeNull();
    expect(parseRecipient(`@${DOMAIN}`, DOMAIN)).toBeNull();
  });
});
