import { useState, useEffect, useCallback } from 'react';
import { Loader2, UserPlus, Trash2, ShieldCheck, User } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface ManagedUser {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

type NewRole = 'admin' | 'user';

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<NewRole>('user');
  const [adding, setAdding] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'list' },
    });
    setLoading(false);
    if (error || data?.error) {
      toast({ title: 'Erro ao carregar utilizadores', description: error?.message || data?.error, variant: 'destructive' });
      return;
    }
    setUsers(data.users ?? []);
  }, [toast]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newPassword.trim()) return;
    setAdding(true);
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'create', email: newEmail.trim(), password: newPassword, role: newRole },
    });
    setAdding(false);
    if (error || data?.error) {
      toast({ title: 'Erro ao criar utilizador', description: error?.message || data?.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Utilizador criado', description: `${newEmail} adicionado com password temporária.` });
    setShowAddDialog(false);
    setNewEmail('');
    setNewPassword('');
    setNewRole('user');
    await loadUsers();
  };

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(`Remover ${email}? Esta ação não pode ser desfeita.`)) return;
    setDeletingId(id);
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'delete', userId: id },
    });
    setDeletingId(null);
    if (error || data?.error) {
      toast({ title: 'Erro ao remover utilizador', description: error?.message || data?.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Utilizador removido' });
    setUsers(prev => prev.filter(u => u.id !== id));
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Gestão de utilizadores</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Administra quem tem acesso à aplicação</p>
          </div>
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <UserPlus className="h-3.5 w-3.5 mr-1.5" />
            Novo utilizador
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
            <table className="w-full min-w-[400px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Email</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Tipo</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Criado em</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-xs text-foreground">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                        u.role === 'admin'
                          ? 'bg-primary/15 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {u.role === 'admin'
                          ? <><ShieldCheck className="h-3 w-3" />Administrador</>
                          : <><User className="h-3 w-3" />Utilizador</>}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString('pt-PT')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.id !== currentUser?.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(u.id, u.email)}
                          disabled={deletingId === u.id}
                        >
                          {deletingId === u.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-xs text-muted-foreground">
                      Nenhum utilizador encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Novo utilizador</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 py-1">
            <div>
              <label className="text-xs text-muted-foreground">Email</label>
              <Input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                className="mt-1 h-8 text-xs"
                placeholder="nome@exemplo.com"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Password temporária</label>
              <Input
                type="text"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="mt-1 h-8 text-xs font-mono"
                placeholder="Mínimo 8 caracteres"
                required
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                O utilizador terá de alterar a password no primeiro login.
              </p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-2">Tipo de acesso</label>
              <div className="space-y-2">
                {([
                  { value: 'user' as NewRole, label: 'Utilizador', desc: 'Acesso a todas as funcionalidades da app' },
                  { value: 'admin' as NewRole, label: 'Administrador', desc: 'Acesso total, incluindo gestão de utilizadores' },
                ] as const).map(opt => (
                  <label key={opt.value} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    newRole === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/30'
                  }`}>
                    <input
                      type="radio"
                      name="new-role"
                      value={opt.value}
                      checked={newRole === opt.value}
                      onChange={() => setNewRole(opt.value)}
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <div className="text-xs font-medium text-foreground">{opt.label}</div>
                      <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" className="text-xs h-8"
                onClick={() => setShowAddDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" className="text-xs h-8" disabled={adding}>
                {adding ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />A criar...</> : 'Criar utilizador'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
