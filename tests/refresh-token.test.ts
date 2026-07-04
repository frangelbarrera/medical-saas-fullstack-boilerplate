import { describe, it, expect, beforeEach } from "vitest";
import {
  issueRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  _hashTokenForTesting,
  issueAccessToken,
} from "../src/server/utils/refresh-token.js";
import jwt from "jsonwebtoken";

/**
 * Unit tests for the refresh token service.
 *
 * These tests verify the rotation, revocation, and validation logic without
 * needing to start the server. Integration tests (token flow via HTTP) are
 * in tests/api.test.ts and tests/in-process.test.ts.
 */

describe("Refresh token service", () => {
  describe("issueRefreshToken + validateRefreshToken", () => {
    it("should issue a valid refresh token", () => {
      const raw = issueRefreshToken("user_1", "clinic_1");
      expect(raw).toBeTruthy();
      expect(raw.length).toBe(96); // 48 bytes hex
      const record = validateRefreshToken(raw);
      expect(record).not.toBeNull();
      expect(record!.userId).toBe("user_1");
      expect(record!.clinicId).toBe("clinic_1");
      expect(record!.revoked).toBe(false);
      expect(record!.expiresAt).toBeInstanceOf(Date);
      expect(record!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("should reject an invalid token", () => {
      const record = validateRefreshToken("invalid_token_string");
      expect(record).toBeNull();
    });

    it("should reject an empty token", () => {
      const record = validateRefreshToken("");
      expect(record).toBeNull();
    });
  });

  describe("rotation", () => {
    it("should revoke the old token when a new one is issued via rotation", () => {
      const raw1 = issueRefreshToken("user_2", "clinic_1");
      const hash1 = _hashTokenForTesting(raw1);

      // Issue a new token, rotating from the old one
      const raw2 = issueRefreshToken("user_2", "clinic_1", hash1);

      // Old token should now be revoked
      expect(validateRefreshToken(raw1)).toBeNull();

      // New token should be valid
      const record2 = validateRefreshToken(raw2);
      expect(record2).not.toBeNull();
      expect(record2!.userId).toBe("user_2");
    });
  });

  describe("revokeRefreshToken", () => {
    it("should revoke a token explicitly", () => {
      const raw = issueRefreshToken("user_3", "clinic_1");
      expect(validateRefreshToken(raw)).not.toBeNull();

      revokeRefreshToken(raw);

      expect(validateRefreshToken(raw)).toBeNull();
    });

    it("should be idempotent (revoking twice is a no-op)", () => {
      const raw = issueRefreshToken("user_4", "clinic_1");
      revokeRefreshToken(raw);
      revokeRefreshToken(raw); // should not throw
      expect(validateRefreshToken(raw)).toBeNull();
    });

    it("should handle revoking a non-existent token gracefully", () => {
      expect(() => revokeRefreshToken("nonexistent")).not.toThrow();
    });
  });

  describe("revokeAllUserTokens", () => {
    it("should revoke all tokens for a user", () => {
      const raw1 = issueRefreshToken("user_5", "clinic_1");
      const raw2 = issueRefreshToken("user_5", "clinic_1");
      const raw3 = issueRefreshToken("user_5", "clinic_1");

      expect(validateRefreshToken(raw1)).not.toBeNull();
      expect(validateRefreshToken(raw2)).not.toBeNull();
      expect(validateRefreshToken(raw3)).not.toBeNull();

      revokeAllUserTokens("user_5");

      expect(validateRefreshToken(raw1)).toBeNull();
      expect(validateRefreshToken(raw2)).toBeNull();
      expect(validateRefreshToken(raw3)).toBeNull();
    });

    it("should not revoke tokens from other users", () => {
      const rawA = issueRefreshToken("user_6", "clinic_1");
      const rawB = issueRefreshToken("user_7", "clinic_1");

      revokeAllUserTokens("user_6");

      expect(validateRefreshToken(rawA)).toBeNull();
      expect(validateRefreshToken(rawB)).not.toBeNull();
    });
  });

  describe("issueAccessToken", () => {
    it("should issue a JWT with the user payload and 8h expiry", () => {
      const token = issueAccessToken({
        id: "user_1",
        username: "admin",
        role: "ADMIN",
        clinicId: "clinic_1",
        name: "Admin User",
        managed_doctor_ids: [],
      });

      const decoded: any = jwt.decode(token);
      expect(decoded.id).toBe("user_1");
      expect(decoded.username).toBe("admin");
      expect(decoded.role).toBe("ADMIN");
      expect(decoded.clinicId).toBe("clinic_1");
      expect(decoded.exp).toBeGreaterThan(decoded.iat);
      // 8h = 28800 seconds
      expect(decoded.exp - decoded.iat).toBe(8 * 60 * 60);
    });
  });
});
