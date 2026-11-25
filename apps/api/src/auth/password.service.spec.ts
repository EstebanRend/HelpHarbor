import { PasswordService } from "./password.service";

describe("PasswordService", () => {
  const passwords = new PasswordService();

  it("hashes with argon2id and verifies", async () => {
    const hashed = await passwords.hash("correct horse battery");
    expect(hashed).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    await expect(passwords.verify(hashed, "correct horse battery")).resolves.toBe(true);
    await expect(passwords.verify(hashed, "Correct horse battery")).resolves.toBe(false);
  });

  it("salts every hash", async () => {
    expect(await passwords.hash("same")).not.toBe(await passwords.hash("same"));
  });

  it("rejects unknown users and malformed hashes without throwing", async () => {
    await expect(passwords.verify(undefined, "helpharbor-dummy-password")).resolves.toBe(false);
    await expect(passwords.verify("not-a-hash", "anything")).resolves.toBe(false);
  });
});
