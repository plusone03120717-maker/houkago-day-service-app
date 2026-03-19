export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'admin' | 'staff' | 'parent'
export type ServiceType = 'afterschool' | 'development_support'
export type AttendanceStatus = 'attended' | 'absent' | 'cancel_waiting'
export type PickupType = 'both' | 'pickup_only' | 'dropoff_only' | 'none'
export type TransportDirection = 'pickup' | 'dropoff'
export type TransportStatus = 'scheduled' | 'boarded' | 'arrived'
export type ReservationStatus = 'reserved' | 'confirmed' | 'cancelled' | 'cancel_waiting'
export type BillingStatus = 'draft' | 'checked' | 'exported' | 'submitted' | 'finalized'
export type InvoiceType = 'invoice' | 'receipt' | 'proxy_notice'
export type SupportPlanStatus = 'draft' | 'finalized' | 'monitoring'
export type ShiftType = 'early' | 'late' | 'regular' | 'off'
export type DocumentType =
  | 'service_record'
  | 'daily_report'
  | 'shift_table'
  | 'support_plan'
  | 'monitoring_sheet'
  | 'invoice'
  | 'receipt'

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          address: string | null
          phone: string | null
          corporate_number: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['organizations']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>
      }
      facilities: {
        Row: {
          id: string
          organization_id: string
          name: string
          facility_number: string
          address: string | null
          phone: string | null
          service_types: ServiceType[]
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['facilities']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['facilities']['Insert']>
      }
      units: {
        Row: {
          id: string
          facility_id: string
          name: string
          service_type: ServiceType
          capacity: number
          unit_number: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['units']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['units']['Insert']>
      }
      users: {
        Row: {
          id: string
          email: string
          role: UserRole
          name: string
          phone: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['users']['Insert']>
      }
      staff_profiles: {
        Row: {
          id: string
          user_id: string
          facility_id: string
          qualification: string | null
          employment_type: 'full_time' | 'part_time'
          hire_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['staff_profiles']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['staff_profiles']['Insert']>
      }
      staff_unit_assignments: {
        Row: {
          id: string
          staff_id: string
          unit_id: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['staff_unit_assignments']['Row'], 'id' | 'created_at'>
        Update: never
      }
      children: {
        Row: {
          id: string
          name: string
          name_kana: string | null
          birth_date: string
          gender: 'male' | 'female' | 'other'
          address: string | null
          school_name: string | null
          grade: string | null
          disability_type: string | null
          allergy_info: string | null
          medical_info: string | null
          emergency_contact: Json | null
          notes: string | null
          photo_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['children']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['children']['Insert']>
      }
      children_units: {
        Row: {
          id: string
          child_id: string
          unit_id: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['children_units']['Row'], 'id' | 'created_at'>
        Update: never
      }
      parent_children: {
        Row: {
          id: string
          user_id: string
          child_id: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['parent_children']['Row'], 'id' | 'created_at'>
        Update: never
      }
      benefit_certificates: {
        Row: {
          id: string
          child_id: string
          certificate_number: string
          service_type: ServiceType
          start_date: string
          end_date: string
          max_days_per_month: number
          copay_limit: number
          copay_category: string | null
          municipality: string | null
          alert_sent: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['benefit_certificates']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['benefit_certificates']['Insert']>
      }
      daily_attendance: {
        Row: {
          id: string
          child_id: string
          unit_id: string
          date: string
          status: AttendanceStatus
          check_in_time: string | null
          check_out_time: string | null
          pickup_type: PickupType
          body_temperature: number | null
          health_condition: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['daily_attendance']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['daily_attendance']['Insert']>
      }
      activity_programs: {
        Row: {
          id: string
          facility_id: string
          name: string
          description: string | null
          category: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['activity_programs']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['activity_programs']['Insert']>
      }
      daily_activities: {
        Row: {
          id: string
          attendance_id: string
          program_id: string | null
          participated: boolean
          achievement_level: number | null
          evaluation_notes: string | null
          goal_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['daily_activities']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['daily_activities']['Insert']>
      }
      daily_records: {
        Row: {
          id: string
          attendance_id: string
          record_type: 'daily_record' | 'notable'
          content: string
          has_notable_flag: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['daily_records']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['daily_records']['Insert']>
      }
      record_attachments: {
        Row: {
          id: string
          daily_record_id: string | null
          daily_activity_id: string | null
          file_url: string
          file_type: 'image' | 'video'
          caption: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['record_attachments']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['record_attachments']['Insert']>
      }
      transport_vehicles: {
        Row: {
          id: string
          facility_id: string
          name: string
          capacity: number
          driver_staff_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['transport_vehicles']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['transport_vehicles']['Insert']>
      }
      transport_schedules: {
        Row: {
          id: string
          unit_id: string
          date: string
          vehicle_id: string | null
          direction: TransportDirection
          driver_staff_id: string | null
          departure_time: string | null
          route_order: number[]
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['transport_schedules']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['transport_schedules']['Insert']>
      }
      transport_details: {
        Row: {
          id: string
          schedule_id: string
          child_id: string
          attendance_id: string | null
          pickup_location: string | null
          pickup_time: string | null
          actual_pickup_time: string | null
          status: TransportStatus
          parent_notified: boolean
          notification_sent_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['transport_details']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['transport_details']['Insert']>
      }
      usage_plans: {
        Row: {
          id: string
          child_id: string
          unit_id: string
          day_of_week: number[]
          start_date: string
          end_date: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['usage_plans']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['usage_plans']['Insert']>
      }
      usage_reservations: {
        Row: {
          id: string
          child_id: string
          unit_id: string
          date: string
          status: ReservationStatus
          requested_by: string | null
          requested_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['usage_reservations']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['usage_reservations']['Insert']>
      }
      billing_monthly: {
        Row: {
          id: string
          unit_id: string
          year_month: string
          status: BillingStatus
          created_at: string
          finalized_at: string | null
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['billing_monthly']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['billing_monthly']['Insert']>
      }
      billing_details: {
        Row: {
          id: string
          billing_monthly_id: string
          child_id: string
          certificate_id: string | null
          total_days: number
          total_units: number
          service_code: string | null
          unit_price: number
          additions: Json
          copay_amount: number
          billed_amount: number
          errors: Json
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['billing_details']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['billing_details']['Insert']>
      }
      billing_actual_costs: {
        Row: {
          id: string
          child_id: string
          unit_id: string
          date: string
          item_name: string
          amount: number
          billing_monthly_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['billing_actual_costs']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['billing_actual_costs']['Insert']>
      }
      billing_invoices: {
        Row: {
          id: string
          child_id: string
          year_month: string
          invoice_type: InvoiceType
          copay_amount: number
          actual_cost_total: number
          total_amount: number
          issued_at: string | null
          pdf_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['billing_invoices']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['billing_invoices']['Insert']>
      }
      messages: {
        Row: {
          id: string
          sender_id: string
          receiver_id: string
          child_id: string | null
          content: string
          attachments: Json
          read_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['messages']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['messages']['Insert']>
      }
      contact_notes: {
        Row: {
          id: string
          attendance_id: string | null
          child_id: string
          date: string
          unit_id: string
          content: string
          photo_urls: string[]
          ai_generated: boolean
          ai_draft: string | null
          staff_id: string | null
          parent_comment: string | null
          parent_commented_at: string | null
          published_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['contact_notes']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['contact_notes']['Insert']>
      }
      announcements: {
        Row: {
          id: string
          facility_id: string
          title: string
          content: string
          target_type: 'all' | 'unit'
          target_unit_id: string | null
          published_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['announcements']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['announcements']['Insert']>
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          keys_json: Json
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['push_subscriptions']['Row'], 'id' | 'created_at'>
        Update: never
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
