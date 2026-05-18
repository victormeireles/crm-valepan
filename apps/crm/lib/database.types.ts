export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      crm_first_pipeline_stage_id: {
        Args: Record<string, never>;
        Returns: string;
      };
    };
    Enums: Record<string, never>;
  };
  crm: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          role: "admin" | "comercial" | "gestao" | "operacao";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          role?: "admin" | "comercial" | "gestao" | "operacao";
        };
        Update: {
          full_name?: string | null;
          role?: "admin" | "comercial" | "gestao" | "operacao";
        };
      };
      leads: {
        Row: {
          id: string;
          phone_e164: string;
          source: string;
          company_id: string | null;
          contact_id: string | null;
          owner_id: string | null;
          distributor_id: string | null;
          client_category: string | null;
          network_type: string | null;
          zip_code: string | null;
          weekly_bread_consumption: number | null;
          bread_type: string | null;
          bread_weight_grams: number | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          phone_e164: string;
          source?: string;
          company_id?: string | null;
          contact_id?: string | null;
          owner_id?: string | null;
          distributor_id?: string | null;
          client_category?: string | null;
          network_type?: string | null;
          zip_code?: string | null;
          weekly_bread_consumption?: number | null;
          bread_type?: string | null;
          bread_weight_grams?: number | null;
          status?: string;
        };
        Update: Partial<Database["crm"]["Tables"]["leads"]["Insert"]>;
      };
      pipeline_stages: {
        Row: {
          id: string;
          name: string;
          sort_order: number;
          is_final: boolean;
          created_at: string;
        };
      };
      pipeline_stage_task_templates: {
        Row: {
          id: string;
          stage_id: string;
          title: string;
          due_days_offset: number | null;
          sort_order: number;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          stage_id: string;
          title: string;
          due_days_offset?: number | null;
          sort_order?: number;
          active?: boolean;
        };
        Update: Partial<Database["crm"]["Tables"]["pipeline_stage_task_templates"]["Insert"]>;
      };
      pipeline_stage_automation_log: {
        Row: {
          id: string;
          opportunity_id: string;
          template_id: string;
          task_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          opportunity_id: string;
          template_id: string;
          task_id?: string | null;
        };
      };
      opportunities: {
        Row: {
          id: string;
          lead_id: string | null;
          company_id: string | null;
          stage_id: string;
          owner_id: string | null;
          distributor_id: string | null;
          title: string | null;
          next_action_at: string | null;
          lost_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lead_id?: string | null;
          company_id?: string | null;
          stage_id: string;
          owner_id?: string | null;
          distributor_id?: string | null;
          title?: string | null;
          next_action_at?: string | null;
          lost_reason?: string | null;
        };
        Update: Partial<Database["crm"]["Tables"]["opportunities"]["Insert"]>;
      };
      conversations: {
        Row: {
          id: string;
          lead_id: string | null;
          channel: string;
          external_id: string | null;
          phone_e164: string;
          conversation_kind: "lead" | "group";
          group_display_name: string | null;
          classification: string | null;
          last_read_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lead_id?: string | null;
          channel?: string;
          external_id?: string | null;
          phone_e164: string;
          conversation_kind?: "lead" | "group";
          group_display_name?: string | null;
          classification?: string | null;
          last_read_at?: string | null;
        };
        Update: Partial<Database["crm"]["Tables"]["conversations"]["Insert"]>;
      };
      zapi_lid_map: {
        Row: {
          lid_key: string;
          phone_e164: string;
          updated_at: string;
        };
        Insert: {
          lid_key: string;
          phone_e164: string;
          updated_at?: string;
        };
        Update: {
          phone_e164?: string;
          updated_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          direction: "in" | "out";
          body: string | null;
          media_kind: "image" | "video" | "audio" | "document" | null;
          media_url: string | null;
          media_mime_type: string | null;
          media_file_name: string | null;
          provider_message_id: string | null;
          message_status: "sent" | "read" | null;
          read_at: string | null;
          sent_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          direction: "in" | "out";
          body?: string | null;
          media_kind?: "image" | "video" | "audio" | "document" | null;
          media_url?: string | null;
          media_mime_type?: string | null;
          media_file_name?: string | null;
          provider_message_id?: string | null;
          message_status?: "sent" | "read" | null;
          read_at?: string | null;
          sent_at?: string;
        };
      };
      tasks: {
        Row: {
          id: string;
          lead_id: string | null;
          opportunity_id: string | null;
          title: string;
          due_at: string | null;
          assignee_id: string | null;
          done: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lead_id?: string | null;
          opportunity_id?: string | null;
          title: string;
          due_at?: string | null;
          assignee_id?: string | null;
          done?: boolean;
        };
        Update: Partial<Database["crm"]["Tables"]["tasks"]["Insert"]>;
      };
      notes: {
        Row: {
          id: string;
          lead_id: string | null;
          opportunity_id: string | null;
          author_id: string | null;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id?: string | null;
          opportunity_id?: string | null;
          author_id?: string | null;
          body: string;
        };
      };
      distributors: {
        Row: {
          id: string;
          name: string;
          notes: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          notes?: string | null;
          active?: boolean;
        };
        Update: Partial<Database["crm"]["Tables"]["distributors"]["Insert"]>;
      };
      distributor_regions: {
        Row: {
          id: string;
          distributor_id: string;
          region_name: string;
          state: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          distributor_id: string;
          region_name: string;
          state?: string | null;
        };
      };
      sample_shipments: {
        Row: {
          id: string;
          lead_id: string | null;
          company_id: string | null;
          contact_name: string | null;
          address_line: string | null;
          send_via: string | null;
          network: string | null;
          business_hours: string | null;
          bread_type: string | null;
          status: string;
          window_start: string | null;
          window_end: string | null;
          feedback: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lead_id?: string | null;
          company_id?: string | null;
          contact_name?: string | null;
          address_line?: string | null;
          send_via?: string | null;
          network?: string | null;
          business_hours?: string | null;
          bread_type?: string | null;
          status?: string;
          window_start?: string | null;
          window_end?: string | null;
          feedback?: string | null;
        };
        Update: Partial<Database["crm"]["Tables"]["sample_shipments"]["Insert"]>;
      };
      sample_items: {
        Row: {
          id: string;
          shipment_id: string;
          description: string;
          qty: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          shipment_id: string;
          description: string;
          qty?: number;
        };
      };
      activity_logs: {
        Row: {
          id: string;
          entity_type: string;
          entity_id: string;
          action: string;
          payload: Json | null;
          actor_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          entity_type: string;
          entity_id: string;
          action: string;
          payload?: Json | null;
          actor_id?: string | null;
        };
      };
      companies: {
        Row: {
          id: string;
          name: string;
          document: string | null;
          city: string | null;
          state: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          document?: string | null;
          city?: string | null;
          state?: string | null;
        };
        Update: Partial<Database["crm"]["Tables"]["companies"]["Insert"]>;
      };
      contacts: {
        Row: {
          id: string;
          company_id: string | null;
          full_name: string | null;
          phone_e164: string;
          email: string | null;
          avatar_url: string | null;
          avatar_updated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id?: string | null;
          full_name?: string | null;
          phone_e164: string;
          email?: string | null;
          avatar_url?: string | null;
          avatar_updated_at?: string | null;
        };
        Update: Partial<Database["crm"]["Tables"]["contacts"]["Insert"]>;
      };
    };
    Views: {
      timeline_events: {
        Row: {
          kind: string;
          event_id: string;
          at: string;
          lead_id: string | null;
          opportunity_id: string | null;
          data: Json;
        };
      };
      v_conversation_last_message: {
        Row: {
          conversation_id: string;
          lead_id: string | null;
          last_direction: string;
          last_sent_at: string;
          last_body_preview: string | null;
        };
      };
    };
    Functions: {
      dashboard_kpis_extra: {
        Args: Record<string, never>;
        Returns: {
          leads_awaiting_reply: number;
          new_leads_7d: number;
          new_leads_prev_7d: number;
          active_conversations_7d: number;
        }[];
      };
    };
  };
}
