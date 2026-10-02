import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/** Passwords are hashed with argon2id (library defaults: memory-hard, per-hash random salt). */
@Injectable()
export class PasswordService {
  private dummyHashPromise?: Promise<string>;

  async hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword, { type: argon2.argon2id });
  }

  async verify(passwordHash: string, plainPassword: string): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash, plainPassword);
    } catch {
      // Malformed stored hash: treat as a failed verification, never as a server error.
      return false;
    }
  }

  /**
   * Hash verified when the username does not exist, so a failed login costs the same time
   * whether or not the account exists (no account enumeration through timing).
   */
  async dummyHash(): Promise<string> {
    this.dummyHashPromise ??= this.hash('timing-equalisation-placeholder');
    return this.dummyHashPromise;
  }
}
