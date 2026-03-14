// import { Immutable, MessageEvent, PanelExtensionContext, Topic } from "@lichtblick/suite";
import { PanelExtensionContext } from "@lichtblick/suite";
import { ReactElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

type PanelState = {
  topic: string;
  surgeMin: number;
  surgeMax: number;
  yawMin: number;
  yawMax: number;
  zeroOnRelease: boolean;
  publishRate: number;
};

const DEFAULT_STATE: PanelState = {
  topic: "/cmd_wrench",
  // These max and min values where translated from steelhead/src/steelhead_controls/src/thrust_allocator.cpp
  surgeMin: -24,
  surgeMax: 32,
  yawMin: -24,
  yawMax: 32,
  zeroOnRelease: true,
  publishRate: 10,
};

type HeldButton = "forward" | "backward" | "left" | "right" | undefined;

function WrenchTeleopPanel({ context }: { context: PanelExtensionContext }): ReactElement {
  const [renderDone, setRenderDone] = useState<(() => void) | undefined>();
  const [surge, setSurge] = useState(0);
  const [yaw, setYaw] = useState(0);
  const [heldButton, setHeldButton] = useState<HeldButton>(undefined);
  const [config, setConfig] = useState<PanelState>(() => {
    const saved = context.initialState as Partial<PanelState> | undefined;
    return { ...DEFAULT_STATE, ...saved };
  });
  const [showConfig, setShowConfig] = useState(false);

  const surgeRef = useRef(surge);
  const yawRef = useRef(yaw);
  surgeRef.current = surge;
  yawRef.current = yaw;

  // We use a layout effect to setup render handling for our panel. We also setup some topic subscriptions.
  useLayoutEffect(() => {
    context.onRender = (_renderState, done) => {
      setRenderDone(() => done);
    };

    context.watch("currentTime");

    context.advertise?.(config.topic, "geometry_msgs/WrenchStamped", { latching: false });
  }, [context, config.topic]);

  // invoke the done callback once the render is complete
  useEffect(() => {
    renderDone?.();
  }, [renderDone]);

  const publishWrench = useCallback(
    (surgeVal: number, yawVal: number) => {
      const now = Date.now();
      context.publish?.(config.topic, {
        header: {
          stamp: {
            sec: Math.floor(now / 1000),
            nanosec: (now % 1000) * 1e6,
          },
          frame_id: "base_link",
        },
        wrench: {
          force: { x: surgeVal, y: 0, z: 0 },
          torque: { x: 0, y: 0, z: yawVal },
        },
      });
    },
    [context, config.topic],
  );

  // Publish loop — runs whenever a button is held, at publishRate hz
  useEffect(() => {
    if (heldButton == undefined) {
      return;
    }
    const intervalMs = 1000 / config.publishRate;
    const handle = setInterval(() => {
      publishWrench(surgeRef.current, yawRef.current);
    }, intervalMs);
    return () => {
      clearInterval(handle);
    };
  }, [heldButton, config.publishRate, publishWrench]);

  const handleButtonDown = useCallback(
    (button: NonNullable<HeldButton>) => {
      let newSurge = surgeRef.current;
      let newYaw = yawRef.current;

      const surgeStep = config.surgeMax * 0.25;
      const yawStep = config.yawMax * 0.25;

      switch (button) {
        case "forward":
          newSurge = config.surgeMax;
          break;
        case "backward":
          newSurge = config.surgeMin;
          break;
        case "left":
          newYaw = config.yawMax;
          break;
        case "right":
          newYaw = config.yawMin;
          break;
      }

      // suppress TS unused warning
      void surgeStep;
      void yawStep;

      setSurge(newSurge);
      setYaw(newYaw);
      setHeldButton(button);
      publishWrench(newSurge, newYaw);
    },
    [config, publishWrench],
  );

  const handleButtonUp = useCallback(() => {
    setHeldButton(undefined);
    if (config.zeroOnRelease) {
      setSurge(0);
      setYaw(0);
      publishWrench(0, 0);
    }
  }, [config.zeroOnRelease, publishWrench]);

  const handleSliderRelease = useCallback(() => {
    if (config.zeroOnRelease) {
      setSurge(0);
      setYaw(0);
      publishWrench(0, 0);
    } else {
      publishWrench(surge, yaw);
    }
  }, [config.zeroOnRelease, surge, yaw, publishWrench]);

  const saveConfig = useCallback(
    (updates: Partial<PanelState>) => {
      const next = { ...config, ...updates };
      setConfig(next);
      context.saveState?.(next);
    },
    [config, context],
  );

  const LIMITS = {
    surge: { min: -24, max: 32 },
    yaw: { min: -24, max: 32 },
  };

  const buttonStyle = (active: boolean): React.CSSProperties => ({
    width: "56px",
    height: "56px",
    fontSize: "1.25rem",
    borderRadius: "8px",
    border: "1px solid #555",
    background: active ? "#0078d4" : "#2a2a2a",
    color: "#fff",
    cursor: "pointer",
    userSelect: "none",
    touchAction: "none",
  });

  return (
    <div style={{ padding: "1rem", fontFamily: "sans-serif", color: "#ddd" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Wrench Teleop</h3>
        <button
          onClick={() => setShowConfig((v) => !v)}
          style={{
            fontSize: "0.75rem",
            background: "none",
            border: "1px solid #555",
            color: "#aaa",
            borderRadius: "4px",
            padding: "2px 8px",
            cursor: "pointer",
          }}
        >
          {showConfig ? "Hide Config" : "⚙ Config"}
        </button>
      </div>

      {/* Config panel */}
      {showConfig && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.5rem",
            marginTop: "0.5rem",
          }}
        >
          <label>
            Surge Min
            <input
              type="number"
              value={config.surgeMin}
              min={LIMITS.surge.min}
              max={0}
              onChange={(e) =>
                saveConfig({
                  surgeMin: Math.max(LIMITS.surge.min, Math.min(0, Number(e.target.value))),
                })
              }
              style={{ display: "block", width: "100%" }}
            />
          </label>
          <label>
            Surge Max
            <input
              type="number"
              value={config.surgeMax}
              min={0}
              max={LIMITS.surge.max}
              onChange={(e) =>
                saveConfig({
                  surgeMax: Math.max(0, Math.min(LIMITS.surge.max, Number(e.target.value))),
                })
              }
              style={{ display: "block", width: "100%" }}
            />
          </label>
          <label>
            Yaw Min
            <input
              type="number"
              value={config.yawMin}
              min={LIMITS.yaw.min}
              max={0}
              onChange={(e) =>
                saveConfig({
                  yawMin: Math.max(LIMITS.yaw.min, Math.min(0, Number(e.target.value))),
                })
              }
              style={{ display: "block", width: "100%" }}
            />
          </label>
          <label>
            Yaw Max
            <input
              type="number"
              value={config.yawMax}
              min={0}
              max={LIMITS.yaw.max}
              onChange={(e) =>
                saveConfig({
                  yawMax: Math.max(0, Math.min(LIMITS.yaw.max, Number(e.target.value))),
                })
              }
              style={{ display: "block", width: "100%" }}
            />
          </label>
        </div>
      )}

      {/* D-pad buttons */}
      <div
        style={{
          marginTop: "1.25rem",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "4px",
        }}
      >
        {/* Forward */}
        <button
          style={buttonStyle(heldButton === "forward")}
          onMouseDown={() => handleButtonDown("forward")}
          onMouseUp={handleButtonUp}
          onMouseLeave={heldButton === "forward" ? handleButtonUp : undefined}
          onTouchStart={(e) => {
            e.preventDefault();
            handleButtonDown("forward");
          }}
          onTouchEnd={handleButtonUp}
        >
          ▲
        </button>

        {/* Left / Right */}
        <div style={{ display: "flex", gap: "4px" }}>
          <button
            style={buttonStyle(heldButton === "left")}
            onMouseDown={() => handleButtonDown("left")}
            onMouseUp={handleButtonUp}
            onMouseLeave={heldButton === "left" ? handleButtonUp : undefined}
            onTouchStart={(e) => {
              e.preventDefault();
              handleButtonDown("left");
            }}
            onTouchEnd={handleButtonUp}
          >
            ◀
          </button>
          {/* center dead zone */}
          <div style={{ width: "56px", height: "56px" }} />
          <button
            style={buttonStyle(heldButton === "right")}
            onMouseDown={() => handleButtonDown("right")}
            onMouseUp={handleButtonUp}
            onMouseLeave={heldButton === "right" ? handleButtonUp : undefined}
            onTouchStart={(e) => {
              e.preventDefault();
              handleButtonDown("right");
            }}
            onTouchEnd={handleButtonUp}
          >
            ▶
          </button>
        </div>

        {/* Backward */}
        <button
          style={buttonStyle(heldButton === "backward")}
          onMouseDown={() => handleButtonDown("backward")}
          onMouseUp={handleButtonUp}
          onMouseLeave={heldButton === "backward" ? handleButtonUp : undefined}
          onTouchStart={(e) => {
            e.preventDefault();
            handleButtonDown("backward");
          }}
          onTouchEnd={handleButtonUp}
        >
          ▼
        </button>
      </div>

      {/* Sliders */}
      <div style={{ marginTop: "1.25rem" }}>
        <label>
          Surge Force (X): <strong>{surge.toFixed(1)} N</strong>
        </label>
        <input
          type="range"
          min={config.surgeMin}
          max={config.surgeMax}
          value={surge}
          style={{ display: "block", width: "100%" }}
          onChange={(e) => setSurge(Number(e.target.value))}
          onMouseUp={handleSliderRelease}
          onTouchEnd={handleSliderRelease}
        />
      </div>
      <div style={{ marginTop: "1rem" }}>
        <label>
          Yaw Torque (Z): <strong>{yaw.toFixed(1)} N·m</strong>
        </label>
        <input
          type="range"
          min={config.yawMin}
          max={config.yawMax}
          value={yaw}
          style={{ display: "block", width: "100%" }}
          onChange={(e) => setYaw(Number(e.target.value))}
          onMouseUp={handleSliderRelease}
          onTouchEnd={handleSliderRelease}
        />
      </div>

      <div style={{ marginTop: "1rem", fontSize: "0.72rem", color: "#666" }}>
        Topic: <code>{config.topic}</code> · {config.publishRate} Hz
      </div>
    </div>
  );
}

export function initWrenchTeleopPanel(context: PanelExtensionContext): () => void {
  const root = createRoot(context.panelElement);
  root.render(<WrenchTeleopPanel context={context} />);

  // Return a function to run when the panel is removed
  return () => {
    root.unmount();
  };
}
