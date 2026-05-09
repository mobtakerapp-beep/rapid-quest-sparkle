type MathTextProps = {
  text: string | null | undefined;
  className?: string;
};

const arabicDigits = (value: string) => value.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

export function toArabicMath(value: string | null | undefined) {
  return arabicDigits(value || "");
}

export function MathText({ text, className = "" }: MathTextProps) {
  const source = toArabicMath(text);
  const parts = source.split(/(\[[^\]]+\/[^\]]+\]|sqrt\([^)]*\)|√\(?[\d٠-٩]+\)?|[\d٠-٩]+\s*\/\s*[\d٠-٩]+)/gi);

  return (
    <span className={`math-text ${className}`} dir="rtl">
      {parts.map((part, index) => {
        const tplFrac = part.match(/^\[([^\]\/]+)\/([^\]]+)\]$/);
        const frac = tplFrac || part.match(/^([\d٠-٩]+)\s*\/\s*([\d٠-٩]+)$/);
        if (frac) {
          return (
            <span key={index} className="math-fraction" aria-label={`${frac[1]} على ${frac[2]}`}>
              <span>{frac[1]}</span>
              <span>{frac[2]}</span>
            </span>
          );
        }

        const root = part.match(/^sqrt\(([^)]*)\)$/i) || part.match(/^√\(?([\d٠-٩]+)\)?$/);
        if (root) {
          return (
            <span key={index} className="math-root" aria-label={`جذر ${root[1]}`}>
              <span className="math-root-symbol">√</span>
              <span className="math-root-value">{root[1]}</span>
            </span>
          );
        }

        return <span key={index}>{part}</span>;
      })}
    </span>
  );
}