interface BrandLogoProps {
  collapsed?: boolean;
}

export function BrandLogo({ collapsed = false }: BrandLogoProps) {
  return (
    <div
      className="brand-mark"
      aria-label={collapsed ? 'Agora' : 'Agora Operational Commons'}
      role="img"
    >
      <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-7 w-7">
        <rect x="1" y="1" width="26" height="26" rx="9" className="brand-mark__frame" />
        <path d="M7 18.5C8.9 15.6 11 14 14 14s5.1 1.6 7 4.5" className="brand-mark__line" />
        <path d="M8.8 15.2c1.3-2 2.9-3 5.2-3s3.9 1 5.2 3" className="brand-mark__line brand-mark__line--muted" />
        <path d="M10.7 12.2c.9-1.1 1.9-1.7 3.3-1.7s2.4.6 3.3 1.7" className="brand-mark__line brand-mark__line--muted" />
        <path d="M14 8.2v10.1" className="brand-mark__spine" />
        <circle cx="14" cy="8.2" r="1.8" className="brand-mark__node" />
      </svg>
    </div>
  );
}
