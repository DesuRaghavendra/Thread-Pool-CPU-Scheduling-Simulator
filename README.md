# **Thread Pool & CPU Scheduling Simulator with Real-Time Metrics**

**Thread Pool & CPU Scheduling Simulator with Real-Time Metrics** is a simulation tool designed to model a high-traffic server that processes user requests using thread pools and various CPU scheduling algorithms. The system provides real-time metrics to help visualize performance, task queue management, and worker status.

## **Features**
- **Thread Pooling**: Simulates a pool of worker threads to handle requests efficiently.
- **CPU Scheduling Algorithms**:
  - **First-Come, First-Serve (FCFS)**: Processes requests in the order they arrive.
  - **Priority Scheduling**: Requests are processed based on priority, with higher priority requests getting processed first.
  - **Round Robin**: Requests are processed in a cyclic order, each getting a fixed time slice (quantum).
- **Request Simulation**: Simulate different types of user requests such as `login`, `fetch questions`, and `submit answers`.
- **Real-Time Metrics**: Visualize and track key performance metrics:
  - Throughput (tasks per interval)
  - Latency (average task completion time)
  - Worker status (idle/busy)
  - Task queue details
- **Admin Dashboard**: An interactive web interface to monitor the system’s performance.

## **Tech Stack**
- **Backend**: Node.js, Express, `worker_threads`, `web-vitals`
- **Frontend**: React.js, Recharts for real-time data visualization
- **Scheduler Algorithms**: Custom implementation of FCFS, Priority, and Round Robin

## **Installation and Setup**

### Prerequisites
Make sure you have the following installed:
- **Node.js** (v14.x or later)
- **npm** (v6.x or later)
- **Git**

### 1. **Clone the Repository**
```bash
git clone https://github.com/your-username/ThreadPool-CPUScheduler.git
