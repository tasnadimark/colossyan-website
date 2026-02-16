const pluginTOC = require("eleventy-plugin-toc");
const markdownIt = require("markdown-it");
const markdownItAnchor = require("markdown-it-anchor");

module.exports = function (eleventyConfig) {
  // Input/output
  eleventyConfig.addPassthroughCopy({ "src/css": "css" });
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  // Markdown: add id attributes to headings for TOC links
  const md = markdownIt({ html: true }).use(markdownItAnchor, {
    slugify: (s) =>
      s
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]/g, ""),
    permalink: false,
  });
  eleventyConfig.setLibrary("md", md);

  // TOC plugin: generate sidebar from h2/h3
  eleventyConfig.addPlugin(pluginTOC, {
    tags: ["h2", "h3"],
    wrapper: "ul",
    wrapperClass: "sidebar-links",
  });

  // Format date for display (e.g. "Feb 2, 2026")
  eleventyConfig.addFilter("readableDate", (dateObj) => {
    if (!dateObj) return "";
    const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  });

  // Estimate reading time from content (word count / ~200 wpm)
  eleventyConfig.addFilter("readingTime", (content) => {
    if (!content) return "0 min read";
    const html = typeof content === "string" ? content : "";
    const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    const words = text.trim().split(/\s/).filter(Boolean).length;
    const mins = Math.max(1, Math.ceil(words / 200));
    return `${mins} min read`;
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
    },
  };
};
