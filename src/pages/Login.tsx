import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';

const Login = () => {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (pin.length !== 6) {
      toast({
        title: 'Invalid PIN',
        description: 'Please enter a 6-digit PIN',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const result = await api.login(pin);
      if (result.success) {
        sessionStorage.setItem('authenticated', 'true');
        navigate('/dashboard');
      } else {
        toast({
          title: 'Login Failed',
          description: 'Invalid PIN',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Connection failed. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center p-6 sm:p-8">
          <CardTitle className="text-2xl sm:text-3xl font-bold">RFID Inventory Scanner</CardTitle>
          <CardDescription className="text-sm sm:text-base mt-2">Enter your PIN to continue</CardDescription>
        </CardHeader>
        <CardContent className="p-6 sm:p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="Enter 6-digit PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className="text-center text-2xl sm:text-3xl tracking-widest h-14 sm:h-16"
              />
            </div>
            <Button type="submit" className="w-full h-12 sm:h-14 text-base sm:text-lg" disabled={loading}>
              {loading ? 'Authenticating...' : 'Login'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
