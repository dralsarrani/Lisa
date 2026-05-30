import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./MarkdownResponse.css";

interface MarkdownResponseProps {
  content: string;
  className?: string;
}

export function MarkdownResponse({ content, className = "" }: MarkdownResponseProps) {
  return (
    <div className={`md-response ${className}`.trim()}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      // No rehypeRaw — raw HTML is never rendered to prevent XSS.
      components={{
        // Inline code vs fenced code block: distinguished by presence of language-* class.
        code({ className: cls, children }) {
          if (cls?.startsWith("language-")) {
            return <code className={`md-code-block-inner ${cls}`}>{children}</code>;
          }
          return <code className="md-code-inline">{children}</code>;
        },
        pre({ children }) {
          return <pre className="md-pre">{children}</pre>;
        },
        // Open links in a new tab safely — never omit rel on target="_blank".
        a({ href, children }) {
          return (
            <a
              href={href}
              className="md-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          );
        },
        // Headings — scaled down to fit the Console card context.
        h1({ children }) {
          return <h1 className="md-h1">{children}</h1>;
        },
        h2({ children }) {
          return <h2 className="md-h2">{children}</h2>;
        },
        h3({ children }) {
          return <h3 className="md-h3">{children}</h3>;
        },
        blockquote({ children }) {
          return <blockquote className="md-blockquote">{children}</blockquote>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
}
