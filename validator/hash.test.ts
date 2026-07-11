import { describe, expect, it } from "vitest";
import { apiSignatureHash, stableStringify, structuralHash } from "./hash.js";

describe("hash determinism", () => {
  it("stableStringify is invariant to object key order", () => {
    const a = { name: "x", type: "string", required: true };
    const b = { required: true, name: "x", type: "string" };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it("apiSignatureHash is invariant to key order in the api object and nested property objects", () => {
    const apiA = {
      properties: [
        { name: "variant", type: "string", required: false, enum: ["primary", "secondary"] },
        { name: "size", type: "string", required: false },
      ],
    };
    const apiB = {
      properties: [
        { required: false, enum: ["primary", "secondary"], type: "string", name: "variant" },
        { type: "string", required: false, name: "size" },
      ],
    };
    expect(apiSignatureHash(apiA)).toBe(apiSignatureHash(apiB));
  });

  it("apiSignatureHash changes when the api actually changes", () => {
    const apiA = { properties: [{ name: "variant", type: "string", required: false, enum: ["primary", "secondary"] }] };
    const apiB = { properties: [{ name: "variant", type: "string", required: false, enum: ["primary", "secondary", "ghost"] }] };
    expect(apiSignatureHash(apiA)).not.toBe(apiSignatureHash(apiB));
  });

  it("structuralHash collapses inter-tag whitespace and trims, but is sensitive to real structural change", () => {
    const a = "<button>\n  <slot name=\"icon\"></slot>\n  <slot></slot>\n</button>";
    const b = "<button><slot name=\"icon\"></slot><slot></slot></button>";
    expect(structuralHash(a)).toBe(structuralHash(b));

    const c = "<button><slot></slot></button>";
    expect(structuralHash(a)).not.toBe(structuralHash(c));
  });
});
