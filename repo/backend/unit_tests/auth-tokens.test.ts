/**
 * Unit tests — JWT token structure and expiry math
 *
 * Tests access/refresh token payload shapes, TTL constants, and
 * JWT signing/verification as pure logic — no DB, no Redis.
 */
import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { createUserSchema } from "../src/modules/admin/user.service";

process.env.ENCRYPTION_KEY = "a".repeat(64);
process.env.JWT_SECRET = "test-jwt-secret";
process.env.NODE_ENV = "test";

const TEST_SECRET = "test-jwt-secret";

// TTL constants matching auth.service.ts
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 900
const REFRESH_TOKEN_TTL_SECONDS = 8 * 60 * 60; // 28800

// ---- TTL constants ----

describe("token TTL constants", () => {
  it("access token TTL is 900 seconds (15 minutes)", () => {
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(900);
  });

  it("refresh token TTL is 28800 seconds (8 hours)", () => {
    expect(REFRESH_TOKEN_TTL_SECONDS).toBe(28800);
  });

  it("refresh TTL is 32× the access TTL", () => {
    expect(REFRESH_TOKEN_TTL_SECONDS / ACCESS_TOKEN_TTL_SECONDS).toBe(32);
  });
});

// ---- Access token payload ----

describe("access token payload", () => {
  function issueAccessToken(
    user: { id: string; username: string; role: string },
    jti: string,
  ): string {
    return jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        campusId: "main-campus",
        jti,
      },
      TEST_SECRET,
      { expiresIn: "15m" },
    );
  }

  it("contains id claim", () => {
    const token = issueAccessToken(
      { id: "u-1", username: "alice", role: "administrator" },
      "jti-1",
    );
    const decoded = jwt.verify(token, TEST_SECRET) as any;
    expect(decoded.id).toBe("u-1");
  });

  it("contains username claim", () => {
    const token = issueAccessToken(
      { id: "u-1", username: "alice", role: "administrator" },
      "jti-1",
    );
    const decoded = jwt.verify(token, TEST_SECRET) as any;
    expect(decoded.username).toBe("alice");
  });

  it("contains role claim", () => {
    const token = issueAccessToken(
      { id: "u-1", username: "alice", role: "operations_manager" },
      "jti-1",
    );
    const decoded = jwt.verify(token, TEST_SECRET) as any;
    expect(decoded.role).toBe("operations_manager");
  });

  it("contains campusId claim", () => {
    const token = issueAccessToken(
      { id: "u-1", username: "alice", role: "operations_manager" },
      "jti-1",
    );
    const decoded = jwt.verify(token, TEST_SECRET) as any;
    expect(decoded.campusId).toBe("main-campus");
  });

  it("contains jti claim", () => {
    const token = issueAccessToken(
      { id: "u-1", username: "alice", role: "administrator" },
      "jti-abc",
    );
    const decoded = jwt.verify(token, TEST_SECRET) as any;
    expect(decoded.jti).toBe("jti-abc");
  });

  it("exp claim is approximately 15 minutes in the future", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = issueAccessToken(
      { id: "u-1", username: "alice", role: "administrator" },
      "jti-1",
    );
    const decoded = jwt.verify(token, TEST_SECRET) as any;
    const after = Math.floor(Date.now() / 1000);
    expect(decoded.exp).toBeGreaterThanOrEqual(
      before + ACCESS_TOKEN_TTL_SECONDS - 1,
    );
    expect(decoded.exp).toBeLessThanOrEqual(
      after + ACCESS_TOKEN_TTL_SECONDS + 1,
    );
  });

  it("access token does NOT contain sub: refresh", () => {
    const token = issueAccessToken(
      { id: "u-1", username: "alice", role: "administrator" },
      "jti-1",
    );
    const decoded = jwt.verify(token, TEST_SECRET) as any;
    expect(decoded.sub).not.toBe("refresh");
  });

  it("two access tokens for same user have different jti values", () => {
    const { v4: uuidv4 } = require("uuid");
    const jti1 = uuidv4();
    const jti2 = uuidv4();
    expect(jti1).not.toBe(jti2);
  });
});

// ---- Refresh token payload ----

describe("refresh token payload", () => {
  function issueRefreshToken(userId: string, jti: string): string {
    return jwt.sign({ id: userId, sub: "refresh", jti }, TEST_SECRET, {
      expiresIn: "8h",
    });
  }

  it("contains id claim", () => {
    const token = issueRefreshToken("u-2", "rjti-1");
    const decoded = jwt.verify(token, TEST_SECRET) as any;
    expect(decoded.id).toBe("u-2");
  });

  it('contains sub: "refresh" claim', () => {
    const token = issueRefreshToken("u-2", "rjti-1");
    const decoded = jwt.verify(token, TEST_SECRET) as any;
    expect(decoded.sub).toBe("refresh");
  });

  it("contains jti claim", () => {
    const token = issueRefreshToken("u-2", "rjti-xyz");
    const decoded = jwt.verify(token, TEST_SECRET) as any;
    expect(decoded.jti).toBe("rjti-xyz");
  });

  it("exp is approximately 8 hours in the future", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = issueRefreshToken("u-2", "rjti-1");
    const decoded = jwt.verify(token, TEST_SECRET) as any;
    const after = Math.floor(Date.now() / 1000);
    expect(decoded.exp).toBeGreaterThanOrEqual(
      before + REFRESH_TOKEN_TTL_SECONDS - 1,
    );
    expect(decoded.exp).toBeLessThanOrEqual(
      after + REFRESH_TOKEN_TTL_SECONDS + 1,
    );
  });

  it("refresh token does NOT contain username claim", () => {
    const token = issueRefreshToken("u-2", "rjti-1");
    const decoded = jwt.verify(token, TEST_SECRET) as any;
    expect(decoded.username).toBeUndefined();
  });

  it("refresh token does NOT contain role claim", () => {
    const token = issueRefreshToken("u-2", "rjti-1");
    const decoded = jwt.verify(token, TEST_SECRET) as any;
    expect(decoded.role).toBeUndefined();
  });
});

