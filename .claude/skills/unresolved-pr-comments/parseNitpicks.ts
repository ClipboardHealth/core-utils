// Matches file sections inside the nitpick block: <details><summary>filename.ext (count)</summary><blockquote>...</blockquote></details>
const FILE_SECTION_REGEX =
  /<details>\s*<summary>([^<]+\.[^<]+)\s+\(\d+\)<\/summary>\s*<blockquote>([\s\S]*?)<\/blockquote>\s*<\/details>/g;

// Matches individual comments: `line-range`: **title** body
// Stops at: horizontal rule, next comment, end of blockquote section, or end of string
const COMMENT_REGEX =
  /`(\d+(?:-\d+)?)`:\s*\*\*([^*]+)\*\*\s*([\s\S]*?)(?=---|\n`\d|<\/blockquote>|$)/g;

export const NITPICK_SECTION_MARKER = "Nitpick comments";

export interface Review {
  author: { login: string } | null;
  body: string;
  createdAt: string;
}

export interface NitpickComment {
  author: string;
  body: string;
  createdAt: string;
  file: string;
  line: string;
}

export function cleanCommentBody(body: string): string {
  // Remove details elements iteratively to handle nested elements
  let result = body;
  let previousResult = "";
  while (result !== previousResult) {
    previousResult = result;
    // Match innermost details elements first (those without nested details)
    result = result.replaceAll(/<details>(?:(?!<details>)[\s\S])*?<\/details>/g, "");
  }

  return result.replaceAll("<", "&lt;").replaceAll(">", "&gt;").trim();
}

interface BlockquoteTag {
  index: number;
  isOpen: boolean;
}

function findMatchingBlockquoteEnd(content: string): number | undefined {
  const openTag = /<blockquote>/gi;
  const closeTag = /<\/blockquote>/gi;

  const tags: BlockquoteTag[] = [];

  let match: RegExpExecArray | null;
  while ((match = openTag.exec(content)) !== null) {
    tags.push({ index: match.index, isOpen: true });
  }
  while ((match = closeTag.exec(content)) !== null) {
    tags.push({ index: match.index, isOpen: false });
  }

  tags.sort((a, b) => a.index - b.index);

  let depth = 1;
  for (const tag of tags) {
    depth += tag.isOpen ? 1 : -1;
    if (depth === 0) {
      return tag.index;
    }
  }

  return undefined;
}

export function extractNitpickSectionContent(body: string): string | undefined {
  const startPattern = /<summary>🧹 Nitpick comments \(\d+\)<\/summary>\s*<blockquote>/i;
  const startMatch = startPattern.exec(body);
  if (!startMatch) {
    return undefined;
  }

  const contentStart = startMatch.index + startMatch[0].length;
  const afterStart = body.slice(contentStart);

  const endPosition = findMatchingBlockquoteEnd(afterStart);
  if (endPosition === undefined) {
    return undefined;
  }

  return afterStart.slice(0, endPosition);
}

export function parseCommentsFromFileSection(
  fileContent: string,
  fileName: string,
  review: Review,
): NitpickComment[] {
  return [...fileContent.matchAll(COMMENT_REGEX)].map((match) => {
    const lineRange = match[1];
    const title = match[2].trim();
    const cleanBody = cleanCommentBody(match[3].trim());

    return {
      author: review.author?.login ?? "deleted-user",
      body: `${title}\n\n${cleanBody}`,
      createdAt: review.createdAt,
      file: fileName,
      line: lineRange,
    };
  });
}

export function extractNitpicksFromReview(review: Review): NitpickComment[] {
  if (!review.body.includes(NITPICK_SECTION_MARKER)) {
    return [];
  }

  const nitpickContent = extractNitpickSectionContent(review.body);
  if (!nitpickContent) {
    return [];
  }

  const fileSections = [...nitpickContent.matchAll(FILE_SECTION_REGEX)];

  return fileSections.flatMap((fileMatch) => {
    const fileName = fileMatch[1].trim();
    const fileContent = fileMatch[2];
    return parseCommentsFromFileSection(fileContent, fileName, review);
  });
}

export function getLatestCodeRabbitReview(reviews: Review[]): Review | undefined {
  return [...reviews]
    .filter(
      (review) =>
        review.author?.login === "coderabbitai" && review.body.includes(NITPICK_SECTION_MARKER),
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

export function extractNitpickComments(reviews: Review[]): NitpickComment[] {
  const latestReview = getLatestCodeRabbitReview(reviews);
  return latestReview ? extractNitpicksFromReview(latestReview) : [];
}

export function extractCodeScanningAlertNumber(body: string): number | undefined {
  const match = /\/code-scanning\/(\d+)/.exec(body);
  return match ? Number.parseInt(match[1], 10) : undefined;
}
