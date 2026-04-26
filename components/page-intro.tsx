import type { ReactNode } from "react";

type PageIntroProps = {
  label: string;
  title: string;
  description: string;
  actions?: ReactNode;
};

export function PageIntro({
  label,
  title,
  description,
  actions
}: PageIntroProps) {
  return (
    <div className="page-intro">
      <span className="label">{label}</span>
      <h1>{title}</h1>
      <p>{description}</p>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}
