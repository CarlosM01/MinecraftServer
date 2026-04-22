import React from 'react';
import { cx } from '@/lib/utils';

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cx(
        'glass-card rounded-xl p-6 transition-all duration-300 hover:border-white/20',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
