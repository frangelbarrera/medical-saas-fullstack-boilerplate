import React from 'react';
import { glass } from '../theme';

interface GCardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  onClick?: () => void;
}

export const GCard: React.FC<GCardProps> = ({ children, style = {}, className = "", onClick }) => (
  <div onClick={onClick} className={className} style={{
    background: glass.card,
    border: `1px solid ${glass.border}`,
    borderRadius: 16,
    backdropFilter: glass.blur,
    WebkitBackdropFilter: glass.blur,
    boxShadow: glass.shadow,
    ...style,
  }}>{children}</div>
);
