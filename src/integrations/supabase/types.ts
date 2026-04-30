export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      dcf_valuations: {
        Row: {
          id: string
          ticker: string
          company_id: string | null
          method: string
          inputs: Json
          result: Json
          price_at_calculation: number | null
          calculated_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          ticker: string
          company_id?: string | null
          method: string
          inputs: Json
          result: Json
          price_at_calculation?: number | null
          calculated_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          ticker?: string
          company_id?: string | null
          method?: string
          inputs?: Json
          result?: Json
          price_at_calculation?: number | null
          calculated_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dcf_valuations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          cik: string | null
          country: string | null
          created_at: string
          currency: string | null
          current_price: number | null
          exchange: string | null
          fiscal_year_end_month: number | null
          id: string
          last_imported_at: string | null
          last_refreshed_at: string | null
          market_cap: number | null
          name: string
          pe_ratio: number | null
          primary_data_source: string | null
          region_type: Database["public"]["Enums"]["region_type"]
          sec_enabled: boolean | null
          sector: string | null
          stockanalysis_url: string | null
          ticker: string
          updated_at: string
        }
        Insert: {
          cik?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          current_price?: number | null
          exchange?: string | null
          fiscal_year_end_month?: number | null
          id?: string
          last_imported_at?: string | null
          last_refreshed_at?: string | null
          market_cap?: number | null
          name: string
          pe_ratio?: number | null
          primary_data_source?: string | null
          region_type?: Database["public"]["Enums"]["region_type"]
          sec_enabled?: boolean | null
          sector?: string | null
          stockanalysis_url?: string | null
          ticker: string
          updated_at?: string
        }
        Update: {
          cik?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          current_price?: number | null
          exchange?: string | null
          fiscal_year_end_month?: number | null
          id?: string
          last_imported_at?: string | null
          last_refreshed_at?: string | null
          market_cap?: number | null
          name?: string
          pe_ratio?: number | null
          primary_data_source?: string | null
          region_type?: Database["public"]["Enums"]["region_type"]
          sec_enabled?: boolean | null
          sector?: string | null
          stockanalysis_url?: string | null
          ticker?: string
          updated_at?: string
        }
        Relationships: []
      }
      financial_line_items: {
        Row: {
          confidence_score: number | null
          created_at: string
          id: string
          normalized_key: string
          normalized_value: number | null
          raw_value: number | null
          source_label: string | null
          source_reference: string | null
          source_type: Database["public"]["Enums"]["source_type"] | null
          statement_type: Database["public"]["Enums"]["statement_type"]
          statement_year_id: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          id?: string
          normalized_key: string
          normalized_value?: number | null
          raw_value?: number | null
          source_label?: string | null
          source_reference?: string | null
          source_type?: Database["public"]["Enums"]["source_type"] | null
          statement_type: Database["public"]["Enums"]["statement_type"]
          statement_year_id: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          id?: string
          normalized_key?: string
          normalized_value?: number | null
          raw_value?: number | null
          source_label?: string | null
          source_reference?: string | null
          source_type?: Database["public"]["Enums"]["source_type"] | null
          statement_type?: Database["public"]["Enums"]["statement_type"]
          statement_year_id?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_line_items_statement_year_id_fkey"
            columns: ["statement_year_id"]
            isOneToOne: false
            referencedRelation: "financial_statement_years"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_statement_years: {
        Row: {
          checksum: string | null
          company_id: string
          created_at: string
          currency: string | null
          data_status: Database["public"]["Enums"]["data_status"] | null
          filing_date: string | null
          filing_type: string | null
          fiscal_year: number
          id: string
          import_method: Database["public"]["Enums"]["import_method"] | null
          period_type: string
          source_type: Database["public"]["Enums"]["source_type"] | null
          source_url: string | null
          updated_at: string
        }
        Insert: {
          checksum?: string | null
          company_id: string
          created_at?: string
          currency?: string | null
          data_status?: Database["public"]["Enums"]["data_status"] | null
          filing_date?: string | null
          filing_type?: string | null
          fiscal_year: number
          id?: string
          import_method?: Database["public"]["Enums"]["import_method"] | null
          period_type?: string
          source_type?: Database["public"]["Enums"]["source_type"] | null
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          checksum?: string | null
          company_id?: string
          created_at?: string
          currency?: string | null
          data_status?: Database["public"]["Enums"]["data_status"] | null
          filing_date?: string | null
          filing_type?: string | null
          fiscal_year?: number
          id?: string
          import_method?: Database["public"]["Enums"]["import_method"] | null
          period_type?: string
          source_type?: Database["public"]["Enums"]["source_type"] | null
          source_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_statement_years_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          company_id: string
          created_at: string
          error_details: string | null
          finished_at: string | null
          id: string
          job_type: Database["public"]["Enums"]["job_type"]
          log_summary: string | null
          source_type: Database["public"]["Enums"]["source_type"] | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          years_imported: number[] | null
        }
        Insert: {
          company_id: string
          created_at?: string
          error_details?: string | null
          finished_at?: string | null
          id?: string
          job_type: Database["public"]["Enums"]["job_type"]
          log_summary?: string | null
          source_type?: Database["public"]["Enums"]["source_type"] | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          years_imported?: number[] | null
        }
        Update: {
          company_id?: string
          created_at?: string
          error_details?: string | null
          finished_at?: string | null
          id?: string
          job_type?: Database["public"]["Enums"]["job_type"]
          log_summary?: string | null
          source_type?: Database["public"]["Enums"]["source_type"] | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          years_imported?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlist: {
        Row: {
          added_at: string
          created_at: string
          exchange: string | null
          id: string
          name: string
          notes: string | null
          ticker: string
          updated_at: string
        }
        Insert: {
          added_at?: string
          created_at?: string
          exchange?: string | null
          id?: string
          name: string
          notes?: string | null
          ticker: string
          updated_at?: string
        }
        Update: {
          added_at?: string
          created_at?: string
          exchange?: string | null
          id?: string
          name?: string
          notes?: string | null
          ticker?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_reports: {
        Row: {
          id: string
          ticker: string
          company_id: string | null
          period_year: number
          period_month: number | null
          report_date: string | null
          title: string
          content_html: string | null
          file_path: string | null
          file_type: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          ticker: string
          company_id?: string | null
          period_year: number
          period_month?: number | null
          report_date?: string | null
          title: string
          content_html?: string | null
          file_path?: string | null
          file_type?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          ticker?: string
          company_id?: string | null
          period_year?: number
          period_month?: number | null
          report_date?: string | null
          title?: string
          content_html?: string | null
          file_path?: string | null
          file_type?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_transactions: {
        Row: {
          id: string
          ticker: string
          company_id: string | null
          type: string
          date: string
          price_per_share: number
          quantity: number
          currency: string
          fees: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          ticker: string
          company_id?: string | null
          type: string
          date: string
          price_per_share: number
          quantity: number
          currency?: string
          fees?: number
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          ticker?: string
          company_id?: string | null
          type?: string
          date?: string
          price_per_share?: number
          quantity?: number
          currency?: string
          fees?: number
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      portfolio_dividends: {
        Row: {
          id: string
          ticker: string
          company_id: string | null
          date: string
          amount_per_share: number
          quantity: number
          currency: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          ticker: string
          company_id?: string | null
          date: string
          amount_per_share: number
          quantity: number
          currency?: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          ticker?: string
          company_id?: string | null
          date?: string
          amount_per_share?: number
          quantity?: number
          currency?: string
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      data_status: "draft" | "imported" | "verified" | "stale"
      import_method:
        | "auto_sec"
        | "auto_stockanalysis"
        | "manual_link"
        | "manual_entry"
      job_status: "pending" | "running" | "completed" | "failed" | "partial"
      job_type: "import" | "refresh" | "import_from_stockanalysis_link"
      region_type: "US" | "NON_US"
      source_type:
        | "SEC_XBRL"
        | "SEC_FILING_FALLBACK"
        | "STOCKANALYSIS_LINK"
        | "STOCKANALYSIS_AUTO"
        | "MANUAL"
      statement_type: "income_statement" | "balance_sheet" | "cash_flow"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      data_status: ["draft", "imported", "verified", "stale"],
      import_method: [
        "auto_sec",
        "auto_stockanalysis",
        "manual_link",
        "manual_entry",
      ],
      job_status: ["pending", "running", "completed", "failed", "partial"],
      job_type: ["import", "refresh", "import_from_stockanalysis_link"],
      region_type: ["US", "NON_US"],
      source_type: [
        "SEC_XBRL",
        "SEC_FILING_FALLBACK",
        "STOCKANALYSIS_LINK",
        "STOCKANALYSIS_AUTO",
        "MANUAL",
      ],
      statement_type: ["income_statement", "balance_sheet", "cash_flow"],
    },
  },
} as const
