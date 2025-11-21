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

export async function fetchInventoryFromAPI(): Promise<InventoryItem[]> {
  try {
    const response = await fetch('https://eucxuuepfsrbgktlqyqx.supabase.co/functions/v1/rfid-export');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result: APIResponse = await response.json();
    
    // Debug logging
    console.log('API Response:', result);
    console.log('Item count:', result.count);
    console.log('Data array length:', result.data?.length);
    
    if (!result.success || !result.data) {
      throw new Error('Invalid API response');
    }
    
    // Validate data completeness
    if (result.count !== result.data.length) {
      console.warn(`⚠️ Data mismatch: Expected ${result.count} items, received ${result.data.length}`);
    }
    
    return result.data;
  } catch (error) {
    console.error('Error fetching inventory from API:', error);
    throw error;
  }
}