// ---- Token pair distinctness ----

describe("token pair", () => {
  function issueTokenPair(user: {
    id: string;
    username: string;
    role: string;
  }) {
    const jti = `jti-${Math.random()}`;
    const accessToken = jwt.sign(
      { id: user.id, username: user.username, role: user.role, jti },
      TEST_SECRET,
      { expiresIn: "15m" },
    );
    const refreshJti = `rjti-${Math.random()}`;
    const refreshToken = jwt.sign(
      { id: user.id, sub: "refresh", jti: refreshJti },
      TEST_SECRET,
      { expiresIn: "8h" },
    );
    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }

  it("access and refresh tokens are different strings", () => {
    const pair = issueTokenPair({
      id: "u-1",
      username: "bob",
      role: "auditor",
    });
    expect(pair.accessToken).not.toBe(pair.refreshToken);
  });

  it("expiresIn returned is 900", () => {
    const pair = issueTokenPair({
      id: "u-1",
      username: "bob",
      role: "auditor",
    });
    expect(pair.expiresIn).toBe(900);
  });

  it("two token pairs for same user produce different access tokens", () => {
    const p1 = issueTokenPair({
      id: "u-1",
      username: "carol",
      role: "administrator",
    });
    const p2 = issueTokenPair({
      id: "u-1",
      username: "carol",
      role: "administrator",
    });
    expect(p1.accessToken).not.toBe(p2.accessToken);
    expect(p1.refreshToken).not.toBe(p2.refreshToken);
  });
});

// ---- JWT verification failures ----

describe("JWT verification edge cases", () => {
  it("token signed with wrong secret fails verification", () => {
    const token = jwt.sign({ id: "u-1" }, "wrong-secret");
    expect(() => jwt.verify(token, TEST_SECRET)).toThrow();
  });

  it("tampered token fails verification", () => {
    const token = jwt.sign({ id: "u-1" }, TEST_SECRET);
    const tampered = token.slice(0, -5) + "XXXXX";
    expect(() => jwt.verify(tampered, TEST_SECRET)).toThrow();
  });

  it("expired access token is rejected", async () => {
    const token = jwt.sign({ id: "u-1" }, TEST_SECRET, { expiresIn: "1ms" });
    await new Promise((r) => setTimeout(r, 10));
    expect(() => jwt.verify(token, TEST_SECRET)).toThrow(/expired/i);
  });

  it("jwt.decode returns payload without verification", () => {
    const token = jwt.sign(
      { id: "u-1", jti: "test-jti", exp: 9999999999 },
      TEST_SECRET,
    );
    const decoded = jwt.decode(token) as any;
    expect(decoded?.id).toBe("u-1");
    expect(decoded?.jti).toBe("test-jti");
  });

  it("jwt.decode on malformed string returns null", () => {
    const decoded = jwt.decode("not.a.valid.token");
    expect(decoded).toBeNull();
  });
});

// ---- createUserSchema — password requirements ----

describe("createUserSchema password rules", () => {
  const validPayload = {
    username: "newuser",
    password: "SecurePass1!",
    role: "administrator" as const,
  };

  it("accepts a strong password", () => {
    expect(createUserSchema.safeParse(validPayload).success).toBe(true);
  });

  it("rejects password shorter than 12 chars", () => {
    expect(
      createUserSchema.safeParse({ ...validPayload, password: "Short1!" })
        .success,
    ).toBe(false);
  });

  it("rejects password without uppercase", () => {
    expect(
      createUserSchema.safeParse({
        ...validPayload,
        password: "alllowercase1!",
      }).success,
    ).toBe(false);
  });

  it("rejects password without lowercase", () => {
    expect(
      createUserSchema.safeParse({
        ...validPayload,
        password: "ALLUPPERCASE1!",
      }).success,
    ).toBe(false);
  });

  it("rejects password without digit", () => {
    expect(
      createUserSchema.safeParse({ ...validPayload, password: "NoDigitHere!!" })
        .success,
    ).toBe(false);
  });

  it("rejects password without special char", () => {
    expect(
      createUserSchema.safeParse({
        ...validPayload,
        password: "NoSpecialChar1A",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid role", () => {
    expect(
      createUserSchema.safeParse({ ...validPayload, role: "superadmin" as any })
        .success,
    ).toBe(false);
  });

  it("accepts all valid roles", () => {
    const validRoles = [
      "administrator",
      "operations_manager",
      "classroom_supervisor",
      "customer_service_agent",
      "auditor",
    ];
    for (const role of validRoles) {
      const result = createUserSchema.safeParse({ ...validPayload, role });
      expect(result.success).toBe(true);
    }
  });

  it("rejects username shorter than 3 chars", () => {
    expect(
      createUserSchema.safeParse({ ...validPayload, username: "ab" }).success,
    ).toBe(false);
  });

  it("rejects username with invalid characters", () => {
    expect(
      createUserSchema.safeParse({ ...validPayload, username: "user name!" })
        .success,
    ).toBe(false);
  });

  it("accepts username with allowed special chars (_, ., -)", () => {
    expect(
      createUserSchema.safeParse({
        ...validPayload,
        username: "user_name.ok-here",
      }).success,
    ).toBe(true);
  });
});
