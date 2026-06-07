import { PanelExtensionContext } from "@lichtblick/suite";
import { ReactElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CircleDPad } from "./CircleDPad";
import { HeldButton } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

type PanelState = {
  topic: string;
  actionsTopic: string;
  forceMag: number;
  torqueMag: number;
  zeroOnRelease: boolean;
  publishRate: number;
  buttonRamp: number;
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

type WrenchState = {
  fx: number; fy: number; fz: number;
  tx: number; ty: number; tz: number;
};

const ZERO_WRENCH: WrenchState = { fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0 };

// ─── Panel ────────────────────────────────────────────────────────────────────

function WrenchTeleopPanel({ context }: { context: PanelExtensionContext }): ReactElement {
  const [renderDone, setRenderDone] = useState<(() => void) | undefined>();
  const [config, setConfig] = useState<PanelState>(() => {
    const saved = context.initialState as Partial<PanelState> | undefined;
    return { ...DEFAULT_STATE, ...saved };
  });
  const [showConfig, setShowConfig] = useState(false);
  const [keyboardEnabled, setKeyboardEnabled] = useState(false);
  const [heldButton, setHeldButton] = useState<HeldButton>(undefined);
  const [wrench, setWrench] = useState<WrenchState>(ZERO_WRENCH);
  const [, forceRender] = useState(0); // for keyboard key indicator re-renders

  const wrenchRef = useRef<WrenchState>(ZERO_WRENCH);
  const targetRef = useRef<WrenchState>(ZERO_WRENCH);
  const keysHeld = useRef<Set<string>>(new Set());

  useLayoutEffect(() => {
    context.onRender = (_renderState, done) => { setRenderDone(() => done); };
    context.watch("currentTime");
    context.advertise?.(config.topic, "geometry_msgs/Wrench", {
      latching: false,
      qos: { reliability: "reliable", durability: "volatile" },
    });
  }, [context, config.topic]);

  useEffect(() => { renderDone?.(); }, [renderDone]);

  const publish = useCallback((w: WrenchState) => {
    context.publish?.(config.topic, {
      force:  { x: w.fx, y: w.fy, z: w.fz },
      torque: { x: w.tx, y: w.ty, z: w.tz },
    });
  }, [context, config.topic]);

  const sendAction = useCallback((input: string) => {
    context.callService?.(config.actionsTopic, { input });
  }, [context, config.actionsTopic]);

  // ─── Keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!keyboardEnabled) return;

    const buildWrench = (): WrenchState => {
      const { forceMag, torqueMag } = config;
      const k = keysHeld.current;
      return {
        fx: (k.has("w") ? forceMag : 0) + (k.has("s") ? -forceMag : 0),
        fy: (k.has("a") ? forceMag : 0) + (k.has("d") ? -forceMag : 0),
        fz: (k.has("q") ? forceMag : 0) + (k.has("z") ? -forceMag : 0),
        tx: (k.has("ArrowUp") ? -torqueMag : 0) + (k.has("ArrowDown") ? torqueMag : 0),
        ty: (k.has("e") ? -torqueMag : 0) + (k.has("c") ? torqueMag : 0),
        tz: (k.has("ArrowLeft") ? torqueMag : 0) + (k.has("ArrowRight") ? -torqueMag : 0),
      };
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      const key = ["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key) ? e.key : e.key.toLowerCase();
      if (key === "o") { sendAction("claw"); return; }
      if (key === "p") { sendAction("torpedo"); return; }
      if (!keysHeld.current.has(key)) {
        keysHeld.current.add(key);
        const w = buildWrench();
        wrenchRef.current = w;
        setWrench(w);
        publish(w);
        forceRender(n => n + 1);
      }
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) e.preventDefault();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = ["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key) ? e.key : e.key.toLowerCase();
      keysHeld.current.delete(key);
      const w = buildWrench();
      wrenchRef.current = w;
      setWrench(w);
      publish(w);
      forceRender(n => n + 1);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
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
      const ramp = (cur: number, tgt: number) => {
        const d = tgt - cur;
        return Math.abs(d) <= config.buttonRamp ? tgt : cur + Math.sign(d) * config.buttonRamp;
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
  const handleButtonDown = useCallback((button: NonNullable<HeldButton>) => {
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
  }, [config]);

  const handleButtonUp = useCallback(() => {
    setHeldButton(undefined);
    targetRef.current = ZERO_WRENCH;
    if (config.zeroOnRelease) {
      wrenchRef.current = ZERO_WRENCH;
      setWrench(ZERO_WRENCH);
      publish(ZERO_WRENCH);
    }
  }, [config.zeroOnRelease, publish]);

  const saveConfig = useCallback((updates: Partial<PanelState>) => {
    const next = { ...config, ...updates };
    setConfig(next);
    context.saveState?.(next);
  }, [config, context]);

  // ─── Render helpers ─────────────────────────────────────────────────────────

  const KeyBadge = ({ k: key, label }: { k: string; label: string }) => {
    const active = keysHeld.current.has(key);
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: "3px",
      }}>
        <div style={{
          width: "36px", height: "36px", borderRadius: "6px", display: "flex",
          alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 700,
          fontFamily: "monospace",
          background: active ? "#0078d4" : "#1e1e1e",
          border: `2px solid ${active ? "#4db3ff" : "#3a3a3a"}`,
          color: active ? "#fff" : "#666",
          boxShadow: active ? "0 0 8px #0078d455" : "none",
          transition: "all 0.05s",
        }}>{label}</div>
      </div>
    );
  };

  const WrenchBar = ({ label, value, max }: { label: string; value: number; max: number }) => {
    const pct = Math.abs(value) / max * 100;
    const positive = value >= 0;
    const active = value !== 0;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ width: "90px", fontSize: "14px", color: "#888", textAlign: "right", flexShrink: 0 }}>{label}</div>
        <div style={{ flex: 1, height: "12px", background: "#1a1a1a", borderRadius: "5px", overflow: "hidden", position: "relative" }}>
          <div style={{
            position: "absolute",
            height: "100%",
            width: `${pct}%`,
            left: positive ? "50%" : `${50 - pct}%`,
            background: active ? "#0078d4" : "#333",
            borderRadius: "3px",
            transition: "all 0.05s",
          }} />
          <div style={{ position: "absolute", left: "50%", top: 0, width: "1px", height: "100%", background: "#333" }} />
        </div>
        <div style={{
          width: "52px", fontSize: "14px", fontFamily: "monospace", textAlign: "right", flexShrink: 0,
          color: active ? "#4db3ff" : "#444",
        }}>{value.toFixed(1)}</div>
      </div>
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "14px", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#ddd", background: "#141414", minHeight: "100%", boxSizing: "border-box" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div>
          <div style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "0.05em", color: "#fff" }}>WRENCH TELEOP</div>
          <div style={{ fontSize: "11px", color: "#555", marginTop: "1px" }}>{config.topic}</div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => setKeyboardEnabled(v => !v)}
            style={{
              fontSize: "13px", padding: "6px 14px", borderRadius: "6px", fontWeight: 600,
              border: `1.5px solid ${keyboardEnabled ? "#0078d4" : "#444"}`,
              background: keyboardEnabled ? "#0078d422" : "#1e1e1e",
              color: keyboardEnabled ? "#4db3ff" : "#888",
              cursor: "pointer",
            }}
          >
            ⌨ {keyboardEnabled ? "KB ON" : "KB OFF"}
          </button>
          <button
            onClick={() => setShowConfig(v => !v)}
            style={{ fontSize: "13px", padding: "6px 12px", borderRadius: "6px", border: "1.5px solid #444", background: "#1e1e1e", color: "#888", cursor: "pointer" }}
          >
            ⚙
          </button>
        </div>
      </div>

      {/* Config */}
      {showConfig && (
        <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "12px", marginBottom: "12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", fontSize: "13px" }}>
            {[
              { label: "Force Mag (N)", key: "forceMag" as const, val: config.forceMag },
              { label: "Torque Mag (N·m)", key: "torqueMag" as const, val: config.torqueMag },
              { label: "Button Ramp", key: "buttonRamp" as const, val: config.buttonRamp },
              { label: "Publish Rate (Hz)", key: "publishRate" as const, val: config.publishRate },
            ].map(({ label, key, val }) => (
              <label key={key}>
                <div style={{ color: "#888", marginBottom: "4px" }}>{label}</div>
                <input type="number" value={val} min={0} max={100}
                  onChange={(e) => saveConfig({ [key]: Number(e.target.value) })}
                  style={{ width: "100%", background: "#111", border: "1px solid #333", color: "#ddd", padding: "5px 8px", borderRadius: "5px", fontSize: "13px" }}
                />
              </label>
            ))}
            <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input type="checkbox" checked={config.zeroOnRelease}
                onChange={(e) => saveConfig({ zeroOnRelease: e.target.checked })} />
              <span style={{ color: "#888", fontSize: "13px" }}>Zero on release</span>
            </label>
          </div>
        </div>
      )}

      {/* Keyboard legend */}
      {keyboardEnabled && (
        <div style={{ background: "#0d1a26", border: "1px solid #1a3a55", borderRadius: "8px", padding: "12px", marginBottom: "12px" }}>
          <div style={{ fontSize: "11px", color: "#4db3ff88", marginBottom: "10px", letterSpacing: "0.08em" }}>KEYBOARD ACTIVE — click panel to focus</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {/* Left column — forces */}
            <div>
              <div style={{ fontSize: "11px", color: "#555", marginBottom: "6px" }}>FORCE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <KeyBadge k="w" label="W" /><KeyBadge k="s" label="S" />
                  <span style={{ fontSize: "12px", color: "#666" }}>Surge X</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <KeyBadge k="a" label="A" /><KeyBadge k="d" label="D" />
                  <span style={{ fontSize: "12px", color: "#666" }}>Strafe Y</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <KeyBadge k="q" label="Q" /><KeyBadge k="z" label="Z" />
                  <span style={{ fontSize: "12px", color: "#666" }}>Heave Z</span>
                </div>
              </div>
            </div>
            {/* Right column — torques */}
            <div>
              <div style={{ fontSize: "11px", color: "#555", marginBottom: "6px" }}>TORQUE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <KeyBadge k="ArrowUp" label="↑" /><KeyBadge k="ArrowDown" label="↓" />
                  <span style={{ fontSize: "12px", color: "#666" }}>Pitch X</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <KeyBadge k="ArrowLeft" label="←" /><KeyBadge k="ArrowRight" label="→" />
                  <span style={{ fontSize: "12px", color: "#666" }}>Yaw Z</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <KeyBadge k="e" label="E" /><KeyBadge k="c" label="C" />
                  <span style={{ fontSize: "12px", color: "#666" }}>Roll Y</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* D-pad + secondary buttons */}
      <div style={{ display: "flex", gap: "16px", alignItems: "center", justifyContent: "center", marginBottom: "14px" }}>
        <CircleDPad heldButton={heldButton} onButtonDown={handleButtonDown} onButtonUp={handleButtonUp} size={320} />

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[
            { btn: "pitch_up"   as const, label: "↑ Pitch", key: "↑" },
            { btn: "pitch_down" as const, label: "↓ Pitch", key: "↓" },
            { btn: "roll_left"  as const, label: "↺ Roll",  key: "E" },
            { btn: "roll_right" as const, label: "↻ Roll",  key: "C" },
          ].map(({ btn, label, key }) => {
            const active = heldButton === btn;
            return (
              <button key={btn}
                style={{
                  padding: "10px 14px", fontSize: "13px", borderRadius: "7px", fontWeight: 500,
                  border: `1.5px solid ${active ? "#0078d4" : "#333"}`,
                  background: active ? "#0078d4" : "#1e1e1e",
                  color: active ? "#fff" : "#999",
                  cursor: "pointer", whiteSpace: "nowrap", minWidth: "100px", textAlign: "left",
                }}
                onMouseDown={() => handleButtonDown(btn)}
                onMouseUp={handleButtonUp}
                onMouseLeave={active ? handleButtonUp : undefined}
                onTouchStart={(e) => { e.preventDefault(); handleButtonDown(btn); }}
                onTouchEnd={handleButtonUp}
              >
                {label} <span style={{ fontSize: "11px", color: active ? "#cce4ff" : "#444" }}>[{key}]</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Wrench readout bars */}
      <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "12px", marginBottom: "14px" }}>
        <div style={{ fontSize: "13px", color: "#555", letterSpacing: "0.08em", marginBottom: "10px" }}>WRENCH OUTPUT</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <WrenchBar label="Surge Fx" value={wrench.fx} max={config.forceMag} />
          <WrenchBar label="Strafe Fy" value={wrench.fy} max={config.forceMag} />
          <WrenchBar label="Heave Fz" value={wrench.fz} max={config.forceMag} />
          <WrenchBar label="Pitch Tx" value={wrench.tx} max={config.torqueMag} />
          <WrenchBar label="Roll Ty" value={wrench.ty} max={config.torqueMag} />
          <WrenchBar label="Yaw Tz" value={wrench.tz} max={config.torqueMag} />
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "10px" }}>
        <button
          onClick={() => sendAction("claw")}
          style={{
            flex: 1, padding: "12px", fontSize: "14px", fontWeight: 700, borderRadius: "8px",
            border: "1.5px solid #b87700", background: "#1a1400", color: "#e8a000",
            cursor: "pointer", letterSpacing: "0.05em",
          }}
        >
          🦀 CLAW <span style={{ fontSize: "11px", opacity: 0.5, fontWeight: 400 }}>[O]</span>
        </button>
        <button
          onClick={() => sendAction("torpedo")}
          style={{
            flex: 1, padding: "12px", fontSize: "14px", fontWeight: 700, borderRadius: "8px",
            border: "1.5px solid #992222", background: "#1a0000", color: "#cc3333",
            cursor: "pointer", letterSpacing: "0.05em",
          }}
        >
          🚀 TORPEDO <span style={{ fontSize: "11px", opacity: 0.5, fontWeight: 400 }}>[P]</span>
        </button>
      </div>

    </div>
  );
}

export function initWrenchTeleopPanel(context: PanelExtensionContext): () => void {
  const root = createRoot(context.panelElement);
  root.render(<WrenchTeleopPanel context={context} />);
  return () => { root.unmount(); };
}
