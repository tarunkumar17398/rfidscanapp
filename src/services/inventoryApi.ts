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
      throw new Error(`API Error: ${response.status}`);
    }
    
    const result: APIResponse = await response.json();
    
    if (!result.success || !result.data) {
      throw new Error('Invalid API response');
    }
    
    return result.data;
  } catch (error) {
    console.error('Failed to fetch inventory:', error);
    throw error;
  }
}
