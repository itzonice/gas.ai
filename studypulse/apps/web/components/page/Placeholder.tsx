// Temporary screen body until each screen is built (prompts 80–86). Keeps the one-H1 rule.
export function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="sp-page">
      <div>
        <h1
          style={{
            fontSize: "var(--sp-type-page-title-size)",
            lineHeight: "var(--sp-type-page-title-line-height)",
          }}
        >
          {title}
        </h1>
        <p
          style={{
            color: "var(--sp-color-on-surface-variant)",
            margin: "var(--sp-space-related) 0 0",
          }}
        >
          {description}
        </p>
      </div>
    </div>
  );
}
