import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { ArrowLeft } from 'lucide-react';

interface MissingItem {
  itemCode: string;
  particulars: string;
  size: string;
  weight: string;
  tagId: string;
}

interface MissingByCategory {
  category: string;
  count: number;
  items: MissingItem[];
}

const MissingItems = () => {
  const [missingData, setMissingData] = useState<MissingByCategory[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchMissingItems();
  }, []);

  const fetchMissingItems = async () => {
    try {
      const data = await api.getMissingItems();
      setMissingData(data.missing || []);
    } catch (error) {
      console.error('Failed to fetch missing items:', error);
    }
  };

  const totalMissing = missingData.reduce((sum, cat) => sum + cat.count, 0);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold">Missing Items</h1>
          <div className="ml-auto">
            <span className="text-lg font-semibold text-destructive">
              Total Missing: {totalMissing}
            </span>
          </div>
        </div>

        {missingData.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground">
              <p className="text-lg">No missing items! All inventory accounted for.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {missingData.map((category) => (
              <Card key={category.category}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{category.category}</span>
                    <span className="text-destructive">({category.count})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {category.items.map((item, idx) => (
                      <div 
                        key={idx} 
                        className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <p className="font-bold text-lg">{item.itemCode}</p>
                            <p className="text-foreground">{item.particulars}</p>
                            <div className="flex gap-4 text-sm text-muted-foreground">
                              <span>Size: {item.size}</span>
                              <span>Weight: {item.weight}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Tag ID</p>
                            <p className="font-mono text-sm">{item.tagId}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MissingItems;
