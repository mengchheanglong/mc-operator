"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { GraphDocumentNode } from "@/types/document";

export default function GraphDocumentNode({
  data,
  selected,
}: NodeProps<GraphDocumentNode>) {
  const isEmphasized = data.isActive || selected;
  const isRelated = data.isConnected;
  const displayTitle = String(data.displayTitle || data.title);
  const labelLines = displayTitle.split("\n");
  const dotScale =
    data.kind === "project"
      ? 1.9
      : data.kind === "workspace-project"
        ? 1.64
        : data.kind === "topic"
          ? 1.55
          : 1.22;
  const dotSize = Math.max(5, Math.min(15, Math.round(data.radius * dotScale)));
  const labelSize =
    data.kind === "project"
      ? "text-[11px]"
      : data.kind === "workspace-project"
        ? "text-[9px]"
        : data.kind === "topic"
          ? "text-[9px]"
          : "text-[8px]";
  const labelWidth = Math.max(
    data.kind === "project"
      ? 72
      : data.kind === "workspace-project"
        ? 68
        : data.kind === "topic"
          ? 62
          : 54,
    labelLines.reduce((max, line) => Math.max(max, line.length), 0) *
      (data.kind === "project"
        ? 6.2
        : data.kind === "workspace-project"
          ? 5.8
          : data.kind === "topic"
            ? 5.6
            : 5.1) +
      14,
  );
  const labelHeight = Math.max(14, labelLines.length * (data.kind === "project" ? 15 : 13));
  const frameWidth = Math.max(dotSize + 6, labelWidth);
  const frameHeight = dotSize + labelHeight + 10;
  const centerX = frameWidth / 2;
  const dotLeft = (frameWidth - dotSize) / 2;
  const dotCenterY = dotSize / 2;
  const handleStyle = {
    top: dotCenterY,
    left: centerX,
    transform: "translate(-50%, -50%)",
  } as const;

  const baseTone =
    data.kind === "project"
      ? isEmphasized
        ? "bg-[#f7f8fb] mc-shadow-glow-slate"
        : isRelated
          ? "bg-[#d8dde8] mc-shadow-md"
          : "bg-[#9ca4b0] mc-shadow-sm"
      : data.kind === "workspace-project"
        ? isEmphasized
          ? "bg-[#9bc7ff] mc-shadow-glow-blue"
          : isRelated
            ? "bg-[#7fa4d3] mc-shadow-md"
            : "bg-[#5d728f] mc-shadow-sm"
      : data.kind === "topic"
        ? isEmphasized
          ? "bg-[#e7c57a] mc-shadow-glow-amber"
          : isRelated
            ? "bg-[#c8aa67] mc-shadow-md"
            : "bg-[#8e7749] mc-shadow-sm"
        : isEmphasized
          ? "bg-[#f2f3f6] mc-shadow-glow-slate"
          : isRelated
            ? "bg-[#afb3bc] mc-shadow-md"
            : "bg-[#70747d] mc-shadow-sm";

  const labelTone =
    isEmphasized
      ? "text-white"
      : isRelated
        ? "text-[#d9dce3]"
        : data.kind === "project"
          ? "text-[rgba(238,241,245,0.8)]"
          : data.kind === "workspace-project"
            ? "text-[rgba(205,220,242,0.72)]"
          : data.kind === "topic"
            ? "text-[rgba(233,221,191,0.76)]"
            : "text-[rgba(223,226,232,0.58)]";

  return (
    <div
      className="graph-obsidian-node relative"
      style={{ width: frameWidth, height: frameHeight }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={handleStyle}
        className="!h-2 !w-2 !border-0 !bg-transparent"
      />

      <div
        className={[
          "graph-obsidian-node__dot absolute top-0 rounded-full transition-all duration-200",
          baseTone,
        ].join(" ")}
        style={{ width: dotSize, height: dotSize, left: dotLeft }}
      />

      <div
        className={[
          "absolute left-1/2 -translate-x-1/2 text-center leading-[1.08] transition-all duration-200",
          labelSize,
          labelTone,
        ].join(" ")}
        style={{ top: dotSize + 6, width: labelWidth }}
      >
        {labelLines.map((line, index) => (
          <div key={`${line}-${index}`} className="px-1">
            {line}
          </div>
        ))}
      </div>

      <div className="sr-only">
        <div>{data.title}</div>
        <div>{data.kind}</div>
        <div>
          {data.outgoingCount} outgoing, {data.incomingCount} incoming
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Top}
        style={handleStyle}
        className="!h-2 !w-2 !border-0 !bg-transparent"
      />
    </div>
  );
}
