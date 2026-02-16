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

  // CTA banner shortcode: reads from post front matter with defaults
  eleventyConfig.addShortcode("cta", function () {
    const heading = this.ctx.ctaHeading || "Try out the best video generator";
    const subtitle = this.ctx.ctaSubtitle || "Check out our AI video generator with 100+ realistic avatars";
    const btnText = this.ctx.ctaButtonText || "Book a demo";
    const btnUrl = this.ctx.ctaButtonUrl || "#";
    const image = this.ctx.ctaImage || "/assets/cta-image.jpg";

    return `<div class="cta-banner cta-banner--inline">
  <div class="cta-content">
    <div class="cta-text">
      <h3 class="cta-heading">${heading}</h3>
      <p class="cta-subtitle">${subtitle}</p>
    </div>
    <a href="${btnUrl}" class="btn btn-light">${btnText}</a>
  </div>
  <div class="cta-image-wrapper">
    <img src="${image}" alt="${heading}" class="cta-image">
  </div>
</div>`;
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
    },
    markdownTemplateEngine: "njk",
  };
};
