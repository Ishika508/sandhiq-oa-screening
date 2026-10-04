export default function StepFrame({ icon: Icon, title, subtitle, reference, children, footer }) {
  return (
    <div className="card">
      <div className="flex items-start gap-3 mb-5">
        {Icon && (
          <div className="icon-tile">
            <Icon size={20} />
          </div>
        )}
        <div>
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>

      {children}

      {reference && (
        <p className="text-[11px] text-slate-400 mt-6 border-t border-slate-200/70 pt-3">
          Reference: {reference}
        </p>
      )}

      {footer}
    </div>
  );
}
