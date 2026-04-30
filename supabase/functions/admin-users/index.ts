import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Não autenticado' }, 401);
    }

    // Verify caller identity and admin role
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller } } = await callerClient.auth.getUser();

    if (!caller || caller.user_metadata?.role !== 'admin') {
      return json({ error: 'Acesso não autorizado' }, 403);
    }

    // Admin client with service role key
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { action, ...params } = await req.json();

    if (action === 'list') {
      const { data, error } = await adminClient.auth.admin.listUsers({ perPage: 200 });
      if (error) return json({ error: error.message }, 500);
      const users = data.users.map(u => ({
        id: u.id,
        email: u.email ?? '',
        role: (u.user_metadata?.role as string) ?? 'user',
        created_at: u.created_at,
      }));
      return json({ users });
    }

    if (action === 'create') {
      const { email, password, role } = params as { email: string; password: string; role: string };
      if (!email || !password || !role) {
        return json({ error: 'email, password e role são obrigatórios' }, 400);
      }
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role, must_change_password: true },
      });
      if (error) return json({ error: error.message }, 500);
      return json({ user: data.user });
    }

    if (action === 'delete') {
      const { userId } = params as { userId: string };
      if (!userId) return json({ error: 'userId é obrigatório' }, 400);
      // Prevent self-deletion
      if (userId === caller.id) return json({ error: 'Não é possível remover a própria conta' }, 400);
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: 'Ação desconhecida' }, 400);

  } catch (err) {
    console.error('admin-users error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
