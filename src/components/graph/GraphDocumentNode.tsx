"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { GraphDocumentNode } from "@/types/document";

export default function GraphDocumentNode({
  data,
  selected,
}: NodeProps<GraphDocumentNode>) {
  const isEmphasized = data.isActive || selected;
  const isRelated = data.isConnected;
  const dotSize = Math.max(4, Math.min(8, Math.round(data.radius * 1.25)));
  const labelWidth = Math.max(22, data.title.length * 4.3 + 6);
  const frameWidth = Math.max(dotSize + 4, labelWidth);
  const frameHeight = dotSize + 13;
  const centerX = frameWidth / 2;
  const dotLeft = (frameWidth - dotSize) / 2;
  const dotCenterY = dotSize / 2;
  const handleStyle = {
    top: dotCenterY,
    left: centerX,
    transform: "translate(-50%, -50%)",
  } as const;

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
          isEmphasized
            ? "bg-[#f2f3f6] shadow-[0_0_8px_rgba(242,243,246,0.28)]"
            : isRelated
              ? "bg-[#afb3bc] shadow-[0_0_6px_rgba(175,179,188,0.22)]"
              : "bg-[#70747d] shadow-[0_0_4px_rgba(112,116,125,0.18)]",
        ].join(" ")}
        style={{ width: dotSize, height: dotSize, left: dotLeft }}
      />

      <div
        className={[
          "absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center text-[8px] leading-none transition-all duration-200",
          isEmphasized
            ? "text-white"
            : isRelated
              ? "text-[#d9dce3]"
              : "text-[rgba(223,226,232,0.58)]",
        ].join(" ")}
        style={{ top: dotSize + 3, width: labelWidth }}
      >
        {data.title}
      </div>

      <div className="sr-only">
        <div>{data.title}</div>
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
