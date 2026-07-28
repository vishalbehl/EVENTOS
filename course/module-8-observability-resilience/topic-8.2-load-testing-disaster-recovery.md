# Module 8 - Topic 8.2: Load Testing with k6/Locust & Disaster Recovery Planning

## 1. Introduction & Learning Objectives
Welcome to **Topic 8.2**. In this chapter, you will master performance load testing (**k6**, **Locust**), bottleneck identification, database connection pool tuning, and disaster recovery strategies.

### Learning Outcomes:
- Simulate thousands of concurrent users performing check-in scans using k6 scripts.
- Identify memory leaks, thread starvation, and DB connection pool bottlenecks.
- Formulate high-availability disaster recovery plans (PITR, RTO < 15m, RPO < 1m).

---

## 2. High-Throughput Load Testing with k6

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },  // Ramp up to 50 virtual users
    { duration: '1m', target: 500 },  // Spike to 500 concurrent users
    { duration: '30s', target: 0 },   // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'], // 95% of requests must complete under 200ms
    http_req_failed: ['rate<0.01'],   // Error rate must be under 1%
  },
};

export default function () {
  const url = 'http://127.0.0.1:8000/api/v1/events';
  const payload = JSON.stringify({
    title: 'Load Test Event',
    slug: 'load-test-event',
    tenant_id: 'org_test'
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': 'org_test',
    },
  };

  const res = http.post(url, payload, params);
  check(res, { 'status is 201': (r) => r.status === 201 });
  sleep(1);
}
```

---

## 3. Disaster Recovery & High-Availability SLA Matrix

| SLA Metric | Target Benchmark | Implementation Strategy |
| :--- | :--- | :--- |
| **Recovery Time Objective (RTO)** | < 15 Minutes | Automated Terraform failover to secondary AWS availability zone |
| **Recovery Point Objective (RPO)** | < 1 Minute | PostgreSQL Point-in-Time Recovery (PITR) with continuous WAL archiving to S3 |
| **Availability** | 99.95% Uptime | ECS Fargate multi-AZ tasks behind AWS Application Load Balancer |

---

## 4. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Install k6 CLI (`winget install k6` or download binary).
2. Run the k6 script against your local FastAPI backend and review p95 response latencies.

---

## 5. Chapter Summary & Next Steps
You have completed Module 8! You have mastered structured logging, Sentry error tracking, k6 load testing, and disaster recovery planning. Next, proceed to the **[Capstone Project Specification](../capstone-project/capstone-specification-and-deployment.md)**!
