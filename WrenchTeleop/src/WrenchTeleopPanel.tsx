import { PanelExtensionContext } from "@lichtblick/suite";
import { ReactElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CircleDPad } from "./CircleDPad";
import { HeldButton } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

type PanelState = {
  topic: string;
  actionsTopic: string;
  forceMag: number;   // N — magnitude for all force axes
  torqueMag: number;  // N·m — magnitude for all torque axes
  zeroOnRelease: boolean;
  publishRate: number;
  buttonRamp: number; // N or N·m per tick, ramp rate for dpad buttons
};

const DEFAULT_STATE: PanelState = {
  topic: "/steelhead/controls/input_forces",
  actionsTopic: "/steelhead/controls/actuators_command",
  forceMag: 15.0,
  torqueMag: 15.0,
  zeroOnRelease: true,
  publishRate: 10,
  buttonRamp: 2,
};

// Full 6-DOF force/torque state
type WrenchState = {
  fx: number; // surge (W/S)
  fy: number; // strafe (A/D)
  fz: number; // heave (Q/Z)
  tx: number; // pitch (↑/↓)
  ty: number; // roll (E/C)
  tz: number; // yaw (←/→)
};

const ZERO_WRENCH: WrenchState = { fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0 };

// ─── Key → wrench axis mapping (matches keyboard_teleop.py) ───────────────────
// w/s → force.x (surge)
// a/d → force.y (strafe)
// q/z → force.z (heave)
// ↑/↓ → torque.x (pitch)
// e/c → torque.y (roll)
// ←/→ → torque.z (yaw)

// ─── Panel ────────────────────────────────────────────────────────────────────

