import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cleanCommentBody,
  extractCodeScanningAlertNumber,
  extractNitpickComments,
  extractNitpicksFromReview,
  extractNitpickSectionContent,
  getLatestCodeRabbitReview,
  parseCommentsFromFileSection,
  type Review,
} from "./parseNitpicks.ts";

describe("cleanCommentBody", () => {
  it("removes details elements", () => {
    const input = "Some text <details><summary>Hidden</summary>Content</details> more text";

    const actual = cleanCommentBody(input);

    assert.equal(actual, "Some text  more text");
  });

  it("escapes HTML angle brackets", () => {
    const input = "Use <T> for generics";

    const actual = cleanCommentBody(input);

    assert.equal(actual, "Use &lt;T&gt; for generics");
  });

  it("trims whitespace", () => {
    const input = "  content  ";

    const actual = cleanCommentBody(input);

    assert.equal(actual, "content");
  });

  it("handles nested details elements", () => {
    const input =
      "text <details><summary>1</summary><details><summary>2</summary>nested</details></details> end";

    const actual = cleanCommentBody(input);

    assert.equal(actual, "text  end");
  });
});

describe("extractNitpickSectionContent", () => {
  it("extracts content from a simple nitpick section", () => {
    const input = `
<details>
<summary>🧹 Nitpick comments (2)</summary><blockquote>
inner content here
</blockquote></details>
`;

    const actual = extractNitpickSectionContent(input);

    assert.equal(actual, "\ninner content here\n");
  });

  it("handles nested blockquotes", () => {
    const input = `
<details>
<summary>🧹 Nitpick comments (1)</summary><blockquote>
<details><summary>file.ts (1)</summary><blockquote>
nested content
</blockquote></details>
</blockquote></details>
`;

    const actual = extractNitpickSectionContent(input);

    assert.ok(actual?.includes("nested content"));
    assert.ok(actual?.includes("<blockquote>"));
  });

  it("returns undefined when no nitpick section exists", () => {
    const input = "No nitpicks here";

    const actual = extractNitpickSectionContent(input);

    assert.equal(actual, undefined);
  });

  it("handles multiple file sections", () => {
    const input = `
<details>
<summary>🧹 Nitpick comments (3)</summary><blockquote>
<details><summary>file1.ts (1)</summary><blockquote>content1</blockquote></details>
<details><summary>file2.ts (2)</summary><blockquote>content2</blockquote></details>
</blockquote></details>
`;

    const actual = extractNitpickSectionContent(input);

    assert.ok(actual?.includes("file1.ts"));
    assert.ok(actual?.includes("file2.ts"));
    assert.ok(actual?.includes("content1"));
    assert.ok(actual?.includes("content2"));
  });

  it("handles CodeRabbit format with comment marker after", () => {
    const input = `
<details>
<summary>🧹 Nitpick comments (1)</summary><blockquote>
<details><summary>test.ts (1)</summary><blockquote>content</blockquote></details>
</blockquote></details>

<!-- This is an auto-generated comment by CodeRabbit for review status -->
`;

    const actual = extractNitpickSectionContent(input);

    assert.ok(actual?.includes("content"));
    assert.ok(!actual?.includes("auto-generated"));
  });
});

describe("parseCommentsFromFileSection", () => {
  const review: Review = {
    author: { login: "coderabbitai" },
    body: "",
    createdAt: "2024-01-15T10:00:00Z",
  };

  it("parses a single comment", () => {
    const fileContent = "`42-45`: **Fix naming convention.**\n\nUse camelCase for variables.";

    const actual = parseCommentsFromFileSection(fileContent, "src/utils.ts", review);

    assert.equal(actual.length, 1);
    assert.deepEqual(actual[0], {
      author: "coderabbitai",
      body: "Fix naming convention.\n\nUse camelCase for variables.",
      createdAt: "2024-01-15T10:00:00Z",
      file: "src/utils.ts",
      line: "42-45",
    });
  });

  it("parses multiple comments", () => {
    const fileContent = `\`10\`: **First issue.**

Description 1

---

\`20-25\`: **Second issue.**

Description 2`;

    const actual = parseCommentsFromFileSection(fileContent, "file.ts", review);

    assert.equal(actual.length, 2);
    assert.equal(actual[0].line, "10");
    assert.equal(actual[1].line, "20-25");
  });

  it("handles deleted user", () => {
    const reviewWithDeletedUser: Review = {
      author: null,
      body: "",
      createdAt: "2024-01-15T10:00:00Z",
    };
    const fileContent = "`1`: **Issue.**\n\nDescription";

    const actual = parseCommentsFromFileSection(fileContent, "file.ts", reviewWithDeletedUser);

    assert.equal(actual[0].author, "deleted-user");
  });

  it("removes nested details from comment body", () => {
    const fileContent =
      "`1`: **Issue.**\n\nText <details><summary>More</summary>Hidden</details> end";

    const actual = parseCommentsFromFileSection(fileContent, "file.ts", review);

    assert.equal(actual[0].body, "Issue.\n\nText  end");
  });
});

