import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { BarChart3, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

export default function Login() {
  const { session, mustChangePassword, signIn } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  if (session && !mustChangePassword) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      toast({ title: 'Erro ao entrar', description: error.message, variant: 'destructive' });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: 'As passwords não coincidem', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: 'Password demasiado curta', description: 'Mínimo 8 caracteres', variant: 'destructive' });
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
      data: { must_change_password: false },
    });
    setChangingPassword(false);
    if (error) {
      toast({ title: 'Erro ao alterar password', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Password definida', description: 'Bem-vindo!' });
    }
  };

  if (session && mustChangePassword) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="flex justify-center mb-3">
              <BarChart3 className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">Definir nova password</h1>
            <p className="text-sm text-muted-foreground mt-1">
              É necessário definir uma password antes de continuar.
            </p>
          </div>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Nova password</label>
              <Input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="mt-1"
                placeholder="Mínimo 8 caracteres"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Confirmar password</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="mt-1"
                placeholder="Repete a password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={changingPassword}>
              {changingPassword
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />A guardar...</>
                : 'Guardar password'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="flex justify-center mb-3">
            <BarChart3 className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">ValueScope</h1>
          <p className="text-sm text-muted-foreground mt-1">Acesso restrito</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Email</label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="mt-1"
              placeholder="nome@exemplo.com"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Password</label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-1"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />A entrar...</>
              : 'Entrar'}
          </Button>
        </form>
      </div>
    </div>
  );
}
