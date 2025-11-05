import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { decodeHtmlEntities } from '@/lib/utils';
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
    <div className="min-h-screen bg-background p-3 sm:p-4 pb-6">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')} className="h-10">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl sm:text-3xl font-bold">Missing Items</h1>
          </div>
          <div className="ml-0 sm:ml-auto">
            <span className="text-base sm:text-lg font-semibold text-destructive">
              Total Missing: {totalMissing}
            </span>
          </div>
        </div>

        {missingData.length === 0 ? (
          <Card>
            <CardContent className="p-8 sm:p-12 text-center text-muted-foreground">
              <p className="text-base sm:text-lg">No missing items! All inventory accounted for.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {missingData.map((category) => (
              <Card key={category.category}>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="flex items-center justify-between text-base sm:text-xl">
                    <span>{category.category}</span>
                    <span className="text-destructive">({category.count})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 pt-0">
                  <div className="space-y-3">
                    {category.items.map((item, idx) => (
                      <div 
                        key={idx} 
                        className="p-3 sm:p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="space-y-1 flex-1">
                            <p className="font-bold text-base sm:text-lg">{item.itemCode}</p>
                            <p className="text-sm sm:text-base text-foreground break-words">{decodeHtmlEntities(item.particulars)}</p>
                            <div className="flex flex-col sm:flex-row gap-1 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                              <span>Size: {decodeHtmlEntities(item.size)}</span>
                              <span>Weight: {item.weight}</span>
                            </div>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-xs text-muted-foreground">Tag ID</p>
                            <p className="font-mono text-xs sm:text-sm break-all">{item.tagId}</p>
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
