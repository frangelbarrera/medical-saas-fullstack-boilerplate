import React from 'react';
import { accent, accentB, danger, success, text1, text2, text3 } from '../theme';

interface ATagProps {
  type: 'read' | 'write' | 'create' | 'export' | 'alert' | 'sign';
}

export const ATag: React.FC<ATagProps> = ({ type }) => {
  const map: Record<string, [string, string]> = {
    read:   [accentB,    "Read"],
    write:  ["rgba(255,255,255,0.5)",  "Write"],
    create: [success,    "Create"],
    export: [accent,     "Export"],
    alert:  [danger,     "Alert"],
    sign:   ["rgba(255,255,255,0.7)",  "Sign"],
  };
  const [col, label] = map[type] || [text3, "—"];
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
      padding: "2px 8px", borderRadius: 99,
      background: "rgba(255,255,255,0.05)", color: text2, border: `1px solid rgba(255,255,255,0.1)`,
    }}>{label}</span>
  );
};

interface SPillProps {
  s: 'Active' | 'Urgent' | 'Inactive';
}

export const SPill: React.FC<SPillProps> = ({ s }) => {
  const m: Record<string, [string, string]> = { 
    Active:[success,"rgba(0,230,118,0.1)"], 
    Urgent:[danger,"rgba(255,77,77,0.1)"], 
    Inactive:[text3,"rgba(255,255,255,0.05)"] 
  };
  const [col, bg] = m[s] || [text3, "transparent"];
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
      background: bg, color: col, border: `1px solid ${col}33`,
    }}>{s}</span>
  );
};
