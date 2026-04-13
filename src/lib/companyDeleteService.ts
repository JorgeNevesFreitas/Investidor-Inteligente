import { supabase } from "@/integrations/supabase/client";

export async function deleteCompany(companyId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/company-manage`,
      {
        method: 'POST',
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ company_id: companyId, action: 'delete_company' }),
      }
    );

    const data = await response.json();
    return data;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
