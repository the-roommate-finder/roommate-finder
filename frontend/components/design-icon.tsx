/* eslint-disable @next/next/no-img-element */
// Preserve the SVG's intrinsic dimensions; the wrapper provides its design slot.
const sizes = {
  'chevron-down': [14, 14], search: [16, 16], location: [11.4998, 13.5002],
  calendar: [16, 16], quote: [29, 29], tick: [24, 24],
  'roommate-divider': [369, 1], 'pricing-divider': [382, 1], 'footer-divider': [1280, 1],
} as const;

export function DesignIcon({ name, className = '' }: { name: keyof typeof sizes; className?: string }) {
  const [width, height] = sizes[name];
  return <span className={`design-icon ${className}`} aria-hidden="true">
    <img src={`/icons/landing/${name}.svg`} width={width} height={height} alt="" />
  </span>;
}
