import { describe, expect, it } from "vitest";
import { resolveApiBaseUrl, resolveBackendOrigin } from "../src/utils/network";

describe("network url resolver", () => {
  it("uses default backend port with http when no location is provided", () => {
    expect(resolveBackendOrigin({ hostname: "campus.local" })).toBe(
      "http://campus.local:6000",
    );
  });

  it("preserves https protocol for secure hosts", () => {
    expect(
      resolveBackendOrigin({ protocol: "https:", hostname: "ops.example.edu" }),
    ).toBe("https://ops.example.edu:6000");
  });

  it("builds api base url from resolved backend origin", () => {
    expect(resolveApiBaseUrl({ hostname: "localhost" })).toBe(
      "http://localhost:6000/api",
    );
  });
});
