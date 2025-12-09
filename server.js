// server.js
import express from 'express';
import bodyParser from 'body-parser';
import { Worker } from 'worker_threads';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';

const app = express();
app.use(cors());

app.use(bodyParser.json());


const THREAD_COUNT = 4;            // number of workers in pool
const SCHEDULER = 'PRIORITY';
//const SCHEDULER = 'ROUND_ROBIN';   // 'FCFS' | 'PRIORITY' | 'ROUND_ROBIN'
const RR_QUANTUM_MS = 200;         // quantum for round-robin
const MAX_QUEUE = 1000;            // optional queue capacity
const RECENT_COMPLETED_MAX = 1000;

// Task representation
class Task {
  constructor({ type='generic', priority=5, workMs=500, createdBy='student' }) {
    this.id = uuidv4();
    this.type = type;
    this.priority = priority;
    this.arrivalTs = Date.now();
    this.workMs = workMs;         
    this.remainingMs = workMs;    
    this.createdBy = createdBy;
    this.started = false;
  }
}

// priority queue (min-heap by priority then arrival)
class PriorityQueue {
  constructor() { this._arr = []; }
  _cmp(a,b){
    if(a.priority !== b.priority) return a.priority - b.priority;
    return a.arrivalTs - b.arrivalTs;
  }
  push(task){
    this._arr.push(task);
    this._arr.sort(this._cmp.bind(this));
  }
  pop(){ return this._arr.shift(); }
  peek(){ return this._arr[0]; }
  size(){ return this._arr.length; }
  all(){ return this._arr.slice(); }
}

// FCFS queue
class FCFSQueue {
  constructor(){ this._q = []; }
  push(task){ this._q.push(task); }
  pop(){ return this._q.shift(); }
  size(){ return this._q.length; }
  all(){ return this._q.slice(); }
}




const workers = [];
const workerStatus = {}; // workerId -> { idle: bool, taskId: null|id, since }

for(let i=0;i<THREAD_COUNT;i++){
  const w = new Worker(new URL('./worker.js', import.meta.url));
  const wid = `w-${i}`;
  workers.push({ id: wid, worker: w, busy: false });
  workerStatus[wid] = { idle:true, taskId:null, since:null };

  w.on('message', (msg) => {
    handleWorkerMessage(wid, msg);
  });
  w.on('error', (err) => {
    console.error('Worker error', wid, err);
    workerStatus[wid] = { idle:true, taskId:null, since:null };
  });
}

// The request queue depending on scheduler 
let queue;
if(SCHEDULER === 'PRIORITY') queue = new PriorityQueue();
else queue = new FCFSQueue();

// Bookkeeping and metrics 
const tasksMap = new Map();  
let completedTasks = [];
let droppedCount = 0;

// Main scheduling loop: when a worker becomes idle, scheduler assigns a task
function assignTasks() {
  // find idle worker
  const idleWorkerObj = workers.find(w => !w.busy);
  if(!idleWorkerObj) return;
  // find next task according to scheduler
  let task = null;
  if(SCHEDULER === 'FCFS') {
    if(queue.size()>0) task = queue.pop();
  } else if(SCHEDULER === 'PRIORITY') {
    if(queue.size()>0) task = queue.pop();
  } else if(SCHEDULER === 'ROUND_ROBIN') {
    if(queue.size()>0) task = queue.pop();
  }

  if(!task) return;

  idleWorkerObj.busy = true;
  workerStatus[idleWorkerObj.id] = { idle:false, taskId: task.id, since: Date.now() };

  // For RR, tell worker to only work for quantumMs (so it may require requeue)
  const payload = {
    taskId: task.id,
    workMs: (SCHEDULER === 'ROUND_ROBIN') ? task.remainingMs : task.remainingMs,
    quantumMs: (SCHEDULER === 'ROUND_ROBIN') ? RR_QUANTUM_MS : undefined
  };
  // mark started
  task.started = true;
  idleWorkerObj.worker.postMessage(payload);
}

