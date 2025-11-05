// API configuration for PHP backend
const API_BASE_URL = 'https://ckarts.in/rfidscan/api';

export const api = {
  // Auth
  login: async (pin: string) => {
    const response = await fetch(`${API_BASE_URL}/auth.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    return response.json();
  },

  // Dashboard stats
  getStats: async () => {
    const response = await fetch(`${API_BASE_URL}/stats.php`);
    return response.json();
  },

  // Import inventory
  importInventory: async (category: string, file: File) => {
    const formData = new FormData();
    formData.append('category', category);
    formData.append('file', file);
    
    const response = await fetch(`${API_BASE_URL}/import.php`, {
      method: 'POST',
      body: formData,
    });
    return response.json();
  },

  // Cycle management
  startCycle: async () => {
    const response = await fetch(`${API_BASE_URL}/cycle.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    });
    return response.json();
  },

  finishCycle: async () => {
    const response = await fetch(`${API_BASE_URL}/cycle.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'finish' }),
    });
    return response.json();
  },

  // Live scans
  getLiveScans: async () => {
    const response = await fetch(`${API_BASE_URL}/scans.php`);
    return response.json();
  },

  // Missing items
  getMissingItems: async () => {
    const response = await fetch(`${API_BASE_URL}/missing.php`);
    return response.json();
  },

  // Export report
  exportReport: async () => {
    const response = await fetch(`${API_BASE_URL}/export.php`);
    const blob = await response.blob();
    return blob;
  },

  // Scan endpoint (called by RFID scanner)
  scan: async (tagId: string) => {
    const response = await fetch(`${API_BASE_URL}/scan.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagId }),
    });
    return response.json();
  },
};
