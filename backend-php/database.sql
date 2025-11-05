-- RFID Inventory Database Setup
-- Run this SQL in your MySQL/phpMyAdmin

CREATE DATABASE IF NOT EXISTS rfid_inventory CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE rfid_inventory;

-- Inventory table
CREATE TABLE IF NOT EXISTS inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  item_code VARCHAR(50) NOT NULL,
  particulars VARCHAR(255) NOT NULL,
  size VARCHAR(50),
  weight VARCHAR(50),
  tag_id VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_category (category),
  INDEX idx_tag_id (tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Scans table
CREATE TABLE IF NOT EXISTS scans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tag_id VARCHAR(100) NOT NULL,
  item_code VARCHAR(50),
  category VARCHAR(50),
  scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tag_id (tag_id),
  INDEX idx_scanned_at (scanned_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cycles table
CREATE TABLE IF NOT EXISTS cycles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  status VARCHAR(20) DEFAULT 'active',
  started_at TIMESTAMP NULL,
  finished_at TIMESTAMP NULL,
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert initial active cycle
INSERT INTO cycles (status, started_at) VALUES ('active', NOW());
