import React from 'react';
import { cn } from '@/lib/utils';

interface WaveHeaderProps {
  title: string;
  subtitle?: string;
  containerClassName?: string;
  titleClassName?: string;
  subtitleClassName?: string;
}

const WaveHeader: React.FC<WaveHeaderProps> = ({
  title,
  subtitle,
  containerClassName,
  titleClassName,
  subtitleClassName,
}) => {
  return (
    <div className={cn('wave-header relative pb-12', containerClassName)}>
      <div className="px-6 pt-12 pb-4">
        <h1 className={cn('text-3xl font-bold font-display', titleClassName)}>{title}</h1>
        {subtitle && (
          <p className={cn('mt-1 text-sm opacity-80', subtitleClassName)}>{subtitle}</p>
        )}
      </div>
      <svg
        className="absolute bottom-0 left-0 w-full"
        viewBox="0 0 400 40"
        preserveAspectRatio="none"
        style={{ height: '40px' }}
      >
        <path
          d="M0,20 Q100,40 200,20 Q300,0 400,20 L400,40 L0,40 Z"
          fill="hsl(var(--background))"
        />
      </svg>
    </div>
  );
};

export default WaveHeader;
