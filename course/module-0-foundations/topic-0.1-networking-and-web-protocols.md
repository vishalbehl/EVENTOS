# Module 0 - Topic 0.1: Networking, HTTP/2, WebSockets, CORS & Security Headers

## 1. Introduction & Learning Objectives
Welcome to **Topic 0.1**. In this chapter, you will master the network protocols and HTTP standards that underpin enterprise web applications like **EventOS**.

### Learning Outcomes:
- Understand TCP/IP packet transmission, multiplexing, and TLS 1.3 handshakes.
- Compare HTTP/1.1, HTTP/2, HTTP/3, WebSockets, and gRPC.
- Master CORS origin policies, preflight requests, and security header configurations.

---

## 2. The Network Stack: TCP/IP & HTTP Evolution

### 2.1 The TCP/IP 4-Layer Model
When a browser sends a request to the EventOS API gateway (`api.eventos.io`), the packet traverses four layers:
1. **Application Layer**: HTTP/2, WebSockets, TLS encapsulation.
2. **Transport Layer**: TCP (connection-oriented, reliable, ordered delivery via SYN -> SYN-ACK -> ACK).
3. **Internet Layer**: IP routing (IPv4/IPv6 packet addressing).
4. **Link Layer**: Ethernet/Wi-Fi frame transmission.

```
┌────────────────────────────────────────────────────────┐
│  Application Layer (HTTP/2, WebSockets, TLS 1.3)       │
├────────────────────────────────────────────────────────┤
│  Transport Layer (TCP / UDP, Port Multiplexing)        │
├────────────────────────────────────────────────────────┤
│  Internet Layer (IP Addressing, Packet Routing)        │
├────────────────────────────────────────────────────────┤
│  Link Layer (Network Hardware & Frame Transmission)    │
└────────────────────────────────────────────────────────┘
```

---

## 3. Web Protocols Comparison

| Protocol | Transport | Multiplexing | Typical Use Case in EventOS |
| :--- | :--- | :--- | :--- |
| **HTTP/1.1** | TCP | Head-of-line blocking | Legacy clients, simple webhooks |
| **HTTP/2** | TCP | Binary framing layer (Single TCP connection) | REST API requests between Next.js portals & FastAPI |
| **WebSockets** | TCP | Full-duplex persistent TCP socket | Live room metric updates & Socket.IO real-time alerts |
| **gRPC** | HTTP/2 | High-speed Protobuf serialization | Internal venue edge server sync |

---

## 4. Cross-Origin Resource Sharing (CORS) & Security Headers

### 4.1 CORS Mechanism
When `organiser.eventos.io` (port 3001) calls `api.eventos.io` (port 8000), the browser issues a preflight `OPTIONS` request:

```http
OPTIONS /api/v1/events HTTP/1.1
Host: api.eventos.io
Origin: http://localhost:3001
Access-Control-Request-Method: POST
Access-Control-Request-Headers: Authorization, Content-Type
```

The server responds with allowed origins:
```http
HTTP/1.1 200 OK
Access-Control-Allow-Origin: http://localhost:3001
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
```

### 4.2 Production Security Headers Configuration
In FastAPI backend ([services/backend/app/main.py](file:///d:/DEV/conf-platform/services/backend/app/main.py)), security headers must be enforced:
- `Strict-Transport-Security` (HSTS): Enforces HTTPS connections.
- `X-Content-Type-Options: nosniff`: Prevents MIME type sniffing.
- `X-Frame-Options: DENY`: Prevents Clickjacking attacks.
- `Content-Security-Policy`: Restricts inline script executions.

---

## 5. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Open Chrome DevTools Network Tab while running `npm run dev:command-center`.
2. Inspect the preflight `OPTIONS` request issued by Axios.
3. Verify that response headers include `Access-Control-Allow-Origin` and `Strict-Transport-Security`.

---

## 6. Chapter Summary & Next Steps
You have mastered network protocols, TCP/IP fundamentals, and security header configurations. Next, move to **[Topic 0.2: OS Concurrency & Async I/O](./topic-0.2-os-concurrency-and-async-io.md)**.
