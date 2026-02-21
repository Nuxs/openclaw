#!/bin/bash

# Demo Data Preparation Script
# Creates realistic test data for dashboard demonstration

echo "🚀 Preparing demo data for Web3 Core Dashboard..."
echo ""

# Create demo data directory
mkdir -p demo-data

# Generate demo database
cat > demo-data/create-demo-db.sql << 'SQL'
-- ============================================
-- Web3 Core Dashboard Demo Database
-- ============================================

-- Resources Table
CREATE TABLE IF NOT EXISTS resources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    price INTEGER NOT NULL,
    owner TEXT NOT NULL,
    status TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Leases Table
CREATE TABLE IF NOT EXISTS leases (
    id TEXT PRIMARY KEY,
    resource_id TEXT NOT NULL,
    tenant TEXT NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    status TEXT NOT NULL,
    amount INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (resource_id) REFERENCES resources(id)
);

-- Disputes Table
CREATE TABLE IF NOT EXISTS disputes (
    id TEXT PRIMARY KEY,
    lease_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    plaintiff TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    resolution TEXT,
    FOREIGN KEY (lease_id) REFERENCES leases(id)
);

-- Alerts Table
CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    priority TEXT NOT NULL,
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at DATETIME,
    acknowledged_by TEXT
);

-- Activities Table (for timeline)
CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    user TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Insert Demo Resources (20 items)
-- ============================================

INSERT INTO resources (id, name, type, price, owner, status, description) VALUES
    ('res-001', 'Professional GPU Instance RTX 4090', 'Compute', 200, 'alice.eth', 'Available', 'High-performance GPU perfect for AI training and 3D rendering'),
    ('res-002', 'High-Speed NVMe Storage 10TB', 'Storage', 150, 'bob.eth', 'Rented', 'Ultra-fast NVMe storage with 7GB/s read speed'),
    ('res-003', 'CDN Bandwidth Package Premium', 'Network', 100, 'carol.eth', 'Available', 'Global CDN with 200+ edge locations'),
    ('res-004', 'AI Training Cluster 8x A100', 'Compute', 500, 'dave.eth', 'Maintenance', 'Distributed training cluster with 8x NVIDIA A100 GPUs'),
    ('res-005', 'Database Hosting PostgreSQL', 'Storage', 80, 'eve.eth', 'Available', 'Managed PostgreSQL with automatic backups'),
    ('res-006', 'Web Hosting VPS Premium', 'Compute', 50, 'frank.eth', 'Available', '8 vCPU, 16GB RAM, 200GB SSD'),
    ('res-007', 'Object Storage S3-Compatible', 'Storage', 30, 'grace.eth', 'Rented', 'S3-compatible storage with 99.99% uptime'),
    ('res-008', 'Load Balancer Pro', 'Network', 120, 'henry.eth', 'Available', 'Layer 7 load balancer with SSL termination'),
    ('res-009', 'GPU Mining Rig 12x RTX 3080', 'Compute', 300, 'iris.eth', 'Rented', 'Optimized for cryptocurrency mining'),
    ('res-010', 'Backup Storage 50TB', 'Storage', 200, 'jack.eth', 'Available', 'Cold storage for long-term backups'),
    ('res-011', 'VPN Server Multi-Region', 'Network', 40, 'kate.eth', 'Available', 'VPN servers in 50+ countries'),
    ('res-012', 'Machine Learning API Endpoint', 'Compute', 180, 'leo.eth', 'Rented', 'Pre-trained models via REST API'),
    ('res-013', 'Video Transcoding Service', 'Compute', 90, 'mia.eth', 'Available', 'Real-time video transcoding and streaming'),
    ('res-014', 'Distributed File System 100TB', 'Storage', 400, 'noah.eth', 'Maintenance', 'HDFS-compatible distributed storage'),
    ('res-015', 'DDoS Protection Service', 'Network', 250, 'olivia.eth', 'Available', 'Enterprise DDoS protection up to 500Gbps'),
    ('res-016', 'Kubernetes Cluster Managed', 'Compute', 280, 'paul.eth', 'Available', 'Fully managed K8s with auto-scaling'),
    ('res-017', 'Redis Cache Cluster', 'Storage', 60, 'quinn.eth', 'Rented', 'High-performance in-memory cache'),
    ('res-018', 'API Gateway Enterprise', 'Network', 150, 'rachel.eth', 'Available', 'Rate limiting, auth, and monitoring'),
    ('res-019', 'Render Farm GPU Cluster', 'Compute', 600, 'sam.eth', 'Available', 'Professional 3D rendering cluster'),
    ('res-020', 'Blockchain Node Hosting', 'Compute', 220, 'tina.eth', 'Rented', 'Fully synced Ethereum archive node');