describe("extractNitpicksFromReview", () => {
  it("extracts nitpicks for dotless filenames", () => {
    const review: Review = {
      author: { login: "coderabbitai" },
      body: `<details>
<summary>🧹 Nitpick comments (1)</summary><blockquote>

<details>
<summary>Dockerfile (1)</summary><blockquote>

\`7\`: **Pin base image.**

Use a digest for reproducibility.

</blockquote></details>

</blockquote></details>`,
      createdAt: "2024-01-15T10:00:00Z",
    };

    const actual = extractNitpicksFromReview(review);

    assert.equal(actual.length, 1);
    assert.equal(actual[0].file, "Dockerfile");
    assert.equal(actual[0].line, "7");
    assert.ok(actual[0].body.includes("Pin base image."));
  });

  it("returns empty array when review has no nitpick section", () => {
    const review: Review = {
      author: { login: "coderabbitai" },
      body: "Just a regular review without nitpicks",
      createdAt: "2024-01-15T10:00:00Z",
    };

    const actual = extractNitpicksFromReview(review);

    assert.deepEqual(actual, []);
  });

  it("extracts nitpicks from a CodeRabbit review", () => {
    const review: Review = {
      author: { login: "coderabbitai" },
      body: `**Actionable comments posted: 1**

<details>
<summary>🧹 Nitpick comments (1)</summary><blockquote>

<details>
<summary>src/utils.ts (1)</summary><blockquote>

\`42-45\`: **Consider using const.**

The variable is never reassigned.

</blockquote></details>

</blockquote></details>

<!-- This is an auto-generated comment by CodeRabbit -->`,
      createdAt: "2024-01-15T10:00:00Z",
    };

    const actual = extractNitpicksFromReview(review);

    assert.equal(actual.length, 1);
    assert.equal(actual[0].file, "src/utils.ts");
    assert.equal(actual[0].line, "42-45");
    assert.ok(actual[0].body.includes("Consider using const."));
  });

  it("extracts nitpicks from multiple files", () => {
    const review: Review = {
      author: { login: "coderabbitai" },
      body: `<details>
<summary>🧹 Nitpick comments (2)</summary><blockquote>

<details>
<summary>file1.ts (1)</summary><blockquote>

\`10\`: **Issue 1.**

Description 1

</blockquote></details>
<details>
<summary>file2.ts (1)</summary><blockquote>

\`20\`: **Issue 2.**

Description 2

</blockquote></details>

</blockquote></details>`,
      createdAt: "2024-01-15T10:00:00Z",
    };

    const actual = extractNitpicksFromReview(review);

    assert.equal(actual.length, 2);
    assert.equal(actual[0].file, "file1.ts");
    assert.equal(actual[1].file, "file2.ts");
  });

  it("extracts nitpicks when comments have nested details elements", () => {
    // Real CodeRabbit format: comments have nested <details> for proposed fixes
    const review: Review = {
      author: { login: "coderabbitai" },
      body: `<details>
<summary>🧹 Nitpick comments (3)</summary><blockquote>

<details>
<summary>src/api.ts (2)</summary><blockquote>

\`47-88\`: **Fix markdown formatting.**

Several issues here.

<details>
<summary>📝 Proposed fix</summary>

\`\`\`diff
-old
+new
\`\`\`

</details>

---

\`89-107\`: **Fix heading format.**

Use proper headings.

<details>
<summary>📝 Proposed fix</summary>

\`\`\`diff
-bad
+good
\`\`\`

</details>

</blockquote></details>
<details>
<summary>src/utils.ts (1)</summary><blockquote>

\`10\`: **Add type annotation.**

Missing type.

</blockquote></details>

</blockquote></details>`,
      createdAt: "2024-01-15T10:00:00Z",
    };

    const actual = extractNitpicksFromReview(review);

    assert.equal(actual.length, 3);
    assert.equal(actual[0].file, "src/api.ts");
    assert.equal(actual[0].line, "47-88");
    assert.equal(actual[1].file, "src/api.ts");
    assert.equal(actual[1].line, "89-107");
    assert.equal(actual[2].file, "src/utils.ts");
    assert.equal(actual[2].line, "10");
  });
});

