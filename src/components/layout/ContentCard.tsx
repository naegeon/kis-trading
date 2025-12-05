import { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ContentCardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
  headerAction?: ReactNode;
}

export function ContentCard({
  children,
  className,
  title,
  description,
  headerAction,
}: ContentCardProps) {
  return (
    <Card className={cn('p-6', className)}>
      {(title || description || headerAction) && (
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              {title && (
                <h3 className="text-lg font-semibold">{title}</h3>
              )}
              {description && (
                <p className="text-sm text-muted-foreground">{description}</p>
              )}
            </div>
            {headerAction && <div>{headerAction}</div>}
          </div>
        </div>
      )}
      {children}
    </Card>
  );
}
