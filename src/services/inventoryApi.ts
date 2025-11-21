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
  console.log('Fetching from CK Inventory API...');
  const apiUrl = "https://eucxuuepfsrbgktlqyqx.supabase.co/functions/v1/rfid-export";
  
  // Try with limit parameter to get all items
  const urlWithLimit = `${apiUrl}?limit=10000`;
  
  console.log(`API URL: ${urlWithLimit}`);
  const response = await fetch(urlWithLimit);
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  const result = await response.json();
  console.log('API Response structure:', {
    hasData: !!result.data,
    dataLength: result.data?.length,
    hasCount: !!result.count,
    count: result.count,
    allKeys: Object.keys(result)
  });
  
  // CRITICAL: Use result.data directly
  const items = result.data || [];
  console.log(`✓ API returned ${items.length} items (count field: ${result.count || 'N/A'})`);
  
  return items;
};
