import React from 'react';
import { glass } from '../theme';

interface GCardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  onClick?: () => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export const GCard: React.FC<GCardProps> = ({ children, style = {}, className = "", onClick, onMouseEnter, onMouseLeave }) => (
  <div onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} className={className} style={{
    background: glass.card,
    border: `1px solid ${glass.border}`,
    borderRadius: 16,
    backdropFilter: glass.blur,
    WebkitBackdropFilter: glass.blur,
    boxShadow: glass.shadow,
    ...style,
  }}>{children}</div>
);