-- ============================================
-- Insert Demo Leases (15 items)
-- ============================================

INSERT INTO leases (id, resource_id, tenant, start_time, end_time, status, amount) VALUES
    ('lease-001', 'res-002', 'frank.eth', '2026-02-20 00:00:00', '2026-03-20 23:59:59', 'Active', 150),
    ('lease-002', 'res-004', 'grace.eth', '2026-02-18 00:00:00', '2026-02-25 23:59:59', 'Active', 500),
    ('lease-003', 'res-001', 'henry.eth', '2026-01-15 00:00:00', '2026-02-15 23:59:59', 'Completed', 200),
    ('lease-004', 'res-007', 'iris.eth', '2026-02-19 00:00:00', '2026-03-19 23:59:59', 'Active', 30),
    ('lease-005', 'res-009', 'jack.eth', '2026-02-10 00:00:00', '2026-03-10 23:59:59', 'Active', 300),
    ('lease-006', 'res-012', 'kate.eth', '2026-02-21 00:00:00', '2026-03-21 23:59:59', 'Active', 180),
    ('lease-007', 'res-017', 'leo.eth', '2026-02-17 00:00:00', '2026-03-17 23:59:59', 'Active', 60),
    ('lease-008', 'res-020', 'mia.eth', '2026-02-16 00:00:00', '2026-03-16 23:59:59', 'Active', 220),
    ('lease-009', 'res-006', 'noah.eth', '2026-01-20 00:00:00', '2026-02-20 23:59:59', 'Expired', 50),
    ('lease-010', 'res-008', 'olivia.eth', '2026-01-25 00:00:00', '2026-02-15 23:59:59', 'Completed', 120),
    ('lease-011', 'res-013', 'paul.eth', '2026-02-05 00:00:00', '2026-02-10 23:59:59', 'Cancelled', 90),
    ('lease-012', 'res-003', 'quinn.eth', '2026-01-10 00:00:00', '2026-02-10 23:59:59', 'Completed', 100),
    ('lease-013', 'res-011', 'rachel.eth', '2026-02-14 00:00:00', '2026-02-19 23:59:59', 'Expired', 40),
    ('lease-014', 'res-015', 'sam.eth', '2026-02-22 00:00:00', '2026-03-22 23:59:59', 'Pending', 250),
    ('lease-015', 'res-019', 'tina.eth', '2026-02-23 00:00:00', '2026-03-23 23:59:59', 'Pending', 600);

-- ============================================
-- Insert Demo Disputes (8 items)
-- ============================================

