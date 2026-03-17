import { useState, useCallback, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const GMAIL_MCP = "https://gmail.mcp.claude.com/mcp";

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/"/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i]]));
  });
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: "#111",
      border: `1px solid ${color}33`,
      borderTop: `3px solid ${color}`,
      padding: "20px",
      borderRadius: "4px",
      flex: 1,
      minWidth: "140px"
    }}>
      <div style={{ color: "#666", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>{label}</div>
      <div style={{ color: "#fff", fontSize: "28px", fontFamily: "'DM Mono', monospace", fontWeight: "600" }}>{value}</div>
      {sub && <div style={{ color: color, fontSize: "12px", marginTop: "6px" }}>{sub}</div>}
    </div>
  );
}

export default function GSCDashboard() {
  const [data, setData] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailStatus, setEmailStatus] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef();

  const processZip = async (file) => {
    setError("");
    try {
      const JSZip = (await import("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js")).default;
      // fallback: use dynamic script loading
      throw new Error("use_script");
    } catch {
      // Load JSZip via script tag
      await new Promise((res, rej) => {
        if (window.JSZip) return res();
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }

    const zip = await window.JSZip.loadAsync(file);
    const read = async (name) => {
      const f = zip.file(name);
      return f ? f.async("string") : null;
    };

    const [chartRaw, queriesRaw, pagesRaw, devicesRaw] = await Promise.all([
      read("Chart.csv"), read("Queries.csv"), read("Pages.csv"), read("Devices.csv")
    ]);

    const chart = chartRaw ? parseCSV(chartRaw) : [];
    const queries = queriesRaw ? parseCSV(queriesRaw) : [];
    const pages = pagesRaw ? parseCSV(pagesRaw) : [];
    const devices = devicesRaw ? parseCSV(devicesRaw) : [];

    // Compute stats
    const totalClicks = chart.reduce((s, r) => s + parseInt(r.Clicks || 0), 0);
    const totalImpressions = chart.reduce((s, r) => s + parseInt(r.Impressions || 0), 0);
    const avgCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0";
    const avgPos = chart.length > 0 ? (chart.reduce((s, r) => s + parseFloat(r.Position || 0), 0) / chart.length).toFixed(1) : "0";

    // Last 7 vs prev 7
    const last7 = chart.slice(-7);
    const prev7 = chart.slice(-14, -7);
    const last7Clicks = last7.reduce((s, r) => s + parseInt(r.Clicks || 0), 0);
    const prev7Clicks = prev7.reduce((s, r) => s + parseInt(r.Clicks || 0), 0);
    const clicksDelta = prev7Clicks > 0 ? (((last7Clicks - prev7Clicks) / prev7Clicks) * 100).toFixed(0) : "0";

    const last7Imp = last7.reduce((s, r) => s + parseInt(r.Impressions || 0), 0);
    const prev7Imp = prev7.reduce((s, r) => s + parseInt(r.Impressions || 0), 0);
    const impDelta = prev7Imp > 0 ? (((last7Imp - prev7Imp) / prev7Imp) * 100).toFixed(0) : "0";

    // Chart data formatted
    const chartData = chart.map(r => ({
      date: r.Date?.slice(5),
      clicks: parseInt(r.Clicks || 0),
      impressions: parseInt(r.Impressions || 0),
      position: parseFloat(r.Position || 0)
    }));

    setData({
      file: file.name,
      totalClicks, totalImpressions, avgCTR, avgPos,
      clicksDelta, impDelta,
      last7Clicks, prev7Clicks, last7Imp, prev7Imp,
      chartData,
      queries: queries.slice(0, 10),
      pages: pages.slice(0, 8),
      devices,
      dateRange: chart.length > 0 ? `${chart[0].Date} → ${chart[chart.length - 1].Date}` : ""
    });
  };

  const onDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files[0] || e.target?.files[0];
    if (file) await processZip(file);
  }, []);

  const sendEmail = async () => {
    if (!data) return;
    setSending(true);
    setEmailStatus("");
    try {
      const summary = `GSC Weekly Summary - thevinylbiz.co.uk
Period: ${data.dateRange}

OVERVIEW (28 days)
• Total Clicks: ${data.totalClicks}
• Total Impressions: ${data.totalImpressions}
• Avg CTR: ${data.avgCTR}%
• Avg Position: ${data.avgPos}

LAST 7 DAYS VS PRIOR 7
• Clicks: ${data.last7Clicks} vs ${data.prev7Clicks} (${data.clicksDelta > 0 ? "+" : ""}${data.clicksDelta}%)
• Impressions: ${data.last7Imp} vs ${data.prev7Imp} (${data.impDelta > 0 ? "+" : ""}${data.impDelta}%)

TOP QUERIES
${data.queries.slice(0, 5).map((q, i) => `${i + 1}. ${q["Top queries"]} — ${q.Clicks} clicks, pos ${parseFloat(q.Position).toFixed(1)}`).join("\n")}

TOP PAGES
${data.pages.slice(0, 5).map((p, i) => `${i + 1}. ${p["Top pages"]} — ${p.Clicks} clicks`).join("\n")}

DEVICES
${data.devices.map(d => `• ${d.Device}: ${d.Clicks} clicks, ${d.Impressions} impressions`).join("\n")}
`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: `Send an email to me with the subject "📊 GSC Weekly Report - thevinylbiz.co.uk" and this body:\n\n${summary}\n\nUse my Gmail to send it to myself.` }],
          mcp_servers: [{ type: "url", url: GMAIL_MCP, name: "gmail" }]
        })
      });
      const json = await response.json();
      const textBlock = json.content?.find(b => b.type === "text");
      if (textBlock?.text?.toLowerCase().includes("sent") || textBlock?.text?.toLowerCase().includes("email")) {
        setSent(true);
        setEmailStatus("✅ Report sent to your Gmail!");
      } else {
        setEmailStatus("⚠️ Check your Gmail — it may have sent. " + (textBlock?.text || ""));
      }
    } catch (e) {
      setEmailStatus("❌ Failed to send: " + e.message);
    }
    setSending(false);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      color: "#e0e0e0",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      padding: "32px 24px"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;600&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #111; } ::-webkit-scrollbar-thumb { background: #333; }
        .drop-zone { transition: all 0.2s; }
        .drop-zone:hover { border-color: #00ff88 !important; background: #0f1f17 !important; }
        .btn { transition: all 0.15s; cursor: pointer; }
        .btn:hover { opacity: 0.85; transform: translateY(-1px); }
        .row-hover:hover { background: #1a1a1a !important; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "32px" }}>
        <div>
          <div style={{ color: "#00ff88", fontSize: "11px", letterSpacing: "3px", textTransform: "uppercase", marginBottom: "6px" }}>thevinylbiz.co.uk</div>
          <h1 style={{ margin: 0, fontSize: "28px", fontWeight: "600", color: "#fff", fontFamily: "'DM Mono', monospace" }}>GSC Dashboard</h1>
        </div>
        {data && (
          <button className="btn" onClick={sendEmail} disabled={sending || sent} style={{
            background: sent ? "#1a3a2a" : "#00ff88",
            color: sent ? "#00ff88" : "#000",
            border: "none",
            padding: "12px 24px",
            borderRadius: "4px",
            fontWeight: "600",
            fontSize: "14px",
            fontFamily: "'DM Sans', sans-serif"
          }}>
            {sending ? "Sending..." : sent ? "✅ Sent!" : "📧 Email Report"}
          </button>
        )}
      </div>

      {emailStatus && (
        <div style={{ background: "#111", border: "1px solid #333", padding: "12px 16px", borderRadius: "4px", marginBottom: "20px", fontSize: "14px", color: "#aaa" }}>
          {emailStatus}
        </div>
      )}

      {!data ? (
        /* Drop Zone */
        <div
          className="drop-zone"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? "#00ff88" : "#333"}`,
            background: dragging ? "#0f1f17" : "#0d0d0d",
            borderRadius: "8px",
            padding: "80px 40px",
            textAlign: "center",
            cursor: "pointer",
            marginTop: "40px"
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>📂</div>
          <div style={{ color: "#fff", fontSize: "18px", fontWeight: "500", marginBottom: "8px" }}>Drop your GSC export here</div>
          <div style={{ color: "#555", fontSize: "14px" }}>Download zip from Search Console → Performance → Export → Download CSV</div>
          <input ref={fileRef} type="file" accept=".zip" style={{ display: "none" }} onChange={onDrop} />
        </div>
      ) : (
        <>
          <div style={{ color: "#555", fontSize: "12px", marginBottom: "24px", fontFamily: "'DM Mono', monospace" }}>
            {data.dateRange} · {data.file}
          </div>

          {/* Stat Cards */}
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "28px" }}>
            <StatCard label="Total Clicks" value={data.totalClicks} sub={`Last 7d: ${data.last7Clicks} (${data.clicksDelta > 0 ? "+" : ""}${data.clicksDelta}% vs prior)`} color="#00ff88" />
            <StatCard label="Impressions" value={data.totalImpressions.toLocaleString()} sub={`Last 7d: ${data.last7Imp.toLocaleString()} (${data.impDelta > 0 ? "+" : ""}${data.impDelta}%)`} color="#3b82f6" />
            <StatCard label="Avg CTR" value={`${data.avgCTR}%`} color="#f59e0b" />
            <StatCard label="Avg Position" value={data.avgPos} sub="Lower = better" color="#a855f7" />
          </div>

          {/* Charts */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "28px" }}>
            {[
              { key: "clicks", label: "Daily Clicks", color: "#00ff88" },
              { key: "impressions", label: "Daily Impressions", color: "#3b82f6" }
            ].map(({ key, label, color }) => (
              <div key={key} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "4px", padding: "20px" }}>
                <div style={{ color: "#666", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "16px" }}>{label}</div>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={data.chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                    <XAxis dataKey="date" tick={{ fill: "#444", fontSize: 10 }} tickLine={false} axisLine={false} interval={6} />
                    <YAxis tick={{ fill: "#444", fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: "4px", color: "#fff" }} />
                    <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>

          {/* Queries + Pages */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "28px" }}>
            {[
              { title: "Top Queries", rows: data.queries, keyField: "Top queries" },
              { title: "Top Pages", rows: data.pages, keyField: "Top pages" }
            ].map(({ title, rows, keyField }) => (
              <div key={title} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "4px", padding: "20px" }}>
                <div style={{ color: "#666", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "16px" }}>{title}</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ color: "#444" }}>
                      <th style={{ textAlign: "left", paddingBottom: "8px", fontWeight: "400" }}>{keyField === "Top queries" ? "Query" : "Page"}</th>
                      <th style={{ textAlign: "right", paddingBottom: "8px", fontWeight: "400" }}>Clicks</th>
                      <th style={{ textAlign: "right", paddingBottom: "8px", fontWeight: "400" }}>Pos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="row-hover" style={{ borderTop: "1px solid #1a1a1a" }}>
                        <td style={{ padding: "8px 0", color: "#ccc", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {keyField === "Top pages" ? r[keyField]?.replace("https://thevinylbiz.co.uk", "") || "/" : r[keyField]}
                        </td>
                        <td style={{ textAlign: "right", color: "#00ff88", fontFamily: "'DM Mono', monospace" }}>{r.Clicks}</td>
                        <td style={{ textAlign: "right", color: "#888", fontFamily: "'DM Mono', monospace" }}>{parseFloat(r.Position).toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* Devices */}
          <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "4px", padding: "20px", marginBottom: "20px" }}>
            <div style={{ color: "#666", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "16px" }}>Devices</div>
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
              {data.devices.map((d, i) => {
                const colors = ["#00ff88", "#3b82f6", "#f59e0b"];
                return (
                  <div key={i} style={{ flex: 1, minWidth: "120px", background: "#0d0d0d", borderLeft: `3px solid ${colors[i]}`, padding: "14px 16px", borderRadius: "2px" }}>
                    <div style={{ color: "#555", fontSize: "11px", marginBottom: "4px" }}>{d.Device}</div>
                    <div style={{ color: "#fff", fontSize: "20px", fontFamily: "'DM Mono', monospace" }}>{d.Clicks} <span style={{ fontSize: "12px", color: "#555" }}>clicks</span></div>
                    <div style={{ color: "#444", fontSize: "12px" }}>{parseInt(d.Impressions).toLocaleString()} impressions</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reset */}
          <button className="btn" onClick={() => { setData(null); setSent(false); setEmailStatus(""); }} style={{
            background: "transparent", border: "1px solid #333", color: "#555", padding: "10px 20px", borderRadius: "4px", fontSize: "13px", fontFamily: "'DM Sans', sans-serif"
          }}>
            ← Load new export
          </button>
        </>
      )}
    </div>
  );
}
