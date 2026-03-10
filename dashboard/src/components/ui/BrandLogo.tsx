import { cn } from '@/lib/cn';
import { useTranslation } from 'react-i18next';

interface BrandLogoProps {
  collapsed?: boolean;
  className?: string;
}

export function BrandLogo({ collapsed = false, className }: BrandLogoProps) {
  const { t } = useTranslation();

  return (
    <div
      className={cn('brand-mark', className)}
      aria-label={collapsed ? t('shell.brandName') : t('common.brandLogoLabel')}
      role="img"
    >
      <span className={collapsed ? 'brand-mark__letter brand-mark__letter--compact' : 'brand-mark__letter'}>
        A
      </span>
    </div>
  );
}
