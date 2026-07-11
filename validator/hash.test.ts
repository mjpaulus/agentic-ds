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

describe("structuralHash: template-AST hash (M3)", () => {
  it("is invariant to attribute order", () => {
    const a = '<button type="button" class="x"><slot></slot></button>';
    const b = '<button class="x" type="button"><slot></slot></button>';
    expect(structuralHash(a)).toBe(structuralHash(b));
  });

  it("is invariant to whitespace differences between byte-different but structurally identical templates", () => {
    const a = '<button type="button">\n\t<slot name="icon"></slot>\n\t<slot></slot>\n</button>';
    const b = '<button   type="button"><slot name="icon"></slot>   <slot></slot></button>';
    expect(structuralHash(a)).toBe(structuralHash(b));
  });

  it("drops comments without affecting the hash", () => {
    const a = "<button><slot></slot></button>";
    const b = "<button><!-- a comment --><slot></slot></button>";
    expect(structuralHash(a)).toBe(structuralHash(b));
  });

  it("changes when an element is added (real structural change)", () => {
    const a = "<button><slot></slot></button>";
    const b = "<button><slot></slot><span>extra</span></button>";
    expect(structuralHash(a)).not.toBe(structuralHash(b));
  });

  it("changes when an attribute is added (real structural change)", () => {
    const a = "<button><slot></slot></button>";
    const b = '<button data-extra="1"><slot></slot></button>';
    expect(structuralHash(a)).not.toBe(structuralHash(b));
  });

  it("changes when meaningful text content differs", () => {
    const a = "<button>Save</button>";
    const b = "<button>Cancel</button>";
    expect(structuralHash(a)).not.toBe(structuralHash(b));
  });
});