INSERT INTO disputes (id, lease_id, reason, description, status, plaintiff, created_at) VALUES
    ('dispute-001', 'lease-001', 'Performance Issues', 'Storage speed is 50% lower than advertised. Expected 7GB/s but getting only 3.5GB/s. This severely impacts our production workload.', 'Pending', 'frank.eth', '2026-02-21 08:30:00'),
    ('dispute-002', 'lease-002', 'Availability', 'Service experienced 6 hours of downtime on 2026-02-19, exceeding our SLA of 99.9% uptime. We need compensation for the business impact.', 'In Progress', 'grace.eth', '2026-02-20 15:00:00'),
    ('dispute-003', 'lease-003', 'Billing Error', 'Overcharged by 20 tokens. Contract specified 200 tokens/month but was charged 220 tokens. Please refund the difference.', 'Resolved', 'henry.eth', '2026-02-16 10:00:00'),
    ('dispute-004', 'lease-005', 'Resource Specification', 'Mining rig showing only 10 GPUs instead of advertised 12. Hashrate is 17% lower than expected.', 'Pending', 'jack.eth', '2026-02-21 09:15:00'),
    ('dispute-005', 'lease-006', 'API Rate Limiting', 'API endpoint is rate-limited to 100 req/s but contract states 500 req/s. This is blocking our production traffic.', 'In Progress', 'kate.eth', '2026-02-21 11:00:00'),
    ('dispute-006', 'lease-009', 'Early Termination', 'Service terminated 5 days early without notice. Seeking partial refund for unused time.', 'Resolved', 'noah.eth', '2026-02-20 16:30:00'),
    ('dispute-007', 'lease-011', 'Quality of Service', 'Video transcoding quality below acceptable standards. Multiple artifacts and encoding errors.', 'Resolved', 'paul.eth', '2026-02-12 14:20:00'),
    ('dispute-008', 'lease-004', 'Data Loss', 'Lost 500MB of data during maintenance window. No backup available despite backup being part of the SLA.', 'In Progress', 'iris.eth', '2026-02-21 07:45:00');

-- Update resolved disputes
UPDATE disputes SET 
    resolved_at = '2026-02-17 14:00:00',
    resolution = 'Partial refund of 10 tokens approved. Billing error confirmed and corrected.'
WHERE id = 'dispute-003';

UPDATE disputes SET 
    resolved_at = '2026-02-21 10:00:00',
    resolution = 'Refund of 8.33 tokens (5 days) approved. Early termination policy violation confirmed.'
WHERE id = 'dispute-006';

UPDATE disputes SET 
    resolved_at = '2026-02-13 16:30:00',
    resolution = 'Service credit of 45 tokens issued. Quality issues acknowledged and fixed.'
WHERE id = 'dispute-007';

-- ============================================
-- Insert Demo Alerts (12 items)
-- ============================================

INSERT INTO alerts (id, priority, category, message, details, status, created_at) VALUES
    ('alert-001', 'P0', 'Security', 'Unauthorized access attempt detected', 'Multiple failed login attempts from IP 192.168.1.100. Possible brute force attack. Account locked for security.', 'Active', '2026-02-21 08:00:00'),
    ('alert-002', 'P1', 'Performance', 'API response time > 1s', 'Average API response time is 1.2s, exceeding threshold of 1s. Affecting endpoints: /api/resources, /api/leases', 'Active', '2026-02-21 07:30:00'),
    ('alert-003', 'P2', 'Storage', 'Disk usage at 75%', 'Main storage volume at 75% capacity (750GB/1TB used). Consider cleanup or expansion.', 'Active', '2026-02-21 06:00:00'),
    ('alert-004', 'Info', 'System', 'Scheduled maintenance in 24h', 'Routine system maintenance scheduled for 2026-02-22 02:00-04:00 UTC. Expected downtime: 2 hours.', 'Acknowledged', '2026-02-20 18:00:00'),
    ('alert-005', 'P0', 'Network', 'DDoS attack detected', 'High volume of traffic detected from multiple sources. DDoS mitigation activated. Peak: 50Gbps.', 'Resolved', '2026-02-20 22:00:00'),
    ('alert-006', 'P1', 'Database', 'Database connection pool exhausted', 'All 100 database connections in use. New requests queued. Consider increasing pool size.', 'Active', '2026-02-21 09:00:00'),
    ('alert-007', 'P2', 'Monitoring', 'High CPU usage on node-03', 'CPU usage at 85% on node-03. Processes: web3-gateway (60%), postgres (25%)', 'Active', '2026-02-21 08:45:00'),
    ('alert-008', 'P1', 'Security', 'SSL certificate expiring in 7 days', 'SSL certificate for *.example.com expires on 2026-02-28. Renewal required immediately.', 'Active', '2026-02-21 10:00:00'),
    ('alert-009', 'P2', 'Backup', 'Backup failed for db-primary', 'Automated backup failed at 2026-02-21 03:00. Error: insufficient disk space. Last successful backup: 2026-02-20.', 'Active', '2026-02-21 03:15:00'),
    ('alert-010', 'Info', 'Update', 'New version available: v1.0.1', 'Security update available. Includes fixes for CVE-2026-1234. Upgrade recommended.', 'Active', '2026-02-21 06:30:00'),
    ('alert-011', 'P0', 'Service', 'Payment gateway offline', 'Payment gateway unresponsive. All transactions failing. Revenue impact: HIGH. Investigating.', 'Resolved', '2026-02-20 14:00:00'),
    ('alert-012', 'P1', 'Compliance', 'GDPR data retention review needed', '500 user accounts inactive for >2 years. GDPR requires review and potential deletion.', 'Active', '2026-02-21 05:00:00');