describe("getLatestCodeRabbitReview", () => {
  it("returns undefined when no reviews exist", () => {
    const actual = getLatestCodeRabbitReview([]);

    assert.equal(actual, undefined);
  });

  it("returns undefined when no CodeRabbit reviews with nitpicks exist", () => {
    const reviews: Review[] = [
      { author: { login: "human" }, body: "LGTM", createdAt: "2024-01-15T10:00:00Z" },
      {
        author: { login: "coderabbitai" },
        body: "No issues found",
        createdAt: "2024-01-15T11:00:00Z",
      },
    ];

    const actual = getLatestCodeRabbitReview(reviews);

    assert.equal(actual, undefined);
  });

  it("returns the latest CodeRabbit review with nitpicks", () => {
    const reviews: Review[] = [
      {
        author: { login: "coderabbitai" },
        body: "🧹 Nitpick comments (1) - older",
        createdAt: "2024-01-15T10:00:00Z",
      },
      {
        author: { login: "coderabbitai" },
        body: "🧹 Nitpick comments (2) - newer",
        createdAt: "2024-01-15T12:00:00Z",
      },
      {
        author: { login: "coderabbitai" },
        body: "🧹 Nitpick comments (1) - middle",
        createdAt: "2024-01-15T11:00:00Z",
      },
    ];

    const actual = getLatestCodeRabbitReview(reviews);

    assert.ok(actual?.body.includes("newer"));
  });

  it("ignores reviews from other authors", () => {
    const reviews: Review[] = [
      {
        author: { login: "human" },
        body: "🧹 Nitpick comments (1) - not coderabbit",
        createdAt: "2024-01-15T12:00:00Z",
      },
      {
        author: { login: "coderabbitai" },
        body: "🧹 Nitpick comments (1) - coderabbit",
        createdAt: "2024-01-15T10:00:00Z",
      },
    ];

    const actual = getLatestCodeRabbitReview(reviews);

    assert.ok(actual?.body.includes("coderabbit"));
    assert.equal(actual?.createdAt, "2024-01-15T10:00:00Z");
  });
});

describe("extractNitpickComments", () => {
  it("returns empty array when no reviews exist", () => {
    const actual = extractNitpickComments([]);

    assert.deepEqual(actual, []);
  });

  it("extracts nitpicks from the latest CodeRabbit review", () => {
    const reviews: Review[] = [
      {
        author: { login: "coderabbitai" },
        body: `<details>
<summary>🧹 Nitpick comments (1)</summary><blockquote>
<details><summary>old.ts (1)</summary><blockquote>
\`1\`: **Old issue.**

Old
</blockquote></details>
</blockquote></details>`,
        createdAt: "2024-01-15T10:00:00Z",
      },
      {
        author: { login: "coderabbitai" },
        body: `<details>
<summary>🧹 Nitpick comments (1)</summary><blockquote>
<details><summary>new.ts (1)</summary><blockquote>
\`2\`: **New issue.**

New
</blockquote></details>
</blockquote></details>`,
        createdAt: "2024-01-15T12:00:00Z",
      },
    ];

    const actual = extractNitpickComments(reviews);

    assert.equal(actual.length, 1);
    assert.equal(actual[0].file, "new.ts");
  });
});

describe("extractCodeScanningAlertNumber", () => {
  const testCases = [
    { input: "https://github.com/org/repo/security/code-scanning/123", expected: 123 },
    { input: "See /code-scanning/456 for details", expected: 456 },
    { input: "No alert here", expected: undefined },
    { input: "/code-scanning/", expected: undefined },
  ];

  for (const { input, expected } of testCases) {
    it(`returns ${expected} for "${input.slice(0, 40)}..."`, () => {
      const actual = extractCodeScanningAlertNumber(input);

      assert.equal(actual, expected);
    });
  }
});
