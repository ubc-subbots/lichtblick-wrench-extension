// import { Immutable, MessageEvent, PanelExtensionContext, Topic } from "@lichtblick/suite";
import { PanelExtensionContext } from "@lichtblick/suite";
import { ReactElement, useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";

type PanelState = {
  topic: string;
  surgeMin: number;
  surgeMax: number;
  yawMin: number;
  yawMax: number;
  zeroOnRelease: boolean;
};

const DEFAULT_STATE: PanelState = {
  topic: "/cmd_wrench",
  surgeMin: -100,
  surgeMax: 100,
  yawMin: -50,
  yawMax: 50,
  zeroOnRelease: true,
}

function WrenchTeleopPanel({ context }: { context: PanelExtensionContext }): ReactElement {

  const [renderDone, setRenderDone] = useState<(() => void) | undefined>();
  const [surge, setSurge] = useState(0);
  const [yaw, setYaw] = useState(0);
  const [config, setConfig] = useState<PanelState>(() => {
    const saved = context.initialState as Partial<PanelState> | undefined;
    return { ...DEFAULT_STATE, ...saved};
  });
  const [showConfig, setShowConfig] = useState(false);

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
      context.publish?.( 
        config.topic, 
        {
          header: {
            stamp: {
              sec: Math.floor(now / 1000),
              nanosec: (now % 1000) * 1e6,
            },
            frame_id: "base_link"
          },
          wrench: {
            force: { x: surgeVal, y: 0, z: 0 },
            torque: { x: 0, y: 0 , z: yawVal},
          },
        }
      );
    },
    [context, config.topic],
  );

  const handleRelease = useCallback(() => {
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

  return (
    <div style={{ padding: "1rem", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Wrench Teleop</h3>
        <button onClick = {() => setShowConfig((v) => !v)} style={{ fontSize: "0.75rem" }}>
          {showConfig ? "Hide Config" : "⚙ Config" }
        </button>
      </div>
       {showConfig && (
        <div
          style={{
            marginTop: "0.75rem",
            padding: "0.75rem",
            background: "#1e1e1e",
            borderRadius: "4px",
            fontSize: "0.8rem",
          }}
        >
          <label>Topic</label>
          <input
            value={config.topic}
            onChange={(e) => saveConfig({ topic: e.target.value })}
            style={{ display: "block", width: "100%", marginBottom: "0.5rem" }}
          />
          <label>
            <input
              type="checkbox"
              checked={config.zeroOnRelease}
              onChange={(e) => saveConfig({ zeroOnRelease: e.target.checked })}
            />{" "}
            Zero on release (recommended for AUV)
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginTop: "0.5rem" }}>
            <label>Surge Min <input type="number" value={config.surgeMin} onChange={(e) => saveConfig({ surgeMin: Number(e.target.value) })} /></label>
            <label>Surge Max <input type="number" value={config.surgeMax} onChange={(e) => saveConfig({ surgeMax: Number(e.target.value) })} /></label>
            <label>Yaw Min <input type="number" value={config.yawMin} onChange={(e) => saveConfig({ yawMin: Number(e.target.value) })} /></label>
            <label>Yaw Max <input type="number" value={config.yawMax} onChange={(e) => saveConfig({ yawMax: Number(e.target.value) })} /></label>
          </div>
        </div>
      )}

      <div style={{ marginTop: "1rem" }}>
        <label>Surge Force (X): <strong>{surge} N</strong></label>
        <input
          type="range"
          min={config.surgeMin}
          max={config.surgeMax}
          value={surge}
          style={{ display: "block", width: "100%" }}
          onChange={(e) => setSurge(Number(e.target.value))}
          onMouseUp={handleRelease}
          onTouchEnd={handleRelease}
        />
      </div>

      <div style={{ marginTop: "1rem" }}>
        <label>Yaw Torque (Z): <strong>{yaw} N·m</strong></label>
        <input
          type="range"
          min={config.yawMin}
          max={config.yawMax}
          value={yaw}
          style={{ display: "block", width: "100%" }}
          onChange={(e) => setYaw(Number(e.target.value))}
          onMouseUp={handleRelease}
          onTouchEnd={handleRelease}
        />
      </div>

      <div style={{ marginTop: "1rem", fontSize: "0.75rem", color: "#888" }}>
        Publishing to: <code>{config.topic}</code>
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