-- Update acknowledged/resolved alerts
UPDATE alerts SET 
    acknowledged_at = '2026-02-20 18:30:00',
    acknowledged_by = 'admin.eth'
WHERE id = 'alert-004';

UPDATE alerts SET 
    status = 'Resolved',
    acknowledged_at = '2026-02-20 23:30:00',
    acknowledged_by = 'security-team.eth'
WHERE id = 'alert-005';

UPDATE alerts SET 
    status = 'Resolved',
    acknowledged_at = '2026-02-20 15:00:00',
    acknowledged_by = 'devops-team.eth'
WHERE id = 'alert-011';

-- ============================================
-- Insert Demo Activities (30 items)
-- ============================================

INSERT INTO activities (type, title, description, user, timestamp) VALUES
    ('resource', 'New Resource Published', 'Blockchain Node Hosting published by tina.eth', 'tina.eth', '2026-02-21 10:30:00'),
    ('lease', 'Lease Created', 'tina.eth rented Blockchain Node Hosting for 30 days', 'tina.eth', '2026-02-21 10:35:00'),
    ('dispute', 'Dispute Filed', 'frank.eth filed dispute for lease-001: Performance Issues', 'frank.eth', '2026-02-21 08:30:00'),
    ('alert', 'Critical Alert', 'P0 Security Alert: Unauthorized access attempt', 'system', '2026-02-21 08:00:00'),
    ('lease', 'Lease Activated', 'Lease lease-006 activated for kate.eth', 'system', '2026-02-21 00:00:00'),
    ('resource', 'Resource Updated', 'AI Training Cluster status changed to Maintenance', 'dave.eth', '2026-02-20 22:00:00'),
    ('dispute', 'Dispute Resolved', 'dispute-006 resolved with partial refund', 'admin.eth', '2026-02-21 10:00:00'),
    ('alert', 'Alert Acknowledged', 'P1 Performance alert acknowledged by ops-team', 'ops-team.eth', '2026-02-21 08:00:00'),
    ('lease', 'Lease Completed', 'Lease lease-010 completed successfully', 'system', '2026-02-20 18:00:00'),
    ('resource', 'New Resource Published', 'Render Farm GPU Cluster published by sam.eth', 'sam.eth', '2026-02-20 16:30:00'),
    ('dispute', 'Dispute Updated', 'dispute-002 status changed to In Progress', 'admin.eth', '2026-02-20 16:00:00'),
    ('lease', 'Lease Expired', 'Lease lease-009 expired', 'system', '2026-02-20 23:59:59'),
    ('alert', 'Alert Resolved', 'DDoS attack mitigated successfully', 'security-team.eth', '2026-02-20 23:30:00'),
    ('resource', 'Resource Price Updated', 'CDN Bandwidth Package price reduced to 100 tokens', 'carol.eth', '2026-02-20 14:00:00'),
    ('lease', 'Lease Cancelled', 'Lease lease-011 cancelled by paul.eth', 'paul.eth', '2026-02-20 12:00:00'),
    ('dispute', 'Dispute Filed', 'iris.eth filed dispute for lease-004: Data Loss', 'iris.eth', '2026-02-21 07:45:00'),
    ('alert', 'New Alert', 'P1 SSL certificate expiring soon', 'system', '2026-02-21 10:00:00'),
    ('resource', 'Resource Deleted', 'Old VPS instance removed by frank.eth', 'frank.eth', '2026-02-20 10:00:00'),
    ('lease', 'Lease Extended', 'Lease lease-001 extended by 15 days', 'frank.eth', '2026-02-20 09:00:00'),
    ('dispute', 'Dispute Resolved', 'dispute-007 resolved with service credit', 'admin.eth', '2026-02-13 16:30:00'),
    ('alert', 'Alert Created', 'P2 Storage: Disk usage at 75%', 'system', '2026-02-21 06:00:00'),
    ('resource', 'New Resource Published', 'API Gateway Enterprise published by rachel.eth', 'rachel.eth', '2026-02-19 15:00:00'),
    ('lease', 'Lease Payment Received', 'Payment received for lease-005: 300 tokens', 'system', '2026-02-19 12:00:00'),
    ('dispute', 'Dispute Filed', 'jack.eth filed dispute for lease-005: Resource Specification', 'jack.eth', '2026-02-21 09:15:00'),
    ('alert', 'Alert Created', 'P1 Database connection pool exhausted', 'system', '2026-02-21 09:00:00'),
    ('resource', 'Resource Activated', 'Kubernetes Cluster Managed now available', 'paul.eth', '2026-02-19 10:00:00'),
    ('lease', 'Lease Created', 'sam.eth rented DDoS Protection Service', 'sam.eth', '2026-02-22 00:00:00'),
    ('dispute', 'Dispute Updated', 'dispute-005 status changed to In Progress', 'admin.eth', '2026-02-21 11:30:00'),
    ('alert', 'Alert Created', 'Info: New version v1.0.1 available', 'system', '2026-02-21 06:30:00'),
    ('resource', 'Resource Updated', 'Professional GPU Instance description updated', 'alice.eth', '2026-02-18 14:00:00');

