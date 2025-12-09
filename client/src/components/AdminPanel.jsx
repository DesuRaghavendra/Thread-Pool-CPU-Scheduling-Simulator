
import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar
} from 'recharts';
import './AdminPanel.css';

export default function AdminPanel() {
  const [status, setStatus] = useState(null);
  const [autoPoll, setAutoPoll] = useState(true);

  // Store metrics in state (arrays, not ref)
  const [metrics, setMetrics] = useState({
    timestamps: [],
    throughputSeries: [],
    latencySeries: []
  });

  // For previous completed count, to calculate delta
  const [prevCompleted, setPrevCompleted] = useState(0);

  const MAX_POINTS = 120;

  async function fetchStatus() {
    try {
      const r = await fetch('http://localhost:3001/status');
      if (!r.ok) throw new Error('status fetch failed');
      const data = await r.json();
      setStatus(data);

      const now = Date.now();
      const lastCompletedCount = data.completed || 0;
      const deltaCompleted = Math.max(0, lastCompletedCount - prevCompleted);

      // Update prevCompleted for next poll
      setPrevCompleted(lastCompletedCount);

      const recent = data.recentCompleted || [];
      const POLL_WINDOW_MS = 5000;
      const windowThreshold = now - POLL_WINDOW_MS;
      const inWindow = recent.filter(t => t.completedTs && t.completedTs >= windowThreshold);

      const avgLatency = (inWindow.length > 0)
        ? (inWindow.reduce((s, it) => s + (it.latencyMs || 0), 0) / inWindow.length)
        : (recent.length > 0 ? (recent[recent.length - 1].latencyMs || 0) : 0);

      const timeLabel = new Date(now).toLocaleTimeString();

      // Build new arrays immutably
      setMetrics(prevMetrics => {
        const newTimestamps = [...prevMetrics.timestamps, timeLabel];
        const newThroughput = [...prevMetrics.throughputSeries, { time: timeLabel, value: deltaCompleted }];
        const newLatency = [...prevMetrics.latencySeries, { time: timeLabel, value: Math.round(avgLatency) }];

        // Trim if needed
        if (newTimestamps.length > MAX_POINTS) {
          newTimestamps.shift();
          newThroughput.shift();
          newLatency.shift();
        }

        return {
          timestamps: newTimestamps,
          throughputSeries: newThroughput,
          latencySeries: newLatency
        };
      });
    } catch (err) {
      console.error('fetchStatus error', err);
    }
  }

  // Poll effect
  useEffect(() => {
    fetchStatus();
    if (autoPoll) {
      const id = setInterval(fetchStatus, 1200);
      return () => clearInterval(id);
    }
  }, [autoPoll]);

  async function generateLoad() {
    await fetch('http://localhost:3001/load', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 25, minMs: 1500, maxMs: 5000 })
    });
    fetchStatus();
  }

  async function sendOne(type = 'fetch') {
    await fetch('http://localhost:3001/request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, priority: 5, workMs: 1000 })
    });
    fetchStatus();
  }

  return (
    <div className="alm-root">
      <header className="alm-header">
        <div>
          <h1>ExamLoadManager — Admin</h1>
          <p className="alm-sub">Scheduler: <strong>{status?.scheduler}</strong> · Threads: <strong>{status?.threads}</strong></p>
        </div>
        <div className="alm-actions">
          <button onClick={fetchStatus} className="btn">Refresh</button>
          <button onClick={() => setAutoPoll(a => !a)} className="btn">{autoPoll ? 'Pause Poll' : 'Auto Poll'}</button>
          <button onClick={generateLoad} className="btn primary">Generate Load</button>
        </div>
      </header>

      <main className="alm-main">
        <section className="alm-left">
          <div className="card overview">
            <div className="row">
              <div><strong>Queue size</strong><div className="muted">{status?.queueSize ?? '—'}</div></div>
              <div><strong>Completed</strong><div className="muted">{status?.completed ?? 0}</div></div>
              <div><strong>Dropped</strong><div className="muted">{status?.dropped ?? 0}</div></div>
            </div>
          </div>

          <div className="card charts">
            <h3>Throughput (tasks / poll interval)</h3>
            <div className="chart">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={metrics.throughputSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <h3 style={{ marginTop: 12 }}>Latency (avg ms)</h3>
            <div className="chart">
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={metrics.latencySeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#8884d8" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card queue">
            <h3>Queue (first 25)</h3>
            <div className="q-list">
              {status?.queue?.slice(0,25).map(t => (
                <div key={t.id} className="q-item">
                  <div className="q-left">
                    <div className="q-type">{t.type}
                    <span className="q-uuid"> · {t.id?.slice(0,8)}</span>
                    </div>
                    <div className="q-meta">prio {t.priority} • rem {t.remainingMs}ms</div>
                  </div>
                  <div className="q-time">{new Date(t.arrivalTs).toLocaleTimeString()}</div>
                </div>
              ))}
              {(!status?.queue || status.queue.length === 0) && <div className="muted">No items in queue</div>}
            </div>
          </div>
        </section>

        <aside className="alm-right"> 
          <div className="card workers">
            <h3>Workers</h3>
            <div className="workers-list">
              {status?.workers?.map(w => (
                <div key={w.id} className={`worker ${w.busy ? 'busy' : 'idle'}`}>
                  <div className="w-left">
                    <div className="w-id">{w.id}</div>
                    <div className="w-task">{w.taskId ? w.taskId.slice(0,8) : '—'}</div>
                  </div>
                  <div className="w-status">{w.busy ? 'busy' : 'idle'}</div>
                </div>
              ))}
            </div>

            <div className="quick-actions">
              <button onClick={() => sendOne('login')} className="btn sm">Add Login</button>
              <button onClick={() => sendOne('fetch')} className="btn sm">Add Fetch</button>
              <button onClick={() => sendOne('submit')} className="btn sm primary">Add Submit</button>
            </div>
          </div>

          <div className="card recent">
            <h3>Recent completions (last 20)</h3>
            <div className="recent-list">
              {(status?.recentCompleted?.slice(-20).reverse() || []).map(c => (
                <div key={c.id} className="recent-item">
                  <div className="r-left">
                    <div className="r-type">{c.type}</div>
                    <div className="r-lat">{c.latencyMs ? `${Math.round(c.latencyMs)} ms` : '—'}</div>
                  </div>
                  <div className="r-time">{c.completedTs ? new Date(c.completedTs).toLocaleTimeString() : '—'}</div>
                </div>
              ))}
              {(!status?.recentCompleted || status.recentCompleted.length === 0) && <div className="muted">No completions yet</div>}
            </div>
          </div>
          
        </aside>
      </main>
    </div>
  );
}