function WrenchTeleopPanel({ context }: { context: PanelExtensionContext }): ReactElement {
  const [renderDone, setRenderDone] = useState<(() => void) | undefined>();
  const [config, setConfig] = useState<PanelState>(() => {
    const saved = context.initialState as Partial<PanelState> | undefined;
    return { ...DEFAULT_STATE, ...saved };
  });
  const [showConfig, setShowConfig] = useState(false);
  const [keyboardEnabled, setKeyboardEnabled] = useState(false);

  // D-pad button state
  const [heldButton, setHeldButton] = useState<HeldButton>(undefined);

  // Live wrench display values
  const [wrench, setWrench] = useState<WrenchState>(ZERO_WRENCH);
  const wrenchRef = useRef<WrenchState>(ZERO_WRENCH);

  // D-pad ramp targets
  const targetRef = useRef<WrenchState>(ZERO_WRENCH);

  // Track which keyboard keys are currently held
  const keysHeld = useRef<Set<string>>(new Set());

  // ─── Advertise ──────────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    context.onRender = (_renderState, done) => {
      setRenderDone(() => done);
    };
    context.watch("currentTime");
    context.advertise?.(config.topic, "geometry_msgs/Wrench", {
      latching: false,
      qos: { reliability: "reliable", durability: "volatile" },
    });
  }, [context, config.topic]);

  useEffect(() => { renderDone?.(); }, [renderDone]);

  // ─── Publish ────────────────────────────────────────────────────────────────
  const publish = useCallback(
    (w: WrenchState) => {
      context.publish?.(config.topic, {
        force:  { x: w.fx, y: w.fy, z: w.fz },
        torque: { x: w.tx, y: w.ty, z: w.tz },
      });
    },
    [context, config.topic],
  );

  // ─── Action buttons (claw / torpedo) ────────────────────────────────────────
  const sendAction = useCallback(
    (input: string) => {
      context.callService?.(config.actionsTopic, { input });
    },
    [context, config.actionsTopic],
  );

  // ─── Keyboard input ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!keyboardEnabled) return;

    const buildWrenchFromKeys = (): WrenchState => {
      const { forceMag, torqueMag } = config;
      const keys = keysHeld.current;
      return {
        fx: (keys.has("w") ? forceMag  : 0) + (keys.has("s") ? -forceMag  : 0),
        fy: (keys.has("a") ? forceMag  : 0) + (keys.has("d") ? -forceMag  : 0),
        fz: (keys.has("q") ? forceMag  : 0) + (keys.has("z") ? -forceMag  : 0),
        tx: (keys.has("ArrowUp")   ? -torqueMag : 0) + (keys.has("ArrowDown")  ? torqueMag  : 0),
        ty: (keys.has("e") ? -torqueMag : 0) + (keys.has("c") ? torqueMag : 0),
        tz: (keys.has("ArrowLeft") ? torqueMag  : 0) + (keys.has("ArrowRight") ? -torqueMag : 0),
      };
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      if ((e.target as HTMLElement).tagName === "INPUT") return;

      const key = e.key === "ArrowUp" || e.key === "ArrowDown" ||
                  e.key === "ArrowLeft" || e.key === "ArrowRight"
                  ? e.key : e.key.toLowerCase();

      // Action keys — fire once on press
      if (key === "o") { sendAction("claw"); return; }
      if (key === "p") { sendAction("torpedo"); return; }

      if (!keysHeld.current.has(key)) {
        keysHeld.current.add(key);
        const w = buildWrenchFromKeys();
        wrenchRef.current = w;
        setWrench(w);
        publish(w);
      }
      // Prevent arrow keys scrolling the panel
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) {
        e.preventDefault();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key === "ArrowUp" || e.key === "ArrowDown" ||
                  e.key === "ArrowLeft" || e.key === "ArrowRight"
                  ? e.key : e.key.toLowerCase();
      keysHeld.current.delete(key);
      const w = buildWrenchFromKeys();
      wrenchRef.current = w;
      setWrench(w);
      if (config.zeroOnRelease || keysHeld.current.size === 0) {
        publish(w);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      // Zero out on disable
      keysHeld.current.clear();
      wrenchRef.current = ZERO_WRENCH;
      setWrench(ZERO_WRENCH);
      publish(ZERO_WRENCH);
    };
  }, [keyboardEnabled, config, publish, sendAction]);

  // ─── D-pad ramp loop ────────────────────────────────────────────────────────
  useEffect(() => {
    if (heldButton == undefined) return;

    const intervalMs = 1000 / config.publishRate;
    const handle = setInterval(() => {
      const ramp = (current: number, target: number) => {
        const diff = target - current;
        return Math.abs(diff) <= config.buttonRamp
          ? target
          : current + Math.sign(diff) * config.buttonRamp;
      };

      const next: WrenchState = {
        fx: ramp(wrenchRef.current.fx, targetRef.current.fx),
        fy: ramp(wrenchRef.current.fy, targetRef.current.fy),
        fz: ramp(wrenchRef.current.fz, targetRef.current.fz),
        tx: ramp(wrenchRef.current.tx, targetRef.current.tx),
        ty: ramp(wrenchRef.current.ty, targetRef.current.ty),
        tz: ramp(wrenchRef.current.tz, targetRef.current.tz),
      };

      wrenchRef.current = next;
      setWrench(next);
      publish(next);
    }, intervalMs);

    return () => clearInterval(handle);
  }, [heldButton, config.publishRate, config.buttonRamp, publish]);

  // ─── D-pad handlers ─────────────────────────────────────────────────────────
  const handleButtonDown = useCallback(
    (button: NonNullable<HeldButton>) => {
      const { forceMag, torqueMag } = config;
      const t = { ...ZERO_WRENCH };
      switch (button) {
        case "forward":    t.fx =  forceMag;  break;
        case "backward":   t.fx = -forceMag;  break;
        case "left":       t.fy =  forceMag;  break;
        case "right":      t.fy = -forceMag;  break;
        case "up":         t.fz =  forceMag;  break;
        case "down":       t.fz = -forceMag;  break;
        case "pitch_up":   t.tx = -torqueMag; break;
        case "pitch_down": t.tx =  torqueMag; break;
        case "roll_left":  t.ty =  torqueMag; break;
        case "roll_right": t.ty = -torqueMag; break;
      }
      targetRef.current = t;
      setHeldButton(button);
    },
    [config],
  );

  const handleButtonUp = useCallback(() => {
    setHeldButton(undefined);
    targetRef.current = ZERO_WRENCH;
    if (config.zeroOnRelease) {
      wrenchRef.current = ZERO_WRENCH;
      setWrench(ZERO_WRENCH);
      publish(ZERO_WRENCH);
    }
  }, [config.zeroOnRelease, publish]);

  // ─── Config ─────────────────────────────────────────────────────────────────
  const saveConfig = useCallback(
    (updates: Partial<PanelState>) => {
      const next = { ...config, ...updates };
      setConfig(next);
      context.saveState?.(next);
    },
    [config, context],
  );

  // ─── Styles ─────────────────────────────────────────────────────────────────
  const actionBtnStyle = (color: string): React.CSSProperties => ({
    padding: "8px 18px",
    fontSize: "0.85rem",
    fontWeight: 600,
    borderRadius: "6px",
    border: `1px solid ${color}`,
    background: "transparent",
    color: color,
    cursor: "pointer",
    letterSpacing: "0.05em",
  });

  const kbKeyStyle = (active: boolean): React.CSSProperties => ({
    display: "inline-block",
    padding: "2px 6px",
    fontSize: "0.7rem",
    borderRadius: "3px",
    border: "1px solid #555",
    background: active ? "#0078d4" : "#222",
    color: active ? "#fff" : "#888",
    fontFamily: "monospace",
    minWidth: "22px",
    textAlign: "center",
  });

  const keys = keysHeld.current;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "0.75rem", fontFamily: "sans-serif", color: "#ddd", fontSize: "0.85rem" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Wrench Teleop</h3>
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            onClick={() => setKeyboardEnabled(v => !v)}
            style={{
              fontSize: "0.75rem",
              padding: "2px 10px",
              borderRadius: "4px",
              border: `1px solid ${keyboardEnabled ? "#0078d4" : "#555"}`,
              background: keyboardEnabled ? "#0078d420" : "none",
              color: keyboardEnabled ? "#4db3ff" : "#aaa",
              cursor: "pointer",
              fontWeight: keyboardEnabled ? 600 : 400,
            }}
          >
            ⌨ {keyboardEnabled ? "KB ON" : "KB OFF"}
          </button>
          <button
            onClick={() => setShowConfig(v => !v)}
            style={{ fontSize: "0.75rem", background: "none", border: "1px solid #555", color: "#aaa", borderRadius: "4px", padding: "2px 8px", cursor: "pointer" }}
          >
            {showConfig ? "✕ Config" : "⚙ Config"}
          </button>
        </div>
      </div>

      {/* Config panel */}
      {showConfig && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.75rem", padding: "0.5rem", background: "#1a1a1a", borderRadius: "6px" }}>
          <label style={{ gridColumn: "1 / -1" }}>
            Topic
            <input type="text" value={config.topic}
              onChange={(e) => saveConfig({ topic: e.target.value })}
              style={{ display: "block", width: "100%", marginTop: "2px", background: "#222", border: "1px solid #444", color: "#ddd", padding: "3px 6px", borderRadius: "4px" }}
            />
          </label>
          <label>
            Force Mag (N)
            <input type="number" value={config.forceMag} min={0} max={50}
              onChange={(e) => saveConfig({ forceMag: Number(e.target.value) })}
              style={{ display: "block", width: "80px", marginTop: "2px", background: "#222", border: "1px solid #444", color: "#ddd", padding: "3px 6px", borderRadius: "4px" }}
            />
          </label>
          <label>
            Torque Mag (N·m)
            <input type="number" value={config.torqueMag} min={0} max={50}
              onChange={(e) => saveConfig({ torqueMag: Number(e.target.value) })}
              style={{ display: "block", width: "80px", marginTop: "2px", background: "#222", border: "1px solid #444", color: "#ddd", padding: "3px 6px", borderRadius: "4px" }}
            />
          </label>
          <label>
            Button Ramp (N/tick)
            <input type="number" value={config.buttonRamp} min={1} max={15}
              onChange={(e) => saveConfig({ buttonRamp: Number(e.target.value) })}
              style={{ display: "block", width: "80px", marginTop: "2px", background: "#222", border: "1px solid #444", color: "#ddd", padding: "3px 6px", borderRadius: "4px" }}
            />
          </label>
          <label>
            Publish Rate (Hz)
            <input type="number" value={config.publishRate} min={1} max={50}
              onChange={(e) => saveConfig({ publishRate: Number(e.target.value) })}
              style={{ display: "block", width: "80px", marginTop: "2px", background: "#222", border: "1px solid #444", color: "#ddd", padding: "3px 6px", borderRadius: "4px" }}
            />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            <input type="checkbox" checked={config.zeroOnRelease}
              onChange={(e) => saveConfig({ zeroOnRelease: e.target.checked })}
            />{" "}Zero on release
          </label>
        </div>
      )}

      {/* Keyboard legend */}
      {keyboardEnabled && (
        <div style={{ background: "#111", border: "1px solid #333", borderRadius: "6px", padding: "0.5rem", marginBottom: "0.75rem" }}>
          <div style={{ fontSize: "0.7rem", color: "#666", marginBottom: "4px" }}>KEYBOARD ACTIVE — click panel to focus</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: "0.72rem" }}>
            <div><span style={kbKeyStyle(keys.has("w"))}>W</span> <span style={kbKeyStyle(keys.has("s"))}>S</span> Surge</div>
            <div><span style={kbKeyStyle(keys.has("ArrowUp"))}>↑</span> <span style={kbKeyStyle(keys.has("ArrowDown"))}>↓</span> Pitch</div>
            <div><span style={kbKeyStyle(keys.has("a"))}>A</span> <span style={kbKeyStyle(keys.has("d"))}>D</span> Strafe</div>
            <div><span style={kbKeyStyle(keys.has("ArrowLeft"))}>←</span> <span style={kbKeyStyle(keys.has("ArrowRight"))}>→</span> Yaw</div>
            <div><span style={kbKeyStyle(keys.has("q"))}>Q</span> <span style={kbKeyStyle(keys.has("z"))}>Z</span> Heave</div>
            <div><span style={kbKeyStyle(keys.has("e"))}>E</span> <span style={kbKeyStyle(keys.has("c"))}>C</span> Roll</div>
            <div><span style={kbKeyStyle(false)}>O</span> Claw &nbsp; <span style={kbKeyStyle(false)}>P</span> Torpedo</div>
          </div>
        </div>
      )}

      {/* D-pad + secondary buttons */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center", justifyContent: "center" }}>
        <CircleDPad heldButton={heldButton} onButtonDown={handleButtonDown} onButtonUp={handleButtonUp} />

        {/* Secondary DOF buttons (pitch, roll, yaw) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {[
            { btn: "pitch_up"   as const, label: "↑ Pitch", key: "↑" },
            { btn: "pitch_down" as const, label: "↓ Pitch", key: "↓" },
            { btn: "roll_left"  as const, label: "↺ Roll",  key: "E" },
            { btn: "roll_right" as const, label: "↻ Roll",  key: "C" },
          ].map(({ btn, label, key }) => {
            const active = heldButton === btn;
            return (
              <button
                key={btn}
                style={{
                  padding: "6px 10px",
                  fontSize: "0.75rem",
                  borderRadius: "5px",
                  border: `1px solid ${active ? "#0078d4" : "#444"}`,
                  background: active ? "#0078d4" : "#2a2a2a",
                  color: active ? "#fff" : "#bbb",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  minWidth: "80px",
                  textAlign: "left",
                }}
                onMouseDown={() => handleButtonDown(btn)}
                onMouseUp={handleButtonUp}
                onMouseLeave={active ? handleButtonUp : undefined}
                onTouchStart={(e) => { e.preventDefault(); handleButtonDown(btn); }}
                onTouchEnd={handleButtonUp}
              >
                {label} <span style={{ fontSize: "0.65rem", color: active ? "#cce4ff" : "#555" }}>[{key}]</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Force/Torque readout */}
      <div style={{ marginTop: "0.75rem", background: "#111", borderRadius: "6px", padding: "0.5rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 12px", fontSize: "0.75rem", fontFamily: "monospace" }}>
        <div style={{ color: "#666", gridColumn: "1 / -1", marginBottom: "2px" }}>WRENCH OUTPUT</div>
        <div>Fx (surge): <span style={{ color: wrench.fx !== 0 ? "#4db3ff" : "#555" }}>{wrench.fx.toFixed(1)} N</span></div>
        <div>Tx (pitch): <span style={{ color: wrench.tx !== 0 ? "#4db3ff" : "#555" }}>{wrench.tx.toFixed(1)} N·m</span></div>
        <div>Fy (strafe): <span style={{ color: wrench.fy !== 0 ? "#4db3ff" : "#555" }}>{wrench.fy.toFixed(1)} N</span></div>
        <div>Ty (roll):  <span style={{ color: wrench.ty !== 0 ? "#4db3ff" : "#555" }}>{wrench.ty.toFixed(1)} N·m</span></div>
        <div>Fz (heave): <span style={{ color: wrench.fz !== 0 ? "#4db3ff" : "#555" }}>{wrench.fz.toFixed(1)} N</span></div>
        <div>Tz (yaw):   <span style={{ color: wrench.tz !== 0 ? "#4db3ff" : "#555" }}>{wrench.tz.toFixed(1)} N·m</span></div>
      </div>

      {/* Action buttons */}
      <div style={{ marginTop: "0.75rem", display: "flex", gap: "10px" }}>
        <button style={actionBtnStyle("#e8a000")} onClick={() => sendAction("claw")}>
          🦀 CLAW <span style={{ fontSize: "0.65rem", opacity: 0.6 }}>[O]</span>
        </button>
        <button style={actionBtnStyle("#cc3333")} onClick={() => sendAction("torpedo")}>
          🚀 TORPEDO <span style={{ fontSize: "0.65rem", opacity: 0.6 }}>[P]</span>
        </button>
      </div>

      {/* Footer */}
      <div style={{ marginTop: "0.5rem", fontSize: "0.65rem", color: "#444" }}>
        Topic: <code style={{ color: "#555" }}>{config.topic}</code> · {config.publishRate} Hz
      </div>
    </div>
  );
}

export function initWrenchTeleopPanel(context: PanelExtensionContext): () => void {
  const root = createRoot(context.panelElement);
  root.render(<WrenchTeleopPanel context={context} />);
  return () => { root.unmount(); };
}
