#!/usr/bin/env node

/**
 * Webflow Blog CSV → Eleventy Markdown Importer
 *
 * Usage:
 *   node scripts/import-webflow.js <path-to-csv>
 *
 * Reads a Webflow blog export CSV and generates one .md file per post
 * in src/blog/, with front matter and converted HTML→Markdown content.
 *
 * Skips archived and draft posts by default (use --include-drafts to override).
 * Handles 500+ posts efficiently using streaming CSV parsing.
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Lightweight CSV parser (handles quoted fields with commas & newlines)
// ---------------------------------------------------------------------------
function parseCSV(text) {
  const rows = [];
  let i = 0;
  const len = text.length;

  function parseField() {
    if (i >= len || text[i] === "\n" || text[i] === "\r") return "";
    if (text[i] === '"') {
      i++; // skip opening quote
      let field = "";
      while (i < len) {
        if (text[i] === '"') {
          if (i + 1 < len && text[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          field += text[i];
          i++;
        }
      }
      return field;
    } else {
      let field = "";
      while (i < len && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") {
        field += text[i];
        i++;
      }
      return field;
    }
  }

  while (i < len) {
    const row = [];
    while (true) {
      row.push(parseField());
      if (i < len && text[i] === ",") {
        i++; // skip comma
        continue;
      }
      break;
    }
    // skip line ending
    if (i < len && text[i] === "\r") i++;
    if (i < len && text[i] === "\n") i++;
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// HTML → Markdown converter (covers the Webflow rich text patterns)
// ---------------------------------------------------------------------------
function htmlToMarkdown(html) {
  if (!html) return "";

  let md = html;

  // Normalize line breaks
  md = md.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Convert Webflow figure/image blocks
  md = md.replace(
    /<figure[^>]*>[\s\S]*?<img\s+src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>[\s\S]*?<\/figure>/gi,
    (_, src, alt) => `\n\n![${alt}](${src})\n\n`
  );

  // Standalone images (not inside figures)
  md = md.replace(
    /<img\s+[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi,
    (_, src, alt) => `![${alt}](${src})`
  );
  md = md.replace(
    /<img\s+[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*\/?>/gi,
    (_, alt, src) => `![${alt}](${src})`
  );

  // Headings
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n\n");
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n\n### $1\n\n");
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n\n#### $1\n\n");

  // Bold and italic
  md = md.replace(/<strong>([\s\S]*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b>([\s\S]*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em>([\s\S]*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i>([\s\S]*?)<\/i>/gi, "*$1*");

  // Links
  md = md.replace(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");

  // Unordered lists
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) => {
    const items = inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (__, content) => {
      return `- ${content.trim()}\n`;
    });
    return "\n\n" + items + "\n";
  });

  // Ordered lists
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
    let index = 0;
    const items = inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (__, content) => {
      index++;
      return `${index}. ${content.trim()}\n`;
    });
    return "\n\n" + items + "\n";
  });

  // Tables
  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, tableInner) => {
    const rows = [];
    const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowPattern.exec(tableInner)) !== null) {
      const cells = [];
      const cellPattern = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
      let cellMatch;
      while ((cellMatch = cellPattern.exec(rowMatch[1])) !== null) {
        cells.push(cellMatch[1].replace(/<[^>]*>/g, "").trim());
      }
      rows.push(cells);
    }
    if (rows.length === 0) return "";
    const colCount = Math.max(...rows.map((r) => r.length));
    const mdRows = rows.map((r) => {
      while (r.length < colCount) r.push("");
      return "| " + r.join(" | ") + " |";
    });
    // Insert separator after header row
    const sep = "| " + Array(colCount).fill("---").join(" | ") + " |";
    mdRows.splice(1, 0, sep);
    return "\n\n" + mdRows.join("\n") + "\n\n";
  });

  // Blockquotes
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content) => {
    const lines = content.replace(/<[^>]*>/g, "").trim().split("\n");
    return "\n\n" + lines.map((l) => `> ${l.trim()}`).join("\n") + "\n\n";
  });

  // Line breaks
  md = md.replace(/<br\s*\/?>/gi, "\n");

  // Paragraphs
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n\n$1\n\n");

  // Divs (strip)
  md = md.replace(/<\/?div[^>]*>/gi, "");

  // Strip remaining tags
  md = md.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  md = md.replace(/&amp;/g, "&");
  md = md.replace(/&lt;/g, "<");
  md = md.replace(/&gt;/g, ">");
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");
  md = md.replace(/&rsquo;/g, "'");
  md = md.replace(/&lsquo;/g, "'");
  md = md.replace(/&rdquo;/g, '"');
  md = md.replace(/&ldquo;/g, '"');
  md = md.replace(/&mdash;/g, "—");
  md = md.replace(/&ndash;/g, "–");
  md = md.replace(/&nbsp;/g, " ");
  md = md.replace(/&hellip;/g, "…");

  // Unescape doubled quotes from CSV
  md = md.replace(/""/g, '"');

  // Clean up excessive blank lines
  md = md.replace(/\n{3,}/g, "\n\n");

  return md.trim();
}

// ---------------------------------------------------------------------------
// Slug helpers
// ---------------------------------------------------------------------------
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function authorSlugToName(slug) {
  if (!slug) return "Colossyan Team";
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Escape YAML strings (wrap in quotes if special chars present)
// ---------------------------------------------------------------------------
function yamlStr(val) {
  if (!val) return '""';
  const s = val.replace(/"/g, '\\"');
  if (/[:#{}\[\],&*?|>!%@`]/.test(s) || s.startsWith("-") || s.startsWith(" ")) {
    return `"${s}"`;
  }
  return `"${s}"`;
}

// ---------------------------------------------------------------------------
// Format date as YYYY-MM-DD
// ---------------------------------------------------------------------------
function formatDate(dateStr) {
  if (!dateStr) return new Date().toISOString().slice(0, 10);
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Insert {% cta %} shortcode after the second h2 in the markdown
// ---------------------------------------------------------------------------
function insertCtaAfterSecondHeading(md) {
  const h2Pattern = /^## .+$/gm;
  const matches = [];
  let match;
  while ((match = h2Pattern.exec(md)) !== null) {
    matches.push({ index: match.index, end: match.index + match[0].length });
  }
  if (matches.length >= 2) {
    const insertAt = matches[1].end;
    return md.slice(0, insertAt) + "\n\n{% cta %}" + md.slice(insertAt);
  }
  // If fewer than 2 headings, append at the end
  return md + "\n\n{% cta %}\n";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const includeDrafts = args.includes("--include-drafts");
  const overwrite = args.includes("--overwrite");
  const csvPath = args.find((a) => !a.startsWith("--"));

    if (!csvPath) {
    console.error("Usage: node scripts/import-webflow.js <path-to-csv> [--include-drafts] [--overwrite]");
    process.exit(1);
  }

  const outputDir = path.join(__dirname, "..", "src", "blog");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`Reading CSV: ${csvPath}`);
  const raw = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCSV(raw);

  if (rows.length < 2) {
    console.error("CSV appears empty or has no data rows.");
    process.exit(1);
  }

  const headers = rows[0].map((h) => h.trim());
  const colIndex = (name) => headers.indexOf(name);

  // Map column names to indices
  const COL = {
    name: colIndex("Name"),
    slug: colIndex("Slug"),
    archived: colIndex("Archived"),
    draft: colIndex("Draft"),
    metaTitle: colIndex("Meta Title"),
    author: colIndex("Authorr") !== -1 ? colIndex("Authorr") : colIndex("Author"),
    summary: colIndex("Post Summary"),
    mainImage: colIndex("Main Image"),
    publishDate: colIndex("Publish date"),
    richText: colIndex("Rich text"),
    metaDescription: colIndex("Meta Description"),
    category: colIndex("What is the Category?"),
    faqQ1: colIndex("FAQ Question 1"),
    faqA1: colIndex("FAQ Answer 1"),
    faqQ2: colIndex("FAQ Question 2"),
    faqA2: colIndex("FAQ Answer 2"),
    faqQ3: colIndex("FAQ Question 3"),
    faqA3: colIndex("FAQ Answer 3"),
    faqQ4: colIndex("FAQ Question 4"),
    faqA4: colIndex("FAQ Answer 4"),
    faqQ5: colIndex("FAQ Question 5"),
    faqA5: colIndex("FAQ Answer 5"),
  };

  let created = 0;
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 5) continue;

    const get = (col) => (col >= 0 && col < row.length ? row[col].trim() : "");

    // Skip archived / draft
    if (get(COL.archived) === "true") {
      skipped++;
      continue;
    }
    if (!includeDrafts && get(COL.draft) === "true") {
      skipped++;
      continue;
    }

    const name = get(COL.name);
    const slug = get(COL.slug) || slugify(name);
    const title = get(COL.metaTitle) || name;
    const author = authorSlugToName(get(COL.author));
    const description = get(COL.metaDescription) || get(COL.summary) || "";
    const mainImage = get(COL.mainImage);
    const publishDate = formatDate(get(COL.publishDate));
    const richText = get(COL.richText);
    const category = get(COL.category);

    // Collect FAQ pairs
    const faqs = [];
    for (let f = 1; f <= 5; f++) {
      const q = get(COL[`faqQ${f}`]);
      const a = get(COL[`faqA${f}`]);
      if (q) faqs.push({ question: q, answer: a || "" });
    }

    if (!name && !richText) {
      skipped++;
      continue;
    }

    // Convert HTML body to Markdown
    let body = htmlToMarkdown(richText);
    body = insertCtaAfterSecondHeading(body);

    // Build front matter
    const lines = [
      "---",
      `title: ${yamlStr(title)}`,
      `author: ${yamlStr(author)}`,
      `date: ${publishDate}`,
      `description: ${yamlStr(description)}`,
    ];

    if (mainImage) {
      lines.push(`featuredImage: ${yamlStr(mainImage)}`);
    }

    if (category) {
      lines.push(`blogTags:`);
      lines.push(`  - ${yamlStr(category)}`);
    }

    if (faqs.length > 0) {
      lines.push(`faqs:`);
      for (const faq of faqs) {
        lines.push(`  - question: ${yamlStr(faq.question)}`);
        lines.push(`    answer: ${yamlStr(faq.answer)}`);
      }
    }

    lines.push("---");

    const content = lines.join("\n") + "\n\n" + body + "\n";

    // Write file
    const filename = `${slug}.md`;
    const filepath = path.join(outputDir, filename);

    if (!overwrite && fs.existsSync(filepath)) {
      skipped++;
      continue;
    }

    fs.writeFileSync(filepath, content, "utf-8");
    created++;

    if (created % 50 === 0) {
      console.log(`  ...${created} posts created`);
    }
  }

  console.log(`\nDone! ${created} posts created, ${skipped} skipped.`);
  console.log(`Output: ${outputDir}/`);
}

main();
