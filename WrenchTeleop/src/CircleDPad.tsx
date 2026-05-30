import { ReactElement } from "react";
import { HeldButton } from "./types";

type DPadProps = {
  heldButton: HeldButton;
  onButtonDown: (button: NonNullable<HeldButton>) => void;
  onButtonUp: () => void;
};

export function CircleDPad({ heldButton, onButtonDown, onButtonUp }: DPadProps): ReactElement {
  const SIZE = 360;
  const CENTER = SIZE / 2;
  const OUTER = SIZE * 0.45;
  const INNER = SIZE * 0.14;
  const GAP = 0;

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
    const r = INNER + (OUTER - INNER) * 0.58;
    return {
      x: CENTER + r * Math.cos(toRad(mid)),
      y: CENTER + r * Math.sin(toRad(mid)),
    };
  };

  const wedges: { button: NonNullable<HeldButton>; start: number; end: number; label: string }[] = [
    { button: "forward", start: 225 + GAP, end: 315 - GAP, label: "▲" },
    { button: "right", start: 315 + GAP, end: 405 - GAP, label: "▶" },
    { button: "backward", start: 45 + GAP, end: 135 - GAP, label: "▼" },
    { button: "left", start: 135 + GAP, end: 225 - GAP, label: "◀" },
  ];

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{ touchAction: "none", userSelect: "none" }}
    >
      {/* Directional wedges */}
      {wedges.map(({ button, start, end, label }) => {
        const active = heldButton === button;
        const pos = labelPos(start, end);
        return (
          <g key={button}>
            <path
              d={wedge(start, end)}
              fill={active ? "#0078d4" : "#2a2a2a"}
              stroke="#555"
              strokeWidth="1.5"
              style={{ cursor: "pointer" }}
              onMouseDown={() => onButtonDown(button)}
              onMouseUp={onButtonUp}
              onMouseLeave={active ? onButtonUp : undefined}
              onTouchStart={(e) => { e.preventDefault(); onButtonDown(button); }}
              onTouchEnd={onButtonUp}
            />
            <text
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="14"
              fill={active ? "#fff" : "#aaa"}
              style={{ pointerEvents: "none" }}
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* Z-axis up/down buttons in center — OUTSIDE the wedges map */}
      <path
        d={`M ${CENTER - INNER + 2} ${CENTER} A ${INNER - 2} ${INNER - 2} 0 0 1 ${CENTER + INNER - 2} ${CENTER} Z`}
        fill={heldButton === "up" ? "#0078d4" : "#2a2a2a"}
        stroke="#444"
        strokeWidth="1"
        style={{ cursor: "pointer" }}
        onMouseDown={() => onButtonDown("up")}
        onMouseUp={onButtonUp}
        onMouseLeave={heldButton === "up" ? onButtonUp : undefined}
        onTouchStart={(e) => { e.preventDefault(); onButtonDown("up"); }}
        onTouchEnd={onButtonUp}
      />
      <text x={CENTER} y={CENTER - 8} textAnchor="middle" dominantBaseline="central"
        fontSize="10" fill={heldButton === "up" ? "#fff" : "#aaa"} style={{ pointerEvents: "none" }}>▲Z</text>

      <path
        d={`M ${CENTER - INNER + 2} ${CENTER} A ${INNER - 2} ${INNER - 2} 0 0 0 ${CENTER + INNER - 2} ${CENTER} Z`}
        fill={heldButton === "down" ? "#0078d4" : "#1a1a1a"}
        stroke="#444"
        strokeWidth="1"
        style={{ cursor: "pointer" }}
        onMouseDown={() => onButtonDown("down")}
        onMouseUp={onButtonUp}
        onMouseLeave={heldButton === "down" ? onButtonUp : undefined}
        onTouchStart={(e) => { e.preventDefault(); onButtonDown("down"); }}
        onTouchEnd={onButtonUp}
      />
      <text x={CENTER} y={CENTER + 8} textAnchor="middle" dominantBaseline="central"
        fontSize="10" fill={heldButton === "down" ? "#fff" : "#aaa"} style={{ pointerEvents: "none" }}>▼Z</text>
    </svg>
  );
}