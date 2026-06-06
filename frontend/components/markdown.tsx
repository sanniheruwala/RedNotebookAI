"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { cn } from "@/lib/utils";

type Props = {
  children: string;
  className?: string;
  // "cell" = larger heading scale (for notebook cells)
  // "compact" = smaller scale (for chat bubbles / AI panel)
  variant?: "cell" | "compact";
};

/**
 * Professional markdown renderer used across notebook cells, AI panel, and
 * the knowledge chat. Heading hierarchy maps to a clear visual scale, code
 * blocks get GitHub-style syntax highlighting, GFM tables and task lists
 * render correctly, and links are tasteful.
 */
export function Markdown({ children, className, variant = "cell" }: Props) {
  const base =
    "prose max-w-none dark:prose-invert " +
    // headings
    "prose-headings:font-semibold prose-headings:tracking-tightish prose-headings:scroll-mt-20 " +
    "prose-h1:mt-6 prose-h1:mb-3 prose-h1:border-b prose-h1:border-border/60 prose-h1:pb-2 " +
    "prose-h2:mt-5 prose-h2:mb-2 prose-h3:mt-4 prose-h3:mb-1.5 " +
    "prose-h4:mt-3 prose-h5:mt-3 prose-h6:mt-3 " +
    "prose-h6:uppercase prose-h6:tracking-widest prose-h6:text-muted-foreground prose-h6:text-xs " +
    // paragraphs + lists
    "prose-p:leading-relaxed prose-p:my-2 " +
    "prose-ul:my-2 prose-ol:my-2 prose-li:my-1 " +
    "prose-li:marker:text-muted-foreground " +
    // links
    "prose-a:text-primary prose-a:underline-offset-4 prose-a:decoration-primary/40 hover:prose-a:decoration-primary " +
    // emphasis
    "prose-strong:text-foreground prose-strong:font-semibold " +
    "prose-em:text-foreground/90 " +
    // inline code
    "prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.9em] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none " +
    // code blocks
    "prose-pre:my-3 prose-pre:rounded-xl prose-pre:border prose-pre:bg-muted/40 prose-pre:p-4 prose-pre:text-[12.5px] prose-pre:leading-relaxed " +
    // blockquote
    "prose-blockquote:border-l-2 prose-blockquote:border-primary/40 prose-blockquote:bg-primary/5 prose-blockquote:py-1 prose-blockquote:px-3 prose-blockquote:not-italic prose-blockquote:text-foreground/90 " +
    // hr
    "prose-hr:my-5 prose-hr:border-border " +
    // tables
    "prose-table:my-3 prose-table:w-full prose-table:text-sm " +
    "prose-th:bg-muted/40 prose-th:px-3 prose-th:py-1.5 prose-th:font-semibold prose-th:text-foreground " +
    "prose-td:px-3 prose-td:py-1.5 prose-td:border-border " +
    // images
    "prose-img:rounded-xl prose-img:my-3";

  const sizes =
    variant === "compact"
      ? "prose-sm prose-h1:text-base prose-h2:text-sm prose-h3:text-sm prose-h4:text-xs"
      : "prose-base prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-h4:text-base prose-h5:text-sm";

  return (
    <div className={cn(base, sizes, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeSlug,
          [
            rehypeAutolinkHeadings,
            {
              behavior: "wrap",
              properties: { className: "no-underline hover:text-primary" },
            },
          ],
          [rehypeHighlight, { ignoreMissing: true, detect: true }],
        ]}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          input: ({ node, ...props }) =>
            props.type === "checkbox" ? (
              <input
                {...props}
                disabled
                className="mr-1.5 h-3.5 w-3.5 align-middle accent-primary"
              />
            ) : (
              <input {...props} />
            ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
