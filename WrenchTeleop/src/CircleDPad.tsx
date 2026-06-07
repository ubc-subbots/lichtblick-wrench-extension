import { ReactElement } from "react";
import { HeldButton } from "./types";

type DPadProps = {
  heldButton: HeldButton;
  onButtonDown: (button: NonNullable<HeldButton>) => void;
  onButtonUp: () => void;
  size?: number
};

export function CircleDPad({ heldButton, onButtonDown, onButtonUp, size = 280}: DPadProps): ReactElement {
  const SIZE = size
  const CENTER = SIZE / 2;
  const OUTER = SIZE * 0.46;
  const INNER = SIZE * 0.15;

  const toRad = (d: number) => (d * Math.PI) / 180;

  const wedge = (startDeg: number, endDeg: number): string => {
    const ox1 = CENTER + OUTER * Math.cos(toRad(startDeg));
    const oy1 = CENTER + OUTER * Math.sin(toRad(startDeg));
    const ox2 = CENTER + OUTER * Math.cos(toRad(endDeg));
    const oy2 = CENTER + OUTER * Math.sin(toRad(endDeg));
    const ix1 = CENTER + INNER * Math.cos(toRad(endDeg));
    const iy1 = CENTER + INNER * Math.sin(toRad(endDeg));
    const ix2 = CENTER + INNER * Math.cos(toRad(startDeg));
    const iy2 = CENTER + INNER * Math.sin(toRad(startDeg));
    return [
      `M ${ox1} ${oy1}`,
      `A ${OUTER} ${OUTER} 0 0 1 ${ox2} ${oy2}`,
      `L ${ix1} ${iy1}`,
      `A ${INNER} ${INNER} 0 0 0 ${ix2} ${iy2}`,
      "Z",
    ].join(" ");
  };

  const labelPos = (startDeg: number, endDeg: number) => {
    const mid = (startDeg + endDeg) / 2;
    const r = INNER + (OUTER - INNER) * 0.55;
    return {
      x: CENTER + r * Math.cos(toRad(mid)),
      y: CENTER + r * Math.sin(toRad(mid)),
    };
  };

  const wedges: { button: NonNullable<HeldButton>; start: number; end: number; label: string; sublabel: string }[] = [
    { button: "forward",  start: 225, end: 315, label: "▲", sublabel: "W" },
    { button: "right",    start: 315, end: 405, label: "▶", sublabel: "D" },
    { button: "backward", start: 45,  end: 135, label: "▼", sublabel: "S" },
    { button: "left",     start: 135, end: 225, label: "◀", sublabel: "A" },
  ];

  const handleProps = (button: NonNullable<HeldButton>) => ({
    onMouseDown: () => onButtonDown(button),
    onMouseUp: onButtonUp,
    onMouseLeave: heldButton === button ? onButtonUp : undefined,
    onTouchStart: (e: React.TouchEvent) => { e.preventDefault(); onButtonDown(button); },
    onTouchEnd: onButtonUp,
  });

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{ touchAction: "none", userSelect: "none", flexShrink: 0 }}
    >
      {wedges.map(({ button, start, end, label, sublabel }) => {
        const active = heldButton === button;
        const pos = labelPos(start, end);
        return (
          <g key={button}>
            <path
              d={wedge(start, end)}
              fill={active ? "#0078d4" : "#1e1e1e"}
              stroke={active ? "#4db3ff" : "#333"}
              strokeWidth="1.5"
              style={{ cursor: "pointer" }}
              {...handleProps(button)}
            />
            <text x={pos.x} y={pos.y - 6} textAnchor="middle" dominantBaseline="central"
              fontSize="20" fill={active ? "#fff" : "#aaa"} style={{ pointerEvents: "none" }}>
              {label}
            </text>
            <text x={pos.x} y={pos.y + 10} textAnchor="middle" dominantBaseline="central"
              fontSize="13" fill={active ? "#cce4ff" : "#555"} style={{ pointerEvents: "none" }}>
              {sublabel}
            </text>
          </g>
        );
      })}

      {/* Center: up (Q) top half, down (Z) bottom half */}
      <path
        d={`M ${CENTER - INNER + 2} ${CENTER} A ${INNER - 2} ${INNER - 2} 0 0 1 ${CENTER + INNER - 2} ${CENTER} Z`}
        fill={heldButton === "up" ? "#0078d4" : "#1e1e1e"}
        stroke={heldButton === "up" ? "#4db3ff" : "#333"}
        strokeWidth="1"
        style={{ cursor: "pointer" }}
        {...handleProps("up")}
      />
      <text x={CENTER} y={CENTER - 9} textAnchor="middle" dominantBaseline="central"
        fontSize="11" fill={heldButton === "up" ? "#fff" : "#666"} style={{ pointerEvents: "none" }}>Q↑</text>

      <path
        d={`M ${CENTER - INNER + 2} ${CENTER} A ${INNER - 2} ${INNER - 2} 0 0 0 ${CENTER + INNER - 2} ${CENTER} Z`}
        fill={heldButton === "down" ? "#0078d4" : "#181818"}
        stroke={heldButton === "down" ? "#4db3ff" : "#2a2a2a"}
        strokeWidth="1"
        style={{ cursor: "pointer" }}
        {...handleProps("down")}
      />
      <text x={CENTER} y={CENTER + 9} textAnchor="middle" dominantBaseline="central"
        fontSize="11" fill={heldButton === "down" ? "#fff" : "#555"} style={{ pointerEvents: "none" }}>Z↓</text>
    </svg>
  );
}
