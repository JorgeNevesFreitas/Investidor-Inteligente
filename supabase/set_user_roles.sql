-- ============================================================
-- Migração de roles para o novo sistema de 3 tipos (admin / investor / viewer)
-- Corre este script no Supabase Dashboard → SQL Editor
--
-- Não há alteração de esquema: role continua a viver em
-- auth.users.raw_user_meta_data (Supabase Auth), não numa tabela própria.
-- A app já trata qualquer role desconhecido/ausente como 'investor', por
-- isso este script é só para deixar os dados explícitos e arrumados.
-- ============================================================

-- Garante que a conta do dono se mantém admin
update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
where email = 'jorgefreitas100@hotmail.com';

-- Migra as contas "Utilizador" do sistema antigo (2 roles: admin/user) para
-- "Investidor" — é exatamente o que já podiam fazer (tudo menos gestão de
-- utilizadores). Não mexe em nenhuma conta já marcada como 'admin' ou 'viewer'.
update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'investor')
where email <> 'jorgefreitas100@hotmail.com'
  and coalesce(raw_user_meta_data->>'role', 'user') = 'user';

-- Para verificar o resultado:
-- select email, raw_user_meta_data->>'role' as role from auth.users order by email;
