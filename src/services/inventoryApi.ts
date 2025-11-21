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
    
    const result = await response.json();
    
    // Debug - remove after fixing
    console.log('API returned count:', result.count);
    console.log('API returned data length:', result.data?.length);
    console.log('First item:', result.data?.[0]);
    
    // CRITICAL: Just return result.data directly
    return result.data || [];
    
  } catch (error) {
    console.error('Error fetching inventory:', error);
    return []; // Return empty array on error
  }
}
