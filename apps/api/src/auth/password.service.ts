import { Injectable } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";

/** argon2id with the OWASP-recommended minimum: 19 MiB memory, 2 iterations, 1 lane. */
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class PasswordService {
  /** Verified against when the email is unknown, so both failure paths cost the same. */
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  async verify(passwordHash: string | undefined, password: string): Promise<boolean> {
    this.dummyHash ??= this.hash("helpharbor-dummy-password");
    const target = passwordHash ?? (await this.dummyHash);
    try {
      const ok = await verify(target, password);
      return passwordHash !== undefined && ok;
    } catch {
      return false;
    }
  }
}
