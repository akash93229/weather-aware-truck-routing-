export default function PanelShell({
  id,
  title,
  subtitle,
  icon,
  onClose,
  children,
  className = '',
  headerAction,
}) {
  return (
    <section className={`panel-shell ${className}`} id={id} aria-label={title}>
      <header className="panel-shell-header">
        <div className="panel-shell-header-left">
          {icon && (
            <span className="panel-shell-icon" aria-hidden="true">
              {icon}
            </span>
          )}
          <div className="panel-shell-titles">
            <h2 className="panel-shell-title">{title}</h2>
            {subtitle && (
              <p className="panel-shell-subtitle" title={subtitle}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <div className="panel-shell-header-right">
          {headerAction}
          {onClose && (
            <button
              type="button"
              className="icon-btn panel-shell-close-btn"
              onClick={onClose}
              title={`Close ${title}`}
              aria-label={`Close ${title}`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </header>
      <div className="panel-shell-body">{children}</div>
    </section>
  );
}
