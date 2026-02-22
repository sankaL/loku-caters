"use client";

import React from "react";

interface DashboardCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}

export default function DashboardCard({
  title,
  subtitle,
  children,
  action,
  style,
}: DashboardCardProps) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid var(--color-border)",
        borderRadius: 24,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        boxSizing: "border-box",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 16,
          gap: 12,
        }}
      >
        <div>
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 15,
              fontWeight: 600,
              color: "var(--color-forest)",
              margin: 0,
            }}
          >
            {title}
          </p>
          {subtitle && (
            <p
              style={{
                fontSize: 12,
                color: "var(--color-muted)",
                margin: "2px 0 0",
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}