// Handler for worker messages
function handleWorkerMessage(workerId, msg) {
  const { taskId, consumedMs } = msg;
  const task = tasksMap.get(taskId);
  if(!task){
    console.warn('Unknown task id returned', taskId);
    // free worker
    const wobj = workers.find(w => w.id === workerId);
    if(wobj) { wobj.busy = false; workerStatus[workerId] = { idle:true, taskId:null, since:null }; }
    assignTasks(); return;
  }

  // subtract consumed time
  task.remainingMs = Math.max(0, task.remainingMs - consumedMs);

  if(task.remainingMs <= 0) {
    task.completedTs = Date.now();
    completedTasks.push(task);
    tasksMap.delete(task.id);
  } else {
    // not finished -> for RR, requeue (with same priority etc.)
    if(SCHEDULER === 'ROUND_ROBIN') {
      // push to tail of queue
      queue.push(task);
    } else {
      // For FCFS/PRIORITY we treat as non-preemptive; but if we ever had quantum we would requeue
      // We'll treat as completed only when worker returns full consumed >= original. (In non-preemptive we shouldn't get partial.)
      // But to be safe, if not finished requeue
      queue.push(task);
    }
  }

  // free worker
  const w = workers.find(w => w.id === workerId);
  if(w) { w.busy = false; workerStatus[workerId] = { idle:true, taskId:null, since:null }; }

  // Try to assign next tasks (loop so multiple idle workers get tasks)
  assignTasks();
  setImmediate(assignTasks);
}

// API: submit simulated request
app.post('/request', (req, res) => {
  const { type='generic', priority=5, workMs=500, createdBy='student' } = req.body || {};
  if(queue.size && queue.size() >= MAX_QUEUE) {
    droppedCount++;
    return res.status(503).json({ error: 'queue-full' });
  }
  const task = new Task({ type, priority, workMs, createdBy });
  tasksMap.set(task.id, task);
  queue.push(task);
  // trigger assignment
  setImmediate(assignTasks);
  res.json({ taskId: task.id });
});

// API: status for admin UI
app.get('/status', (req, res) => {
  const qItems = queue.all ? queue.all() : [];
  //newly added code
    const recent = completedTasks.slice(-(RECENT_COMPLETED_MAX)).map(t => ({
    id: t.id,
    type: t.type,
    arrivalTs: t.arrivalTs,
    completedTs: t.completedTs,
    latencyMs: (t.completedTs && t.arrivalTs) ? (t.completedTs - t.arrivalTs) : null
  }));
  //upto here

  const workersView = workers.map(w => ({
    id: w.id,
    busy: w.busy,
    taskId: workerStatus[w.id]?.taskId || null,
    since: workerStatus[w.id]?.since || null
  }));

  res.json({
    scheduler: SCHEDULER,
    threads: THREAD_COUNT,
    queueSize: qItems.length,
    queue: qItems.map(t => ({ id: t.id, type: t.type, priority: t.priority, remainingMs: t.remainingMs, arrivalTs: t.arrivalTs })),
    workers: workersView,
    completed: completedTasks.length,
    dropped: droppedCount,
    recentCompleted: recent 
  });
});

// Simple endpoint to change scheduler at runtime for experiments
app.post('/admin/scheduler', (req, res) => {
  const { scheduler } = req.body;
  if(['FCFS','PRIORITY','ROUND_ROBIN'].includes(scheduler)) {
    console.log('Changing scheduler to', scheduler, '— this restart may not migrate queued tasks as intended.');
    return res.status(501).json({ error: 'change-scheduler-not-implemented-dynamically' });
  }
  res.status(400).json({ error: 'invalid-scheduler' });
});

// Bulk load generator for testing: create N requests with random sizes
app.post('/load', (req, res) => {
  const { count=100, minMs=100, maxMs=2000 } = req.body || {};
  for(let i=0;i<count;i++){
    const workMs = Math.floor(Math.random()*(maxMs-minMs+1))+minMs;
    const priority = Math.ceil(Math.random()*10);
    const type = (Math.random() < 0.2) ? 'submit' : ((Math.random()<0.4)?'fetch':'login');
    const task = new Task({ type, priority, workMs });
    tasksMap.set(task.id, task);
    queue.push(task);
  }
  setImmediate(assignTasks);
  res.json({ queued: count });
});

// start server
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`ExamLoadManager backend started on port ${PORT}`);
  console.log(`Scheduler=${SCHEDULER}, threads=${THREAD_COUNT}, RR_QUANTUM_MS=${RR_QUANTUM_MS}`);
});