SQL

echo "📝 Creating database..."
sqlite3 demo-data/demo.db < demo-data/create-demo-db.sql

echo "✅ Database created: demo-data/demo.db"
echo ""

# Generate summary report
echo "📊 Demo Data Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

RESOURCES=$(sqlite3 demo-data/demo.db "SELECT COUNT(*) FROM resources;")
LEASES=$(sqlite3 demo-data/demo.db "SELECT COUNT(*) FROM leases;")
DISPUTES=$(sqlite3 demo-data/demo.db "SELECT COUNT(*) FROM disputes;")
ALERTS=$(sqlite3 demo-data/demo.db "SELECT COUNT(*) FROM alerts;")
ACTIVITIES=$(sqlite3 demo-data/demo.db "SELECT COUNT(*) FROM activities;")

echo "Resources:  $RESOURCES"
echo "Leases:     $LEASES"
echo "Disputes:   $DISPUTES"
echo "Alerts:     $ALERTS"
echo "Activities: $ACTIVITIES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Generate status breakdown
echo "📈 Status Breakdown"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Resources by Status:"
sqlite3 demo-data/demo.db "SELECT status, COUNT(*) FROM resources GROUP BY status;" | while IFS='|' read status count; do
    echo "  $status: $count"
done

echo ""
echo "Leases by Status:"
sqlite3 demo-data/demo.db "SELECT status, COUNT(*) FROM leases GROUP BY status;" | while IFS='|' read status count; do
    echo "  $status: $count"
done

echo ""
echo "Disputes by Status:"
sqlite3 demo-data/demo.db "SELECT status, COUNT(*) FROM disputes GROUP BY status;" | while IFS='|' read status count; do
    echo "  $status: $count"
done

echo ""
echo "Alerts by Priority:"
sqlite3 demo-data/demo.db "SELECT priority, COUNT(*) FROM alerts GROUP BY priority ORDER BY CASE priority WHEN 'P0' THEN 1 WHEN 'P1' THEN 2 WHEN 'P2' THEN 3 ELSE 4 END;" | while IFS='|' read priority count; do
    echo "  $priority: $count"
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "✅ Demo data preparation complete!"
echo ""
echo "📁 Files created:"
echo "   - demo-data/demo.db (SQLite database)"
echo "   - demo-data/create-demo-db.sql (SQL script)"
echo ""
echo "🚀 Next steps:"
echo "   1. Configure your application to use demo-data/demo.db"
echo "   2. Start the dashboard server"
echo "   3. Begin recording your demo video"
echo ""
echo "💡 Tip: You can reset the demo data by running this script again"
echo ""
