type SectionHeadingProps = {
  label: string;
  title: string;
  description: string;
};

export function SectionHeading({
  label,
  title,
  description
}: SectionHeadingProps) {
  return (
    <div className="page-intro">
      <span className="label">{label}</span>
      <h1 className="font-display">{title}</h1>
      <p>{description}</p>
    </div>
  );
}
