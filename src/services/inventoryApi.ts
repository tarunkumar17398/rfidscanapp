export interface InventoryItem {
  'ITEM CODE': string;
  'PARTICULARS': string;
  'SIZE': string;
  'Weight': string;
  'RFID-EPC': string;
}

export interface APIResponse {
  success: boolean;
  count: number;
  data: InventoryItem[];
}

export const fetchInventoryFromAPI = async (): Promise<InventoryItem[]> => {
  const apiUrl = "https://eucxuuepfsrbgktlqyqx.supabase.co/functions/v1/rfid-export";
  
  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  const result = await response.json();
  
  // CRITICAL: Use result.data directly
  const items = result.data || [];
  console.log(`✓ Fetched ${items.length} items`);
  
  return items;
};
